// ============================================================================
// Supabase Client Initialization
// Securely configured using environment variables from .env.local
// ============================================================================

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || "").trim();
const supabaseKey = (
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  ""
).trim();

/**
 * Validates whether Supabase environment variables are actively configured.
 */
export const isSupabaseConfigured: boolean = Boolean(
  supabaseUrl &&
  supabaseKey &&
  (supabaseUrl.startsWith("http://") || supabaseUrl.startsWith("https://")) &&
  !supabaseUrl.includes("your-project-id")
);

/**
 * Shared Supabase Client instance.
 * Gracefully defaults to null if VITE_SUPABASE_URL has not yet been set in .env.local,
 * preventing unhandled application initialization crashes.
 */
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null;

if (!isSupabaseConfigured) {
  if (typeof window !== "undefined") {
    if (!supabaseUrl) {
      console.info(
        "[Supabase] VITE_SUPABASE_URL is not set yet in .env.local. The app is running smoothly in local/fallback storage mode."
      );
    }
  }
}
