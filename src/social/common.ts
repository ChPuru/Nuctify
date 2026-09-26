import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabase } from '../integrations/supabase';
import { useAuthStore, type UserProfile } from '../store/auth';
import { useToastStore } from '../store/toast';

export type SocialStatus = 'ready' | 'not-configured' | 'signed-out';

export interface SocialCtx { sb: SupabaseClient; user: UserProfile }

/** Offline "local-" users (created when Supabase is absent) can't use cloud social features. */
const isCloudUser = (u: UserProfile | null): u is UserProfile => !!u && !u.id.startsWith('local-');

export function socialStatus(user = useAuthStore.getState().user): SocialStatus {
  if (!getSupabase()) return 'not-configured';
  return isCloudUser(user) ? 'ready' : 'signed-out';
}

export function useSocialStatus(): SocialStatus {
  const user = useAuthStore((s) => s.user);
  return socialStatus(user);
}

/** Returns the client + user, or toasts why social features are unavailable and returns null. */
export function requireSocial(): SocialCtx | null {
  const status = socialStatus();
  const sb = getSupabase();
  const user = useAuthStore.getState().user;
  if (status === 'ready' && sb && user) return { sb, user };
  if (status === 'not-configured') toast('Cloud features need Supabase configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)', 'error');
  else { toast('Sign in to use this feature', 'info'); useAuthStore.getState().openAuthModal(); }
  return null;
}

export const toast = (msg: string, type: 'success' | 'error' | 'info' | 'warning' = 'info') => useToastStore.getState().addToast(msg, type);

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function genCode(len = 6): string {
  const buf = new Uint32Array(len);
  crypto.getRandomValues(buf);
  return Array.from(buf, (n) => ALPHABET[n % ALPHABET.length]).join('');
}
export const normalizeCode = (c: string) => c.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);

export type LinkKind = 'jam' | 'blend' | 'collab';
export const shareLink = (kind: LinkKind, code: string) =>
  `${window.location.origin}${window.location.pathname}#${kind}:${code}`;

export async function copyText(text: string, what = 'Link'): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast(`${what} copied`, 'success');
  } catch {
    toast(text, 'info');
  }
}

export const errMsg = (e: unknown) => (e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : String(e));
