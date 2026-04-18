import { useState } from 'react';
import { useLibraryStore } from '../store';

interface SidebarProps {
  currentPage: string;
  onNavigate: (page: string) => void;
}

export default function Sidebar({ currentPage, onNavigate }: SidebarProps) {
  const { playlists, createPlaylist, deletePlaylist } = useLibraryStore();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [contextMenu, setContextMenu] = useState<{ id: string; x: number; y: number } | null>(null);

const handleCreatePlaylist = () => {
    if (newPlaylistName.trim()) {
      createPlaylist(newPlaylistName.trim());
      setNewPlaylistName('');
      setShowCreateModal(false);
    }
  };

const NavItem = ({ id, icon, label, isFilled = false }: { id: string; icon: string; label: string; isFilled?: boolean }) => {
    const active = currentPage === id;
    return (
      <button
        onClick={() => onNavigate(id)}
        className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl transition-all active:scale-95 group ${
          active
            ? 'text-white bg-white/8 shadow-sm'
            : 'text-slate-400 hover:bg-white/5 hover:text-white'
        }`}
      >
        <span className={`material-symbols-outlined text-xl ${isFilled && active ? 'filled' : ''} ${active ? 'text-primary' : ''}`}>{icon}</span>
        <span className="font-medium">{label}</span>
      </button>
    );
  };

return (
    <>
      <aside className="fixed left-0 top-0 h-full z-40 w-64 hidden lg:flex flex-col border-r border-white/5 bg-[#0e0e13]/90 backdrop-blur-3xl font-['Plus_Jakarta_Sans'] font-medium tracking-wide">
        {}
        <div className="p-8 pb-6">
          <h1
            className="text-2xl font-bold tracking-tighter bg-gradient-to-r from-[#ba9eff] to-[#53ddfc] bg-clip-text text-transparent cursor-pointer"
            onClick={() => onNavigate('home')}
          >
            Nuctify
          </h1>
          <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500 mt-1">Free &amp; Open Source</p>
        </div>

{}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-3 space-y-1">
          <div className="mb-4 space-y-1">
            <NavItem id="home" icon="home" label="Home" isFilled />
            <NavItem id="search" icon="search" label="Search" />
          </div>

<div className="mb-4 space-y-1">
            <div className="px-4 text-[10px] font-bold uppercase tracking-widest text-slate-600 mb-2">Your Music</div>
            <NavItem id="liked" icon="favorite" label="Liked Songs" isFilled />
            <NavItem id="recent" icon="history" label="Recently Played" />
            <NavItem id="queue" icon="queue_music" label="Queue" />
          </div>

{}
          <div className="mt-4">
            <div className="px-4 text-[10px] font-bold uppercase tracking-widest text-slate-600 mb-2 flex justify-between items-center">
              <span>Playlists</span>
              <button
                onClick={() => setShowCreateModal(true)}
                className="text-slate-400 hover:text-primary transition-colors"
                title="Create Playlist"
              >
                <span className="material-symbols-outlined text-base">add_circle</span>
              </button>
            </div>
            <div className="space-y-0.5">
              {playlists.length === 0 && (
                <p className="px-4 py-3 text-xs text-slate-600 italic">No playlists yet</p>
              )}
              {playlists.map((p) => (
                <button
                  key={p.id}
                  onClick={() => onNavigate(`playlist:${p.id}`)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setContextMenu({ id: p.id, x: e.clientX, y: e.clientY });
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-colors group ${
                    currentPage === `playlist:${p.id}`
                      ? 'bg-white/8 text-white'
                      : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <span className="material-symbols-outlined text-base opacity-50 group-hover:opacity-100">queue_music</span>
                  <span className="text-sm truncate flex-1 text-left">{p.name}</span>
                  <span className="text-[10px] text-slate-600 font-mono">{p.tracks.length}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

{}
        <div className="p-3 border-t border-white/5">
          <NavItem id="settings" icon="settings" label="Settings" />
        </div>
      </aside>

{}
      {showCreateModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-[fadeIn_0.15s_ease-out]" onClick={() => setShowCreateModal(false)}>
          <div className="w-full max-w-md bg-surface-container-high border border-white/10 rounded-3xl p-8 shadow-[0_40px_100px_rgba(0,0,0,0.6)] animate-[slideUp_0.2s_ease-out]" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-2xl font-headline font-bold text-white mb-2">Create Playlist</h2>
            <p className="text-sm text-slate-400 mb-6">Give your new playlist a name</p>

<input
              type="text"
              value={newPlaylistName}
              onChange={(e) => setNewPlaylistName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreatePlaylist()}
              placeholder="My Awesome Playlist"
              autoFocus
              className="w-full bg-surface-container border-none rounded-xl py-3.5 px-4 text-white placeholder:text-slate-500 focus:ring-2 focus:ring-primary text-sm mb-6"
            />

<div className="flex justify-end gap-3">
              <button
                onClick={() => { setShowCreateModal(false); setNewPlaylistName(''); }}
                className="px-6 py-2.5 rounded-xl text-sm font-semibold text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreatePlaylist}
                disabled={!newPlaylistName.trim()}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-primary to-secondary text-on-primary-container text-sm font-bold disabled:opacity-40 hover:shadow-[0_8px_24px_rgba(186,158,255,0.3)] transition-all active:scale-95"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

{}
      {contextMenu && (
        <div
          className="fixed z-[300] bg-surface-container-high/95 backdrop-blur-2xl border border-white/10 rounded-xl shadow-2xl py-1 w-48 animate-[fadeIn_0.1s_ease-out]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={() => setContextMenu(null)}
          onMouseLeave={() => setContextMenu(null)}
        >
          <button
            onClick={() => { deletePlaylist(contextMenu.id); setContextMenu(null); }}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-error hover:bg-error/10 transition-colors"
          >
            <span className="material-symbols-outlined text-base">delete</span>
            Delete Playlist
          </button>
        </div>
      )}
    </>
  );
}
