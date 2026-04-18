import { useEffect } from 'react';
import Sidebar from './components/Sidebar';
import TopNav from './components/TopNav';
import PlayerBar from './components/PlayerBar';
import NowPlaying from './components/NowPlaying';
import HomePage from './pages/Home';
import SearchPage from './pages/Search';
import { ToastContainer } from './components/Toast';
import LibraryPage from './pages/Library';
import SettingsPage from './pages/Settings';
import PlaylistPage from './pages/Playlist';
import AuthModal from './components/AuthModal';
import { isNativeApp } from './utils/env';
import { usePlayerStore } from './store';
import { useAuthStore } from './store/auth';
import { useNavStore } from './store/nav';

let registerShortcut: any;
if (isNativeApp()) {
  import('@tauri-apps/plugin-global-shortcut').then(m => {
    registerShortcut = m.register;
  }).catch(() => {});
}

export default function App() {
  const currentPage = useNavStore((s) => s.currentPage);
  const navigate = useNavStore((s) => s.navigate);
  const { togglePlay, nextTrack, prevTrack } = usePlayerStore();
  const { showAuthModal, initialize } = useAuthStore();

useEffect(() => {
    initialize();
  }, [initialize]);

useEffect(() => {
    if (isNativeApp() && registerShortcut) {
      const initShortcuts = async () => {
        try {
          await registerShortcut('CommandOrControl+Shift+Space', (event: any) => {
            if (event.state === 'Pressed') togglePlay();
          });
          await registerShortcut('CommandOrControl+Shift+Right', (event: any) => {
            if (event.state === 'Pressed') nextTrack();
          });
          await registerShortcut('CommandOrControl+Shift+Left', (event: any) => {
            if (event.state === 'Pressed') prevTrack();
          });
        } catch (e) {
          console.error("Tauri shortcuts already registered or failed");
        }
      };
      initShortcuts();
    }
  }, [togglePlay, nextTrack, prevTrack]);

const renderPage = () => {
    if (currentPage.startsWith('playlist:')) {
      const playlistId = currentPage.replace('playlist:', '');
      return <PlaylistPage playlistId={playlistId} />;
    }

switch (currentPage) {
      case 'home':
        return <HomePage />;
      case 'search':
        return <SearchPage />;
      case 'liked':
        return <LibraryPage view="liked" />;
      case 'recent':
        return <LibraryPage view="recent" />;
      case 'queue':
        return <LibraryPage view="queue" />;
      case 'settings':
        return <SettingsPage />;
      default:
        return <HomePage />;
    }
  };

return (
    <div className="flex bg-background min-h-screen text-on-surface">
      <Sidebar currentPage={currentPage} onNavigate={navigate} />
      <TopNav />

<main className="flex-1 lg:pl-64 pt-20 px-6 max-w-7xl mx-auto pb-32 overflow-x-hidden w-full relative z-10" id="main-content">
        {renderPage()}
      </main>

<PlayerBar />
      <NowPlaying />
      <ToastContainer />
      {showAuthModal && <AuthModal />}
    </div>
  );
}
