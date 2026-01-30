import { createClient } from '@supabase/supabase-js';

function getEnv(name) {
  const v = process.env[name];
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

export function getSupabaseServerClient({ preferServiceRole = false } = {}) {
  const url = getEnv('SUPABASE_URL');
  const anonKey = getEnv('SUPABASE_ANON_KEY');
  const serviceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');

  if (!url) {
    const err = new Error("Variable d'environnement manquante: SUPABASE_URL");
    err.missingVariables = ['SUPABASE_URL'];
    throw err;
  }

  const key = preferServiceRole ? (serviceRoleKey || anonKey) : (anonKey || serviceRoleKey);
  if (!key) {
    const err = new Error(
      "Variables d'environnement manquantes: SUPABASE_ANON_KEY (et/ou SUPABASE_SERVICE_ROLE_KEY)"
    );
    err.missingVariables = ['SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];
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

