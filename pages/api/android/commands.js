import { getSupabaseServerClient, sendEnvError } from '../../../lib/supabaseServer.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const deviceId = typeof req.query.deviceId === 'string' ? req.query.deviceId.trim() : '';
    const limitRaw = typeof req.query.limit === 'string' ? Number(req.query.limit) : 80;
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(300, limitRaw)) : 80;

    if (!deviceId) {
      res.status(400).json({ error: 'Paramètre manquant: deviceId' });
      return;
    }

    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from('android_commands')
      .select('id, created_at, executed_at, device_id, command_type, payload, status, result')
      .eq('device_id', deviceId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');
    res.status(200).json({ commands: data || [] });
  } catch (error) {
    if (error?.missingVariables) {
      sendEnvError(res, error);
      return;
    }
    console.error('Erreur dans /api/android/commands:', error);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(500).json({
      error: 'Erreur lors de la récupération des commandes',
      message: error.message
    });
  }
}

