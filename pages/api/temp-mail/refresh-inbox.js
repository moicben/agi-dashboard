import { getSupabaseClient } from '../../../lib/server/supabase.js';
import { fetchTempMailInboxEmails } from '../../../lib/server/tempmail.js';

function setCors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function toIsoFromTempEmail(tempEmail) {
    // Temp-Mail API is not super stable, so we try multiple shapes.
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

        const inboxId = String(req.body?.inboxId ?? '').trim();
        if (!inboxId) return res.status(400).json({ error: 'inboxId requis' });

        const { data: inbox, error: inboxError } = await supabase
            .from('inboxes')
            .select('*')
            .eq('id', inboxId)
            .single();
        if (inboxError) throw inboxError;
        if (!inbox?.email) return res.status(400).json({ error: 'Inbox invalide' });

        const { data: existingEmails, error: existingError } = await supabase
            .from('emails')
            .select('external_id')
            .eq('inbox_id', inboxId);
        if (existingError) throw existingError;

        const existingSet = new Set((existingEmails || []).map((e) => String(e?.external_id || '').trim()).filter(Boolean));

        const tempEmails = await fetchTempMailInboxEmails(inbox.email);
        if (!Array.isArray(tempEmails) || tempEmails.length === 0) {
            return res.status(200).json({ ok: true, newEmailsCount: 0, inserted: [] });
        }

        const toInsert = [];
        for (const t of tempEmails) {
            const externalId = String(t?.mail_id || t?.id || '').trim();
            if (!externalId) continue;
            if (existingSet.has(externalId)) continue;
            toInsert.push(mapTempEmailToRow(t, inbox));
        }

        if (toInsert.length === 0) {
            return res.status(200).json({ ok: true, newEmailsCount: 0, inserted: [] });
        }

        const { data: inserted, error: insertError } = await supabase
            .from('emails')
            .insert(toInsert)
            .select('*');
        if (insertError) throw insertError;

        return res.status(200).json({
            ok: true,
            newEmailsCount: inserted?.length || 0,
            inserted: inserted || []
        });
    } catch (error) {
        const payload = { error: 'Erreur /temp-mail/refresh-inbox', message: error?.message || String(error) };
        if (error?.code === 'SUPABASE_ENV_MISSING' || error?.code === 'RAPIDAPI_ENV_MISSING') {
            payload.missingVariables = error.missingVariables;
        }
        return res.status(500).json(payload);
    }
}

