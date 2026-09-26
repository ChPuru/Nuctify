import { memo, useMemo } from 'react';
import { useMixSpecs, useMixStore, gradientFor, type MixSpec } from '../recommend';
import { usePlayerStore } from '../store';
import { useNavStore } from '../store/nav';
import { useToastStore } from '../store/toast';
import { Shelf, cn } from './ui';

const ICONS: Record<MixSpec['kind'], string> = {
  daily: 'auto_awesome', time: 'schedule', weekday: 'calendar_today', onrepeat: 'repeat', rewind: 'history',
  discover: 'explore', release: 'new_releases', artist: 'person', album: 'album',
};

export const MixCover = memo(function MixCover({ spec, size = 'card', className }: { spec: Pick<MixSpec, 'id' | 'title' | 'kind'>; size?: 'card' | 'hero'; className?: string }) {
  const g = gradientFor(spec.id);
  const hero = size === 'hero';
  return (
    <div
      aria-hidden
      className={cn('relative overflow-hidden aspect-square select-none shadow-card', hero ? 'w-48 sm:w-56 lg:w-60 rounded-xl shadow-overlay shrink-0' : 'w-full rounded-xl', className)}
      style={{ background: `linear-gradient(135deg, ${g.from}, ${g.to})` }}
    >
      <div className="absolute -right-1/4 -top-1/4 w-3/4 h-3/4 rounded-full opacity-40 blur-2xl" style={{ background: g.accent }} />
      <div className="absolute -left-1/4 bottom-0 w-2/3 h-1/2 rounded-full opacity-25 blur-2xl" style={{ background: g.accent }} />
      <span className={cn('material-symbols-outlined filled absolute text-white/80', hero ? 'top-4 left-4 text-3xl' : 'top-2.5 left-2.5 text-xl')}>{ICONS[spec.kind]}</span>
      <p className={cn('absolute inset-x-0 bottom-0 font-headline font-extrabold text-white leading-[1.05] tracking-tight line-clamp-3 drop-shadow', hero ? 'p-5 text-3xl' : 'p-3 text-lg sm:text-xl')}>
        {spec.title}
      </p>
      <div className="absolute inset-x-0 bottom-0 h-1.5" style={{ background: g.accent }} />
    </div>
  );
});

export async function playMix(spec: MixSpec, shuffle = false) {
  const toast = useToastStore.getState().addToast;
  const mix = await useMixStore.getState().ensure(spec);
  if (!mix?.tracks.length) return toast(navigator.onLine ? `Couldn't build ${spec.title} right now` : 'You’re offline — mixes need a connection the first time', 'error');
  usePlayerStore.getState().playTracks(mix.tracks, 0, shuffle ? { shuffle: true } : undefined);
}

export const MixCard = memo(function MixCard({ spec, badge }: { spec: MixSpec; badge?: string }) {
  const navigate = useNavStore((s) => s.navigate);
  const pending = useMixStore((s) => !!s.pending[spec.id]);
  const description = useMixStore((s) => s.mixes[spec.id]?.description) || spec.description;
  return (
    <div className="group relative rounded-xl p-2 -m-2 transition-colors duration-200 can-hover:hover:bg-on-surface/[0.05]">
      <button type="button" onClick={() => navigate(`mix:${spec.id}`)} className="block w-full text-left rounded-lg active:scale-[0.98] transition-transform duration-150">
        <MixCover spec={spec} className="mb-2.5" />
        <p className="text-sm font-semibold text-on-surface truncate">{spec.title}</p>
        <p className="text-xs text-on-surface-variant line-clamp-2 mt-0.5">{description}</p>
      </button>
      {badge && <span className="absolute top-4 right-4 pointer-events-none rounded-full bg-black/55 text-white text-[10px] font-bold uppercase tracking-wider px-2 py-0.5">{badge}</span>}
      <div className="absolute inset-x-2 top-2 aspect-square pointer-events-none">
        <button
          type="button"
          aria-label={`Play ${spec.title}`}
          disabled={pending}
          onClick={(e) => { e.stopPropagation(); void playMix(spec); }}
          className="pointer-events-auto absolute right-2 bottom-4 w-11 h-11 rounded-full bg-primary text-on-primary shadow-elevated flex items-center justify-center transition-[opacity,transform] duration-200 hover:scale-105 active:scale-95 opacity-100 can-hover:opacity-0 can-hover:translate-y-2 can-hover:group-hover:opacity-100 can-hover:group-hover:translate-y-0 focus-visible:opacity-100 focus-visible:translate-y-0"
        >
          <span aria-hidden className={cn('material-symbols-outlined filled text-2xl', pending && 'animate-spin')}>{pending ? 'progress_activity' : 'play_arrow'}</span>
        </button>
      </div>
    </div>
  );
});

const PRIORITY: Record<MixSpec['kind'], number> = { time: 0, weekday: 1, daily: 2, discover: 3, release: 4, onrepeat: 5, artist: 6, rewind: 7, album: 8 };

/** Compact "Made for you" shelf for Home. */
export default memo(function MadeForYouShelf({ className }: { className?: string }) {
  const { specs, cold } = useMixSpecs();
  const navigate = useNavStore((s) => s.navigate);
  const items = useMemo(() => {
    const now = specs.filter((s) => s.group === 'now' && s.highlight).slice(0, 1);
    const rest = specs.filter((s) => s.group !== 'now').sort((a, b) => PRIORITY[a.kind] - PRIORITY[b.kind]);
    return [...now, ...rest].slice(0, 10);
  }, [specs]);

  if (cold || !items.length) {
    return (
      <section className={cn('rounded-2xl bg-surface-container p-5 flex items-center gap-4', className)}>
        <span aria-hidden className="material-symbols-outlined filled text-4xl text-primary">auto_awesome</span>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-on-surface">Get mixes made for you</p>
          <p className="text-sm text-on-surface-variant">Pick a few favourite artists and keep listening — Daily Mixes and Discover Weekly will appear here.</p>
        </div>
        <button type="button" onClick={() => navigate('made-for-you')} className="shrink-0 h-9 px-4 rounded-full bg-on-surface text-background text-sm font-bold">Start</button>
      </section>
    );
  }
  return (
    <Shelf title="Made for you" onSeeAll={() => navigate('made-for-you')} className={className}>
      {items.map((s) => <MixCard key={s.id} spec={s} badge={s.highlight ? 'Now' : undefined} />)}
    </Shelf>
  );
});
