import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigured = Boolean(url && anonKey);

// Placeholder values keep the app rendering (the login page shows a setup notice) until .env is filled in.
export const supabase = createClient(url || 'http://localhost', anonKey || 'missing-anon-key');
