import { memo, useMemo, useState, type MouseEvent, type ReactNode } from 'react';
import { useLibraryStore } from '../store';
import type { Playlist } from '../providers/types';
import { Artwork, Button, IconButton, Menu, Modal, Tabs, useMenuState, cn } from './ui';

interface SidebarProps {
  currentPage: string;
  onNavigate: (page: string) => void;
}

type Filter = 'playlists' | 'artists' | 'albums';
const EMPTY: never[] = [];

const NavItem = memo(function NavItem({ id, icon, label, active, onNavigate }: { id: string; icon: string; label: string; active: boolean; onNavigate: (page: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onNavigate(id)}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'w-full flex items-center gap-4 h-11 px-3 rounded-lg text-[15px] font-bold transition-colors duration-150',
        active ? 'text-on-surface bg-on-surface/[0.08]' : 'text-on-surface-variant hover:text-on-surface',
      )}
    >
      <span aria-hidden className={cn('material-symbols-outlined text-[26px]', active && 'filled')}>{icon}</span>
      {label}
    </button>
  );
});

const LibraryRow = memo(function LibraryRow({ id, title, subtitle, active, onNavigate, art, onMenu, pinned }: {
  id: string; title: string; subtitle: string; active: boolean; onNavigate: (page: string) => void; art: ReactNode; onMenu?: (e: MouseEvent<HTMLElement>) => void; pinned?: boolean;
}) {
  return (
    <div className={cn('group relative flex items-center rounded-lg transition-colors duration-150', active ? 'bg-on-surface/[0.08]' : 'hover:bg-on-surface/[0.05]')} onContextMenu={onMenu}>
      <button type="button" onClick={() => onNavigate(id)} aria-current={active ? 'page' : undefined} className="flex-1 min-w-0 flex items-center gap-3 p-2 text-left">
        {art}
        <span className="min-w-0 flex-1">
          <span className={cn('block text-sm font-semibold truncate', active ? 'text-primary' : 'text-on-surface')}>{title}</span>
          <span className="flex items-center gap-1 text-xs text-on-surface-variant truncate">
            {pinned && <span aria-label="Pinned" className="material-symbols-outlined filled text-[14px] text-primary">push_pin</span>}
            {subtitle}
          </span>
        </span>
      </button>
      {onMenu && (
        <IconButton icon="more_horiz" label={`More options for ${title}`} size="xs" onClick={onMenu} className="mr-1 can-hover:opacity-0 can-hover:group-hover:opacity-100 focus-visible:opacity-100" />
      )}
    </div>
  );
});

const Tile = ({ icon, className }: { icon: string; className: string }) => (
  <span aria-hidden className={cn('w-12 h-12 rounded-md flex items-center justify-center shrink-0', className)}>
    <span className="material-symbols-outlined filled text-2xl">{icon}</span>
  </span>
);

const playlistArt = (p: Playlist) => p.thumbnail || p.tracks.find((t) => t.thumbnail)?.thumbnail;

export default memo(function Sidebar({ currentPage, onNavigate }: SidebarProps) {
  const playlists = useLibraryStore((s) => s.playlists);
  const likedCount = useLibraryStore((s) => s.likedTracks.length);
  const pins = useLibraryStore((s) => s.pinnedPlaylists) ?? EMPTY;
  const artists = useLibraryStore((s) => s.followedArtists) ?? EMPTY;
  const albums = useLibraryStore((s) => s.savedAlbums) ?? EMPTY;
  const [filter, setFilter] = useState<Filter>('playlists');
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<Playlist | null>(null);
  const [menuFor, setMenuFor] = useState<Playlist | null>(null);
  const menu = useMenuState();

  const sorted = useMemo(() => {
    const rank = (p: Playlist) => { const i = pins.indexOf(p.id); return i < 0 ? Infinity : i; };
    return [...playlists].sort((a, b) => rank(a) - rank(b) || (b.updatedAt || 0) - (a.updatedAt || 0));
  }, [playlists, pins]);

  const togglePin = (id: string) => useLibraryStore.getState().togglePinPlaylist(id);

  const create = () => {
    const n = name.trim();
    if (!n) return;
    const id = useLibraryStore.getState().createPlaylist(n);
    setName('');
    setCreating(false);
    if (typeof id === 'string') onNavigate(`playlist:${id}`);
  };

  return (
    <>
      <aside aria-label="Sidebar" className="fixed left-0 top-0 bottom-0 z-40 w-[var(--sidebar-w)] hidden lg:flex flex-col gap-2 p-2 pt-[calc(0.5rem+env(safe-area-inset-top))] bg-background">
        <div className="rounded-xl bg-surface-container-low px-3 pt-4 pb-2">
          <button type="button" onClick={() => onNavigate('home')} className="flex items-center gap-2.5 px-3 mb-4" aria-label="Nuctify home">
            <img src="/nuctify.svg" alt="" className="w-7 h-7" />
            <span className="font-headline text-xl font-extrabold tracking-tight text-on-surface">Nuctify</span>
          </button>
          <nav className="space-y-0.5">
            <NavItem id="home" icon="home" label="Home" active={currentPage === 'home'} onNavigate={onNavigate} />
            <NavItem id="search" icon="search" label="Search" active={currentPage === 'search'} onNavigate={onNavigate} />
            <NavItem id="made-for-you" icon="auto_awesome" label="Made for you" active={currentPage === 'made-for-you' || currentPage.startsWith('mix:')} onNavigate={onNavigate} />
            <NavItem id="jam" icon="groups" label="Jam" active={currentPage === 'jam' || currentPage.startsWith('jam:') || currentPage.startsWith('blend')} onNavigate={onNavigate} />
          </nav>
        </div>

        <div className="flex-1 min-h-0 rounded-xl bg-surface-container-low flex flex-col">
          <div className="flex items-center justify-between pl-3 pr-2 pt-3 pb-2">
            <button
              type="button"
              onClick={() => onNavigate('library')}
              aria-current={currentPage === 'library' ? 'page' : undefined}
              className={cn('flex items-center gap-3 h-10 px-3 rounded-lg font-bold text-[15px] transition-colors', currentPage === 'library' ? 'text-on-surface' : 'text-on-surface-variant hover:text-on-surface')}
            >
              <span aria-hidden className={cn('material-symbols-outlined text-[26px]', currentPage === 'library' && 'filled')}>library_music</span>
              Your Library
            </button>
            <IconButton icon="add" label="Create playlist" size="sm" onClick={() => setCreating(true)} />
          </div>

          <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
            <LibraryRow id="liked" title="Liked Songs" subtitle={`Playlist · ${likedCount} song${likedCount === 1 ? '' : 's'}`} active={currentPage === 'liked'} onNavigate={onNavigate}
              art={<Tile icon="favorite" className="bg-gradient-to-br from-primary to-secondary text-on-primary" />} />
            <LibraryRow id="recent" title="Recently Played" subtitle="History" active={currentPage === 'recent'} onNavigate={onNavigate}
              art={<Tile icon="history" className="bg-surface-container-highest text-on-surface-variant" />} />
            <LibraryRow id="stats" title="Your Stats" subtitle="Listening insights" active={currentPage === 'stats'} onNavigate={onNavigate}
              art={<Tile icon="insights" className="bg-surface-container-highest text-on-surface-variant" />} />

            {(artists.length > 0 || albums.length > 0) && (
              <Tabs<Filter>
                ariaLabel="Filter library"
                value={filter}
                onChange={setFilter}
                className="px-1 pt-3 pb-1"
                options={[
                  { value: 'playlists', label: 'Playlists' },
                  ...(artists.length ? [{ value: 'artists' as Filter, label: 'Artists' }] : []),
                  ...(albums.length ? [{ value: 'albums' as Filter, label: 'Albums' }] : []),
                ]}
              />
            )}
            {!(artists.length || albums.length) && sorted.length > 0 && <div className="h-px bg-on-surface/[0.06] mx-2 my-2" />}

            {(filter === 'playlists' || (filter === 'artists' && !artists.length) || (filter === 'albums' && !albums.length)) && sorted.map((p) => (
              <LibraryRow
                key={p.id}
                id={`playlist:${p.id}`}
                title={p.name}
                subtitle={`${p.rules ? 'Smart playlist' : 'Playlist'} · ${p.tracks.length} song${p.tracks.length === 1 ? '' : 's'}`}
                active={currentPage === `playlist:${p.id}`}
                pinned={pins.includes(p.id)}
                onNavigate={onNavigate}
                onMenu={(e) => { setMenuFor(p); menu.openFrom(e); }}
                art={<Artwork src={playlistArt(p)} size="sm" rounded="md" icon="queue_music" />}
              />
            ))}

            {filter === 'artists' && artists.map((a) => (
              <LibraryRow key={a.id} id={`artist:${a.id}`} title={a.name} subtitle="Artist" active={currentPage === `artist:${a.id}`} onNavigate={onNavigate}
                art={<Artwork src={a.image} size="sm" rounded="full" icon="person" />} />
            ))}

            {filter === 'albums' && albums.map((a) => (
              <LibraryRow key={a.id} id={`album:${a.id}`} title={a.title} subtitle={`Album · ${a.artist}`} active={currentPage === `album:${a.id}`} onNavigate={onNavigate}
                art={<Artwork src={a.thumbnail} size="sm" rounded="md" icon="album" />} />
            ))}

            {playlists.length === 0 && filter === 'playlists' && (
              <div className="mx-1 mt-3 rounded-lg bg-surface-container p-4">
                <p className="text-sm font-bold text-on-surface">Create your first playlist</p>
                <p className="text-xs text-on-surface-variant mt-1 mb-3">It's easy, we'll help you.</p>
                <Button size="sm" variant="primary" onClick={() => setCreating(true)}>Create playlist</Button>
              </div>
            )}
          </div>

          <div className="px-2 pb-2 pt-1 border-t border-on-surface/[0.05]">
            <NavItem id="settings" icon="settings" label="Settings" active={currentPage === 'settings'} onNavigate={onNavigate} />
          </div>
        </div>
      </aside>

      <Menu
        open={menu.open && !!menuFor}
        anchor={menu.anchor}
        onClose={menu.onClose}
        ariaLabel="Playlist options"
        header={menuFor && <p className="text-sm font-bold truncate">{menuFor.name}</p>}
        items={menuFor ? [
          { label: 'Open', icon: 'open_in_new', onSelect: () => onNavigate(`playlist:${menuFor.id}`) },
          { label: pins.includes(menuFor.id) ? 'Unpin playlist' : 'Pin playlist', icon: 'push_pin', onSelect: () => togglePin(menuFor.id) },
          { divider: true },
          { label: 'Delete playlist', icon: 'delete', danger: true, onSelect: () => setConfirmDelete(menuFor) },
        ] : []}
      />

      <Modal
        open={creating}
        onClose={() => { setCreating(false); setName(''); }}
        title="Create playlist"
        size="sm"
        footer={<>
          <Button variant="ghost" onClick={() => { setCreating(false); setName(''); }}>Cancel</Button>
          <Button variant="primary" onClick={create} disabled={!name.trim()}>Create</Button>
        </>}
      >
        <label htmlFor="new-playlist-name" className="sr-only">Playlist name</label>
        <input
          id="new-playlist-name"
          type="text"
          value={name}
          autoFocus
          maxLength={100}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && create()}
          placeholder="My playlist"
          className="w-full h-12 rounded-lg bg-surface-container-highest border-0 px-4 text-on-surface placeholder:text-on-surface-variant/70 focus:ring-2 focus:ring-primary"
        />
      </Modal>

      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete playlist?"
        description={confirmDelete ? `"${confirmDelete.name}" will be removed from your library.` : undefined}
        size="sm"
        footer={<>
          <Button variant="ghost" onClick={() => setConfirmDelete(null)}>Cancel</Button>
          <Button variant="danger" onClick={() => {
            if (!confirmDelete) return;
            useLibraryStore.getState().deletePlaylist(confirmDelete.id);
            if (currentPage === `playlist:${confirmDelete.id}`) onNavigate('library');
            setConfirmDelete(null);
          }}>Delete</Button>
        </>}
      />
    </>
  );
});
