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
    const root = `${deviceId}/screenshots`;

    const { data: days, error: daysErr } = await supabase.storage.from(bucket).list(root, {
      limit: 200,
      offset: 0,
      sortBy: { column: 'name', order: 'desc' }
    });
    if (daysErr) throw daysErr;

    const out = (days || [])
      .map((it) => {
        const parsed = parseFrDayFolder(it?.name);
        return parsed ? { name: it.name, date: parsed.toISOString() } : null;
      })
      .filter(Boolean)
      .sort((a, b) => String(b.name).localeCompare(String(a.name)));

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');
    res.status(200).json({ days: out });
  } catch (error) {
    if (error?.missingVariables) {
      sendEnvError(res, error);
      return;
    }
    console.error('Erreur dans /api/android/screenshot-days:', error);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(500).json({
      error: 'Erreur lors de la récupération des jours',
      message: error.message
    });
  }
}

