import { createClient } from '@supabase/supabase-js';

const PAGE_SIZE = 50;

function getSafePage(value) {
  const n = Number.parseInt(String(value ?? '0'), 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

export default async function handler(req, res) {
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      const missingVars = [];
      if (!SUPABASE_URL) missingVars.push('SUPABASE_URL');
      if (!SUPABASE_ANON_KEY) missingVars.push('SUPABASE_ANON_KEY');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.status(500).json({
        error: 'Configuration incomplète',
        message: `Variables d'environnement manquantes: ${missingVars.join(', ')}. Veuillez les ajouter dans votre fichier .env.`,
        missingVariables: missingVars
      });
      return;
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    const identityIdRaw = req.query.identityId;
    const identityId = identityIdRaw ? String(identityIdRaw) : null;

    const page = getSafePage(req.query.page);
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let startDate = null;
    let endDate = null;
    if (req.query.start && req.query.end) {
      startDate = new Date(req.query.start);
      endDate = new Date(req.query.end);
      endDate.setHours(23, 59, 59, 999);
    }

    // NB: relations PostgREST basées sur les FKs:
    // - events.meeting_id -> meetings.internal_id (events_meeting_id_fkey)
    // - meetings.contact_id -> contacts.id (meetings_contact_id_fkey)
    let query = supabase
      .from('events')
      .select(
        `
          id,
          created_at,
          event_type,
          meeting_id,
          meetings:meetings!events_meeting_id_fkey!inner (
            participant_email,
            status,
            comment,
            identity_id,
            contact_id,
            contacts:contacts!meetings_contact_id_fkey (
              additional_data
            )
          )
        `,
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .range(from, to);

    if (startDate && endDate) {
      query = query.gte('created_at', startDate.toISOString()).lte('created_at', endDate.toISOString());
    }

    // Filtrage identité (utilise la colonne de la table jointe)
    if (identityId) {
      query = query.eq('meetings.identity_id', identityId);
    }

    const { data, error, count } = await query;
    if (error) throw error;

    const items = (data || []).map((row) => {
      const meeting = row?.meetings || null;
      const contact = meeting?.contacts || null;
      return {
        eventId: row?.id ?? null,
        eventAt: row?.created_at ?? null,
        eventType: row?.event_type ?? null,
        meetingId: row?.meeting_id ?? null,
        participantEmail: meeting?.participant_email ?? null,
        meetingStatus: meeting?.status ?? null,
        meetingComment: meeting?.comment ?? null,
        contactAdditionalData: contact?.additional_data ?? null
      };
    });

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');
    res.status(200).json({
      items,
      page,
      pageSize: PAGE_SIZE,
      total: typeof count === 'number' ? count : null,
      filters: {
        identityId,
        start: startDate ? startDate.toISOString() : null,
        end: endDate ? endDate.toISOString() : null
      }
    });
  } catch (error) {
    console.error('Erreur dans /api/conversions:', error);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(500).json({
      error: 'Erreur lors de la récupération des conversions',
      message: error.message
    });
  }
}

