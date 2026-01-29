import { createClient } from '@supabase/supabase-js';

const FUNNEL_EVENTS = ['visit', 'login', 'adb_pair', 'adb_connect'];

async function countBookings({ supabase, startDate, endDate }) {
  // "Bookings" = contacts dont status = 'booked' sur la période (basé sur contacts.created_at)
  // NB: on se base sur updated_at pour dater le passage en "booked".
  let query = supabase
    .from('contacts')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'booked');

  if (startDate && endDate) {
    query = query.gte('updated_at', startDate.toISOString()).lte('updated_at', endDate.toISOString());
  }

  const { error, count } = await query;
  if (error) throw error;
  return typeof count === 'number' ? count : 0;
}

async function fetchEventsPaginated({ supabase, startDate, endDate }) {
  const pageSize = 1000;
  let from = 0;
  const rows = [];

  while (true) {
    const to = from + pageSize - 1;

    let query = supabase
      .from('events')
      .select('contact_id, event_type, created_at')
      .in('event_type', FUNNEL_EVENTS)
      .not('contact_id', 'is', null)
      .order('created_at', { ascending: true })
      .range(from, to);

    if (startDate && endDate) {
      query = query.gte('created_at', startDate.toISOString()).lte('created_at', endDate.toISOString());
    }

    const { data, error } = await query;
    if (error) throw error;

    const page = data || [];
    rows.push(...page);

    if (page.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

export default async function handler(req, res) {
  try {
    // Configuration Supabase depuis les variables d'environnement
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
    
    let startDate = null;
    let endDate = null;
    
    if (req.query.start && req.query.end) {
      startDate = new Date(req.query.start);
      endDate = new Date(req.query.end);
    }

    // On calcule un funnel "par contact" (contacts uniques) sur la période.
    // Pipeline imposé: bookings -> visit -> login -> adb_pair -> adb_connect
    const events = await fetchEventsPaginated({ supabase, startDate, endDate });

    // contact_id -> Set(event_type)
    const contactEventTypes = new Map();
    for (const ev of events || []) {
      const cid = ev?.contact_id;
      const t = ev?.event_type;
      if (!cid || !t) continue;
      let set = contactEventTypes.get(cid);
      if (!set) {
        set = new Set();
        contactEventTypes.set(cid, set);
      }
      set.add(t);
    }

    const bookings = await countBookings({ supabase, startDate, endDate });

    let visit = 0;
    let login = 0;
    let adbPair = 0;
    let adbConnect = 0;

    for (const types of contactEventTypes.values()) {
      // On "reconstruit" un funnel monotone même si les events visit ne sont pas backfill.
      // Visit = a eu un event du funnel (visit OU étapes suivantes)
      // Login = a eu login OU étapes suivantes, etc.
      const reachedVisit = types.size > 0;
      const reachedLogin = types.has('login') || types.has('adb_pair') || types.has('adb_connect');
      const reachedAdbPair = types.has('adb_pair') || types.has('adb_connect');
      const reachedAdbConnect = types.has('adb_connect');

      if (reachedVisit) visit += 1;
      if (reachedLogin) login += 1;
      if (reachedAdbPair) adbPair += 1;
      if (reachedAdbConnect) adbConnect += 1;
    }

    const pct = (num, den) => {
      if (!den || den <= 0) return 0;
      return Number(((Number(num) / Number(den)) * 100).toFixed(1));
    };
    
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');
    res.status(200).json({
      funnel: {
        bookings,
        visit,
        login,
        adbPair,
        adbConnect
      },
      conversions: {
        toVisit: pct(visit, bookings),
        toLogin: pct(login, bookings),
        toAdbPair: pct(adbPair, bookings),
        toAdbConnect: pct(adbConnect, bookings)
      },
      // Gardé pour compat UI, mais la DB simplifiée ne relie plus les events à une "identity".
      availableIdentities: [],
      period: {
        start: startDate ? startDate.toISOString() : null,
        end: endDate ? endDate.toISOString() : null
      },
      filters: {}
    });
    
  } catch (error) {
    console.error('Erreur dans /api/analytics:', error);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(500).json({
      error: 'Erreur lors de la récupération des analytics',
      message: error.message
    });
  }
}
