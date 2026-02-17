import { getSupabaseClient } from '../../../lib/server/supabase.js';
import { fetchTempMailInboxEmails } from '../../../lib/server/tempmail.js';

function setCors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

function toIsoFromTempEmail(tempEmail) {
    const ts = tempEmail?.mail_timestamp;
    if (Number.isFinite(Number(ts))) return new Date(Number(ts) * 1000).toISOString();
    const createdAt = tempEmail?.createdAt || tempEmail?.created_at;
    if (createdAt) {
        const d = new Date(createdAt);
        if (!Number.isNaN(d.getTime())) return d.toISOString();
    }
    return new Date().toISOString();
}

function mapTempEmailToRow(tempEmail, inbox) {
    const externalId = tempEmail?.mail_id || tempEmail?.id;
    const fromEmail = tempEmail?.mail_from || tempEmail?.from || 'Expediteur inconnu';
    const subject = tempEmail?.mail_subject || tempEmail?.subject || '(Aucun sujet)';
    const content =
        tempEmail?.mail_text_only ||
        tempEmail?.mail_html ||
        tempEmail?.text ||
        tempEmail?.html ||
        tempEmail?.body ||
        '';

    return {
        inbox_id: inbox.id,
        external_id: String(externalId ?? ''),
        from_email: String(fromEmail ?? ''),
        to_email: String(tempEmail?.mail_to || tempEmail?.to || inbox.email || ''),
        subject: String(subject ?? ''),
        content: String(content ?? ''),
        received_at: toIsoFromTempEmail(tempEmail),
        is_read: false
    };
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

        const { data: inboxes, error: inboxesError } = await supabase
            .from('inboxes')
            .select('*')
            .eq('is_active', true)
            .order('created_at', { ascending: false });
        if (inboxesError) throw inboxesError;

        let totalInserted = 0;
        const perInbox = [];

        for (const inbox of inboxes || []) {
            if (!inbox?.id || !inbox?.email) continue;

            const { data: existingEmails, error: existingError } = await supabase
                .from('emails')
                .select('external_id')
                .eq('inbox_id', inbox.id);
            if (existingError) throw existingError;

            const existingSet = new Set(
                (existingEmails || [])
                    .map((e) => String(e?.external_id || '').trim())
                    .filter(Boolean)
            );

            const tempEmails = await fetchTempMailInboxEmails(inbox.email);
            const toInsert = [];
            for (const t of Array.isArray(tempEmails) ? tempEmails : []) {
                const externalId = String(t?.mail_id || t?.id || '').trim();
                if (!externalId) continue;
                if (existingSet.has(externalId)) continue;
                toInsert.push(mapTempEmailToRow(t, inbox));
            }

            let insertedCount = 0;
            if (toInsert.length) {
                const { data: inserted, error: insertError } = await supabase
                    .from('emails')
                    .insert(toInsert)
                    .select('id');
                if (insertError) throw insertError;
                insertedCount = inserted?.length || 0;
            }

            totalInserted += insertedCount;
            perInbox.push({ inboxId: inbox.id, email: inbox.email, insertedCount });

            // petite pause pour limiter le rate limiting RapidAPI
            await sleep(350);
        }

        return res.status(200).json({ ok: true, totalInserted, perInbox });
    } catch (error) {
        const payload = { error: 'Erreur /temp-mail/refresh-all', message: error?.message || String(error) };
        if (error?.code === 'SUPABASE_ENV_MISSING' || error?.code === 'RAPIDAPI_ENV_MISSING') {
            payload.missingVariables = error.missingVariables;
        }
        return res.status(500).json(payload);
    }
}

