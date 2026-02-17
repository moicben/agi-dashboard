import { getSupabaseClient } from '../../../lib/server/supabase.js';
import { fetchTempMailDomains } from '../../../lib/server/tempmail.js';

function setCors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function normalizeDomain(d) {
    const s = String(d || '').trim();
    return s.startsWith('@') ? s.slice(1) : s;
}

export default async function handler(req, res) {
    setCors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const supabase = getSupabaseClient({
            urlEnv: 'TEMPMAIL_SUPABASE_URL',
            keyEnv: 'TEMPMAIL_SUPABASE_SERVICE_ROLE_KEY'
        });

        if (req.method === 'GET') {
            const { data, error } = await supabase.from('inboxes').select('*').order('created_at', { ascending: false });
            if (error) throw error;
            return res.status(200).json({ inboxes: data || [] });
        }

        if (req.method === 'POST') {
            const inputRaw = req.body?.input ?? req.body?.email ?? req.body?.name ?? '';
            const input = String(inputRaw || '').trim();
            if (!input) return res.status(400).json({ error: 'Input requis' });

            const domains = await fetchTempMailDomains();
            if (!domains.length) {
                return res.status(500).json({ error: 'Aucun domaine Temp-Mail disponible' });
            }

            const normalizedDomains = domains.map(normalizeDomain).filter(Boolean);

            let email = '';
            let name = '';

            if (input.includes('@')) {
                const [localPart, domainPart] = input.split('@');
                name = String(localPart || '').trim();
                const domain = String(domainPart || '').trim();
                if (!name || !domain) return res.status(400).json({ error: 'Adresse email invalide' });

                if (!normalizedDomains.includes(domain)) {
                    return res.status(400).json({
                        error: `Le domaine "${domain}" n'est pas supporté`,
                        availableDomains: normalizedDomains
                    });
                }
                email = `${name}@${domain}`;
            } else {
                name = input;
                const domain = normalizedDomains[Math.floor(Math.random() * normalizedDomains.length)];
                email = `${name}@${domain}`;
            }

            const { data, error } = await supabase
                .from('inboxes')
                .insert([{ email, name, is_active: true }])
                .select('*')
                .single();
            if (error) throw error;

            return res.status(200).json({ inbox: data });
        }

        if (req.method === 'DELETE') {
            const id = String(req.query?.id ?? '').trim();
            if (!id) return res.status(400).json({ error: 'Query "id" requis' });

            const { error } = await supabase.from('inboxes').delete().eq('id', id);
            if (error) throw error;
            return res.status(200).json({ ok: true });
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (error) {
        const message = error?.message || String(error);
        const payload = { error: 'Erreur /temp-mail/inboxes', message };
        if (error?.code === 'SUPABASE_ENV_MISSING' || error?.code === 'RAPIDAPI_ENV_MISSING') {
            payload.missingVariables = error.missingVariables;
        }
        return res.status(500).json(payload);
    }
}

