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
    const name = typeof req.query.name === 'string' ? req.query.name.trim() : '';
    const expiresInRaw = typeof req.query.expiresIn === 'string' ? Number(req.query.expiresIn) : 300;
    const expiresIn = Number.isFinite(expiresInRaw) ? Math.max(30, Math.min(3600, Math.trunc(expiresInRaw))) : 300;

    if (!deviceId) {
      res.status(400).json({ error: 'Paramètre manquant: deviceId' });
      return;
    }
    if (!day || !parseFrDayFolder(day)) {
      res.status(400).json({ error: 'Paramètre invalide: day (attendu dd-MM-yyyy)' });
      return;
    }
    if (!name || name.includes('/') || !name.toLowerCase().endsWith('.webp')) {
      res.status(400).json({ error: 'Paramètre invalide: name' });
      return;
    }

    const bucket = 'screenshots';
    const supabase = getSupabaseAndroidServerClient({ preferServiceRole: true });
    const objectPath = `${deviceId}/${day}/${name}`;
    const signed = await signOrPublicUrl({ supabase, bucket, objectPath, expiresIn });

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');
    res.status(200).json({
      deviceId,
      day,
      name,
      path: objectPath,
      mode: signed.mode,
      url: signed.url
    });
  } catch (error) {
    if (error?.missingVariables) {
      sendEnvError(res, error);
      return;
    }
    console.error('Erreur dans /api/android/screenshot-frame-url:', error);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(500).json({
      error: 'Erreur lors de la récupération de la frame',
      message: error.message
    });
  }
}

