import React, { useEffect, lazy, Suspense } from 'react';
import Sidebar from './components/Sidebar';
import TopNav from './components/TopNav';
import PlayerBar from './components/PlayerBar';
import NowPlaying from './components/NowPlaying';
import { ToastContainer } from './components/Toast';
import AuthModal from './components/AuthModal';
import MobileNav from './components/MobileNav';
import { isTauriApp } from './utils/env';
import { usePlayerStore, useLibraryStore } from './store';
import { useAuthStore } from './store/auth';
import { useNavStore } from './store/nav';
import { usePluginStore } from './store/plugins';
import { useToastStore } from './store/toast';
import { handleSpotifyCallback } from './integrations/spotify';
import { focusSearch, canGoBack } from './components/TopNav';
import { Button, EmptyState, SkeletonPage, isTypingTarget } from './components/ui';

const HomePage = lazy(() => import('./pages/Home'));
const SearchPage = lazy(() => import('./pages/Search'));
const LibraryPage = lazy(() => import('./pages/Library'));
const SettingsPage = lazy(() => import('./pages/Settings'));
const StatsPage = lazy(() => import('./pages/Stats'));
const ArtistPage = lazy(() => import('./pages/Artist'));
const AlbumPage = lazy(() => import('./pages/Album'));
const PlaylistPage = lazy(() => import('./pages/Playlist'));
const SharedPlaylist = lazy(() => import('./pages/SharedPlaylist'));
const ProfilePage = lazy(() => import('./pages/Profile'));
const MadeForYouPage = lazy(() => import('./pages/MadeForYou'));
const MixPage = lazy(() => import('./pages/Mix'));
const JamPage = lazy(() => import('./pages/Jam'));
const BlendPage = lazy(() => import('./pages/Blend'));
const CollabJoinPage = lazy(() => import('./pages/CollabJoin'));

const OVERLAY = '[aria-modal="true"], body > [role="menu"]';

const handled = (e: KeyboardEvent, fn: () => unknown) => {
  e.preventDefault();
  e.stopPropagation();
  fn();
};

const isCapacitor = () => !!(window as any).Capacitor?.isNativePlatform?.();

if (isCapacitor()) {
  import('@capacitor/app').then(({ App: CapApp }) => {
    CapApp.addListener('appUrlOpen', async (event: any) => {
      if (event.url.startsWith('nuctify://callback')) {
        const success = await handleSpotifyCallback(event.url);
        if (success) window.dispatchEvent(new Event('nuctify:spotify-connected'));
      }
    });
    CapApp.addListener('backButton', () => {
      if (document.querySelector(OVERLAY)) return void document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      const player = usePlayerStore.getState();
      if (player.nowPlayingExpanded) return player.toggleNowPlaying();
      const auth = useAuthStore.getState();
      if (auth.showAuthModal) return auth.closeAuthModal();
      const nav = useNavStore.getState();
      if (nav.currentPage === 'home') return void CapApp.minimizeApp();
      if (canGoBack()) return window.history.back();
      nav.navigate('home');
    });
  }).catch(() => {});
}

class PageBoundary extends React.Component<{ children: React.ReactNode }, { err?: Error }> {
  state: { err?: Error } = {};
  static getDerivedStateFromError(err: Error) { return { err }; }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <EmptyState
        icon="sentiment_dissatisfied"
        title="Something went wrong"
        description="This page hit an error. Try again or head back home."
        action={<div className="flex gap-2 justify-center">
          <Button onClick={() => this.setState({ err: undefined })}>Try again</Button>
          <Button variant="primary" onClick={() => { this.setState({ err: undefined }); useNavStore.getState().navigate('home'); }}>Go home</Button>
        </div>}
      />
    );
  }
}

export default function App() {
  const currentPage = useNavStore((s) => s.currentPage);
  const navigate = useNavStore((s) => s.navigate);
  const showAuthModal = useAuthStore((s) => s.showAuthModal);

  useEffect(() => {
    (window as any).nuctifyNavigate = navigate;
  }, [navigate]);

  useEffect(() => {
    usePluginStore.getState().loadPlugins();
    if (/[?&](code|lastfm_auth|token)=/.test(window.location.search)) navigate('settings');
    useAuthStore.getState().initialize().then(() => {
      useLibraryStore.getState().fetchFromCloud();
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || e.altKey) return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && !e.shiftKey && key === 'k') return handled(e, focusSearch);
      if (isTypingTarget(document.activeElement) || document.querySelector(OVERLAY)) return;
      const player = usePlayerStore.getState();
      if (!mod && e.key === '/') return handled(e, focusSearch);
      if (!mod && !e.shiftKey && e.key === ' ') return handled(e, player.togglePlay);
      if (!mod && e.shiftKey && e.key === 'ArrowRight') return handled(e, player.nextTrack);
      if (!mod && e.shiftKey && e.key === 'ArrowLeft') return handled(e, player.prevTrack);
      if (mod && !e.shiftKey && key === 'l' && player.currentTrack) {
        const track = player.currentTrack;
        return handled(e, () => {
          const lib = useLibraryStore.getState();
          lib.toggleLike(track);
          const liked = useLibraryStore.getState().likedTracks.some((t) => t.id === track.id);
          useToastStore.getState().addToast(liked ? 'Added to Liked Songs' : 'Removed from Liked Songs', 'success');
        });
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  useEffect(() => {
    if (!isTauriApp()) return;
    let cancelled = false;
    let gs: typeof import('@tauri-apps/plugin-global-shortcut') | undefined;
    (async () => {
      gs = await import('@tauri-apps/plugin-global-shortcut');
      await gs.unregisterAll().catch(() => {});
      if (cancelled) return;
      const st = () => usePlayerStore.getState();
      await gs.register('MediaPlayPause', (e) => { if (e.state === 'Pressed') st().togglePlay(); });
      await gs.register('MediaTrackNext', (e) => { if (e.state === 'Pressed') st().nextTrack(); });
      await gs.register('MediaTrackPrevious', (e) => { if (e.state === 'Pressed') st().prevTrack(); });
    })().catch((e) => console.error('Global shortcuts failed', e));
    return () => {
      cancelled = true;
      gs?.unregisterAll().catch(() => {});
    };
  }, []);

  const renderPage = () => {
    const [prefix, ...rest] = currentPage.split(':');
    const id = rest.join(':');
    switch (prefix) {
      case 'playlist': return <PlaylistPage playlistId={id} />;
      case 'remote-playlist': return <PlaylistPage remoteId={id} />;
      case 'shared': return <SharedPlaylist shareId={id} />;
      case 'artist': return <ArtistPage artistId={id} />;
      case 'album': return <AlbumPage albumId={id} />;
      case 'search': return <SearchPage />;
      case 'library': return <LibraryPage view="all" />;
      case 'liked': return <LibraryPage view="liked" />;
      case 'recent': return <LibraryPage view="recent" />;
      case 'queue': return <LibraryPage view="queue" />;
      case 'settings': return <SettingsPage />;
      case 'stats': return <StatsPage />;
      case 'profile': return <ProfilePage />;
      case 'made-for-you': return <MadeForYouPage />;
      case 'mix': return <MixPage mixId={id} />;
      case 'jam': return <JamPage code={id || undefined} />;
      case 'blend': return <BlendPage code={id || undefined} />;
      case 'collab': return <CollabJoinPage code={id} />;
      default: return <HomePage />;
    }
  };

  return (
    <div className="min-h-[100dvh] bg-background text-on-surface select-none">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[400] focus:px-4 focus:py-2 focus:rounded-full focus:bg-primary focus:text-on-primary focus:font-bold">Skip to content</a>
      <Sidebar currentPage={currentPage} onNavigate={navigate} />
      <TopNav />

      <main id="main-content" tabIndex={-1} className="relative z-[1] lg:pl-[var(--sidebar-w)] overflow-x-clip outline-none">
        <div className="mx-auto w-full max-w-[1800px] px-4 sm:px-6 lg:px-8 pt-[calc(var(--topnav-h)+env(safe-area-inset-top))] pb-[calc(var(--mobile-nav-h)+var(--mini-player-h)+2.5rem+env(safe-area-inset-bottom))] lg:pb-[calc(var(--player-h)+2.5rem)]">
          <PageBoundary key={currentPage}>
            <Suspense fallback={<SkeletonPage />}>
              {renderPage()}
            </Suspense>
          </PageBoundary>
        </div>
      </main>

      <PlayerBar />
      <MobileNav />
      <NowPlaying />
      <ToastContainer />
      {showAuthModal && <AuthModal />}
    </div>
  );
}
