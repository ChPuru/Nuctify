import { useState, useMemo, useEffect } from 'react';
import SearchBar from '../components/SearchBar';
import TrackList from '../components/TrackList';
import TrackContextMenu from '../components/TrackContextMenu';
import { useSearchStore, usePlayerStore, useLibraryStore } from '../store';
import { useNavStore } from '../store/nav';
import { Track, Album, Artist } from '../providers/types';
import { registry } from '../providers/registry';
import { Artwork, Button, Chip, EmptyState, IconButton, MediaCard, Shelf, Skeleton, SkeletonList, SkeletonShelf, Tabs } from '../components/ui';

type Filter = 'all' | 'songs' | 'albums' | 'artists' | 'playlists';

const BROWSE: { label: string; query: string; icon: string; from: string; to: string }[] = [
  { label: 'Bollywood', query: 'bollywood hits', icon: 'movie', from: '#e11d48', to: '#9f1239' },
  { label: 'Pop', query: 'pop hits', icon: 'auto_awesome', from: '#8b5cf6', to: '#5b21b6' },
  { label: 'Hip-Hop', query: 'hip hop', icon: 'mic', from: '#f59e0b', to: '#b45309' },
  { label: 'Punjabi', query: 'punjabi hits', icon: 'celebration', from: '#10b981', to: '#047857' },
  { label: 'Chill', query: 'chill lofi', icon: 'spa', from: '#0ea5e9', to: '#0369a1' },
  { label: 'Workout', query: 'workout motivation', icon: 'fitness_center', from: '#ef4444', to: '#b91c1c' },
  { label: 'Romance', query: 'romantic songs', icon: 'favorite', from: '#ec4899', to: '#be185d' },
  { label: 'Focus', query: 'focus instrumental', icon: 'psychology', from: '#14b8a6', to: '#0f766e' },
  { label: 'Party', query: 'party songs', icon: 'nightlife', from: '#f97316', to: '#c2410c' },
  { label: 'Indie', query: 'indie', icon: 'piano', from: '#6366f1', to: '#4338ca' },
  { label: 'Devotional', query: 'devotional', icon: 'self_improvement', from: '#eab308', to: '#a16207' },
  { label: 'Rock', query: 'rock classics', icon: 'music_note', from: '#64748b', to: '#334155' },
  { label: 'Sleep', query: 'sleep music', icon: 'bedtime', from: '#3b82f6', to: '#1e3a8a' },
  { label: 'Tamil', query: 'tamil hits', icon: 'queue_music', from: '#d946ef', to: '#a21caf' },
  { label: 'K-Pop', query: 'kpop', icon: 'star', from: '#f43f5e', to: '#7c3aed' },
  { label: 'Retro', query: 'old is gold 90s', icon: 'radio', from: '#a3a3a3', to: '#525252' },
];

function saveRecent(list: string[]) {
  useSearchStore.setState({ recentSearches: list });
  try { localStorage.setItem('nuctify_recent_searches', JSON.stringify(list)); } catch { /* ignore */ }
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export default function SearchPage() {
  const results = useSearchStore(s => s.results);
  const isSearching = useSearchStore(s => s.isSearching);
  const query = useSearchStore(s => s.query);
  const recentSearches = useSearchStore(s => s.recentSearches);
  const search = useSearchStore(s => s.search);
  const searchByLyrics = useSearchStore(s => s.searchByLyrics);
  const setSearchByLyrics = useSearchStore(s => s.setSearchByLyrics);
  const playlists = useLibraryStore(s => s.playlists);
  const currentId = usePlayerStore(s => s.currentTrack?.id);
  const isPlaying = usePlayerStore(s => s.isPlaying);
  const navigate = useNavStore(s => s.navigate);
  const [filter, setFilter] = useState<Filter>('all');
  const [menu, setMenu] = useState<{ track: Track; x: number; y: number } | null>(null);

  useEffect(() => { setFilter('all'); }, [query]);

  const openAlbum = (album: Album) => {
    if (registry.get(album.source)?.getAlbumDetails) navigate(`album:${album.id}`);
    else search(`${album.title ?? ''} ${album.artist ?? ''}`.trim());
  };
  const openArtist = (artist: Artist) => {
    if (registry.get(artist.source)?.getArtistDetails) navigate(`artist:${artist.id}`);
    else search(artist.name);
  };
  const playTrack = (t: Track, list: Track[]) => {
    const st = usePlayerStore.getState();
    if (st.currentTrack?.id === t.id) st.togglePlay();
    else st.playTracks(list, Math.max(0, list.findIndex(x => x.id === t.id)));
  };

  const matchedPlaylists = useMemo(() => {
    const q = norm(query);
    return q ? playlists.filter(p => norm(p.name).includes(q)) : [];
  }, [playlists, query]);

  const top = useMemo(() => {
    if (!results) return null;
    const q = norm(query);
    const artist = results.artists.find(a => norm(a.name) === q);
    if (artist) return { kind: 'artist' as const, artist };
    return results.tracks[0] ? { kind: 'track' as const, track: results.tracks[0] } : results.artists[0] ? { kind: 'artist' as const, artist: results.artists[0] } : null;
  }, [results, query]);

  const lyricsToggle = (
    <Chip label="Lyrics" icon="lyrics" selected={searchByLyrics} onClick={() => { setSearchByLyrics(!searchByLyrics); if (query) setTimeout(() => useSearchStore.getState().search(query)); }} />
  );

  const header = (
    <div className="sticky top-[calc(var(--topnav-h)+env(safe-area-inset-top))] z-20 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 pt-2 pb-3 bg-background">
      <div className="max-w-3xl flex items-center gap-2">
        <div className="flex-1 min-w-0"><SearchBar autoFocus /></div>
      </div>
      {results && !isSearching && (
        <div className="flex items-center gap-2 mt-3 overflow-x-auto no-scrollbar">
          <Tabs<Filter>
            ariaLabel="Result type"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'All' },
              { value: 'songs', label: 'Songs' },
              ...(results.albums.length ? [{ value: 'albums' as const, label: 'Albums' }] : []),
              ...(results.artists.length ? [{ value: 'artists' as const, label: 'Artists' }] : []),
              ...(matchedPlaylists.length ? [{ value: 'playlists' as const, label: 'Playlists' }] : []),
            ]}
          />
          <span className="w-px h-6 bg-outline-variant shrink-0 mx-1" />
          {lyricsToggle}
        </div>
      )}
    </div>
  );

  if (isSearching && !results) {
    return (
      <div className="pb-8">
        {header}
        <div className="grid lg:grid-cols-12 gap-8 mt-4">
          <Skeleton className="lg:col-span-5 h-56" rounded="rounded-2xl" />
          <SkeletonList count={4} className="lg:col-span-7" />
        </div>
        <SkeletonShelf className="mt-10" />
      </div>
    );
  }

  if (!results) {
    return (
      <div className="pb-8 animate-fade-in">
        {header}
        <div className="flex items-center gap-2 mt-1 mb-8">
          {lyricsToggle}
          {searchByLyrics && <p className="text-xs text-on-surface-variant">Find songs from a line you remember</p>}
        </div>
        {recentSearches.length > 0 && (
          <section className="mb-10" aria-labelledby="recent-h">
            <div className="flex items-center justify-between mb-3">
              <h2 id="recent-h" className="text-xl font-headline font-bold text-on-surface">Recent searches</h2>
              <Button variant="ghost" size="sm" onClick={() => saveRecent([])}>Clear all</Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {recentSearches.map(s => (
                <Chip key={s} label={s} icon="history" onClick={() => search(s)} onRemove={() => saveRecent(recentSearches.filter(x => x !== s))} />
              ))}
            </div>
          </section>
        )}
        <section aria-labelledby="browse-h">
          <h2 id="browse-h" className="text-xl font-headline font-bold text-on-surface mb-4">Browse all</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
            {BROWSE.map(b => (
              <button
                key={b.label}
                type="button"
                onClick={() => search(b.query)}
                className="relative overflow-hidden rounded-xl h-24 sm:h-28 p-4 text-left text-white font-headline font-bold text-lg shadow-card active:scale-[0.98] can-hover:hover:brightness-110 transition-[transform,filter] duration-150"
                style={{ background: `linear-gradient(135deg, ${b.from}, ${b.to})` }}
              >
                {b.label}
                <span aria-hidden className="material-symbols-outlined absolute -right-2 -bottom-3 text-7xl opacity-30 rotate-12">{b.icon}</span>
              </button>
            ))}
          </div>
        </section>
      </div>
    );
  }

  const empty = !results.tracks.length && !results.albums.length && !results.artists.length && !matchedPlaylists.length;
  const albumShelf = results.albums.length > 0 && (
    <Shelf title="Albums" onSeeAll={results.albums.length > 6 ? () => setFilter('albums') : undefined}>
      {results.albums.map(a => <MediaCard key={a.id} title={a.title} subtitle={[a.year, a.artist].filter(Boolean).join(' • ')} image={a.thumbnail} onClick={() => openAlbum(a)} />)}
    </Shelf>
  );
  const artistShelf = results.artists.length > 0 && (
    <Shelf title="Artists" onSeeAll={results.artists.length > 6 ? () => setFilter('artists') : undefined}>
      {results.artists.map(a => <MediaCard key={a.id} title={a.name} subtitle="Artist" image={a.image} shape="circle" onClick={() => openArtist(a)} />)}
    </Shelf>
  );
  const playlistCards = matchedPlaylists.map(p => (
    <MediaCard key={p.id} title={p.name} subtitle={`Playlist • ${p.tracks.length} songs`} image={p.thumbnail || p.tracks[0]?.thumbnail} icon="queue_music" onClick={() => navigate(`playlist:${p.id}`)} onPlay={p.tracks.length ? () => usePlayerStore.getState().playTracks(p.tracks) : undefined} />
  ));
  const grid = 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-x-4 gap-y-6';

  return (
    <div className={`pb-8 transition-opacity duration-150 ${isSearching ? 'opacity-60' : ''}`}>
      {header}
      {empty ? (
        <EmptyState icon="search_off" title={`No results for "${query}"`} description="Check the spelling, or try fewer or different keywords." action={!searchByLyrics ? <Button onClick={() => { setSearchByLyrics(true); search(query); }} icon="lyrics">Search lyrics instead</Button> : undefined} />
      ) : filter === 'all' ? (
        <div className="space-y-10 mt-4 animate-fade-in">
          {(top || results.tracks.length > 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
              {top && (
                <section className="lg:col-span-5" aria-labelledby="top-h">
                  <h2 id="top-h" className="text-xl font-headline font-bold text-on-surface mb-3">Top result</h2>
                  {top.kind === 'track' ? (
                    <div className="group relative rounded-2xl bg-surface-container p-5 transition-colors can-hover:hover:bg-surface-container-high">
                      <button type="button" onClick={() => playTrack(top.track, results.tracks)} className="block w-full text-left">
                        <Artwork src={top.track.thumbnail} size="lg" rounded="xl" shadow className="mb-5" />
                        <p className="text-2xl sm:text-3xl font-headline font-extrabold text-on-surface line-clamp-2 pr-14">{top.track.title}</p>
                        <p className="text-sm text-on-surface-variant mt-1 truncate pr-14">
                          <span className="inline-block px-2 py-0.5 mr-2 rounded-full bg-on-surface/10 text-on-surface text-xs font-semibold">Song</span>
                          {top.track.artist}
                        </p>
                      </button>
                      <div className="absolute top-3 right-3">
                        <IconButton icon="more_horiz" label="More options" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setMenu({ track: top.track, x: r.right - 224, y: r.bottom + 4 }); }} />
                      </div>
                      <button
                        type="button"
                        aria-label={currentId === top.track.id && isPlaying ? 'Pause' : 'Play'}
                        onClick={() => playTrack(top.track, results.tracks)}
                        className="absolute right-5 bottom-5 w-12 h-12 rounded-full bg-primary text-on-primary shadow-elevated flex items-center justify-center transition-[opacity,transform] duration-200 hover:scale-105 active:scale-95 can-hover:opacity-0 can-hover:group-hover:opacity-100 focus-visible:opacity-100"
                      >
                        <span aria-hidden className="material-symbols-outlined filled text-2xl">{currentId === top.track.id && isPlaying ? 'pause' : 'play_arrow'}</span>
                      </button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => openArtist(top.artist)} className="w-full text-left rounded-2xl bg-surface-container p-5 transition-colors can-hover:hover:bg-surface-container-high">
                      <Artwork src={top.artist.image} size="lg" rounded="full" icon="person" shadow className="mb-5" />
                      <p className="text-2xl sm:text-3xl font-headline font-extrabold text-on-surface truncate">{top.artist.name}</p>
                      <span className="inline-block mt-2 px-2 py-0.5 rounded-full bg-on-surface/10 text-on-surface text-xs font-semibold">Artist</span>
                    </button>
                  )}
                </section>
              )}
              {results.tracks.length > 0 && (
                <section className={top ? 'lg:col-span-7 min-w-0' : 'lg:col-span-12'} aria-labelledby="songs-h">
                  <div className="flex items-center justify-between mb-3">
                    <h2 id="songs-h" className="text-xl font-headline font-bold text-on-surface">Songs</h2>
                    {results.tracks.length > 5 && <Button variant="ghost" size="sm" onClick={() => setFilter('songs')}>Show all</Button>}
                  </div>
                  <TrackList tracks={results.tracks.slice(0, 5)} showIndex={false} showProvider />
                </section>
              )}
            </div>
          )}
          {artistShelf}
          {albumShelf}
          {playlistCards.length > 0 && <Shelf title="Your playlists" onSeeAll={() => setFilter('playlists')}>{playlistCards}</Shelf>}
        </div>
      ) : (
        <div className="mt-4 animate-fade-in">
          {filter === 'songs' && (results.tracks.length
            ? <TrackList tracks={results.tracks} showProvider />
            : <EmptyState compact icon="music_off" title="No songs found" />)}
          {filter === 'albums' && (
            <div className={grid}>{results.albums.map(a => <MediaCard key={a.id} title={a.title} subtitle={[a.year, a.artist].filter(Boolean).join(' • ')} image={a.thumbnail} onClick={() => openAlbum(a)} />)}</div>
          )}
          {filter === 'artists' && (
            <div className={grid}>{results.artists.map(a => <MediaCard key={a.id} title={a.name} subtitle="Artist" image={a.image} shape="circle" onClick={() => openArtist(a)} />)}</div>
          )}
          {filter === 'playlists' && <div className={grid}>{playlistCards}</div>}
        </div>
      )}
      {menu && <TrackContextMenu track={menu.track} x={menu.x} y={menu.y} onClose={() => setMenu(null)} />}
    </div>
  );
}
