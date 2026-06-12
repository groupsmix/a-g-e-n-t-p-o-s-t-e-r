import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getEnv } from "@repo/config";

let supabaseClient: SupabaseClient | undefined;

export function getSupabase(): SupabaseClient {
  if (!supabaseClient) {
    const env = getEnv();
    supabaseClient = createClient(
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY,
    );
  }
  return supabaseClient;
}
