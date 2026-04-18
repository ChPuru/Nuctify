import { create } from 'zustand';
import { getSupabase, isSupabaseConfigured } from '../integrations/supabase';

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

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isLoading: true,
  showAuthModal: false,
  authError: null,

initialize: async () => {

const sb = getSupabase();
    if (sb) {
      try {
        const { data: { session } } = await sb.auth.getSession();
        if (session?.user) {
          set({
            user: {
              id: session.user.id,
              email: session.user.email || '',
              displayName: session.user.user_metadata?.display_name ||
                session.user.user_metadata?.full_name ||
                session.user.email?.split('@')[0] || 'User',
              avatarUrl: session.user.user_metadata?.avatar_url,
            },
            isLoading: false,
          });

sb.auth.onAuthStateChange((_event, session) => {
            if (session?.user) {
              set({
                user: {
                  id: session.user.id,
                  email: session.user.email || '',
                  displayName: session.user.user_metadata?.display_name ||
                    session.user.user_metadata?.full_name ||
                    session.user.email?.split('@')[0] || 'User',
                  avatarUrl: session.user.user_metadata?.avatar_url,
                },
              });
            } else {
              set({ user: null });
            }
          });
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
          user: {
            id: data.user.id,
            email: data.user.email || '',
            displayName: data.user.user_metadata?.display_name ||
              data.user.email?.split('@')[0] || 'User',
          },
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
        options: { data: { display_name: displayName } },
      });
      if (error) {
        set({ authError: error.message, isLoading: false });
        return false;
      }
      if (data.user) {
        set({
          user: {
            id: data.user.id,
            email: data.user.email || '',
            displayName,
          },
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
      await sb.auth.signOut();
    }
    localStorage.removeItem('nuctify_offline_user');
    set({ user: null, showAuthModal: false });
  },

openAuthModal: () => set({ showAuthModal: true, authError: null }),
  closeAuthModal: () => set({ showAuthModal: false, authError: null }),
  clearError: () => set({ authError: null }),
}));
