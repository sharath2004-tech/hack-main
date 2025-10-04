import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

let supabaseInstance: SupabaseClient | null = null;
let supabaseConfigError: string | null = null;

if (!supabaseUrl) {
	supabaseConfigError = 'Missing environment variable VITE_SUPABASE_URL. Add it to your .env file.';
} else if (!supabaseAnonKey) {
	supabaseConfigError = 'Missing environment variable VITE_SUPABASE_ANON_KEY. Add it to your .env file.';
} else {
	try {
		supabaseInstance = createClient(supabaseUrl, supabaseAnonKey);
	} catch (error) {
		supabaseConfigError = error instanceof Error ? error.message : 'Failed to initialize Supabase client.';
	}
}

export const supabase = supabaseInstance;
export const supabaseError = supabaseConfigError;
