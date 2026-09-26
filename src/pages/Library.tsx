import { useEffect, useMemo, useState, type ReactNode } from 'react';
import TrackList from '../components/TrackList';
import { useLibraryStore, usePlayerStore, useDownloadsStore, type HistoryEntry } from '../store';
import { useNavStore } from '../store/nav';
import { useToastStore } from '../store/toast';
import { registry } from '../providers';
import { getAllOfflineTracks } from '../audio/offline';
import type { Playlist, Track } from '../providers/types';
import {
  Artwork, Button, EmptyState, IconButton, MediaCard, Menu, Modal, PageHeader, SkeletonList, Tabs, cn, useMenuState, type MenuItem,
} from '../components/ui';

type Tab = 'playlists' | 'albums' | 'artists' | 'downloaded' | 'liked' | 'history';
type Sort = 'recent' | 'alpha' | 'creator';
type Layout = 'grid' | 'list';

interface Item {
  key: string;
  title: string;
  subtitle: string;
  creator: string;
  image?: string;
  icon: string;
  circle?: boolean;
  art?: 'liked' | 'downloads';
  pinned?: boolean;
  playlist?: Playlist;
  onOpen: () => void;
  onPlay?: () => void;
}

const UI_KEY = 'nuctify_library_ui';
const loadUi = (): { tab: Tab; sort: Sort; layout: Layout } => {
  const d = { tab: 'playlists' as Tab, sort: 'recent' as Sort, layout: 'grid' as Layout };
  try { return { ...d, ...JSON.parse(localStorage.getItem(UI_KEY) || '{}') }; } catch { return d; }
};

const SORT_LABEL: Record<Sort, string> = { recent: 'Recents', alpha: 'Alphabetical', creator: 'Creator' };
const GRADIENT = { liked: 'from-[#4f2bd9] via-[#7b5cff] to-[#b9a5ff]', downloads: 'from-[#0f766e] via-[#14b8a6] to-[#99f6e4]' };

const cmp = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' });
const matches = (q: string, ...s: (string | undefined)[]) => !q || s.some(x => x?.toLowerCase().includes(q));

function sortTracks(tracks: Track[], sort: Sort, q: string) {
  const t = tracks.filter(x => matches(q, x.title, x.artist, x.album));
  if (sort === 'alpha') return [...t].sort((a, b) => cmp(a.title, b.title));
  if (sort === 'creator') return [...t].sort((a, b) => cmp(a.artist, b.artist) || cmp(a.title, b.title));
  return t;
}

function GradientArt({ kind, className, iconSize = 'text-5xl' }: { kind: 'liked' | 'downloads'; className?: string; iconSize?: string }) {
  return (
    <div className={cn('shrink-0 flex items-center justify-center bg-gradient-to-br text-white', GRADIENT[kind], className)}>
      <span aria-hidden className={cn('material-symbols-outlined filled', iconSize)}>{kind === 'liked' ? 'favorite' : 'download_for_offline'}</span>
    </div>
  );
}

function useOfflineTracks(enabled: boolean) {
  const ids = useDownloadsStore(s => s.ids);
  const [tracks, setTracks] = useState<Track[] | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    getAllOfflineTracks().then(t => alive && setTracks(t)).catch(() => alive && setTracks([]));
    return () => { alive = false; };
  }, [enabled, ids]);
  return tracks;
}

function groupHistory(entries: HistoryEntry[]) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const day = 864e5;
  const groups: { label: string; tracks: Track[] }[] = [];
  let seen = new Set<string>();
  for (const e of entries.slice(0, 300)) {
    const d = new Date(e.playedAt); d.setHours(0, 0, 0, 0);
    const diff = Math.round((today.getTime() - d.getTime()) / day);
    const label = diff <= 0 ? 'Today' : diff === 1 ? 'Yesterday' : diff < 7 ? d.toLocaleDateString(undefined, { weekday: 'long' }) : d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
    let g = groups[groups.length - 1];
    if (!g || g.label !== label) { g = { label, tracks: [] }; groups.push(g); seen = new Set(); }
    if (!seen.has(e.track.id)) { seen.add(e.track.id); g.tracks.push(e.track); }
  }
  return groups;
}

function PlayActions({ tracks, extra }: { tracks: Track[]; extra?: ReactNode }) {
  const play = (shuffle: boolean) => tracks.length && usePlayerStore.getState().playTracks(tracks, 0, { shuffle });
  return (
    <>
      <IconButton icon="play_arrow" label="Play" variant="primary" size="xl" filled disabled={!tracks.length} onClick={() => play(false)} />
      <IconButton icon="shuffle" label="Shuffle play" variant="tonal" size="lg" disabled={!tracks.length} onClick={() => play(true)} />
      {extra}
    </>
  );
}

function CreatePlaylistModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('');
  useEffect(() => { if (open) setName(''); }, [open]);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = name.trim();
    if (!v) return;
    const id = useLibraryStore.getState().createPlaylist(v);
    onClose();
    useNavStore.getState().navigate(`playlist:${id}`);
  };
  return (
    <Modal open={open} onClose={onClose} title="New playlist" size="sm"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form="new-pl" disabled={!name.trim()}>Create</Button></>}>
      <form id="new-pl" onSubmit={submit}>
        <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="My playlist" aria-label="Playlist name" enterKeyHint="done" maxLength={100}
          className="w-full h-12 rounded-xl bg-on-surface/[0.08] px-4 text-on-surface placeholder:text-on-surface-variant outline-none focus:ring-2 focus:ring-primary" />
      </form>
    </Modal>
  );
}

function TrackCollection({ view }: { view: 'liked' | 'recent' | 'queue' }) {
  const liked = useLibraryStore(s => s.likedTracks);
  const history = useLibraryStore(s => s.listeningHistory);
  const queue = usePlayerStore(s => s.queue);
  const queueIndex = usePlayerStore(s => s.queueIndex);
  const [confirm, setConfirm] = useState(false);
  const groups = useMemo(() => (view === 'recent' ? groupHistory(history) : []), [view, history]);

  if (view === 'queue') {
    const current = queue[queueIndex];
    const upcoming = queue.slice(queueIndex + 1);
    const offset = queueIndex + 1;
    return (
      <div className="animate-fade-in pb-8">
        <PageHeader title="Queue" color={null} meta={<span>{upcoming.length} up next</span>}
          actions={upcoming.length > 0 && <Button icon="clear_all" onClick={() => usePlayerStore.getState().clearUpcoming()}>Clear queue</Button>} />
        {!current && !upcoming.length ? (
          <EmptyState icon="queue_music" title="Your queue is empty" description="Use “Play next” or “Add to queue” on any song to line it up here." />
        ) : (
          <>
            {current && <section className="mb-8"><h2 className="text-lg font-bold text-on-surface mb-2">Now playing</h2><TrackList tracks={[current]} showIndex={false} showHeader={false} /></section>}
            <section>
              <h2 className="text-lg font-bold text-on-surface mb-2">Next up</h2>
              <TrackList tracks={upcoming} showIndex={false} showHeader={false} emptyTitle="Nothing queued" emptyDescription="Autoplay will keep the music going."
                onReorder={(a, b) => usePlayerStore.getState().reorderQueue(a + offset, b + offset)} />
            </section>
          </>
        )}
      </div>
    );
  }

  const liked_ = view === 'liked';
  const tracks = liked_ ? liked : groups.flatMap(g => g.tracks);
  return (
    <div className="animate-fade-in pb-8">
      <PageHeader
        eyebrow="Playlist"
        title={liked_ ? 'Liked Songs' : 'Recently Played'}
        color={liked_ ? '#5b3fd9' : '#0e7490'}
        artwork={liked_ ? <GradientArt kind="liked" className="w-48 h-48 sm:w-56 sm:h-56 lg:w-60 lg:h-60 rounded-xl shadow-overlay" iconSize="text-7xl" />
          : <div className="w-48 h-48 sm:w-56 sm:h-56 lg:w-60 lg:h-60 rounded-xl shadow-overlay bg-gradient-to-br from-[#0e7490] to-[#67e8f9] flex items-center justify-center text-white"><span aria-hidden className="material-symbols-outlined text-7xl">history</span></div>}
        meta={<span>{liked_ ? `${liked.length} songs` : `${history.length} plays`}</span>}
        actions={<PlayActions tracks={tracks} extra={!liked_ && history.length > 0 && <Button variant="ghost" icon="delete_sweep" onClick={() => setConfirm(true)}>Clear history</Button>} />}
      />
      {liked_ ? (
        <TrackList tracks={liked} showProvider emptyTitle="Songs you like will appear here" emptyDescription="Tap the heart on any song to save it." />
      ) : groups.length ? groups.map(g => (
        <section key={g.label} className="mb-6">
          <h2 className="text-base font-bold text-on-surface mb-1 px-2">{g.label}</h2>
          <TrackList tracks={g.tracks} showIndex={false} showHeader={false} />
        </section>
      )) : <EmptyState icon="history" title="Nothing played yet" description="Start listening and your history will show up here." />}
      <Modal open={confirm} onClose={() => setConfirm(false)} title="Clear listening history?" description="This removes your history and resets Recently Played. Stats based on history will reset too." size="sm"
        footer={<><Button variant="ghost" onClick={() => setConfirm(false)}>Cancel</Button><Button variant="danger" onClick={() => { useLibraryStore.getState().clearHistory(); setConfirm(false); }}>Clear</Button></>} />
    </div>
  );
}

export default function LibraryPage({ view }: { view: 'liked' | 'recent' | 'queue' | 'all' }) {
  if (view !== 'all') return <TrackCollection view={view} />;
  return <LibraryHome />;
}

function LibraryHome() {
  const playlists = useLibraryStore(s => s.playlists);
  const pinned = useLibraryStore(s => s.pinnedPlaylists);
  const liked = useLibraryStore(s => s.likedTracks);
  const albums = useLibraryStore(s => s.savedAlbums);
  const artists = useLibraryStore(s => s.followedArtists);
  const history = useLibraryStore(s => s.listeningHistory);
  const dlCount = useDownloadsStore(s => s.ids.size);
  const navigate = useNavStore(s => s.navigate);
  const [ui, setUi] = useState(loadUi);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [target, setTarget] = useState<Playlist | null>(null);
  const [toDelete, setToDelete] = useState<Playlist | null>(null);
  const sortMenu = useMenuState();
  const itemMenu = useMenuState();
  const { tab, sort, layout } = ui;
  const q = query.trim().toLowerCase();
  const offline = useOfflineTracks(tab === 'downloaded');
  const historyTracks = useMemo(() => {
    const seen = new Set<string>();
    return history.filter(e => !seen.has(e.track.id) && (seen.add(e.track.id), true)).map(e => e.track);
  }, [history]);

  const update = (p: Partial<typeof ui>) => setUi(u => {
    const n = { ...u, ...p };
    try { localStorage.setItem(UI_KEY, JSON.stringify(n)); } catch {}
    return n;
  });

  const playAlbum = async (id: string) => {
    try {
      const { tracks } = await registry.getAlbumDetails(id);
      if (tracks.length) usePlayerStore.getState().playTracks(tracks);
      else useToastStore.getState().addToast('No playable tracks in this album', 'info');
    } catch { useToastStore.getState().addToast('Could not load album', 'error'); }
  };

  const items = useMemo<Item[]>(() => {
    let list: Item[] = [];
    if (tab === 'playlists') {
      list = playlists.map(p => ({
        key: p.id, title: p.name, creator: p.authorId || 'You', icon: p.rules ? 'auto_awesome' : 'queue_music',
        subtitle: `${p.rules ? 'Smart playlist' : 'Playlist'} • ${p.tracks.length} songs`,
        image: p.thumbnail || p.tracks.find(t => t.thumbnail)?.thumbnail, pinned: pinned.includes(p.id), playlist: p,
        onOpen: () => navigate(`playlist:${p.id}`),
        onPlay: p.tracks.length ? () => usePlayerStore.getState().playTracks(p.tracks) : undefined,
      }));
      if (sort === 'recent') list.sort((a, b) => (b.playlist!.updatedAt || 0) - (a.playlist!.updatedAt || 0));
    } else if (tab === 'albums') {
      list = albums.map(a => ({
        key: a.id, title: a.title, creator: a.artist, subtitle: `Album • ${a.artist}`, image: a.thumbnail, icon: 'album',
        onOpen: () => navigate(`album:${a.id}`), onPlay: () => playAlbum(a.id),
      }));
    } else if (tab === 'artists') {
      list = artists.map(a => ({ key: a.id, title: a.name, creator: a.name, subtitle: 'Artist', image: a.image, icon: 'person', circle: true, onOpen: () => navigate(`artist:${a.id}`) }));
    }
    list = list.filter(i => matches(q, i.title, i.subtitle));
    if (sort === 'alpha') list.sort((a, b) => cmp(a.title, b.title));
    if (sort === 'creator') list.sort((a, b) => cmp(a.creator, b.creator) || cmp(a.title, b.title));
    if (tab === 'playlists') {
      list.sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned));
      if (!q) list.unshift(
        { key: '_liked', title: 'Liked Songs', creator: '', subtitle: `Playlist • ${liked.length} songs`, icon: 'favorite', art: 'liked', pinned: true, onOpen: () => navigate('liked'), onPlay: liked.length ? () => usePlayerStore.getState().playTracks(liked) : undefined },
        { key: '_dl', title: 'Downloads', creator: '', subtitle: `${dlCount} songs on this device`, icon: 'download', art: 'downloads', pinned: true, onOpen: () => update({ tab: 'downloaded' }) },
      );
    }
    return list;
  }, [tab, sort, q, playlists, pinned, albums, artists, liked, dlCount, navigate]);

  const tracks = tab === 'liked' ? liked : tab === 'history' ? historyTracks : tab === 'downloaded' ? offline ?? [] : [];
  const shownTracks = useMemo(() => sortTracks(tracks, sort, q), [tracks, sort, q]);
  const isTrackTab = tab === 'liked' || tab === 'history' || tab === 'downloaded';

  const tabs: { value: Tab; label: string }[] = [
    { value: 'playlists', label: 'Playlists' },
    { value: 'albums', label: 'Albums' },
    { value: 'artists', label: 'Artists' },
    { value: 'downloaded', label: 'Downloaded' },
    { value: 'liked', label: 'Liked' },
    { value: 'history', label: 'History' },
  ];

  const menuItems: MenuItem[] = target ? [
    { label: 'Open', icon: 'open_in_new', onSelect: () => navigate(`playlist:${target.id}`) },
    { label: 'Play', icon: 'play_arrow', disabled: !target.tracks.length, onSelect: () => usePlayerStore.getState().playTracks(target.tracks) },
    { label: 'Add to queue', icon: 'queue_music', disabled: !target.tracks.length, onSelect: () => usePlayerStore.getState().addToQueue(target.tracks) },
    { label: pinned.includes(target.id) ? 'Unpin' : 'Pin to top', icon: 'push_pin', onSelect: () => useLibraryStore.getState().togglePinPlaylist(target.id) },
    { divider: true },
    { label: 'Delete', icon: 'delete', danger: true, onSelect: () => setToDelete(target) },
  ] : [];

  const openItemMenu = (e: React.MouseEvent<HTMLElement>, it: Item) => {
    if (!it.playlist) return;
    setTarget(it.playlist);
    itemMenu.openFrom(e);
  };

  const empty: Record<Tab, [string, string, string]> = {
    playlists: ['queue_music', 'Create your first playlist', 'It’s easy — we’ll help you.'],
    albums: ['album', 'No saved albums yet', 'Save albums from any album page and they’ll show up here.'],
    artists: ['person', 'Follow your favourite artists', 'Tap Follow on an artist page to keep them close.'],
    downloaded: ['download_for_offline', 'No downloads yet', 'Download songs to listen without a connection.'],
    liked: ['favorite', 'Songs you like will appear here', 'Tap the heart on any song to save it.'],
    history: ['history', 'Nothing played yet', 'Start listening and your history will show up here.'],
  };

  const renderEmpty = () => {
    const [icon, title, desc] = empty[tab];
    return <EmptyState icon={q ? 'search_off' : icon} title={q ? `No results for “${query}”` : title} description={q ? 'Try a different search.' : desc}
      action={!q && tab === 'playlists' ? <Button variant="primary" icon="add" onClick={() => setCreating(true)}>Create playlist</Button> : undefined} />;
  };

  return (
    <div className="animate-fade-in pb-8">
      <header className="flex items-center justify-between gap-3 pt-2 sm:pt-6 mb-4">
        <h1 className="font-headline font-extrabold text-3xl sm:text-4xl tracking-tight text-on-surface">Your Library</h1>
        <div className="flex items-center gap-1">
          <IconButton icon="add" label="Create playlist" onClick={() => setCreating(true)} />
          <IconButton icon="bar_chart" label="Your stats" onClick={() => navigate('stats')} />
        </div>
      </header>

      <Tabs options={tabs} value={tab} onChange={t => { update({ tab: t }); setQuery(''); }} ariaLabel="Library filter" className="-mx-4 px-4 sm:mx-0 sm:px-0 mb-4" />

      <div className="flex items-center gap-2 mb-5">
        <label className="relative flex-1 max-w-xs">
          <span aria-hidden className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-lg text-on-surface-variant">search</span>
          <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder={`Search in ${tabs.find(t => t.value === tab)!.label.toLowerCase()}`}
            aria-label="Search in your library"
            className="w-full h-9 rounded-full bg-on-surface/[0.06] pl-9 pr-3 text-sm text-on-surface placeholder:text-on-surface-variant outline-none focus:ring-2 focus:ring-primary" />
        </label>
        <div className="flex-1" />
        <Button size="sm" variant="ghost" iconRight="swap_vert" onClick={sortMenu.openFrom} aria-haspopup="menu">{SORT_LABEL[sort]}</Button>
        {!isTrackTab && (
          <IconButton icon={layout === 'grid' ? 'view_list' : 'grid_view'} label={layout === 'grid' ? 'Show as list' : 'Show as grid'} size="sm"
            onClick={() => update({ layout: layout === 'grid' ? 'list' : 'grid' })} />
        )}
      </div>

      {isTrackTab ? (
        tab === 'downloaded' && offline === null ? <SkeletonList count={6} /> : shownTracks.length ? (
          <>
            <div className="flex items-center gap-3 mb-4"><PlayActions tracks={shownTracks} /></div>
            <TrackList tracks={shownTracks} showProvider />
          </>
        ) : renderEmpty()
      ) : items.length === 0 ? renderEmpty() : layout === 'grid' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-x-4 gap-y-6">
          {items.map(it => it.art ? (
            <button key={it.key} type="button" onClick={it.onOpen} className="group text-left rounded-xl p-2 -m-2 can-hover:hover:bg-on-surface/[0.05] transition-colors active:scale-[0.98]">
              <GradientArt kind={it.art} className="w-full aspect-square rounded-xl shadow-card mb-2.5" />
              <p className="text-sm font-semibold text-on-surface truncate">{it.title}</p>
              <p className="text-xs text-on-surface-variant truncate mt-0.5">{it.subtitle}</p>
            </button>
          ) : (
            <MediaCard key={it.key} title={it.title} image={it.image} icon={it.icon} shape={it.circle ? 'circle' : 'square'} onClick={it.onOpen} onPlay={it.onPlay}
              onContextMenu={it.playlist ? (e) => openItemMenu(e as React.MouseEvent<HTMLElement>, it) : undefined}
              subtitle={<span className="inline-flex items-center gap-1">{it.pinned && <span aria-label="Pinned" className="material-symbols-outlined filled text-sm text-primary">push_pin</span>}{it.subtitle}</span>} />
          ))}
        </div>
      ) : (
        <div role="list" className="-mx-2">
          {items.map(it => (
            <div key={it.key} role="listitem" className="group flex items-center gap-3 px-2 rounded-lg can-hover:hover:bg-on-surface/[0.06]"
              onContextMenu={it.playlist ? (e) => openItemMenu(e, it) : undefined}>
              <button type="button" onClick={it.onOpen} className="flex flex-1 min-w-0 items-center gap-3 py-2 text-left active:opacity-70">
                {it.art ? <GradientArt kind={it.art} className="w-14 h-14 rounded-lg" iconSize="text-2xl" />
                  : <Artwork src={it.image} size="md" rounded={it.circle ? 'full' : 'lg'} icon={it.icon} />}
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-on-surface">{it.title}</span>
                  <span className="flex items-center gap-1 text-[13px] text-on-surface-variant truncate">
                    {it.pinned && <span aria-label="Pinned" className="material-symbols-outlined filled text-sm text-primary">push_pin</span>}{it.subtitle}
                  </span>
                </span>
              </button>
              {it.onPlay && <IconButton icon="play_arrow" label={`Play ${it.title}`} size="sm" filled className="can-hover:opacity-0 can-hover:group-hover:opacity-100 focus-visible:opacity-100" onClick={it.onPlay} />}
              {it.playlist && <IconButton icon="more_vert" label={`More options for ${it.title}`} size="sm" aria-haspopup="menu" onClick={e => openItemMenu(e, it)} />}
            </div>
          ))}
        </div>
      )}

      <Menu open={sortMenu.open} anchor={sortMenu.anchor} onClose={sortMenu.onClose} align="end" width={200} ariaLabel="Sort by"
        header={<p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Sort by</p>}
        items={(['recent', 'alpha', 'creator'] as Sort[]).filter(s => s !== 'creator' || tab !== 'artists').map(s => ({ label: s === 'creator' && isTrackTab ? 'Artist' : SORT_LABEL[s], checked: sort === s, onSelect: () => update({ sort: s }) }))} />
      <Menu open={itemMenu.open} anchor={itemMenu.anchor} onClose={itemMenu.onClose} items={menuItems} ariaLabel="Playlist options"
        header={target && <p className="text-sm font-semibold text-on-surface truncate">{target.name}</p>} />
      <CreatePlaylistModal open={creating} onClose={() => setCreating(false)} />
      <Modal open={!!toDelete} onClose={() => setToDelete(null)} size="sm" title={`Delete “${toDelete?.name ?? ''}”?`}
        description="This playlist will be removed from your library. This can’t be undone."
        footer={<><Button variant="ghost" onClick={() => setToDelete(null)}>Cancel</Button><Button variant="danger" onClick={() => {
          if (toDelete) { useLibraryStore.getState().deletePlaylist(toDelete.id); useToastStore.getState().addToast(`Deleted “${toDelete.name}”`, 'info'); }
          setToDelete(null);
        }}>Delete</Button></>} />
    </div>
  );
}
