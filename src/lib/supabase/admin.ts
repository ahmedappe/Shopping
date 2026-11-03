import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Supabase client with the service-role (secret) key. It bypasses all
 * security rules, so it is ONLY used for Auth admin tasks (creating users,
 * setting passwords, disabling accounts) after the caller has been checked
 * to be an admin. Never import this into a client component.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const hasAdminKey = () => Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
