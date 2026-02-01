import { getSupabaseAndroidServerClient, sendEnvError } from '../../../lib/supabaseServer.js';

function computeOnline(lastSeenAt) {
  if (!lastSeenAt) return false;
  const t = new Date(lastSeenAt).getTime();
  if (!Number.isFinite(t)) return false;
  return Date.now() - t <= 12_000; // ~12s
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const supabase = getSupabaseAndroidServerClient();

    const { data, error } = await supabase
      .from('devices')
      .select('id, created_at, updated_at, last_seen_at, last_package_name, status')
      .order('last_seen_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) throw error;

    const devices = (data || []).map((d) => ({
      ...d,
      online: computeOnline(d?.last_seen_at)
    }));

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');
    res.status(200).json({ devices });
  } catch (error) {
    if (error?.missingVariables) {
      sendEnvError(res, error);
      return;
    }
    console.error('Erreur dans /api/android/devices:', error);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(500).json({
      error: 'Erreur lors de la récupération des devices',
      message: error.message
    });
  }
}

