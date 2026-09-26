import { memo, useEffect, useState } from 'react';
import { useAuthStore } from '../store/auth';
import { usePlayerStore } from '../store';
import { useNavStore } from '../store/nav';
import { useToastStore } from '../store/toast';
import { Button, IconButton, Menu, Modal, useMenuState, cn, type MenuItem } from './ui';

export function focusSearch() {
  const player = usePlayerStore.getState();
  if (player.nowPlayingExpanded) player.toggleNowPlaying();
  const nav = useNavStore.getState();
  if (nav.currentPage !== 'search') nav.navigate('search');
  let tries = 0;
  const attempt = () => {
    const el = document.getElementById('global-search') as HTMLInputElement | null;
    if (el) { el.focus(); el.select?.(); }
    else if (tries++ < 40) setTimeout(attempt, 50);
  };
  attempt();
}

const pageStack: string[] = [useNavStore.getState().currentPage];
useNavStore.subscribe((s) => {
  if (s.currentPage === pageStack[pageStack.length - 1]) return;
  if (s.currentPage === pageStack[pageStack.length - 2]) pageStack.pop();
  else pageStack.push(s.currentPage);
});
export const canGoBack = () => pageStack.length > 1;

const ROOT_PAGES = new Set(['home', 'search', 'library']);
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

function PartyModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [code, setCode] = useState('');
  const go = (fn: () => void) => { fn(); setCode(''); onClose(); };
  return (
    <Modal open={open} onClose={onClose} title="Listening party" description="Listen together in real time. Host a room or join a friend's." size="sm">
      <div className="space-y-4">
        <Button variant="primary" icon="podcasts" fullWidth onClick={() => go(() => usePlayerStore.getState().createParty())}>Host a party</Button>
        <div className="flex items-center gap-3 text-xs text-on-surface-variant"><div className="h-px flex-1 bg-on-surface/10" />or join<div className="h-px flex-1 bg-on-surface/10" /></div>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const id = code.trim(); if (id) go(() => usePlayerStore.getState().joinParty(id)); }}>
          <label htmlFor="party-code" className="sr-only">Party code</label>
          <input id="party-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Party code" autoComplete="off"
            className="flex-1 min-w-0 h-10 rounded-full bg-surface-container-highest border-0 px-4 text-sm text-on-surface placeholder:text-on-surface-variant/70 focus:ring-2 focus:ring-primary" />
          <Button type="submit" disabled={!code.trim()}>Join</Button>
        </form>
      </div>
    </Modal>
  );
}

export default memo(function TopNav() {
  const user = useAuthStore((s) => s.user);
  const partyRoomId = usePlayerStore((s) => s.partyRoomId);
  const currentPage = useNavStore((s) => s.currentPage);
  const navigate = useNavStore((s) => s.navigate);
  const [scrolled, setScrolled] = useState(false);
  const [partyOpen, setPartyOpen] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const menu = useMenuState();

  useEffect(() => {
    let raf = 0;
    const on = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => setScrolled(window.scrollY > 12)); };
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => { window.removeEventListener('scroll', on); cancelAnimationFrame(raf); };
  }, []);

  const name = user?.displayName || user?.email || '';
  const initials = name ? name.split(/[\s@.]+/).filter(Boolean).map((w) => w[0]).join('').toUpperCase().slice(0, 2) : '';
  const isRoot = ROOT_PAGES.has(currentPage);

  const items: MenuItem[] = [
    ...(user ? [{ label: 'Profile', icon: 'account_circle', onSelect: () => navigate('profile') }] : [{ label: 'Sign in', icon: 'login', onSelect: () => useAuthStore.getState().openAuthModal() }]),
    { label: 'Your stats', icon: 'insights', onSelect: () => navigate('stats') },
    { label: 'Recently played', icon: 'history', onSelect: () => navigate('recent') },
    { label: 'Queue', icon: 'queue_music', onSelect: () => navigate('queue') },
    { label: partyRoomId ? `Leave party (${partyRoomId})` : 'Listening party', icon: 'groups', onSelect: () => (partyRoomId ? usePlayerStore.getState().leaveParty() : setPartyOpen(true)) },
    { label: 'Settings', icon: 'settings', onSelect: () => navigate('settings') },
    ...(user ? [{ divider: true }, { label: 'Log out', icon: 'logout', danger: true, onSelect: () => { useAuthStore.getState().signOut(); } }] : []),
  ];

  const goBack = () => (canGoBack() ? history.back() : navigate('home'));
  const avatar = (size: string) => user?.avatarUrl && !avatarFailed ? (
    <img src={user.avatarUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" className={cn(size, 'rounded-full object-cover')} onError={() => setAvatarFailed(true)} />
  ) : user ? (
    <span className={cn(size, 'rounded-full bg-gradient-to-br from-primary to-secondary text-on-primary text-xs font-extrabold flex items-center justify-center')}>{initials || '?'}</span>
  ) : (
    <span className={cn(size, 'rounded-full bg-surface-container-highest text-on-surface-variant flex items-center justify-center')}><span aria-hidden className="material-symbols-outlined text-xl">person</span></span>
  );

  return (
    <header
      className={cn(
        'fixed top-0 right-0 left-0 lg:left-[var(--sidebar-w)] z-30 pt-[env(safe-area-inset-top)] transition-[background-color,box-shadow] duration-200',
        scrolled ? 'bg-background shadow-[0_1px_0_rgb(var(--on-surface)/0.06)]' : 'bg-transparent',
      )}
    >
      <div className="h-[var(--topnav-h)] flex items-center gap-2 px-4 sm:px-6 lg:px-8">
        <div className="hidden lg:flex items-center gap-2">
          <IconButton icon="chevron_left" label="Go back" variant="tonal" size="sm" onClick={goBack} className="bg-background/70" />
          <IconButton icon="chevron_right" label="Go forward" variant="tonal" size="sm" onClick={() => history.forward()} className="bg-background/70" />
        </div>

        <div className="lg:hidden flex items-center gap-1 min-w-0">
          {isRoot ? (
            <button type="button" onClick={() => navigate('home')} className="flex items-center gap-2" aria-label="Nuctify home">
              <img src="/nuctify.svg" alt="" className="w-7 h-7" />
              <span className="font-headline text-lg font-extrabold tracking-tight">Nuctify</span>
            </button>
          ) : (
            <IconButton icon="arrow_back" label="Go back" onClick={goBack} className="-ml-2 text-on-surface" />
          )}
        </div>

        <div className="flex-1 flex justify-center min-w-0">
          {currentPage !== 'search' && (
            <button
              type="button"
              onClick={focusSearch}
              className="hidden lg:flex items-center gap-3 w-full max-w-md h-11 pl-4 pr-3 rounded-full bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface border border-transparent hover:border-on-surface/10 transition-colors"
            >
              <span aria-hidden className="material-symbols-outlined text-[22px]">search</span>
              <span className="flex-1 text-left text-sm">What do you want to play?</span>
              <kbd className="text-[11px] font-semibold px-1.5 py-0.5 rounded border border-on-surface/15 text-on-surface-variant">{isMac ? '⌘' : 'Ctrl'} K</kbd>
            </button>
          )}
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          {partyRoomId && (
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(partyRoomId).then(() => useToastStore.getState().addToast('Party code copied', 'success'), () => {})}
              className="flex items-center gap-1.5 h-8 px-3 rounded-full bg-tertiary/20 text-tertiary text-xs font-bold"
              aria-label={`Copy party code ${partyRoomId}`}
            >
              <span aria-hidden className="w-2 h-2 rounded-full bg-tertiary motion-safe:animate-pulse" />
              <span className="max-w-[6rem] truncate">{partyRoomId}</span>
            </button>
          )}
          {currentPage !== 'search' && <IconButton icon="search" label="Search" onClick={focusSearch} className="lg:hidden" />}
          {!user && (
            <Button size="sm" variant="primary" className="hidden sm:inline-flex" onClick={() => useAuthStore.getState().openAuthModal()}>Sign in</Button>
          )}
          <button
            type="button"
            onClick={menu.openFrom}
            aria-label="Account menu"
            aria-haspopup="menu"
            aria-expanded={menu.open}
            className="p-1 rounded-full bg-background/70 hover:scale-105 active:scale-95 transition-transform"
          >
            {avatar('w-8 h-8')}
          </button>
        </div>
      </div>

      <Menu
        open={menu.open}
        anchor={menu.anchor}
        onClose={menu.onClose}
        align="end"
        width={260}
        ariaLabel="Account"
        header={
          <div className="flex items-center gap-3">
            {avatar('w-10 h-10')}
            <div className="min-w-0">
              <p className="text-sm font-bold truncate">{user ? user.displayName || 'Listener' : 'Not signed in'}</p>
              <p className="text-xs text-on-surface-variant truncate">{user ? user.email : 'Sign in to sync your library'}</p>
            </div>
          </div>
        }
        items={items}
      />
      <PartyModal open={partyOpen} onClose={() => setPartyOpen(false)} />
    </header>
  );
});
