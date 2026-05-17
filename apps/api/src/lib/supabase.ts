import { createClient } from '@supabase/supabase-js';
import { parseApiEnv } from '@eventops/config';

export function getSupabaseAdmin() {
  const env = parseApiEnv(process.env);

  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function getSupabaseAuth() {
  const env = parseApiEnv(process.env);

  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}