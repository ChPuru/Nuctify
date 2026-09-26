import { useEffect, useRef, useState, type PointerEvent as RPointerEvent, type KeyboardEvent as RKeyboardEvent, type MouseEvent as RMouseEvent } from 'react';
import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { usePlayerStore, useLibraryStore, useDownloadsStore } from '../store';
import { useNavStore } from '../store/nav';
import { useToastStore } from '../store/toast';
import { EQ_PRESETS } from '../audio/engine';
import { formatTime } from '../utils';
import { useDominantColor } from '../utils/color';
import type { Track } from '../providers/types';
import { Artwork, IconButton, Menu, useMenuState, cn, isTypingTarget, type MenuItem } from './ui';
import QueuePanel from './QueuePanel';
import JamIndicator from './JamIndicator';

export type NowPlayingTab = 'lyrics' | 'queue' | null;

export const useNowPlayingView = create<{ tab: NowPlayingTab; setTab: (t: NowPlayingTab) => void }>((set) => ({
  tab: null,
  setTab: (tab) => set({ tab }),
}));

export function openNowPlaying(tab: NowPlayingTab = null) {
  useNowPlayingView.setState({ tab });
  const p = usePlayerStore.getState();
  if (!p.nowPlayingExpanded && p.currentTrack) p.toggleNowPlaying();
}

export function goTo(page: string) {
  const p = usePlayerStore.getState();
  if (p.nowPlayingExpanded) p.toggleNowPlaying();
  useNavStore.getState().navigate(page);
}

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const OVERLAY = '[aria-modal="true"], body > [role="menu"]';

type Axis = 'x' | 'y';
export function useSwipe(onMove: (axis: Axis, d: number) => void, onEnd: (axis: Axis, d: number, v: number) => void) {
  const st = useRef<{ x: number; y: number; t: number; id: number; axis: Axis | null } | null>(null);
  const moved = useRef(false);
  const end = (e: RPointerEvent, cancel?: boolean) => {
    const s = st.current;
    st.current = null;
    if (!s || !s.axis) return;
    const d = s.axis === 'x' ? e.clientX - s.x : e.clientY - s.y;
    onMove(s.axis, 0);
    if (!cancel) onEnd(s.axis, d, d / Math.max(1, performance.now() - s.t));
  };
  return {
    onPointerDown: (e: RPointerEvent) => {
      if ((e.pointerType === 'mouse' && e.button !== 0) || (e.target as HTMLElement).closest('button,a,input,[role="slider"]')) return;
      st.current = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId, axis: null };
      moved.current = false;
    },
    onPointerMove: (e: RPointerEvent) => {
      const s = st.current;
      if (!s || s.id !== e.pointerId) return;
      const dx = e.clientX - s.x, dy = e.clientY - s.y;
      if (!s.axis) {
        if (Math.hypot(dx, dy) < 10) return;
        s.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
        moved.current = true;
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      }
      onMove(s.axis, s.axis === 'x' ? dx : dy);
    },
    onPointerUp: (e: RPointerEvent) => end(e),
    onPointerCancel: (e: RPointerEvent) => end(e, true),
    onClickCapture: (e: RMouseEvent) => {
      if (!moved.current) return;
      moved.current = false;
      e.stopPropagation();
      e.preventDefault();
    },
  };
}

function useSlider(onCommit: (r: number) => void, onLive?: (r: number) => void) {
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const at = (x: number) => {
    const r = ref.current?.getBoundingClientRect();
    return r && r.width ? clamp((x - r.left) / r.width) : 0;
  };
  const handlers = {
    onPointerDown: (e: RPointerEvent<HTMLDivElement>) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      const r = at(e.clientX);
      setDrag(r);
      onLive?.(r);
    },
    onPointerMove: (e: RPointerEvent<HTMLDivElement>) => {
      const r = at(e.clientX);
      if (drag !== null) { setDrag(r); onLive?.(r); }
      else if (e.pointerType === 'mouse') setHover(r);
    },
    onPointerUp: (e: RPointerEvent<HTMLDivElement>) => {
      if (drag === null) return;
      onCommit(at(e.clientX));
      setDrag(null);
    },
    onPointerCancel: () => setDrag(null),
    onPointerLeave: () => setHover(null),
  };
  return { ref, drag, hover, handlers };
}

export function SeekBar({ overlay, stacked, className }: { overlay?: boolean; stacked?: boolean; className?: string }) {
  const currentTime = usePlayerStore((s) => s.currentTime);
  const duration = usePlayerStore((s) => s.duration);
  const seekTo = usePlayerStore((s) => s.seekTo);
  const { ref, drag, hover, handlers } = useSlider((r) => duration && seekTo(r * duration));
  const pct = drag ?? (duration ? clamp(currentTime / duration) : 0);
  const shown = drag !== null ? drag * duration : currentTime;
  const onKey = (e: RKeyboardEvent) => {
    if (!duration) return;
    const step = { ArrowLeft: -5, ArrowRight: 5, ArrowDown: -5, ArrowUp: 5, PageDown: -duration / 10, PageUp: duration / 10 }[e.key];
    const to = e.key === 'Home' ? 0 : e.key === 'End' ? duration - 1 : step !== undefined ? currentTime + step : null;
    if (to === null) return;
    e.preventDefault();
    e.stopPropagation();
    seekTo(clamp(to, 0, duration));
  };
  const time = (v: number, align: string) => (
    <span className={cn('text-[11px] font-medium tabular-nums shrink-0', overlay ? 'text-white/70' : 'text-on-surface-variant', align)}>{formatTime(v)}</span>
  );
  const bar = (
    <div
      ref={ref}
      role="slider"
      tabIndex={duration ? 0 : -1}
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(shown)}
      aria-valuetext={`${formatTime(shown)} of ${formatTime(duration)}`}
      onKeyDown={onKey}
      {...handlers}
      className={cn('group relative flex-1 h-5 flex items-center touch-none outline-none', duration ? 'cursor-pointer' : 'cursor-default')}
    >
      <div className={cn('relative w-full h-1 rounded-full overflow-hidden transition-[height] duration-150 group-hover:h-1.5 group-focus-visible:h-1.5', drag !== null && '!h-1.5', overlay ? 'bg-white/25' : 'bg-on-surface/15')}>
        <div
          className={cn('absolute inset-y-0 left-0 w-full origin-left rounded-full', overlay ? 'bg-white' : 'bg-on-surface can-hover:group-hover:bg-primary', drag !== null && !overlay && '!bg-primary')}
          style={{ transform: `scaleX(${pct})` }}
        />
      </div>
      <div
        aria-hidden
        className={cn('absolute top-1/2 w-3 h-3 -ml-1.5 -mt-1.5 rounded-full bg-white shadow-card transition-opacity duration-150', drag !== null || overlay ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100')}
        style={{ left: `${pct * 100}%` }}
      />
      {hover !== null && drag === null && duration > 0 && (
        <div aria-hidden className="absolute bottom-full mb-1.5 -translate-x-1/2 px-1.5 py-0.5 rounded-md bg-surface-container-highest text-on-surface text-[11px] font-semibold tabular-nums shadow-card pointer-events-none" style={{ left: `${hover * 100}%` }}>
          {formatTime(hover * duration)}
        </div>
      )}
    </div>
  );
  if (stacked) {
    return (
      <div className={className}>
        {bar}
        <div className="flex justify-between -mt-0.5">{time(shown, '')}<span className={cn('text-[11px] font-medium tabular-nums', overlay ? 'text-white/70' : 'text-on-surface-variant')}>-{formatTime(duration ? duration - shown : 0)}</span></div>
      </div>
    );
  }
  return <div className={cn('flex items-center gap-2 w-full', className)}>{time(shown, 'w-10 text-right')}{bar}{time(duration, 'w-10')}</div>;
}

export function VolumeControl({ overlay, className }: { overlay?: boolean; className?: string }) {
  const volume = usePlayerStore((s) => s.volume);
  const isMuted = usePlayerStore((s) => s.isMuted);
  const setVolume = usePlayerStore((s) => s.setVolume);
  const toggleMute = usePlayerStore((s) => s.toggleMute);
  const { ref, drag, handlers } = useSlider(setVolume, setVolume);
  const wrap = useRef<HTMLDivElement>(null);
  const v = drag ?? (isMuted ? 0 : volume);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const s = usePlayerStore.getState();
      s.setVolume(clamp(Math.round(((s.isMuted ? 0 : s.volume) - Math.sign(e.deltaY) * 0.05) * 100) / 100));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);
  const onKey = (e: RKeyboardEvent) => {
    const step = { ArrowLeft: -0.05, ArrowDown: -0.05, ArrowRight: 0.05, ArrowUp: 0.05 }[e.key];
    if (step === undefined && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    e.stopPropagation();
    setVolume(e.key === 'Home' ? 0 : e.key === 'End' ? 1 : clamp(Math.round((v + step!) * 100) / 100));
  };
  const icon = v === 0 ? 'volume_off' : v < 0.5 ? 'volume_down' : 'volume_up';
  return (
    <div ref={wrap} className={cn('flex items-center gap-1 min-w-0', className)}>
      <IconButton icon={icon} label={isMuted ? 'Unmute' : 'Mute'} size="sm" onClick={toggleMute} className={overlay ? '!text-white/80 hover:!text-white hover:!bg-white/10' : ''} />
      <div
        ref={ref}
        role="slider"
        tabIndex={0}
        aria-label="Volume"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(v * 100)}
        onKeyDown={onKey}
        {...handlers}
        className="group relative flex-1 h-5 flex items-center cursor-pointer touch-none outline-none"
      >
        <div className={cn('relative w-full h-1 rounded-full overflow-hidden', overlay ? 'bg-white/25' : 'bg-on-surface/15')}>
          <div className={cn('absolute inset-y-0 left-0 w-full origin-left', overlay ? 'bg-white' : 'bg-on-surface can-hover:group-hover:bg-primary')} style={{ transform: `scaleX(${v})` }} />
        </div>
        <div aria-hidden className={cn('absolute top-1/2 w-3 h-3 -ml-1.5 -mt-1.5 rounded-full bg-white shadow-card transition-opacity', drag !== null ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100')} style={{ left: `${v * 100}%` }} />
      </div>
    </div>
  );
}

export function PlayButton({ size = 'md', tone = 'light', className }: { size?: 'md' | 'lg' | 'xl'; tone?: 'light' | 'bare'; className?: string }) {
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const busy = usePlayerStore((s) => s.isLoading || s.isBuffering);
  const has = usePlayerStore((s) => !!s.currentTrack);
  const togglePlay = usePlayerStore((s) => s.togglePlay);
  const dims = { md: 'w-10 h-10 text-[26px]', lg: 'w-16 h-16 text-[40px]', xl: 'w-[4.5rem] h-[4.5rem] text-[44px]' }[size];
  return (
    <button
      type="button"
      data-noswipe
      onClick={togglePlay}
      disabled={!has}
      aria-label={isPlaying ? 'Pause' : 'Play'}
      title={isPlaying ? 'Pause' : 'Play'}
      className={cn(
        'relative inline-flex items-center justify-center shrink-0 rounded-full transition-transform duration-150 active:scale-90 disabled:opacity-40',
        tone === 'light' ? 'bg-white text-black can-hover:hover:scale-105 shadow-card' : 'text-current',
        dims, className,
      )}
    >
      <span aria-hidden className="material-symbols-outlined filled" style={{ fontSize: 'inherit' }}>{isPlaying ? 'pause' : 'play_arrow'}</span>
      {busy && <span aria-hidden className={cn('absolute rounded-full border-2 border-transparent animate-spin', tone === 'light' ? '-inset-1 border-t-white/90' : 'inset-0 border-t-current')} />}
    </button>
  );
}

export function useLiked(track: Track | null) {
  const id = track?.id;
  return useLibraryStore((s) => !!id && s.likedTracks.some((t) => t.id === id));
}

export function TrackMeta({ track, overlay, large, className }: { track: Track; overlay?: boolean; large?: boolean; className?: string }) {
  const link = 'text-left truncate max-w-full hover:underline underline-offset-2 decoration-1';
  return (
    <div className={cn('min-w-0 flex flex-col', className)}>
      {track.albumId ? (
        <button type="button" onClick={() => goTo(`album:${track.albumId}`)} className={cn(link, 'font-bold', large ? 'text-2xl sm:text-[1.625rem] leading-tight' : 'text-sm', overlay ? 'text-white' : 'text-on-surface')}>{track.title}</button>
      ) : (
        <span className={cn('truncate font-bold', large ? 'text-2xl sm:text-[1.625rem] leading-tight' : 'text-sm', overlay ? 'text-white' : 'text-on-surface')}>{track.title}</span>
      )}
      {track.artistId ? (
        <button type="button" onClick={() => goTo(`artist:${track.artistId}`)} className={cn(link, large ? 'text-lg mt-0.5' : 'text-xs', overlay ? 'text-white/70' : 'text-on-surface-variant')}>{track.artist}</button>
      ) : (
        <span className={cn('truncate', large ? 'text-lg mt-0.5' : 'text-xs', overlay ? 'text-white/70' : 'text-on-surface-variant')}>{track.artist}</span>
      )}
    </div>
  );
}

const EQ_LABELS: Record<string, string> = { flat: 'Off (Flat)', bassBoost: 'Bass boost', electronic: 'Electronic', acoustic: 'Acoustic', vocalBooster: 'Vocal boost' };
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const SLEEP = [5, 15, 30, 45, 60, 90];

export function usePlaybackMenu(track: Track | null) {
  const [mode, setMode] = useState<'main' | 'sleep' | 'speed' | 'eq' | 'playlist'>('main');
  const { eqPreset, playbackSpeed, sleeping } = usePlayerStore(useShallow((s) => ({ eqPreset: s.eqPreset, playbackSpeed: s.playbackSpeed, sleeping: s.sleepTimerRemaining !== null })));
  const playlists = useLibraryStore((s) => s.playlists);
  const id = track?.id ?? '';
  const downloaded = useDownloadsStore((s) => s.ids.has(id));
  const dl = useDownloadsStore((s) => s.progress[id]);
  const reset = () => setMode('main');
  if (!track) return { items: [] as MenuItem[], reset };
  const p = usePlayerStore.getState();
  const toast = useToastStore.getState().addToast;
  const back: MenuItem = { label: 'Back', icon: 'arrow_back', keepOpen: true, onSelect: reset };
  let items: MenuItem[];
  if (mode === 'sleep') {
    items = [back, { divider: true },
      ...SLEEP.map((m) => ({ label: m < 60 ? `${m} minutes` : m === 60 ? '1 hour' : '1½ hours', icon: 'bedtime', onSelect: () => { p.startSleepTimer(m); toast(`Sleep timer set for ${m} min`); } })),
      { label: 'End of track', icon: 'music_note', onSelect: () => { const s = usePlayerStore.getState(); const left = Math.max(0.1, (s.duration - s.currentTime) / 60 / (s.playbackSpeed || 1)); p.startSleepTimer(left); toast('Music will stop after this track'); } },
      ...(sleeping ? [{ divider: true }, { label: 'Turn off timer', icon: 'timer_off', danger: true, onSelect: () => { p.stopSleepTimer(); toast('Sleep timer off'); } }] : []),
    ];
  } else if (mode === 'speed') {
    items = [back, { divider: true }, ...SPEEDS.map((sp) => ({ label: sp === 1 ? 'Normal' : `${sp}×`, checked: playbackSpeed === sp, onSelect: () => p.setPlaybackSpeed(sp) }))];
  } else if (mode === 'eq') {
    items = [back, { divider: true }, ...Object.keys(EQ_PRESETS).map((k) => ({ label: EQ_LABELS[k] ?? k, checked: eqPreset === k, onSelect: () => p.setEQPreset(k) }))];
  } else if (mode === 'playlist') {
    const own = playlists.filter((pl) => !pl.rules);
    items = [back, { divider: true },
      { label: 'New playlist', icon: 'add', onSelect: () => useLibraryStore.getState().createPlaylist(track.title, [track]) },
      ...own.map((pl) => ({ label: pl.name, icon: 'queue_music', onSelect: () => toast(useLibraryStore.getState().addToPlaylist(pl.id, track) ? `Added to "${pl.name}"` : `Already in "${pl.name}"`, 'success') })),
    ];
  } else {
    items = [
      ...(track.artistId ? [{ label: 'Go to artist', icon: 'person', onSelect: () => goTo(`artist:${track.artistId}`) }] : []),
      ...(track.albumId ? [{ label: 'Go to album', icon: 'album', onSelect: () => goTo(`album:${track.albumId}`) }] : []),
      { label: 'Start radio', icon: 'radio', onSelect: () => p.startRadio(track) },
      { label: 'Add to playlist', icon: 'playlist_add', keepOpen: true, hint: '›', onSelect: () => setMode('playlist') },
      downloaded
        ? { label: 'Remove download', icon: 'download_done', onSelect: () => useDownloadsStore.getState().remove(track.id).then(() => toast('Download removed')) }
        : { label: dl !== undefined ? `Downloading… ${Math.round(dl)}%` : 'Download', icon: 'download', disabled: dl !== undefined, onSelect: () => useDownloadsStore.getState().download(track) },
      { divider: true },
      { label: 'Sleep timer', icon: 'bedtime', keepOpen: true, hint: sleeping ? 'On' : '›', onSelect: () => setMode('sleep') },
      { label: 'Playback speed', icon: 'speed', keepOpen: true, hint: playbackSpeed === 1 ? '›' : `${playbackSpeed}×`, onSelect: () => setMode('speed') },
      { label: 'Equalizer', icon: 'equalizer', keepOpen: true, hint: eqPreset === 'flat' ? '›' : EQ_LABELS[eqPreset] ?? eqPreset, onSelect: () => setMode('eq') },
    ];
  }
  return { items, reset };
}

export function PlaybackMenuButton({ track, overlay, size = 'sm', icon = 'more_horiz' }: { track: Track; overlay?: boolean; size?: 'sm' | 'md'; icon?: string }) {
  const menu = useMenuState();
  const { items, reset } = usePlaybackMenu(track);
  const close = () => { menu.onClose(); reset(); };
  return (
    <>
      <IconButton icon={icon} label="More options" size={size} onClick={menu.openFrom} className={overlay ? '!text-white/80 hover:!text-white hover:!bg-white/10' : ''} />
      <Menu
        open={menu.open}
        onClose={close}
        anchor={menu.anchor}
        align="end"
        width={260}
        ariaLabel="Playback options"
        items={items}
        header={
          <div className="flex items-center gap-3">
            <Artwork src={track.thumbnail} size="xs" rounded="md" />
            <div className="min-w-0">
              <p className="text-sm font-bold truncate text-on-surface">{track.title}</p>
              <p className="text-xs truncate text-on-surface-variant">{track.artist}</p>
            </div>
          </div>
        }
      />
    </>
  );
}

function LikeButton({ track, overlay, size = 'sm' }: { track: Track; overlay?: boolean; size?: 'sm' | 'md' }) {
  const liked = useLiked(track);
  return (
    <IconButton
      data-noswipe
      icon="favorite"
      label={liked ? 'Remove from Liked Songs' : 'Save to Liked Songs'}
      size={size}
      active={liked}
      filled={liked}
      onClick={(e) => { e.stopPropagation(); useLibraryStore.getState().toggleLike(track); }}
      className={cn(overlay && !liked && '!text-white/80 hover:!text-white hover:!bg-white/10', liked && '!text-primary')}
    />
  );
}
export { LikeButton };

function MiniProgress() {
  const pct = usePlayerStore((s) => (s.duration ? clamp(s.currentTime / s.duration) : 0));
  return (
    <div aria-hidden className="absolute bottom-0 inset-x-2 h-0.5 rounded-full bg-white/20 overflow-hidden">
      <div className="h-full w-full origin-left bg-white transition-transform duration-300 ease-linear" style={{ transform: `scaleX(${pct})` }} />
    </div>
  );
}

function MobileMiniPlayer({ track }: { track: Track }) {
  const color = useDominantColor(track.thumbnail);
  const body = useRef<HTMLDivElement>(null);
  const swipe = useSwipe(
    (axis, d) => {
      const el = body.current;
      if (!el) return;
      el.style.transition = d ? 'none' : '';
      el.style.transform = axis === 'x' && d ? `translateX(${d}px)` : axis === 'y' && d < 0 ? `translateY(${Math.max(d, -24) / 2}px)` : '';
      el.style.opacity = axis === 'x' && d ? String(1 - Math.min(0.6, Math.abs(d) / 300)) : '';
    },
    (axis, d, v) => {
      const s = usePlayerStore.getState();
      if (axis === 'x' && (Math.abs(d) > 72 || Math.abs(v) > 0.6)) (d < 0 ? s.nextTrack : s.prevTrack)();
      else if (axis === 'y' && (d < -32 || v < -0.4)) openNowPlaying();
    },
  );
  return (
    <div className="fixed inset-x-2 z-40 lg:hidden bottom-[calc(var(--mobile-nav-h)+0.375rem+env(safe-area-inset-bottom))] animate-sheet-up">
      <div
        {...swipe}
        className={cn('relative h-[var(--mini-player-h)] rounded-xl shadow-elevated overflow-hidden touch-none select-none transition-colors duration-500', color ? 'text-white' : 'bg-surface-container-highest text-on-surface')}
        style={color ? { backgroundColor: color } : undefined}
      >
        <div className="absolute inset-0 bg-black/15 pointer-events-none" />
        <div className="relative h-full flex items-center gap-1 pl-2 pr-1">
          <div
            ref={body}
            role="button"
            tabIndex={0}
            aria-label={`Now playing: ${track.title} by ${track.artist}. Open player`}
            onClick={() => openNowPlaying()}
            onKeyDown={(e) => { if (e.key === 'Enter') openNowPlaying(); }}
            className="flex-1 min-w-0 flex items-center gap-3 h-full transition-[transform,opacity] duration-200 outline-none"
          >
            <Artwork key={track.id} src={track.thumbnail} size="sm" rounded="md" className="!w-11 !h-11 shadow-card" />
            <div key={`t-${track.id}`} className="min-w-0 flex-1 animate-fade-in">
              <p className="text-sm font-bold truncate leading-tight">{track.title}</p>
              <p className={cn('text-xs truncate mt-0.5', color ? 'text-white/70' : 'text-on-surface-variant')}>{track.artist}</p>
            </div>
          </div>
          <LikeButton track={track} overlay={!!color} size="md" />
          <PlayButton size="md" tone="bare" className="!w-11 !h-11 !text-[32px]" />
        </div>
        <MiniProgress />
      </div>
    </div>
  );
}

function DesktopBar({ track }: { track: Track | null }) {
  const { shuffle, repeat, toggleShuffle, toggleRepeat, nextTrack, prevTrack } = usePlayerStore(useShallow((s) => ({
    shuffle: s.shuffle, repeat: s.repeat, toggleShuffle: s.toggleShuffle, toggleRepeat: s.toggleRepeat, nextTrack: s.nextTrack, prevTrack: s.prevTrack,
  })));
  const hasLyrics = usePlayerStore((s) => !!(s.lyrics?.synced?.length || s.lyrics?.plain));
  const [queueOpen, setQueueOpen] = useState(false);

  useEffect(() => {
    if (!queueOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector(OVERLAY)) setQueueOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [queueOpen]);

  return (
    <>
      {queueOpen && (
        <aside aria-label="Queue" className="hidden lg:flex flex-col fixed z-[35] right-3 top-[calc(var(--topnav-h)+0.5rem)] bottom-[calc(var(--player-h)+0.75rem)] w-[22rem] rounded-2xl bg-surface-container border border-on-surface/[0.06] shadow-elevated animate-scale-in origin-bottom-right overflow-hidden">
          <div className="flex items-center justify-between pl-5 pr-2 h-14 shrink-0 border-b border-on-surface/[0.06]">
            <h2 className="text-base font-bold">Queue</h2>
            <IconButton icon="close" label="Close queue" size="sm" onClick={() => setQueueOpen(false)} />
          </div>
          <QueuePanel className="flex-1 min-h-0" />
        </aside>
      )}
      <footer aria-label="Player" className="hidden lg:grid fixed bottom-0 right-0 left-[var(--sidebar-w)] z-40 h-[var(--player-h)] grid-cols-[minmax(0,1fr)_minmax(0,42rem)_minmax(0,1fr)] items-center gap-6 px-4 glass-bar border-t border-on-surface/[0.06]">
        <div className="flex items-center gap-3 min-w-0">
          {track ? (
            <>
              <button type="button" onClick={() => openNowPlaying()} aria-label="Open Now Playing" className="group relative shrink-0 rounded-lg">
                <Artwork key={track.id} src={track.thumbnail} size="md" rounded="lg" shadow className="animate-fade-in" />
                <span aria-hidden className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity">
                  <span className="material-symbols-outlined text-base">keyboard_arrow_up</span>
                </span>
              </button>
              <TrackMeta key={track.id} track={track} className="animate-fade-in" />
              <LikeButton track={track} />
            </>
          ) : (
            <div className="flex items-center gap-3 text-on-surface-variant">
              <Artwork size="md" rounded="lg" />
              <p className="text-sm">Pick something to play</p>
            </div>
          )}
        </div>

        <div className="flex flex-col items-center gap-1 min-w-0">
          <div className="flex items-center gap-2">
            <IconButton icon="shuffle" label={shuffle ? 'Disable shuffle' : 'Enable shuffle'} size="sm" active={shuffle} filled={false} onClick={toggleShuffle} aria-pressed={shuffle} />
            <IconButton icon="skip_previous" label="Previous" size="md" filled onClick={prevTrack} disabled={!track} className="!text-on-surface" />
            <PlayButton size="md" className="mx-1" />
            <IconButton icon="skip_next" label="Next" size="md" filled onClick={() => nextTrack()} disabled={!track} className="!text-on-surface" />
            <IconButton icon={repeat === 'one' ? 'repeat_one' : 'repeat'} label={`Repeat: ${repeat}`} size="sm" active={repeat !== 'off'} filled={false} onClick={toggleRepeat} aria-pressed={repeat !== 'off'} />
          </div>
          <SeekBar />
        </div>

        <div className="flex items-center justify-end gap-0.5 min-w-0">
          <JamIndicator />
          <IconButton icon="lyrics" label="Lyrics" size="sm" disabled={!track} onClick={() => openNowPlaying('lyrics')} className={cn(hasLyrics && '!text-on-surface')} />
          <IconButton icon="queue_music" label={queueOpen ? 'Hide queue' : 'Show queue'} size="sm" active={queueOpen} filled={false} aria-pressed={queueOpen} onClick={() => setQueueOpen((o) => !o)} />
          {track && <PlaybackMenuButton track={track} />}
          <VolumeControl className="w-36 ml-1" />
          <IconButton icon="open_in_full" label="Now Playing view" size="sm" disabled={!track} onClick={() => openNowPlaying()} />
        </div>
      </footer>
    </>
  );
}

export default function PlayerBar() {
  const track = usePlayerStore((s) => s.currentTrack);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.shiftKey || isTypingTarget(document.activeElement) || document.querySelector(OVERLAY)) return;
      const s = usePlayerStore.getState();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        s.setVolume(clamp(Math.round(((s.isMuted ? 0 : s.volume) + (e.key === 'ArrowUp' ? 0.05 : -0.05)) * 100) / 100));
        return;
      }
      const a = document.activeElement;
      if (mod || !s.currentTrack || (a && a !== document.body && a.id !== 'main-content')) return;
      if (e.key === 'ArrowRight') s.seekTo(Math.min(s.currentTime + 5, s.duration || 0));
      else if (e.key === 'ArrowLeft') s.seekTo(Math.max(s.currentTime - 5, 0));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <DesktopBar track={track} />
      {track && <MobileMiniPlayer track={track} />}
    </>
  );
}
