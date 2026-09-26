import { useMemo, useState } from 'react';
import { useLibraryStore, usePlayerStore } from '../store';
import { useNavStore } from '../store/nav';
import type { Track } from '../providers/types';
import { Artwork, EmptyState, Tabs, cn } from '../components/ui';

type Period = 'week' | 'month' | 'year' | 'all';
const PERIODS: { value: Period; label: string }[] = [
  { value: 'week', label: 'Last 7 days' },
  { value: 'month', label: 'Last 4 weeks' },
  { value: 'year', label: 'Last 12 months' },
  { value: 'all', label: 'All time' },
];
const SPAN: Record<Period, number> = { week: 7, month: 28, year: 365, all: Infinity };
const SOURCE_LABELS: Record<string, string> = { jiosaavn: 'JioSaavn', soundcloud: 'SoundCloud', youtube: 'YouTube', bandcamp: 'Bandcamp', local: 'Local files', podcast: 'Podcasts' };

interface Row { key: string; title: string; subtitle?: string; image?: string; count: number; track?: Track; artistId?: string }

export default function StatsPage() {
  const history = useLibraryStore(s => s.listeningHistory);
  const playCounts = useLibraryStore(s => s.playCounts);
  const liked = useLibraryStore(s => s.likedTracks);
  const navigate = useNavStore(s => s.navigate);
  const [period, setPeriod] = useState<Period>('month');

  const stats = useMemo(() => {
    const since = SPAN[period] === Infinity ? 0 : Date.now() - SPAN[period] * 864e5;
    const entries = history.filter(e => e.playedAt >= since);
    const known = new Map<string, Track>();
    [...liked, ...history.map(e => e.track)].forEach(t => known.set(t.id, t));

    const tracks = new Map<string, Row>();
    const artists = new Map<string, Row>();
    const sources: Record<string, number> = {};
    const hours = new Array(24).fill(0);
    let seconds = 0;
    const bump = (m: Map<string, Row>, key: string, init: () => Omit<Row, 'count'>, n = 1) => {
      const r = m.get(key);
      if (r) r.count += n; else m.set(key, { ...init(), count: n });
    };

    for (const { track: t, playedAt } of entries) {
      seconds += t.duration || 180;
      hours[new Date(playedAt).getHours()]++;
      sources[t.source] = (sources[t.source] || 0) + 1;
      bump(tracks, t.id, () => ({ key: t.id, title: t.title, subtitle: t.artist, image: t.thumbnail, track: t }));
      bump(artists, t.artist, () => ({ key: t.artist, title: t.artist, image: t.thumbnail, artistId: t.artistId }));
    }

    if (period === 'all') {
      for (const [id, d] of Object.entries(playCounts)) {
        const r = tracks.get(id);
        if (r) { r.count = Math.max(r.count, d.count); continue; }
        tracks.set(id, { key: id, title: d.title, subtitle: d.artist, image: d.thumbnail, count: d.count, track: known.get(id) });
      }
      artists.clear();
      for (const r of tracks.values()) {
        const name = r.subtitle || 'Unknown';
        bump(artists, name, () => ({ key: name, title: name, image: r.image, artistId: r.track?.artistId }), r.count);
      }
    }

    const top = (m: Map<string, Row>) => [...m.values()].sort((a, b) => b.count - a.count).slice(0, 10);
    const plays = period === 'all' ? Math.max(entries.length, Object.values(playCounts).reduce((a, d) => a + d.count, 0)) : entries.length;
    return { plays, minutes: Math.round(seconds / 60), topTracks: top(tracks), topArtists: top(artists), artistCount: artists.size, sources, hours };
  }, [history, playCounts, liked, period]);

  const peak = Math.max(1, ...stats.hours);
  const totalSrc = Object.values(stats.sources).reduce((a, b) => a + b, 0);
  const cards = [
    { label: 'Minutes listened', value: stats.minutes.toLocaleString() },
    { label: 'Plays', value: stats.plays.toLocaleString() },
    { label: 'Artists', value: stats.artistCount.toLocaleString() },
    { label: 'Liked songs', value: liked.length.toLocaleString() },
  ];

  return (
    <div className="animate-fade-in pb-8">
      <header className="pt-2 sm:pt-6 mb-5">
        <h1 className="font-headline font-extrabold text-3xl sm:text-5xl tracking-tight text-on-surface">Your stats</h1>
        <p className="text-on-surface-variant mt-1">What you’ve been listening to</p>
      </header>
      <Tabs options={PERIODS} value={period} onChange={setPeriod} ariaLabel="Time period" className="-mx-4 px-4 sm:mx-0 sm:px-0 mb-6" />

      {stats.plays === 0 ? (
        <EmptyState icon="insights" title="No listening yet for this period" description="Play some music and your stats will build up here." />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-10">
            {cards.map(c => (
              <div key={c.label} className="rounded-xl bg-surface-container p-4 sm:p-5">
                <p className="text-2xl sm:text-4xl font-headline font-extrabold text-on-surface tabular-nums">{c.value}</p>
                <p className="text-xs sm:text-sm text-on-surface-variant mt-1">{c.label}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-10 gap-y-10 mb-10">
            <RankList title="Top songs" rows={stats.topTracks} onSelect={r => r.track && usePlayerStore.getState().playTracks(stats.topTracks.flatMap(x => x.track ? [x.track] : []), Math.max(0, stats.topTracks.filter(x => x.track).indexOf(r)))} />
            <RankList title="Top artists" rows={stats.topArtists} circle onSelect={r => r.artistId && navigate(`artist:${r.artistId}`)} />
          </div>

          {stats.hours.some(Boolean) ? (
            <section className="mb-10">
              <h2 className="text-xl font-bold text-on-surface mb-4">When you listen</h2>
              <div className="flex items-end gap-[3px] sm:gap-1 h-32" role="img" aria-label="Plays by hour of day">
                {stats.hours.map((h, i) => (
                  <div key={i} className="flex-1 h-full flex items-end" title={`${i}:00 — ${h} plays`}>
                    <div className={cn('w-full rounded-t-sm transition-[height] duration-300', h === peak ? 'bg-primary' : 'bg-on-surface/20')} style={{ height: `${Math.max(2, (h / peak) * 100)}%` }} />
                  </div>
                ))}
              </div>
              <div className="flex justify-between text-[11px] text-on-surface-variant mt-2 tabular-nums"><span>12am</span><span>6am</span><span>12pm</span><span>6pm</span><span>11pm</span></div>
            </section>
          ) : null}

          {totalSrc > 0 && (
            <section>
              <h2 className="text-xl font-bold text-on-surface mb-4">Where your music comes from</h2>
              <div className="flex h-3 rounded-full overflow-hidden bg-on-surface/10 mb-4">
                {Object.entries(stats.sources).sort(([, a], [, b]) => b - a).map(([s, n], i) => (
                  <div key={s} style={{ width: `${(n / totalSrc) * 100}%`, opacity: Math.max(0.25, 1 - i * 0.2) }} className="bg-primary first:rounded-l-full last:rounded-r-full" />
                ))}
              </div>
              <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                {Object.entries(stats.sources).sort(([, a], [, b]) => b - a).map(([s, n], i) => (
                  <li key={s} className="flex items-center gap-2 text-on-surface">
                    <span aria-hidden className="w-2.5 h-2.5 rounded-full bg-primary" style={{ opacity: Math.max(0.25, 1 - i * 0.2) }} />
                    {SOURCE_LABELS[s] || s}<span className="text-on-surface-variant tabular-nums">{Math.round((n / totalSrc) * 100)}%</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function RankList({ title, rows, circle, onSelect }: { title: string; rows: Row[]; circle?: boolean; onSelect: (r: Row) => void }) {
  return (
    <section>
      <h2 className="text-xl font-bold text-on-surface mb-3">{title}</h2>
      <ol className="-mx-2">
        {rows.map((r, i) => {
          const actionable = circle ? !!r.artistId : !!r.track;
          return (
            <li key={r.key}>
              <button type="button" disabled={!actionable} onClick={() => onSelect(r)}
                className="w-full flex items-center gap-3 px-2 py-2 rounded-lg text-left transition-colors enabled:hover:bg-on-surface/[0.06] enabled:active:bg-on-surface/10 disabled:cursor-default">
                <span className="w-6 text-center text-sm font-bold tabular-nums text-on-surface-variant">{i + 1}</span>
                <Artwork src={r.image} size="sm" rounded={circle ? 'full' : 'md'} icon={circle ? 'person' : 'music_note'} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-on-surface">{r.title}</span>
                  {r.subtitle && <span className="block truncate text-[13px] text-on-surface-variant">{r.subtitle}</span>}
                </span>
                <span className="text-sm tabular-nums text-on-surface-variant">{r.count} {r.count === 1 ? 'play' : 'plays'}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
