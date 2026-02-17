import { getSupabaseClient } from '../../../lib/server/supabase.js';

function setCors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export default async function handler(req, res) {
    setCors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const supabase = getSupabaseClient({
            urlEnv: 'TEMPMAIL_SUPABASE_URL',
            keyEnv: 'TEMPMAIL_SUPABASE_SERVICE_ROLE_KEY'
        });

        const [{ data: inboxes, error: inboxesError }, { data: emails, error: emailsError }] =
            await Promise.all([
                supabase.from('inboxes').select('*').order('created_at', { ascending: false }),
                supabase.from('emails').select('*').order('created_at', { ascending: false })
            ]);

        if (inboxesError) throw inboxesError;
        if (emailsError) throw emailsError;

        return res.status(200).json({
            inboxes: inboxes || [],
            emails: emails || []
        });
    } catch (error) {
        const payload = { error: 'Erreur /temp-mail/state', message: error?.message || String(error) };
        if (error?.code === 'SUPABASE_ENV_MISSING') payload.missingVariables = error.missingVariables;
        return res.status(500).json(payload);
    }
}

