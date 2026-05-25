import { createClient } from '@supabase/supabase-js';
import { parseApiEnv } from '@eventops/config';

function createSupabaseClient(apiKey: string, accessToken?: string) {
  const globalHeaders = accessToken
    ? {
        Authorization: `Bearer ${accessToken}`,
      }
    : undefined;

  return createClient(parseApiEnv(process.env).SUPABASE_URL, apiKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    ...(globalHeaders ? { global: { headers: globalHeaders } } : {}),
  });
}

export function getSupabaseAuth() {
  const env = parseApiEnv(process.env);

  return createSupabaseClient(env.SUPABASE_ANON_KEY);
}

export function getSupabaseUser(accessToken: string) {
  const env = parseApiEnv(process.env);

  return createSupabaseClient(env.SUPABASE_ANON_KEY, accessToken);
}

export function getSupabaseAdmin() {
  const env = parseApiEnv(process.env);

  return createSupabaseClient(env.SUPABASE_SERVICE_ROLE_KEY);
}
