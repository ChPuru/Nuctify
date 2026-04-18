import { useState } from 'react';
import { useAuthStore } from '../store/auth';
import { isSupabaseConfigured } from '../integrations/supabase';

type AuthMode = 'signin' | 'signup';

export default function AuthModal() {
  const { signInWithEmail, signUpWithEmail, signInWithGoogle, closeAuthModal, authError, isLoading, clearError } = useAuthStore();
  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);

const cloudEnabled = isSupabaseConfigured();

const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'signin') {
      await signInWithEmail(email, password);
    } else {
      await signUpWithEmail(email, password, displayName || email.split('@')[0]);
    }
  };

const switchMode = () => {
    setMode(mode === 'signin' ? 'signup' : 'signin');
    clearError();
  };

return (
    <div
      className="fixed inset-0 z-[500] flex items-center justify-center bg-black/70 backdrop-blur-md animate-[fadeIn_0.2s_ease-out]"
      onClick={closeAuthModal}
    >
      <div
        className="w-full max-w-md bg-surface-container-high border border-white/10 rounded-[2rem] shadow-[0_40px_120px_rgba(0,0,0,0.7)] overflow-hidden animate-[slideUp_0.3s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        {}
        <div className="relative p-8 pb-6 text-center">
          <button
            onClick={closeAuthModal}
            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"
          >
            <span className="material-symbols-outlined text-slate-400 text-lg">close</span>
          </button>

<h1 className="text-3xl font-headline font-extrabold bg-gradient-to-r from-[#ba9eff] to-[#53ddfc] bg-clip-text text-transparent mb-1">
            Nuctify
          </h1>
          <p className="text-sm text-slate-400">
            {mode === 'signin' ? 'Welcome back' : 'Create your account'}
          </p>
        </div>

{}
        <form onSubmit={handleSubmit} className="px-8 pb-4 space-y-4">
          {mode === 'signup' && (
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5 block">Display Name</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
                className="w-full bg-surface-container border-none rounded-xl py-3 px-4 text-white placeholder:text-slate-600 focus:ring-2 focus:ring-primary text-sm"
              />
            </div>
          )}

<div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5 block">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              className="w-full bg-surface-container border-none rounded-xl py-3 px-4 text-white placeholder:text-slate-600 focus:ring-2 focus:ring-primary text-sm"
            />
          </div>

<div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5 block">Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                className="w-full bg-surface-container border-none rounded-xl py-3 px-4 pr-12 text-white placeholder:text-slate-600 focus:ring-2 focus:ring-primary text-sm"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors"
              >
                <span className="material-symbols-outlined text-lg">{showPassword ? 'visibility_off' : 'visibility'}</span>
              </button>
            </div>
          </div>

{}
          {authError && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-error/10 border border-error/20 text-error text-xs font-medium">
              <span className="material-symbols-outlined text-base">error</span>
              {authError}
            </div>
          )}

{}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3.5 rounded-xl bg-gradient-to-r from-primary to-secondary text-on-primary-container font-bold text-sm disabled:opacity-50 hover:shadow-[0_8px_32px_rgba(186,158,255,0.3)] transition-all active:scale-[0.98]"
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {mode === 'signin' ? 'Signing in...' : 'Creating account...'}
              </span>
            ) : (
              mode === 'signin' ? 'Sign In' : 'Create Account'
            )}
          </button>

{}
          {cloudEnabled && (
            <>
              <div className="flex items-center gap-4 my-2">
                <div className="flex-1 h-px bg-white/10" />
                <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">or</span>
                <div className="flex-1 h-px bg-white/10" />
              </div>

<button
                type="button"
                onClick={signInWithGoogle}
                className="w-full py-3 rounded-xl bg-white/5 border border-white/10 text-white font-semibold text-sm hover:bg-white/10 transition-colors flex items-center justify-center gap-3 active:scale-[0.98]"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Continue with Google
              </button>
            </>
          )}

{!cloudEnabled && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-surface-container text-xs text-slate-400">
              <span className="material-symbols-outlined text-base">info</span>
              Running in offline mode. Data is stored locally on this device.
            </div>
          )}
        </form>

{}
        <div className="px-8 pb-8 pt-2 text-center">
          <p className="text-sm text-slate-400">
            {mode === 'signin' ? "Don't have an account?" : 'Already have an account?'}
            <button
              onClick={switchMode}
              className="text-primary font-bold ml-1 hover:underline"
            >
              {mode === 'signin' ? 'Sign Up' : 'Sign In'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
