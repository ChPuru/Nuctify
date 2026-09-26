import { useState } from 'react';
import { useAuthStore } from '../store/auth';
import { isSupabaseConfigured } from '../integrations/supabase';
import { Button, Modal } from './ui';

type AuthMode = 'signin' | 'signup';
const INPUT = 'w-full h-12 rounded-xl bg-on-surface/[0.06] border border-on-surface/10 px-4 text-on-surface placeholder:text-on-surface-variant outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 transition-colors';
const LABEL = 'block text-sm font-semibold text-on-surface mb-1.5';

export default function AuthModal() {
  const signInWithEmail = useAuthStore(s => s.signInWithEmail);
  const signUpWithEmail = useAuthStore(s => s.signUpWithEmail);
  const signInWithGoogle = useAuthStore(s => s.signInWithGoogle);
  const closeAuthModal = useAuthStore(s => s.closeAuthModal);
  const authError = useAuthStore(s => s.authError);
  const isLoading = useAuthStore(s => s.isLoading);
  const clearError = useAuthStore(s => s.clearError);
  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const cloudEnabled = isSupabaseConfigured();
  const signin = mode === 'signin';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (signin) await signInWithEmail(email, password);
    else await signUpWithEmail(email, password, displayName || email.split('@')[0]);
  };

  const switchMode = () => { setMode(signin ? 'signup' : 'signin'); clearError(); };

  return (
    <Modal open onClose={closeAuthModal} size="sm" ariaLabel={signin ? 'Log in to Nuctify' : 'Sign up for Nuctify'} bodyClassName="px-6 pb-6 sm:px-8 sm:pb-8">
      <div className="text-center pt-2 pb-6">
        <div className="mx-auto mb-4 w-14 h-14 rounded-2xl bg-primary text-on-primary flex items-center justify-center shadow-card">
          <span aria-hidden className="material-symbols-outlined filled text-3xl">graphic_eq</span>
        </div>
        <h2 className="font-headline text-2xl sm:text-3xl font-extrabold tracking-tight text-on-surface">{signin ? 'Log in to Nuctify' : 'Sign up to start listening'}</h2>
        <p className="text-sm text-on-surface-variant mt-1.5">{signin ? 'Your library, on every device.' : 'Sync likes, playlists and history everywhere.'}</p>
      </div>

      {cloudEnabled && (
        <>
          <Button fullWidth size="lg" variant="outline" onClick={signInWithGoogle} className="gap-3">
            <svg aria-hidden className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Continue with Google
          </Button>
          <div className="flex items-center gap-4 my-5" aria-hidden>
            <div className="flex-1 h-px bg-on-surface/10" /><span className="text-xs text-on-surface-variant">or</span><div className="flex-1 h-px bg-on-surface/10" />
          </div>
        </>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {!signin && (
          <div>
            <label htmlFor="auth-name" className={LABEL}>Display name</label>
            <input id="auth-name" type="text" autoComplete="nickname" value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="What should we call you?" className={INPUT} />
          </div>
        )}
        <div>
          <label htmlFor="auth-email" className={LABEL}>Email</label>
          <input id="auth-email" type="email" autoComplete="email" inputMode="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required className={INPUT} />
        </div>
        <div>
          <label htmlFor="auth-pass" className={LABEL}>Password</label>
          <div className="relative">
            <input id="auth-pass" type={showPassword ? 'text' : 'password'} autoComplete={signin ? 'current-password' : 'new-password'} value={password}
              onChange={e => setPassword(e.target.value)} placeholder={signin ? 'Password' : 'At least 6 characters'} required minLength={6} className={`${INPUT} pr-12`} />
            <button type="button" onClick={() => setShowPassword(v => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:text-on-surface">
              <span aria-hidden className="material-symbols-outlined text-xl">{showPassword ? 'visibility_off' : 'visibility'}</span>
            </button>
          </div>
        </div>

        {authError && (
          <div role="alert" className="flex items-start gap-2 p-3 rounded-xl bg-error/10 text-error text-sm">
            <span aria-hidden className="material-symbols-outlined text-lg">error</span>{authError}
          </div>
        )}

        <Button type="submit" variant="primary" size="lg" fullWidth loading={isLoading}>{signin ? 'Log in' : 'Create account'}</Button>

        {!cloudEnabled && (
          <p className="flex items-start gap-2 text-xs text-on-surface-variant">
            <span aria-hidden className="material-symbols-outlined text-base">info</span>
            Cloud sync isn’t configured in this build, so your account and library stay on this device.
          </p>
        )}
      </form>

      <p className="text-center text-sm text-on-surface-variant mt-6">
        {signin ? 'Don’t have an account?' : 'Already have an account?'}
        <button type="button" onClick={switchMode} className="text-on-surface font-bold ml-1.5 underline-offset-2 hover:underline">{signin ? 'Sign up' : 'Log in'}</button>
      </p>
    </Modal>
  );
}
