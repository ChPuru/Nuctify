import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

let supabase: SupabaseClient | null = null;
let broken = false;

export function getSupabase(): SupabaseClient | null {
  if (broken || !/^https?:\/\//.test(SUPABASE_URL) || !SUPABASE_ANON_KEY) return null;

if (!supabase) {
    try {
      supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          storageKey: 'nuctify_auth',
        },
      });
    } catch (e) {
      console.error('[Supabase] Invalid config:', e);
      broken = true;
      return null;
    }
  }
  return supabase;
}

export function isSupabaseConfigured(): boolean {
  return getSupabase() !== null;
}

export async function syncUserData(
  userId: string,
  key: string,
  data: any
): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;

try {
    const { error } = await sb.from('user_data').upsert(
      { user_id: userId, data_key: key, data_value: JSON.stringify(data), updated_at: new Date().toISOString() },
      { onConflict: 'user_id,data_key' }
    );
    if (error) console.error('[Supabase] Sync failed:', error.message);
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
      .maybeSingle();

    if (error || !data) return null;
    return JSON.parse(data.data_value);
  } catch (e) {
    console.error('[Supabase] Fetch failed:', e);
    return null;
  }
}

export async function sharePlaylist(
  playlist: any,
  author: string
): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;

  try {
    const { data, error } = await sb.from('shared_playlists').insert({
      name: playlist.name,
      tracks: JSON.stringify(playlist.tracks),
      author_name: author,
    }).select('id').single();

    if (error) throw error;
    return data.id;
  } catch (e) {
    console.error('[Supabase] Sharing failed:', e);
    return null;
  }
}

export async function getSharedPlaylist(id: string): Promise<any | null> {
  const sb = getSupabase();
  if (!sb) return null;

  try {
    const { data, error } = await sb.from('shared_playlists').select('*').eq('id', id).single();
    if (error || !data) return null;
    return {
      ...data,
      tracks: typeof data.tracks === 'string' ? JSON.parse(data.tracks) : data.tracks
    };
  } catch (e) {
    console.error('[Supabase] Fetch shared failed:', e);
    return null;
  }
}
