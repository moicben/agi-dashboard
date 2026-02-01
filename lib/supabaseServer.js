import { createClient } from '@supabase/supabase-js';

function getEnv(name) {
  const v = process.env[name];
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function makeSupabaseServerClient(
  { urlVar, anonKeyVar, serviceRoleKeyVar },
  { preferServiceRole = false } = {}
) {
  const url = getEnv(urlVar);
  const anonKey = getEnv(anonKeyVar);
  const serviceRoleKey = getEnv(serviceRoleKeyVar);

  if (!url) {
    const err = new Error(`Variable d'environnement manquante: ${urlVar}`);
    err.missingVariables = [urlVar];
    throw err;
  }

  const key = preferServiceRole ? (serviceRoleKey || anonKey) : (anonKey || serviceRoleKey);
  if (!key) {
    const err = new Error(
      `Variables d'environnement manquantes: ${anonKeyVar} (et/ou ${serviceRoleKeyVar})`
    );
    err.missingVariables = [anonKeyVar, serviceRoleKeyVar];
    throw err;
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });
}

export function getSupabaseServerClient({ preferServiceRole = false } = {}) {
  return makeSupabaseServerClient(
    {
      urlVar: 'SUPABASE_URL',
      anonKeyVar: 'SUPABASE_ANON_KEY',
      serviceRoleKeyVar: 'SUPABASE_SERVICE_ROLE_KEY'
    },
    { preferServiceRole }
  );
}

// Client dédié au sous-système Android (DB "Android")
export function getSupabaseAndroidServerClient({ preferServiceRole = false } = {}) {
  return makeSupabaseServerClient(
    {
      urlVar: 'SUPABASE_ANDROID_URL',
      anonKeyVar: 'SUPABASE_ANDROID_ANON_KEY',
      serviceRoleKeyVar: 'SUPABASE_ANDROID_SERVICE_ROLE_KEY'
    },
    { preferServiceRole }
  );
}

export function sendEnvError(res, error) {
  const missing = Array.isArray(error?.missingVariables) ? error.missingVariables : null;
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  res.status(500).json({
    error: 'Configuration incomplète',
    message: error?.message || 'Configuration Supabase incomplète.',
    missingVariables: missing ?? undefined
  });
}

