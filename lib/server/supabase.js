import { createClient } from '@supabase/supabase-js';

export function getSupabaseClient({ urlEnv = 'SUPABASE_URL', keyEnv = 'SUPABASE_ANON_KEY' } = {}) {
    const SUPABASE_URL = process.env[urlEnv];
    const SUPABASE_ANON_KEY = process.env[keyEnv];

    const missing = [];
    if (!SUPABASE_URL) missing.push(urlEnv);
    if (!SUPABASE_ANON_KEY) missing.push(keyEnv);

    if (missing.length) {
        const err = new Error(
            `Configuration Supabase incomplète (variables manquantes: ${missing.join(', ')})`
        );
        err.code = 'SUPABASE_ENV_MISSING';
        err.missingVariables = missing;
        throw err;
    }

    return createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

