import { create } from 'zustand';
import { getSupabase } from '../integrations/supabase';
import { isNativeApp } from '../utils/env';

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
}

interface AuthState {
  user: UserProfile | null;
  isLoading: boolean;
  showAuthModal: boolean;
  authError: string | null;

initialize: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<boolean>;
  signUpWithEmail: (email: string, password: string, displayName: string) => Promise<boolean>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  openAuthModal: () => void;
  closeAuthModal: () => void;
  clearError: () => void;
}

let listenerRegistered = false;

const toProfile = (u: any): UserProfile => ({
  id: u.id,
  email: u.email || '',
  displayName: u.user_metadata?.display_name ||
    u.user_metadata?.full_name ||
    u.email?.split('@')[0] || 'User',
  avatarUrl: u.user_metadata?.avatar_url,
});

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isLoading: true,
  showAuthModal: false,
  authError: null,

initialize: async () => {

const sb = getSupabase();
    if (sb) {
      if (!listenerRegistered) {
        listenerRegistered = true;
        sb.auth.onAuthStateChange((event, session) => {
          const prevId = get().user?.id;
          if (session?.user) {
            set({ user: toProfile(session.user), isLoading: false });
            if (session.user.id !== prevId && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
              setTimeout(() => { import('./index').then(m => m.useLibraryStore.getState().fetchFromCloud()).catch(() => {}); }, 0);
            }
          } else if (prevId && !prevId.startsWith('local-')) {
            set({ user: null });
          }
        });
      }
      try {
        const { data: { session } } = await sb.auth.getSession();
        if (session?.user) {
          set({ user: toProfile(session.user), isLoading: false });
          return;
        }
      } catch (e) {
        console.warn('[Auth] Supabase session check failed:', e);
      }
    }

const offlineUser = localStorage.getItem('nuctify_offline_user');
    if (offlineUser) {
      try {
        set({ user: JSON.parse(offlineUser), isLoading: false });
        return;
      } catch {}
    }

set({ isLoading: false });
  },

signInWithEmail: async (email, password) => {
    set({ isLoading: true, authError: null });
    const sb = getSupabase();

if (sb) {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) {
        set({ authError: error.message, isLoading: false });
        return false;
      }
      if (data.user) {
        set({
          user: toProfile(data.user),
          isLoading: false,
          showAuthModal: false,
        });
        return true;
      }
    } else {

const profile: UserProfile = {
        id: `local-${Date.now()}`,
        email,
        displayName: email.split('@')[0],
      };
      localStorage.setItem('nuctify_offline_user', JSON.stringify(profile));
      set({ user: profile, isLoading: false, showAuthModal: false });
      return true;
    }

set({ isLoading: false });
    return false;
  },

signUpWithEmail: async (email, password, displayName) => {
    set({ isLoading: true, authError: null });
    const sb = getSupabase();

if (sb) {
      const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: { data: { display_name: displayName }, emailRedirectTo: window.location.origin },
      });
      if (error) {
        set({ authError: error.message, isLoading: false });
        return false;
      }
      if (data.user && !data.session) {
        set({ authError: 'Check your inbox to confirm your email, then sign in.', isLoading: false });
        return false;
      }
      if (data.user) {
        set({
          user: toProfile(data.user),
          isLoading: false,
          showAuthModal: false,
        });
        return true;
      }
    } else {

const profile: UserProfile = {
        id: `local-${Date.now()}`,
        email,
        displayName,
      };
      localStorage.setItem('nuctify_offline_user', JSON.stringify(profile));
      set({ user: profile, isLoading: false, showAuthModal: false });
      return true;
    }

set({ isLoading: false });
    return false;
  },

signInWithGoogle: async () => {
    const sb = getSupabase();
    if (!sb) {
      set({ authError: 'Cloud backend not configured. Using offline mode.' });
      return;
    }
    if (isNativeApp()) {
      set({ authError: 'Google sign-in is not available in the app yet. Please use email.' });
      return;
    }
    const { error } = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) {
      set({ authError: error.message });
    }
  },

signOut: async () => {
    const sb = getSupabase();
    if (sb) {
      const { error } = await sb.auth.signOut();
      if (error) await sb.auth.signOut({ scope: 'local' });
    }
    localStorage.removeItem('nuctify_offline_user');
    set({ user: null, showAuthModal: false });
  },

openAuthModal: () => set({ showAuthModal: true, authError: null }),
  closeAuthModal: () => set({ showAuthModal: false, authError: null }),
  clearError: () => set({ authError: null }),
}));
