import { getSupabaseServerClient, sendEnvError } from '../../../lib/supabaseServer.js';

function parseFrDayFolder(name) {
  // "dd-MM-yyyy"
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

async function findLatestScreenshotPath({ supabase, bucket, deviceId }) {
  const root = `${deviceId}/screenshots`;

  const { data: days, error: daysErr } = await supabase.storage.from(bucket).list(root, {
    limit: 200,
    offset: 0,
    sortBy: { column: 'name', order: 'desc' }
  });
  if (daysErr) throw daysErr;

  const dayFolders = (days || [])
    .map((it) => ({ name: it?.name, parsed: parseFrDayFolder(it?.name) }))
    .filter((x) => x.name && x.parsed);

  if (dayFolders.length === 0) return null;

  dayFolders.sort((a, b) => b.parsed.getTime() - a.parsed.getTime());
  const latestDay = dayFolders[0].name;

  const dayPath = `${root}/${latestDay}`;
  const { data: files, error: filesErr } = await supabase.storage.from(bucket).list(dayPath, {
    limit: 500,
    offset: 0,
    sortBy: { column: 'name', order: 'desc' }
  });
  if (filesErr) throw filesErr;

  const candidates = (files || [])
    .filter((it) => typeof it?.name === 'string' && it.name.toLowerCase().endsWith('.webp'))
    .sort((a, b) => String(b.name).localeCompare(String(a.name)));

  if (candidates.length === 0) return null;

  const latestFile = candidates[0];
  return {
    objectPath: `${dayPath}/${latestFile.name}`,
    objectName: latestFile.name,
    dayFolder: latestDay,
    updatedAt: latestFile.updated_at ?? null
  };
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const deviceId = typeof req.query.deviceId === 'string' ? req.query.deviceId.trim() : '';
    if (!deviceId) {
      res.status(400).json({ error: 'Paramètre manquant: deviceId' });
      return;
    }

    const bucket = 'android';
    const supabase = getSupabaseServerClient({ preferServiceRole: true });

    const latest = await findLatestScreenshotPath({ supabase, bucket, deviceId });
    if (!latest) {
      res.status(404).json({ error: 'Aucun screenshot trouvé' });
      return;
    }

    // Signed URL court (auto-refresh côté UI)
    const { data: signed, error: signedErr } = await supabase.storage
      .from(bucket)
      .createSignedUrl(latest.objectPath, 60);

    if (signedErr) {
      // Fallback: si bucket public, on tente une URL publique
      const { data: pub } = supabase.storage.from(bucket).getPublicUrl(latest.objectPath);
      if (!pub?.publicUrl) throw signedErr;

      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Content-Type', 'application/json');
      res.status(200).json({
        url: pub.publicUrl,
        path: latest.objectPath,
        updatedAt: latest.updatedAt,
        day: latest.dayFolder,
        name: latest.objectName,
        mode: 'public'
      });
      return;
    }

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');
    res.status(200).json({
      url: signed?.signedUrl ?? null,
      path: latest.objectPath,
      updatedAt: latest.updatedAt,
      day: latest.dayFolder,
      name: latest.objectName,
      mode: 'signed'
    });
  } catch (error) {
    if (error?.missingVariables) {
      sendEnvError(res, error);
      return;
    }
    console.error('Erreur dans /api/android/latest-screenshot:', error);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(500).json({
      error: 'Erreur lors de la récupération du screenshot',
      message: error.message
    });
  }
}

