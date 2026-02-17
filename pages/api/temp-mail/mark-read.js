import { getSupabaseClient } from '../../../lib/server/supabase.js';

function setCors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export default async function handler(req, res) {
    setCors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const supabase = getSupabaseClient({
            urlEnv: 'TEMPMAIL_SUPABASE_URL',
            keyEnv: 'TEMPMAIL_SUPABASE_SERVICE_ROLE_KEY'
        });
        const emailId = String(req.body?.emailId ?? '').trim();
        if (!emailId) return res.status(400).json({ error: 'emailId requis' });

        const { error } = await supabase.from('emails').update({ is_read: true }).eq('id', emailId);
        if (error) throw error;
        return res.status(200).json({ ok: true });
    } catch (error) {
        const payload = { error: 'Erreur /temp-mail/mark-read', message: error?.message || String(error) };
        if (error?.code === 'SUPABASE_ENV_MISSING') payload.missingVariables = error.missingVariables;
        return res.status(500).json(payload);
    }
}

