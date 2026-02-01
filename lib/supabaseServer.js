import { createClient } from '@supabase/supabase-js';

// Fallback "Engine" (prod) : utilisé si la config Vercel pointe par erreur sur la DB Android.
// NB: le client "anon" est considéré publiable (pas un secret), mais on préfère normalement
// le fournir via variables d'environnement.
const ENGINE_FALLBACK_URL = 'https://xuiiqcpbvixbogvfyvim.supabase.co';
const ENGINE_FALLBACK_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh1aWlxY3Bidml4Ym9ndmZ5dmltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk4OTU4NDUsImV4cCI6MjA4NTQ3MTg0NX0.nA4QjSRngMkKhAgR1sm_mYu9UJwxyasjVF5vZk6rxFE';

const ANDROID_PROJECT_HOST = 'etrdomykaucjcuiimjqj.supabase.co';

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
  // On corrige automatiquement une erreur de configuration fréquente en prod:
  // SUPABASE_URL / SUPABASE_ANON_KEY pointent sur la DB Android au lieu de la DB Engine.
  const envUrl = getEnv('SUPABASE_URL');
  const envAnon = getEnv('SUPABASE_ANON_KEY');
  const envService = getEnv('SUPABASE_SERVICE_ROLE_KEY');

  const looksLikeAndroid = Boolean(envUrl && envUrl.includes(ANDROID_PROJECT_HOST));
  if (!envUrl || looksLikeAndroid) {
    const key = preferServiceRole ? (envService || ENGINE_FALLBACK_ANON_KEY) : (ENGINE_FALLBACK_ANON_KEY || envService);
    return createClient(ENGINE_FALLBACK_URL, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    });
  }

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

