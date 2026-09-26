import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as RKeyboardEvent, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { usePlayerStore } from '../store';
import { useToastStore } from '../store/toast';
import { formatTime } from '../utils';
import type { Track } from '../providers/types';
import { Artwork, Button, IconButton, cn } from './ui';

const PAGE = 100;

function Row({ track, playing, onPlay, children, style, className }: { track: Track; playing?: boolean; onPlay?: () => void; children?: ReactNode; style?: CSSProperties; className?: string }) {
  return (
    <li data-row style={style} className={cn('group relative flex items-center gap-1 h-16 rounded-lg pr-1 can-hover:hover:bg-on-surface/[0.06] focus-within:bg-on-surface/[0.06]', className)}>
      <button type="button" onClick={onPlay} disabled={!onPlay} className="flex-1 min-w-0 flex items-center gap-3 h-full pl-2 text-left rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-primary/60">
        <Artwork src={track.thumbnail} size="sm" rounded="md" />
        <span className="min-w-0 flex-1">
          <span className={cn('block text-sm font-semibold truncate', playing ? 'text-primary' : 'text-on-surface')}>{track.title}</span>
          <span className="block text-xs text-on-surface-variant truncate mt-0.5">{track.artist}</span>
        </span>
        {track.duration > 0 && <span className="text-xs tabular-nums text-on-surface-variant pr-1 hidden sm:inline">{formatTime(track.duration)}</span>}
      </button>
      {children}
    </li>
  );
}

export default function QueuePanel({ className }: { className?: string }) {
  const { queue, queueIndex, current, isPlaying, autoplay } = usePlayerStore(useShallow((s) => ({
    queue: s.queue, queueIndex: s.queueIndex, current: s.currentTrack, isPlaying: s.isPlaying, autoplay: s.autoplayEnabled,
  })));
  const [limit, setLimit] = useState(PAGE);
  const [drag, setDrag] = useState<{ from: number; to: number; dy: number } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const dr = useRef<{ from: number; startY: number; startScroll: number; y: number; rowH: number; max: number; raf: number } | null>(null);

  const start = Math.max(0, queueIndex + 1);
  const upcomingAll = queue.slice(start);
  const upcoming = upcomingAll.slice(0, limit);
  const totalSecs = upcomingAll.reduce((a, t) => a + (t.duration || 0), 0);

  useEffect(() => () => { if (dr.current) cancelAnimationFrame(dr.current.raf); }, []);

  const update = () => {
    const d = dr.current, sc = scroller.current;
    if (!d || !sc) return;
    const dy = d.y - d.startY + (sc.scrollTop - d.startScroll);
    setDrag({ from: d.from, to: Math.min(d.max, Math.max(0, Math.round(d.from + dy / d.rowH))), dy });
  };

  const onHandleDown = (e: RPointerEvent<HTMLButtonElement>, i: number) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const sc = scroller.current, row = e.currentTarget.closest('[data-row]') as HTMLElement | null;
    if (!sc || !row) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const d = { from: i, startY: e.clientY, startScroll: sc.scrollTop, y: e.clientY, rowH: row.offsetHeight + 2, max: upcoming.length - 1, raf: 0 };
    dr.current = d;
    const tick = () => {
      if (dr.current !== d) return;
      const r = sc.getBoundingClientRect();
      const edge = d.y < r.top + 56 ? -1 : d.y > r.bottom - 56 ? 1 : 0;
      if (edge) { sc.scrollTop += edge * 8; update(); }
      d.raf = requestAnimationFrame(tick);
    };
    d.raf = requestAnimationFrame(tick);
    setDrag({ from: i, to: i, dy: 0 });
  };
  const onHandleMove = (e: RPointerEvent) => {
    if (!dr.current) return;
    dr.current.y = e.clientY;
    update();
  };
  const onHandleUp = (cancel?: boolean) => {
    const d = dr.current;
    dr.current = null;
    if (d) cancelAnimationFrame(d.raf);
    if (!cancel && drag && drag.from !== drag.to) usePlayerStore.getState().reorderQueue(start + drag.from, start + drag.to);
    setDrag(null);
  };
  const onHandleKey = (e: RKeyboardEvent, i: number) => {
    const to = e.key === 'ArrowUp' ? i - 1 : e.key === 'ArrowDown' ? i + 1 : null;
    if (to === null) return;
    e.preventDefault();
    e.stopPropagation();
    if (to < 0 || to >= upcomingAll.length) return;
    usePlayerStore.getState().reorderQueue(start + i, start + to);
    requestAnimationFrame(() => list.current?.querySelector<HTMLElement>(`[data-handle="${to}"]`)?.focus());
  };

  const shift = (i: number) => {
    if (!drag) return 0;
    const h = dr.current?.rowH ?? 66;
    if (i === drag.from) return drag.dy;
    if (drag.from < drag.to && i > drag.from && i <= drag.to) return -h;
    if (drag.from > drag.to && i >= drag.to && i < drag.from) return h;
    return 0;
  };

  const remove = (abs: number, t: Track) => {
    usePlayerStore.getState().removeFromQueue(abs);
    useToastStore.getState().addToast(`Removed "${t.title}" from queue`, 'info', {
      action: { label: 'Undo', onClick: () => usePlayerStore.setState((s) => ({ queue: [...s.queue.slice(0, abs), t, ...s.queue.slice(abs)], queueIndex: abs <= s.queueIndex ? s.queueIndex + 1 : s.queueIndex })) },
    });
  };

  const clear = () => {
    const prev = queue;
    usePlayerStore.getState().clearUpcoming();
    useToastStore.getState().addToast('Cleared upcoming songs', 'info', {
      action: { label: 'Undo', onClick: () => usePlayerStore.setState((s) => (s.queue.length === start && s.queueIndex === queueIndex ? { queue: prev } : {})) },
    });
  };

  const playAt = (abs: number) => usePlayerStore.getState().setQueue(queue, abs);

  return (
    <div ref={scroller} className={cn('overflow-y-auto overscroll-contain px-2 pb-4', className)}>
      {current && (
        <section className="pt-3">
          <h3 className="px-2 pb-1 text-xs font-bold uppercase tracking-wider text-on-surface-variant">Now playing</h3>
          <ul>
            <Row track={current} playing>
              <span aria-label={isPlaying ? 'Playing' : 'Paused'} className="material-symbols-outlined text-primary text-xl px-2 filled">{isPlaying ? 'graphic_eq' : 'pause'}</span>
            </Row>
          </ul>
        </section>
      )}

      <section className="pt-4">
        <div className="flex items-center gap-2 px-2 pb-1">
          <h3 className="flex-1 text-xs font-bold uppercase tracking-wider text-on-surface-variant">
            Next up{upcomingAll.length > 0 && <span className="normal-case tracking-normal font-medium"> · {upcomingAll.length} {upcomingAll.length === 1 ? 'song' : 'songs'}{totalSecs > 0 && ` · ${formatTime(totalSecs)}`}</span>}
          </h3>
          {upcomingAll.length > 0 && <Button size="sm" variant="ghost" onClick={clear}>Clear</Button>}
        </div>

        {upcoming.length ? (
          <ul ref={list} className="flex flex-col gap-0.5">
            {upcoming.map((t, i) => {
              const abs = start + i;
              const dragging = drag?.from === i;
              return (
                <Row
                  key={`${abs}-${t.id}`}
                  track={t}
                  onPlay={() => playAt(abs)}
                  className={cn(dragging ? 'z-10 bg-surface-container-highest shadow-elevated' : drag && 'transition-transform duration-150')}
                  style={drag ? { transform: `translateY(${shift(i)}px)` } : undefined}
                >
                  <IconButton icon="remove_circle" label={`Remove ${t.title} from queue`} size="sm" onClick={() => remove(abs, t)} className="can-hover:opacity-0 can-hover:group-hover:opacity-100 focus-visible:opacity-100 transition-opacity" />
                  <button
                    type="button"
                    data-handle={i}
                    aria-label={`Reorder ${t.title}. Use arrow up or down to move`}
                    title="Drag to reorder"
                    onPointerDown={(e) => onHandleDown(e, i)}
                    onPointerMove={onHandleMove}
                    onPointerUp={() => onHandleUp()}
                    onPointerCancel={() => onHandleUp(true)}
                    onKeyDown={(e) => onHandleKey(e, i)}
                    className={cn('w-9 h-10 shrink-0 inline-flex items-center justify-center rounded-md text-on-surface-variant hover:text-on-surface touch-none', dragging ? 'cursor-grabbing' : 'cursor-grab')}
                  >
                    <span aria-hidden className="material-symbols-outlined text-xl">drag_indicator</span>
                  </button>
                </Row>
              );
            })}
          </ul>
        ) : (
          <div className="px-2 py-8 text-center">
            <span aria-hidden className="material-symbols-outlined text-4xl text-on-surface-variant/60">queue_music</span>
            <p className="mt-2 text-sm font-semibold text-on-surface">Your queue is empty</p>
            <p className="mt-1 text-xs text-on-surface-variant">{autoplay ? 'Autoplay will keep the music going with similar songs.' : 'Add songs with “Add to queue” or “Play next”.'}</p>
          </div>
        )}
        {upcomingAll.length > limit && (
          <div className="flex justify-center pt-3">
            <Button size="sm" variant="secondary" onClick={() => setLimit((l) => l + PAGE)}>Show {Math.min(PAGE, upcomingAll.length - limit)} more</Button>
          </div>
        )}
      </section>
    </div>
  );
}
