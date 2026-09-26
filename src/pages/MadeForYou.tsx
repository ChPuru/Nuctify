import { useEffect, useMemo, useRef, useState } from 'react';
import { registry } from '../providers';
import type { Artist, HomeSection } from '../providers/types';
import { useLibraryStore, usePlayerStore } from '../store';
import { useNavStore } from '../store/nav';
import { useMixSpecs, type MixSpec } from '../recommend';
import { MixCard } from '../components/MadeForYouShelf';
import { Artwork, Button, EmptyState, MediaCard, Shelf, SkeletonShelf, cn } from '../components/ui';

const EMPTY: never[] = [];
const greeting = () => { const h = new Date().getHours(); return h < 5 ? 'Up late?' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };

function toArtist(t: { artist: string; artistId?: string; thumbnail?: string; source: Artist['source'] }): Artist | null {
  if (!t.artistId) return null;
  return { id: t.artistId, name: t.artist.split(',')[0].trim(), image: t.thumbnail, source: t.source, sourceId: registry.parseEntityId(t.artistId).rawId };
}

function ArtistPicker({ sections }: { sections: HomeSection[] | null }) {
  const followed = useLibraryStore((s) => s.followedArtists) ?? EMPTY;
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Artist[] | null>(null);
  const [trending, setTrending] = useState<Artist[]>([]);
  const seq = useRef(0);

  useEffect(() => {
    let alive = true;
    registry.getTrendingAll(40).then((ts) => alive && setTrending(ts.map(toArtist).filter((a): a is Artist => !!a))).catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return setResults(null);
    const id = ++seq.current;
    const t = setTimeout(() => {
      registry.searchAll(term, 12).then((r) => id === seq.current && setResults(r.artists.slice(0, 12))).catch(() => setResults([]));
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const suggestions = useMemo(() => {
    const fromHome = (sections || []).flatMap((s) => s.tracks || []).map(toArtist).filter((a): a is Artist => !!a);
    const seen = new Set<string>();
    return [...followed, ...trending, ...fromHome].filter((a) => { const k = a.name.toLowerCase(); return !seen.has(k) && (seen.add(k), true); }).slice(0, 24);
  }, [sections, trending, followed]);

  const list = results ?? suggestions;
  const isFollowing = (a: Artist) => followed.some((f) => f.id === a.id);

  return (
    <section className="rounded-2xl bg-surface-container-low p-4 sm:p-6">
      <h2 className="text-xl font-bold text-on-surface">Pick artists you love</h2>
      <p className="text-sm text-on-surface-variant mt-1 mb-4">We’ll use them to build your Daily Mixes, Discover Weekly and Release Radar. {followed.length > 0 && <b className="text-on-surface">{followed.length} selected.</b>}</p>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search artists"
        aria-label="Search artists"
        className="w-full sm:max-w-sm h-11 rounded-full bg-surface-container-highest border-0 px-5 mb-4 text-on-surface placeholder:text-on-surface-variant/70 focus:ring-2 focus:ring-primary"
      />
      {list.length === 0 ? (
        <p className="text-sm text-on-surface-variant py-6">{results ? 'No artists found.' : navigator.onLine ? 'Loading suggestions…' : 'You’re offline — connect to find artists.'}</p>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8 gap-3">
          {list.map((a) => {
            const on = isFollowing(a);
            return (
              <button key={a.id} type="button" aria-pressed={on} onClick={() => useLibraryStore.getState().toggleFollowArtist(a)}
                className="group flex flex-col items-center gap-2 p-2 rounded-xl hover:bg-on-surface/[0.05] transition-colors">
                <span className="relative w-full">
                  <Artwork src={a.image} size="fill" rounded="full" icon="person" className={cn('transition', on && 'ring-4 ring-primary')} />
                  {on && <span className="material-symbols-outlined filled absolute bottom-0 right-0 bg-primary text-on-primary rounded-full text-lg w-7 h-7 flex items-center justify-center">check</span>}
                </span>
                <span className="text-xs font-semibold text-on-surface text-center line-clamp-2">{a.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

function HomeFallback({ sections }: { sections: HomeSection[] | null }) {
  const navigate = useNavStore((s) => s.navigate);
  if (!sections) return <SkeletonShelf />;
  return (
    <>
      {sections.slice(0, 4).map((s) => (
        <Shelf key={s.id} title={s.title} subtitle={s.subtitle}>
          {[
            ...(s.tracks || []).slice(0, 15).map((t, i) => (
              <MediaCard key={t.id} title={t.title} subtitle={t.artist} image={t.thumbnail} onClick={() => usePlayerStore.getState().playTracks(s.tracks!, i)} onPlay={() => usePlayerStore.getState().playTracks(s.tracks!, i)} />
            )),
            ...(s.albums || []).slice(0, 15).map((a) => <MediaCard key={a.id} title={a.title} subtitle={a.artist} image={a.thumbnail} onClick={() => navigate(`album:${a.id}`)} />),
            ...(s.playlists || []).slice(0, 15).map((p) => <MediaCard key={p.id} title={p.title} subtitle={p.subtitle} image={p.thumbnail} icon="queue_music" onClick={() => navigate(`remote-playlist:${p.id}`)} />),
          ]}
        </Shelf>
      ))}
    </>
  );
}

const GROUPS: { group: MixSpec['group']; title: string; subtitle?: string }[] = [
  { group: 'daily', title: 'Your Daily Mixes', subtitle: 'Refreshed every day from what you love' },
  { group: 'now', title: 'Mixes for right now', subtitle: 'Tuned to your time of day and day of week' },
  { group: 'special', title: 'Made for you', subtitle: 'Discover Weekly, Release Radar and more' },
  { group: 'top', title: 'Your top mixes', subtitle: 'Built around your favourite artists and albums' },
];

export default function MadeForYouPage() {
  const { specs, cold } = useMixSpecs();
  const [sections, setSections] = useState<HomeSection[] | null>(null);
  const [tune, setTune] = useState(false);
  const online = typeof navigator === 'undefined' || navigator.onLine;

  useEffect(() => {
    if (!cold && !tune) return;
    let alive = true;
    registry.getHomeSections().then((s) => alive && setSections(s)).catch(() => alive && setSections([]));
    return () => { alive = false; };
  }, [cold, tune]);

  return (
    <div className="space-y-10 pb-6">
      <header className="pt-4 sm:pt-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-on-surface-variant">{greeting()}</p>
          <h1 className="font-headline text-3xl sm:text-5xl font-extrabold tracking-tight text-on-surface">Made for you</h1>
          {!online && <p className="text-sm text-on-surface-variant mt-2">You’re offline — saved mixes still play; new ones will build when you reconnect.</p>}
        </div>
        {!cold && <Button icon={tune ? 'close' : 'tune'} onClick={() => setTune((v) => !v)}>{tune ? 'Done' : 'Tune your mixes'}</Button>}
      </header>

      {(cold || tune) && <ArtistPicker sections={sections} />}

      {cold ? (
        <>
          {specs.length > 0 && (
            <Shelf title="Getting started">{specs.map((s) => <MixCard key={s.id} spec={s} />)}</Shelf>
          )}
          <HomeFallback sections={sections} />
          {sections?.length === 0 && specs.length === 0 && (
            <EmptyState icon="auto_awesome" title="Your mixes are on the way" description="Play some music, like songs or follow artists — personalised mixes appear after a few listens." />
          )}
        </>
      ) : (
        GROUPS.map(({ group, title, subtitle }) => {
          const list = specs.filter((s) => s.group === group);
          if (!list.length) return null;
          return (
            <Shelf key={group} title={title} subtitle={subtitle}>
              {list.map((s) => <MixCard key={s.id} spec={s} badge={s.highlight ? (s.kind === 'weekday' ? 'Today' : 'Now') : undefined} />)}
            </Shelf>
          );
        })
      )}
    </div>
  );
}
