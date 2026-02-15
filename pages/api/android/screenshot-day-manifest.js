import { getSupabaseAndroidServerClient, sendEnvError } from '../../../lib/supabaseServer.js';

function parseFrDayFolder(name) {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(String(name || '').trim());
  if (!m) return null;
  const dd = Number(m[1]);
  const mm = Number(m[2]);
  const yyyy = Number(m[3]);
  if (!Number.isFinite(dd) || !Number.isFinite(mm) || !Number.isFinite(yyyy)) return null;
  return { dd, mm, yyyy };
}

function parseTimeFromScreenshotName(name) {
  const m = /^(\d{2})-(\d{2})-(\d{2})/.exec(String(name || '').trim());
  if (!m) return null;
  const hh = Number(m[1]);
  const mi = Number(m[2]);
  const ss = Number(m[3]);
  if (![hh, mi, ss].every((v) => Number.isFinite(v))) return null;
  if (hh < 0 || hh > 23 || mi < 0 || mi > 59 || ss < 0 || ss > 59) return null;
  return { hh, mi, ss };
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

    const page = (files || []).filter((it) => typeof it?.name === 'string' && it.name.toLowerCase().endsWith('.webp'));
    out.push(...page);

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
    const maxFilesRaw = typeof req.query.maxFiles === 'string' ? Number(req.query.maxFiles) : 20000;
    const maxFiles = Number.isFinite(maxFilesRaw) ? Math.max(200, Math.min(50000, Math.trunc(maxFilesRaw))) : 20000;

    if (!deviceId) {
      res.status(400).json({ error: 'Paramètre manquant: deviceId' });
      return;
    }
    const dayParts = parseFrDayFolder(day);
    if (!dayParts) {
      res.status(400).json({ error: 'Paramètre invalide: day (attendu dd-MM-yyyy)' });
      return;
    }

    const bucket = 'screenshots';
    const supabase = getSupabaseAndroidServerClient({ preferServiceRole: true });
    const dayPath = `${deviceId}/${day}`;
    const { files, truncated } = await listAllWebpFiles({ supabase, bucket, dayPath, maxFiles });

    files.sort((a, b) => String(a.name).localeCompare(String(b.name)));

    const frames = [];
    const hourMap = new Map();

    for (const [index, file] of files.entries()) {
      const name = String(file.name || '');
      const t = parseTimeFromScreenshotName(name);
      if (!t) continue;

      const createdAt = new Date(dayParts.yyyy, dayParts.mm - 1, dayParts.dd, t.hh, t.mi, t.ss).toISOString();
      const secondOfDay = t.hh * 3600 + t.mi * 60 + t.ss;
      frames.push({
        index,
        name,
        path: `${dayPath}/${name}`,
        hour: t.hh,
        secondOfDay,
        createdAt,
        updatedAt: file?.updated_at ?? null
      });

      const cur = hourMap.get(t.hh) || { hour: t.hh, count: 0, firstIndex: index, lastIndex: index };
      cur.count += 1;
      cur.firstIndex = Math.min(cur.firstIndex, index);
      cur.lastIndex = Math.max(cur.lastIndex, index);
      hourMap.set(t.hh, cur);
    }

    const hours = Array.from(hourMap.values())
      .sort((a, b) => a.hour - b.hour)
      .map((h) => ({
        ...h,
        middleIndex: h.firstIndex + Math.floor((h.count - 1) / 2)
      }));

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');
    res.status(200).json({
      deviceId,
      day,
      frames,
      hours,
      totalFiles: files.length,
      truncated
    });
  } catch (error) {
    if (error?.missingVariables) {
      sendEnvError(res, error);
      return;
    }
    console.error('Erreur dans /api/android/screenshot-day-manifest:', error);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(500).json({
      error: 'Erreur lors de la récupération du manifest',
      message: error.message
    });
  }
}

