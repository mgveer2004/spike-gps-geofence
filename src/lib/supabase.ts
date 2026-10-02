import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// Spike only: direct connection with the public anon key (no login, no session storage).
export const supabase = createClient(
  supabaseUrl ?? 'http://missing-supabase-url.invalid',
  supabaseAnonKey ?? 'missing-anon-key',
  { auth: { persistSession: false, autoRefreshToken: false } },
);
