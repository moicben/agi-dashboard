import { getSupabaseAndroidServerClient, sendEnvError } from '../../../lib/supabaseServer.js';

const ALLOWED_COMMANDS = new Set([
  'tap',
  'double_tap',
  'long_press',
  'swipe',
  'global_action',
  'click_node',
  'set_text',
  'open_app'
]);

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const deviceId = typeof body.deviceId === 'string' ? body.deviceId.trim() : '';
    const commandType = typeof body.commandType === 'string' ? body.commandType.trim() : '';
    const payload = isPlainObject(body.payload) ? body.payload : {};

    if (!deviceId) {
      res.status(400).json({ error: 'deviceId manquant' });
      return;
    }
    if (!commandType || !ALLOWED_COMMANDS.has(commandType)) {
      res.status(400).json({ error: 'commandType invalide', allowed: Array.from(ALLOWED_COMMANDS) });
      return;
    }

    const supabase = getSupabaseAndroidServerClient();
    const { data, error } = await supabase
      .from('commands')
      .insert({
        device_id: deviceId,
        command_type: commandType,
        payload,
        status: 'pending'
      })
      .select('id, created_at, executed_at, device_id, command_type, payload, status, result')
      .single();

    if (error) throw error;

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');
    res.status(200).json({ command: data });
  } catch (error) {
    if (error?.missingVariables) {
      sendEnvError(res, error);
      return;
    }
    console.error('Erreur dans /api/android/send-command:', error);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(500).json({
      error: "Erreur lors de l'envoi de la commande",
      message: error.message
    });
  }
}

