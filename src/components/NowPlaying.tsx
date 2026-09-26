import { useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { usePlayerStore } from '../store';
import { useDominantColor } from '../utils/color';
import type { Track } from '../providers/types';
import { Artwork, IconButton, Tabs, cn, useMediaQuery } from './ui';
import { SeekBar, VolumeControl, PlayButton, TrackMeta, LikeButton, PlaybackMenuButton, useNowPlayingView, useSwipe, type NowPlayingTab } from './PlayerBar';
import QueuePanel from './QueuePanel';
import LyricsView from './LyricsView';
import Visualizer from './Visualizer';

const OVERLAY = '[aria-modal="true"], body > [role="menu"]';
const OV = '!text-white/80 hover:!text-white hover:!bg-white/10';
const act = (on: boolean) => (on ? '!text-white !bg-white/20' : OV);

export default function NowPlaying() {
  const open = usePlayerStore((s) => s.nowPlayingExpanded);
  const has = usePlayerStore((s) => !!s.currentTrack);
  useEffect(() => {
    if (open && !has) usePlayerStore.getState().toggleNowPlaying();
  }, [open, has]);
  return open && has ? <Panel /> : null;
}

function SleepChip() {
  const ms = usePlayerStore((s) => s.sleepTimerRemaining);
  if (ms === null) return null;
  return (
    <span title="Sleep timer" className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-white/15 text-xs font-semibold tabular-nums shrink-0">
      <span aria-hidden className="material-symbols-outlined text-sm filled">bedtime</span>
      {Math.max(1, Math.ceil(ms / 60000))}m
    </span>
  );
}

function Controls({ className }: { className?: string }) {
  const { shuffle, repeat, toggleShuffle, toggleRepeat, nextTrack, prevTrack } = usePlayerStore(useShallow((s) => ({
    shuffle: s.shuffle, repeat: s.repeat, toggleShuffle: s.toggleShuffle, toggleRepeat: s.toggleRepeat, nextTrack: s.nextTrack, prevTrack: s.prevTrack,
  })));
  return (
    <div className={cn('flex items-center justify-between w-full', className)}>
      <IconButton icon="shuffle" label={shuffle ? 'Disable shuffle' : 'Enable shuffle'} aria-pressed={shuffle} onClick={toggleShuffle} className={act(shuffle)} />
      <IconButton icon="skip_previous" label="Previous" size="xl" filled onClick={prevTrack} className="!text-white hover:!bg-white/10 !text-[40px]" />
      <PlayButton size="xl" />
      <IconButton icon="skip_next" label="Next" size="xl" filled onClick={() => nextTrack()} className="!text-white hover:!bg-white/10 !text-[40px]" />
      <IconButton icon={repeat === 'one' ? 'repeat_one' : 'repeat'} label={`Repeat: ${repeat}`} aria-pressed={repeat !== 'off'} onClick={toggleRepeat} className={act(repeat !== 'off')} />
    </div>
  );
}

function PanelBody({ view, large, className }: { view: Exclude<NowPlayingTab, null>; large?: boolean; className?: string }) {
  return view === 'lyrics' ? <LyricsView large={large} className={className} /> : <QueuePanel className={cn('-mx-2', className)} />;
}

function Cover({ track, playing, size }: { track: Track; playing: boolean; size: string }) {
  return (
    <div className={cn('transition-transform duration-300 ease-out', playing ? 'scale-100' : 'scale-[0.88]')} style={{ width: size }}>
      <Artwork key={track.id} src={track.thumbnail} alt={`${track.title} artwork`} size="fill" rounded="xl" priority className="shadow-overlay" />
    </div>
  );
}

function Panel() {
  const track = usePlayerStore((s) => s.currentTrack)!;
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const karaoke = usePlayerStore((s) => s.karaokeMode);
  const toggleKaraoke = usePlayerStore((s) => s.toggleKaraokeMode);
  const tab = useNowPlayingView((s) => s.tab);
  const setTab = useNowPlayingView((s) => s.setTab);
  const wide = useMediaQuery('(min-width: 1024px)');
  const color = useDominantColor(track.thumbnail);
  const [bgFailed, setBgFailed] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const art = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const close = () => usePlayerStore.getState().toggleNowPlaying();
  const view: NowPlayingTab = wide ? tab ?? 'lyrics' : tab;

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeBtn.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || document.querySelector(OVERLAY)) return;
      e.preventDefault();
      usePlayerStore.getState().toggleNowPlaying();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      if (prev && document.contains(prev)) prev.focus({ preventScroll: true });
    };
  }, []);

  const swipe = useSwipe(
    (axis, d) => {
      const el = axis === 'y' ? root.current : art.current;
      if (!el) return;
      el.style.transition = d ? 'none' : 'transform 250ms cubic-bezier(0.16,1,0.3,1)';
      el.style.transform = axis === 'y' ? (d > 0 ? `translateY(${d}px)` : '') : d ? `translateX(${d * 0.7}px)` : '';
    },
    (axis, d, v) => {
      if (axis === 'y') { if (d > 140 || v > 0.7) close(); return; }
      if (Math.abs(d) > 80 || Math.abs(v) > 0.6) { const s = usePlayerStore.getState(); (d < 0 ? s.nextTrack : s.prevTrack)(); }
    },
  );
  const mobileSwipe = wide ? {} : swipe;

  const header = (
    <header {...mobileSwipe} className="relative z-10 shrink-0 px-3 sm:px-6 pt-[calc(env(safe-area-inset-top)+0.25rem)] pb-1 touch-none lg:touch-auto">
      <div aria-hidden className="lg:hidden mx-auto mt-1 mb-1 w-9 h-1 rounded-full bg-white/30" />
      <div className="flex items-center gap-2 h-12">
        <IconButton ref={closeBtn} icon="keyboard_arrow_down" label="Close Now Playing" onClick={close} className={cn(OV, '!text-[28px]')} />
        <div className="flex-1 min-w-0 text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/60">Now playing</p>
          <p className="text-sm font-semibold truncate">{track.album || track.artist}</p>
        </div>
        <SleepChip />
        <PlaybackMenuButton track={track} overlay size="md" />
      </div>
    </header>
  );

  const mobile = (
    <div className="relative z-10 flex-1 min-h-0 flex flex-col px-6 sm:px-10 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] max-w-xl w-full mx-auto">
      {view ? (
        <>
          <div className="flex items-center gap-3 py-2">
            <Artwork src={track.thumbnail} size="sm" rounded="md" className="shadow-card" />
            <TrackMeta track={track} overlay className="flex-1" />
            <LikeButton track={track} overlay size="md" />
          </div>
          <div className="flex-1 min-h-0 flex flex-col pt-1 pb-2">
            <PanelBody view={view} className="flex-1" />
          </div>
        </>
      ) : (
        <>
          <div {...swipe} className="flex-1 min-h-0 flex items-center justify-center py-4 touch-none">
            <div ref={art}>
              <Cover track={track} playing={isPlaying} size="min(calc(100vw - 3rem), 30rem, calc(100dvh - 25.5rem - env(safe-area-inset-top) - env(safe-area-inset-bottom)))" />
            </div>
          </div>
          <div className="flex items-center gap-2 pt-2">
            <TrackMeta key={track.id} track={track} overlay large className="flex-1 animate-fade-in" />
            <LikeButton track={track} overlay size="md" />
          </div>
        </>
      )}
      <SeekBar overlay stacked className="mt-3" />
      <Controls className="mt-1" />
      <div className="flex items-center justify-between mt-2">
        <IconButton icon="lyrics" label={view === 'lyrics' ? 'Hide lyrics' : 'Lyrics'} aria-pressed={view === 'lyrics'} onClick={() => setTab(view === 'lyrics' ? null : 'lyrics')} className={act(view === 'lyrics')} />
        <IconButton icon="queue_music" label={view === 'queue' ? 'Hide queue' : 'Up next'} aria-pressed={view === 'queue'} onClick={() => setTab(view === 'queue' ? null : 'queue')} className={act(view === 'queue')} />
      </div>
    </div>
  );

  const desktop = (
    <div className={cn('relative z-10 flex-1 min-h-0 grid gap-12 xl:gap-20 px-10 xl:px-16 pb-8 pt-2 max-w-[1600px] w-full mx-auto', karaoke ? 'grid-cols-1' : 'grid-cols-2')}>
      {!karaoke && (
        <section aria-label="Player" className="min-h-0 flex flex-col justify-center items-center">
          <div ref={art}>
            <Cover track={track} playing={isPlaying} size="min(100%, 30rem, calc(100dvh - 23rem))" />
          </div>
          <div className="w-full max-w-[30rem] mt-8">
            <div className="flex items-center gap-2">
              <TrackMeta key={track.id} track={track} overlay large className="flex-1 animate-fade-in" />
              <LikeButton track={track} overlay size="md" />
            </div>
            <SeekBar overlay stacked className="mt-4" />
            <Controls className="mt-2" />
            <VolumeControl overlay className="mt-4 w-56 mx-auto" />
          </div>
        </section>
      )}
      <section aria-label={view === 'queue' ? 'Up next' : 'Lyrics'} className={cn('min-h-0 flex flex-col', karaoke && 'max-w-4xl w-full mx-auto')}>
        <div className="flex items-center gap-2 mb-3 shrink-0">
          <Tabs<'lyrics' | 'queue'>
            ariaLabel="Now Playing panel"
            value={view ?? 'lyrics'}
            onChange={setTab}
            options={[{ value: 'lyrics', label: 'Lyrics', icon: 'lyrics' }, { value: 'queue', label: 'Up next', icon: 'queue_music' }]}
            className="flex-1"
          />
          {view === 'lyrics' && (
            <IconButton icon={karaoke ? 'close_fullscreen' : 'open_in_full'} label={karaoke ? 'Exit full-screen lyrics' : 'Full-screen lyrics'} size="sm" onClick={toggleKaraoke} className={OV} />
          )}
        </div>
        <PanelBody view={view ?? 'lyrics'} large={karaoke} className="flex-1" />
        {karaoke && (
          <div className="shrink-0 flex items-center gap-4 pt-4">
            <Artwork src={track.thumbnail} size="sm" rounded="md" />
            <TrackMeta track={track} overlay className="w-56" />
            <PlayButton size="md" />
            <SeekBar overlay className="flex-1" />
          </div>
        )}
      </section>
    </div>
  );

  return (
    <div ref={root} role="dialog" aria-label="Now playing" className="fixed inset-0 z-[100] flex flex-col text-white overflow-hidden animate-sheet-up select-none">
      <div aria-hidden className="absolute inset-0 bg-surface-container-low transition-colors duration-700" style={color ? { backgroundColor: color } : undefined} />
      {wide && track.thumbnail && bgFailed !== track.thumbnail && (
        <img aria-hidden alt="" src={track.thumbnail} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setBgFailed(track.thumbnail!)} className="absolute inset-0 w-full h-full object-cover scale-125 blur-[80px] opacity-40 pointer-events-none" />
      )}
      <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/35 to-black/80 pointer-events-none" />
      {wide && <Visualizer active={isPlaying} className="!absolute bottom-0 inset-x-0 !h-28 text-white opacity-[0.12]" />}
      {header}
      {wide ? desktop : mobile}
    </div>
  );
}
