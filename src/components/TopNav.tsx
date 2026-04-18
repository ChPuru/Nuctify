import { useState, useRef, useEffect } from 'react';
import { useAuthStore } from '../store/auth';

export default function TopNav() {
  const { user, signOut } = useAuthStore();
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

const initials = user?.displayName
    ? user.displayName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : '?';

return (
    <header className="fixed top-0 right-0 w-full lg:pl-64 h-16 flex justify-between items-center px-6 lg:px-8 z-30 bg-[#0e0e13]/60 backdrop-blur-xl font-['Manrope'] text-sm tracking-[0.05em] transition-all">
      <div className="flex items-center gap-4 flex-1">
        <div className="text-xl font-black text-white lg:hidden bg-gradient-to-r from-[#ba9eff] to-[#53ddfc] bg-clip-text text-transparent">Nuctify</div>
      </div>

<div className="flex items-center gap-4">
        {}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="flex items-center gap-3 px-3 py-1.5 rounded-full hover:bg-white/5 transition-colors cursor-pointer group"
          >
            {user ? (
              <>
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-xs font-bold text-on-primary-container flex-shrink-0">
                  {initials}
                </div>
                <span className="hidden md:block text-sm font-semibold text-white group-hover:text-primary transition-colors max-w-[120px] truncate">{user.displayName || user.email}</span>
              </>
            ) : (
              <>
                <div className="w-8 h-8 rounded-full bg-surface-container-highest flex items-center justify-center border border-outline-variant/15">
                  <span className="material-symbols-outlined text-on-surface-variant text-lg">person</span>
                </div>
                <span className="hidden md:block text-sm font-semibold text-slate-400">Sign In</span>
              </>
            )}
            <span className="material-symbols-outlined text-slate-400 text-sm hidden md:block">expand_more</span>
          </button>

{}
          {showDropdown && (
            <div className="absolute top-full right-0 mt-2 w-64 bg-surface-container-high/95 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.6)] overflow-hidden animate-[fadeIn_0.15s_ease-out] z-50">
              {user ? (
                <>
                  <div className="p-4 border-b border-white/5">
                    <p className="text-sm font-bold text-white truncate">{user.displayName || 'User'}</p>
                    <p className="text-[11px] text-slate-400 truncate mt-0.5">{user.email}</p>
                  </div>
                  <div className="p-2">
                    <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-slate-300 hover:bg-white/5 hover:text-white transition-colors">
                      <span className="material-symbols-outlined text-lg">account_circle</span>
                      Profile
                    </button>
                    <button
                      onClick={() => { signOut(); setShowDropdown(false); }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-error hover:bg-error/10 transition-colors"
                    >
                      <span className="material-symbols-outlined text-lg">logout</span>
                      Sign Out
                    </button>
                  </div>
                </>
              ) : (
                <div className="p-4 text-center">
                  <p className="text-sm text-slate-400 mb-3">Sign in to sync your data</p>
                  <button
                    onClick={() => { useAuthStore.getState().openAuthModal(); setShowDropdown(false); }}
                    className="w-full py-2.5 rounded-xl bg-gradient-to-r from-primary to-secondary text-on-primary-container font-bold text-sm hover:shadow-[0_8px_24px_rgba(186,158,255,0.3)] transition-all active:scale-95"
                  >
                    Sign In / Sign Up
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
