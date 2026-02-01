import { getSupabaseAndroidServerClient, sendEnvError } from '../../../lib/supabaseServer.js';

function parseFrDayFolder(name) {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(String(name || '').trim());
  if (!m) return null;
  const dd = Number(m[1]);
  const mm = Number(m[2]);
  const yyyy = Number(m[3]);
  if (!Number.isFinite(dd) || !Number.isFinite(mm) || !Number.isFinite(yyyy)) return null;
  const d = new Date(Date.UTC(yyyy, mm - 1, dd, 0, 0, 0, 0));
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function parseHourFromScreenshotName(name) {
  // "<HH>-mm-ss.webp" ou "<HH>-mm-ss-1.webp"
  const m = /^(\d{2})-\d{2}-\d{2}/.exec(String(name || '').trim());
  if (!m) return null;
  const hh = Number(m[1]);
  if (!Number.isFinite(hh) || hh < 0 || hh > 23) return null;
  return hh;
}

async function listAllWebpFiles({ supabase, bucket, dayPath, maxFiles }) {
  const out = [];
  const limit = 1000;
  let offset = 0;

  while (out.length < maxFiles) {
    const { data: files, error } = await supabase.storage.from(bucket).list(dayPath, {
      limit,
      offset,
      sortBy: { column: 'name', order: 'asc' }
    });
    if (error) throw error;

    const items = (files || []).filter((it) => typeof it?.name === 'string' && it.name.toLowerCase().endsWith('.webp'));
    out.push(...items);

    if (!files || files.length < limit) break;
    offset += limit;
  }

  return { files: out.slice(0, maxFiles), truncated: out.length >= maxFiles };
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const deviceId = typeof req.query.deviceId === 'string' ? req.query.deviceId.trim() : '';
    const day = typeof req.query.day === 'string' ? req.query.day.trim() : '';
    const maxFilesRaw = typeof req.query.maxFiles === 'string' ? Number(req.query.maxFiles) : 5000;
    const maxFiles = Number.isFinite(maxFilesRaw) ? Math.max(200, Math.min(20000, Math.trunc(maxFilesRaw))) : 5000;

    if (!deviceId) {
      res.status(400).json({ error: 'Paramètre manquant: deviceId' });
      return;
    }
    if (!day || !parseFrDayFolder(day)) {
      res.status(400).json({ error: 'Paramètre invalide: day (attendu dd-MM-yyyy)' });
      return;
    }

    const bucket = 'screenshots';
    const supabase = getSupabaseAndroidServerClient({ preferServiceRole: true });
    const dayPath = `${deviceId}/${day}`;

    const { files, truncated } = await listAllWebpFiles({ supabase, bucket, dayPath, maxFiles });

    const hours = new Map(); // hh -> { hour, count, firstName, lastName }
    for (const f of files) {
      const hh = parseHourFromScreenshotName(f?.name);
      if (hh === null) continue;
      const cur = hours.get(hh) || { hour: hh, count: 0, firstName: null, lastName: null };
      cur.count += 1;
      const n = String(f.name);
      if (!cur.firstName || n < cur.firstName) cur.firstName = n;
      if (!cur.lastName || n > cur.lastName) cur.lastName = n;
      hours.set(hh, cur);
    }

    const hourList = Array.from(hours.values()).sort((a, b) => a.hour - b.hour);

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');
    res.status(200).json({
      deviceId,
      day,
      hours: hourList,
      totalFiles: files.length,
      truncated
    });
  } catch (error) {
    if (error?.missingVariables) {
      sendEnvError(res, error);
      return;
    }
    console.error('Erreur dans /api/android/screenshot-day-index:', error);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(500).json({
      error: 'Erreur lors de la génération de l’index',
      message: error.message
    });
  }
}

