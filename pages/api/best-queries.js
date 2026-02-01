import { getSupabaseServerClient, sendEnvError } from '../../lib/supabaseServer.js';

const DEFAULT_LIMIT = 25;
const FUNNEL_EVENTS = ['visit', 'login', 'adb_pair', 'adb_connect'];

function getSafeLimit(value) {
  const n = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(n, 200);
}

async function fetchEventsWithQueriesPaginated({ supabase, startDate, endDate }) {
  const pageSize = 1000;
  let from = 0;
  const rows = [];

  while (true) {
    const to = from + pageSize - 1;

    let query = supabase
      .from('events')
      .select(
        `
          contact_id,
          event_type,
          created_at,
          contacts:contacts!events_contact_id_fkey (
            source_query
          )
        `
      )
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
    let supabase;
    try {
      supabase = getSupabaseServerClient();
    } catch (e) {
      sendEnvError(res, e);
      return;
    }

    let startDate = null;
    let endDate = null;
    if (req.query.start && req.query.end) {
      startDate = new Date(req.query.start);
      endDate = new Date(req.query.end);
    }
    const limit = getSafeLimit(req.query.limit);

    // Agrégation par source_query
    const byQuery = new Map();
    const normalizeQuery = (q) => {
      const s = String(q ?? '').trim();
      return s;
    };

    const events = await fetchEventsWithQueriesPaginated({ supabase, startDate, endDate });

    // On compte des contacts uniques "qui ont atteint l'étape" (funnel monotone).
    // query -> { reached: { visit, login, adbPair, adbConnect } }
    for (const ev of events || []) {
      const contactId = ev?.contact_id;
      if (!contactId) continue;

      const query = normalizeQuery(ev?.contacts?.source_query);
      if (!query) continue;

      const t = String(ev?.event_type ?? '').trim();
      if (!t) continue;

      let agg = byQuery.get(query);
      if (!agg) {
        agg = {
          query,
          reached: {
            visit: new Set(),
            login: new Set(),
            adbPair: new Set(),
            adbConnect: new Set()
          }
        };
        byQuery.set(query, agg);
      }

      // visit = a un event funnel (quel qu'il soit)
      agg.reached.visit.add(contactId);
      // login = a login OU étapes suivantes
      if (t === 'login' || t === 'adb_pair' || t === 'adb_connect') agg.reached.login.add(contactId);
      // adb_pair = a adb_pair OU étapes suivantes
      if (t === 'adb_pair' || t === 'adb_connect') agg.reached.adbPair.add(contactId);
      // adb_connect = a adb_connect
      if (t === 'adb_connect') agg.reached.adbConnect.add(contactId);
    }

    const items = [...byQuery.values()]
      .map((r) => {
        const visitCount = r.reached.visit.size;
        const loginCount = r.reached.login.size;
        const adbPairCount = r.reached.adbPair.size;
        const adbConnectCount = r.reached.adbConnect.size;

        const overallCount = visitCount + loginCount + adbPairCount + adbConnectCount;

        return {
          query: r.query,
          visitCount,
          loginCount,
          adbPairCount,
          adbConnectCount,
          overallCount,
          // Champ utile pour le tri ("a généré le plus de conversion")
          conversionsCount: adbConnectCount
        };
      })
      .sort((a, b) => {
        const dc = Number(b.conversionsCount ?? 0) - Number(a.conversionsCount ?? 0);
        if (dc !== 0) return dc;
        const doverall = Number(b.overallCount ?? 0) - Number(a.overallCount ?? 0);
        if (doverall !== 0) return doverall;
        return String(a.query).localeCompare(String(b.query));
      })
      .slice(0, limit);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');
    res.status(200).json({
      items,
      limit,
      filters: {
        start: startDate ? startDate.toISOString() : null,
        end: endDate ? endDate.toISOString() : null
      }
    });
  } catch (error) {
    console.error('Erreur dans /api/best-queries:', error);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(500).json({
      error: 'Erreur lors de la récupération des best queries',
      message: error.message
    });
  }
}

