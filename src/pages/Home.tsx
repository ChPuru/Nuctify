import MadeForYouShelf from '../components/MadeForYouShelf';
import { useState, useEffect, useMemo } from 'react';
import { usePlayerStore, useLibraryStore, useSearchStore } from '../store';
import { useNavStore } from '../store/nav';
import { registry } from '../providers';
import { Track, HomeSection } from '../providers/types';
import { isNativeApp } from '../utils/env';
import { getGreeting } from '../utils';
import { playRemote } from './Album';
import { Artwork, Button, IconButton, MediaCard, Shelf, SkeletonShelf, cn } from '../components/ui';

const CACHE_TTL = 10 * 60_000;
let trendingCache: { at: number; tracks: Track[] } | null = null;
let sectionsCache: { at: number; sections: HomeSection[] } | null = null;
let discoveryCache: { key: string; tracks: Track[] } | null = null;

const firstArtist = (s: string) => s.split(/\s*(?:,|&|\bfeat\.?|\bft\.?|\bx\b)\s*/i)[0]?.trim() || s;

interface Pick { key: string; title: string; image?: string; icon?: string; onClick: () => void; active?: boolean }

function QuickPick({ p, playing }: { p: Pick; playing: boolean }) {
  return (
    <button
      type="button"
      onClick={p.onClick}
      className={cn('group flex items-center gap-3 h-14 sm:h-16 pr-3 rounded-lg overflow-hidden bg-on-surface/[0.07] text-left transition-colors duration-150 can-hover:hover:bg-on-surface/[0.14] active:scale-[0.99]', p.active && 'text-primary')}
    >
      {p.icon && !p.image ? (
        <div className="w-14 h-14 sm:w-16 sm:h-16 shrink-0 flex items-center justify-center bg-gradient-to-br from-primary to-secondary text-on-primary">
          <span aria-hidden className="material-symbols-outlined filled text-2xl">{p.icon}</span>
        </div>
      ) : (
        <Artwork src={p.image} size="md" rounded="md" className="!rounded-none sm:w-16 sm:h-16 shrink-0" />
      )}
      <span className={cn('flex-1 min-w-0 text-[13px] sm:text-sm font-bold line-clamp-2', p.active ? 'text-primary' : 'text-on-surface')}>{p.title}</span>
      {p.active && playing && <span aria-hidden className="material-symbols-outlined text-primary text-xl shrink-0">graphic_eq</span>}
    </button>
  );
}

export default function HomePage() {
  const [trending, setTrending] = useState<Track[] | null>(trendingCache?.tracks ?? null);
  const [sections, setSections] = useState<HomeSection[] | null>(sectionsCache?.sections ?? null);
  const [discovery, setDiscovery] = useState<Track[]>(discoveryCache?.tracks ?? []);
  const [reload, setReload] = useState(0);
  const isPlaying = usePlayerStore(s => s.isPlaying);
  const currentId = usePlayerStore(s => s.currentTrack?.id);
  const history = useLibraryStore(s => s.listeningHistory);
  const legacyRecent = useLibraryStore(s => s.recentlyPlayed);
  const likedTracks = useLibraryStore(s => s.likedTracks);
  const playlists = useLibraryStore(s => s.playlists);
  const pinned = useLibraryStore(s => s.pinnedPlaylists);
  const followed = useLibraryStore(s => s.followedArtists);
  const navigate = useNavStore(s => s.navigate);

  useEffect(() => {
    let cancelled = false;
    const stale = (at?: number) => reload > 0 || !at || Date.now() - at > CACHE_TTL;
    if (stale(trendingCache?.at)) {
      registry.getTrendingAll(20)
        .then(tracks => { if (tracks.length) trendingCache = { at: Date.now(), tracks }; if (!cancelled) setTrending(tracks.length ? tracks : trendingCache?.tracks ?? []); })
        .catch(() => { if (!cancelled) setTrending(t => t ?? []); });
    }
    if (stale(sectionsCache?.at)) {
      registry.getHomeSections()
        .then(res => { if (res.length) sectionsCache = { at: Date.now(), sections: res }; if (!cancelled) setSections(res.length ? res : sectionsCache?.sections ?? []); })
        .catch(() => { if (!cancelled) setSections(s => s ?? []); });
    }
    const counts = Object.values(useLibraryStore.getState().playCounts);
    if (counts.length) {
      const topArtist = firstArtist(counts.sort((a, b) => b.count - a.count)[0].artist);
      if (discoveryCache?.key !== topArtist || reload > 0) {
        registry.searchAll(`${topArtist} mix`, 15)
          .then(r => { discoveryCache = { key: topArtist, tracks: r.tracks }; if (!cancelled) setDiscovery(r.tracks); })
          .catch(() => {});
      }
    }
    return () => { cancelled = true; };
  }, [reload]);

  const recent = useMemo(() => {
    const seen = new Set<string>();
    const out: Track[] = [];
    for (const t of [...history.map(h => h.track), ...legacyRecent]) {
      if (!seen.has(t.id)) { seen.add(t.id); out.push(t); }
      if (out.length >= 20) break;
    }
    return out;
  }, [history, legacyRecent]);

  const topArtists = useMemo(() => {
    const map = new Map<string, { name: string; id?: string; image?: string; count: number }>();
    for (const { track } of history.slice(0, 300)) {
      const name = firstArtist(track.artist || '');
      if (!name || /unknown/i.test(name)) continue;
      const key = name.toLowerCase();
      const e = map.get(key) ?? { name, count: 0, image: track.thumbnail };
      e.count++;
      if (!e.id && track.artistId && !/[,&]/.test(track.artist)) e.id = track.artistId;
      map.set(key, e);
    }
    return [...map.values()].filter(a => a.count > 1).sort((a, b) => b.count - a.count).slice(0, 12).map(a => {
      const f = followed.find(x => x.id === a.id || x.name.toLowerCase() === a.name.toLowerCase());
      return f ? { ...a, id: f.id, image: f.image || a.image } : a;
    });
  }, [history, followed]);

  const playList = (track: Track, list: Track[]) => {
    const st = usePlayerStore.getState();
    if (track.id === st.currentTrack?.id) st.togglePlay();
    else st.playTracks(list, Math.max(0, list.findIndex(t => t.id === track.id)));
  };

  const picks = useMemo<Pick[]>(() => {
    const out: Pick[] = [];
    if (likedTracks.length) out.push({ key: 'liked', title: 'Liked Songs', icon: 'favorite', onClick: () => navigate('liked') });
    const pls = [...playlists].sort((a, b) => (pinned.includes(b.id) ? 1 : 0) - (pinned.includes(a.id) ? 1 : 0) || b.updatedAt - a.updatedAt).slice(0, 3);
    for (const p of pls) out.push({ key: p.id, title: p.name, image: p.thumbnail || p.tracks[0]?.thumbnail, icon: 'queue_music', onClick: () => navigate(`playlist:${p.id}`) });
    for (const t of recent) {
      if (out.length >= 8) break;
      out.push({ key: t.id, title: t.title, image: t.thumbnail, icon: 'music_note', onClick: () => playList(t, recent), active: t.id === currentId });
    }
    return out;
  }, [likedTracks.length, playlists, pinned, recent, currentId]); // eslint-disable-line react-hooks/exhaustive-deps

  const trackCard = (t: Track, list: Track[]) => (
    <MediaCard key={t.id} title={t.title} subtitle={t.artist} image={t.thumbnail} icon="music_note" playing={t.id === currentId && isPlaying} onPlay={() => playList(t, list)} />
  );

  const loading = sections === null && trending === null;
  const nothing = sections !== null && trending !== null && !sections.length && !trending.length;

  return (
    <div className="space-y-10 sm:space-y-12 pt-2 sm:pt-4 animate-fade-in">
      <section aria-labelledby="greeting">
        <div className="flex items-center justify-between gap-4 mb-4 sm:mb-5">
          <h1 id="greeting" className="text-2xl sm:text-3xl lg:text-4xl font-headline font-extrabold tracking-tight text-on-surface">{getGreeting()}</h1>
          <IconButton icon="refresh" label="Refresh" size="sm" onClick={() => setReload(r => r + 1)} />
        </div>
        {picks.length > 0 ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
            {picks.map((p, i) => <div key={p.key} className={i >= 6 ? 'hidden lg:block' : undefined}><QuickPick p={p} playing={isPlaying} /></div>)}
          </div>
        ) : (
          <div className="rounded-2xl bg-surface-container p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1">
              <p className="font-headline text-lg font-bold text-on-surface">Start listening</p>
              <p className="text-sm text-on-surface-variant">Search for songs, artists and albums across every source. Your picks will show up here.</p>
            </div>
            <Button variant="primary" icon="search" onClick={() => navigate('search')}>Search music</Button>
          </div>
        )}
      </section>

      {recent.length > 0 && (
        <Shelf title="Jump back in" onSeeAll={() => navigate('recent')}>
          {recent.map(t => trackCard(t, recent))}
        </Shelf>
      )}

      {loading && <><SkeletonShelf /><SkeletonShelf /></>}

      {trending && trending.length > 0 && (
        <Shelf title="Trending now" subtitle="What everyone's playing">
          {trending.map(t => trackCard(t, trending))}
        </Shelf>
      )}

      {topArtists.length > 0 && (
        <Shelf title="Your top artists" itemClassName="w-[34vw] max-w-[9.5rem] sm:w-40 sm:max-w-none">
          {topArtists.map(a => (
            <MediaCard
              key={a.name}
              title={a.name}
              subtitle="Artist"
              image={a.image}
              shape="circle"
              onClick={() => {
                if (a.id) navigate(`artist:${a.id}`);
                else { useSearchStore.getState().search(a.name); navigate('search'); }
              }}
            />
          ))}
        </Shelf>
      )}

      {sections?.map(section => (
        <Shelf key={section.id} title={section.title} subtitle={section.subtitle}>
          {[
            ...(section.tracks ?? []).map(t => trackCard(t, section.tracks!)),
            ...(section.albums ?? []).map(a => (
              <MediaCard key={a.id} title={a.title} subtitle={[a.year, a.artist].filter(Boolean).join(' • ')} image={a.thumbnail} onClick={() => navigate(`album:${a.id}`)} onPlay={() => playRemote('album', a.id)} />
            )),
            ...(section.playlists ?? []).map(p => (
              <MediaCard key={p.id} title={p.title} subtitle={p.subtitle} image={p.thumbnail} icon="queue_music" onClick={() => navigate(`remote-playlist:${p.id}`)} onPlay={() => playRemote('playlist', p.id)} />
            )),
          ]}
        </Shelf>
      ))}

      {sections === null && !loading && <SkeletonShelf />}

      <MadeForYouShelf />

      {discovery.length > 0 && (
        <Shelf title="More of what you like" subtitle="Based on what you play most">
          {discovery.map(t => trackCard(t, discovery))}
        </Shelf>
      )}

      {nothing && (
        <div className="rounded-2xl bg-surface-container p-6 flex flex-col items-center text-center gap-3">
          <span aria-hidden className="material-symbols-outlined text-4xl text-on-surface-variant">cloud_off</span>
          <p className="font-bold text-on-surface">Couldn't load recommendations</p>
          <p className="text-sm text-on-surface-variant">Check your connection and try again.</p>
          <Button icon="refresh" onClick={() => { setTrending(null); setSections(null); setReload(r => r + 1); }}>Retry</Button>
        </div>
      )}

      {!isNativeApp() && (
        <section className="rounded-2xl bg-surface-container p-5 sm:p-8 flex flex-col md:flex-row md:items-center gap-5">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold uppercase tracking-wider text-primary mb-1">Take it with you</p>
            <h2 className="text-xl sm:text-2xl font-headline font-extrabold text-on-surface">Get the Nuctify app</h2>
            <p className="text-sm text-on-surface-variant mt-1 max-w-xl">Background playback, media keys, offline downloads and Discord presence.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href="https://github.com/ChPuru/Nuctify/releases/download/exe/Nuctify_0.1.0_x64-setup.exe" className="inline-flex items-center gap-2 h-10 px-5 rounded-full bg-primary text-on-primary text-sm font-bold hover:brightness-110 transition">
              <span aria-hidden className="material-symbols-outlined text-lg">desktop_windows</span>Windows
            </a>
            <a href="https://github.com/ChPuru/Nuctify/releases/download/apk/app-release.apk" className="inline-flex items-center gap-2 h-10 px-5 rounded-full bg-on-surface/10 text-on-surface text-sm font-bold hover:bg-on-surface/[0.15] transition">
              <span aria-hidden className="material-symbols-outlined text-lg">android</span>Android
            </a>
          </div>
        </section>
      )}
    </div>
  );
}
