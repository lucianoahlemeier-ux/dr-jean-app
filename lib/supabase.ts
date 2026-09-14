import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Server-only Supabase client using the service role key. NEVER import this
// into a client component — the service role key must never reach the browser.

let cached: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  cached = createClient(url, key, {
    auth: { persistSession: false },
  });
  return cached;
}

/** Bucket used to hold the raw upload *temporarily* during generation only. */
export const UPLOADS_BUCKET = "uploads";
/** Bucket for optional user-supplied group cover photos (not the chat). */
export const COVERS_BUCKET = "covers";
