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
  return { dd, mm, yyyy };
}

function parseHourFromScreenshotName(name) {
  const m = /^(\d{2})-\d{2}-\d{2}/.exec(String(name || '').trim());
  if (!m) return null;
  const hh = Number(m[1]);
  if (!Number.isFinite(hh) || hh < 0 || hh > 23) return null;
  return hh;
}

function parseTimeFromScreenshotName(name) {
  // "<HH>-mm-ss.webp" ou "<HH>-mm-ss-1.webp"
  const m = /^(\d{2})-(\d{2})-(\d{2})/.exec(String(name || '').trim());
  if (!m) return null;
  const hh = Number(m[1]);
  const mi = Number(m[2]);
  const ss = Number(m[3]);
  if (![hh, mi, ss].every((x) => Number.isFinite(x))) return null;
  return { hh, mi, ss };
}

async function listAllWebpFilesForHour({ supabase, bucket, dayPath, hour, maxScanFiles }) {
  const out = [];
  const limit = 1000;
  let offset = 0;
  let scanned = 0;

  while (scanned < maxScanFiles) {
    const { data: files, error } = await supabase.storage.from(bucket).list(dayPath, {
      limit,
      offset,
      sortBy: { column: 'name', order: 'asc' }
    });
    if (error) throw error;

    const page = files || [];
    scanned += page.length;

    for (const it of page) {
      const name = String(it?.name || '');
      if (!name.toLowerCase().endsWith('.webp')) continue;
      if (parseHourFromScreenshotName(name) !== hour) continue;
      out.push({ name, updated_at: it?.updated_at ?? null });
    }

    if (page.length < limit) break;
    offset += limit;
  }

  return { files: out, scanned, truncatedScan: scanned >= maxScanFiles };
}

async function signOrPublicUrl({ supabase, bucket, objectPath, expiresIn }) {
  const { data: signed, error: signedErr } = await supabase.storage.from(bucket).createSignedUrl(objectPath, expiresIn);
  if (!signedErr && signed?.signedUrl) return { url: signed.signedUrl, mode: 'signed' };
  const { data: pub } = supabase.storage.from(bucket).getPublicUrl(objectPath);
  if (pub?.publicUrl) return { url: pub.publicUrl, mode: 'public' };
  throw signedErr || new Error('Impossible de générer une URL (signed/public).');
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
    const hourRaw = typeof req.query.hour === 'string' ? Number(req.query.hour) : NaN;
    const limitRaw = typeof req.query.limit === 'string' ? Number(req.query.limit) : 1200;
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(5000, Math.trunc(limitRaw))) : 1200;

    if (!deviceId) {
      res.status(400).json({ error: 'Paramètre manquant: deviceId' });
      return;
    }
    const dayParts = parseFrDayFolder(day);
    if (!day || !dayParts) {
      res.status(400).json({ error: 'Paramètre invalide: day (attendu dd-MM-yyyy)' });
      return;
    }
    const hour = Number.isFinite(hourRaw) ? Math.trunc(hourRaw) : NaN;
    if (!Number.isFinite(hour) || hour < 0 || hour > 23) {
      res.status(400).json({ error: 'Paramètre invalide: hour (0-23)' });
      return;
    }

    const bucket = 'screenshots';
    const supabase = getSupabaseAndroidServerClient({ preferServiceRole: true });
    const dayPath = `${deviceId}/${day}`;

    // On scanne jusqu'à N entrées du jour (sécurité perf)
    const maxScanFiles = 20000;
    const { files, truncatedScan } = await listAllWebpFilesForHour({
      supabase,
      bucket,
      dayPath,
      hour,
      maxScanFiles
    });

    files.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    const selected = files.slice(0, limit);
    const truncated = files.length > limit;

    const expiresIn = 3600; // 1h pour laisser le player tourner
    const frames = [];
    let mode = null;

    for (const f of selected) {
      const objectPath = `${dayPath}/${f.name}`;
      const signed = await signOrPublicUrl({ supabase, bucket, objectPath, expiresIn });
      mode = mode || signed.mode;

      const t = parseTimeFromScreenshotName(f.name);
      const iso =
        t && dayParts
          ? new Date(dayParts.yyyy, dayParts.mm - 1, dayParts.dd, t.hh, t.mi, t.ss).toISOString()
          : null;

      frames.push({
        url: signed.url,
        path: objectPath,
        name: f.name,
        createdAt: iso,
        updatedAt: f.updated_at
      });
    }

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');
    res.status(200).json({
      deviceId,
      day,
      hour,
      frames,
      mode,
      scannedMax: maxScanFiles,
      truncatedScan,
      truncated
    });
  } catch (error) {
    if (error?.missingVariables) {
      sendEnvError(res, error);
      return;
    }
    console.error('Erreur dans /api/android/screenshot-frames:', error);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(500).json({
      error: 'Erreur lors de la récupération des frames',
      message: error.message
    });
  }
}

