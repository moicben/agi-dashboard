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

    const page = getSafePage(req.query.page);
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let startDate = null;
    let endDate = null;
    if (req.query.start && req.query.end) {
      startDate = new Date(req.query.start);
      endDate = new Date(req.query.end);
    }

    const redactObject = (value) => {
      if (!value || typeof value !== 'object') return value;
      // Projet de recherche: ne pas masquer "password"/"pass" dans la réponse.
      // On garde le masquage pour les autres secrets courants (tokens, api keys, etc.).
      const redactKey = (k) => /otp|token|secret|api[_-]?key|code|key/i.test(String(k));
      const walk = (v) => {
        if (Array.isArray(v)) return v.map(walk);
        if (v && typeof v === 'object') {
          const out = {};
          for (const [k, vv] of Object.entries(v)) {
            out[k] = redactKey(k) ? '[REDACTED]' : walk(vv);
          }
          return out;
        }
        return v;
      };
      return walk(value);
    };

    let query = supabase
      .from('events')
      .select(
        `
          id,
          created_at,
          event_type,
          ip,
          details,
          contact_id,
          contacts:contacts!events_contact_id_fkey (
            source_query,
            additional_data
          )
        `,
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .range(from, to);

    if (startDate && endDate) {
      query = query.gte('created_at', startDate.toISOString()).lte('created_at', endDate.toISOString());
    }

    const { data, error, count } = await query;
    if (error) throw error;

    const items = (data || []).map((row) => {
      const contact = row?.contacts || null;
      return {
        eventId: row?.id ?? null,
        eventAt: row?.created_at ?? null,
        eventType: row?.event_type ?? null,
        ip: row?.ip ?? null,
        contactId: row?.contact_id ?? null,
        sourceQuery: contact?.source_query ?? null,
        contactAdditionalData: redactObject(contact?.additional_data ?? null),
        eventDetails: redactObject(row?.details ?? null)
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

