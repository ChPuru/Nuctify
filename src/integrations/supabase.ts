import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

let supabase: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;

if (!supabase) {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        storageKey: 'nuctify_auth',
      },
    });
  }
  return supabase;
}

export function isSupabaseConfigured(): boolean {
  return !!(SUPABASE_URL && SUPABASE_ANON_KEY);
}

export async function syncUserData(
  userId: string,
  key: string,
  data: any
): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;

try {
    await sb.from('user_data').upsert(
      { user_id: userId, data_key: key, data_value: JSON.stringify(data), updated_at: new Date().toISOString() },
      { onConflict: 'user_id,data_key' }
    );
  } catch (e) {
    console.error('[Supabase] Sync failed:', e);
  }
}

export async function fetchUserData(
  userId: string,
  key: string
): Promise<any | null> {
  const sb = getSupabase();
  if (!sb) return null;

try {
    const { data, error } = await sb
      .from('user_data')
      .select('data_value')
      .eq('user_id', userId)
      .eq('data_key', key)
      .single();

if (error || !data) return null;
    return JSON.parse(data.data_value);
  } catch (e) {
    console.error('[Supabase] Fetch failed:', e);
    return null;
  }
}
