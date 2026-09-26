import { useEffect, useRef, useState } from 'react';
import { usePlayerStore } from '../store';
import { audioEngine } from '../audio/engine';
import { fetchLyrics } from '../lyrics/lrclib';
import type { Lyrics } from '../providers/types';
import { cn, useMediaQuery } from './ui';

export default function LyricsView({ className, large }: { className?: string; large?: boolean }) {
  const track = usePlayerStore((s) => s.currentTrack);
  const storeLyrics = usePlayerStore((s) => s.lyrics);
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [res, setRes] = useState<{ id?: string; lyrics: Lyrics | null; loading: boolean }>({ lyrics: null, loading: true });
  const [active, setActive] = useState(-1);
  const [offset, setOffset] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const userUntil = useRef(0);

  useEffect(() => {
    setOffset(0);
    setActive(-1);
    if (!track) return;
    if (track.source === 'podcast') { setRes({ id: track.id, lyrics: null, loading: false }); return; }
    let alive = true;
    setRes({ id: track.id, lyrics: null, loading: true });
    fetchLyrics(track.title, track.artist, track.duration, track.album, track.source)
      .then((l) => alive && setRes({ id: track.id, lyrics: l, loading: false }))
      .catch(() => alive && setRes({ id: track.id, lyrics: null, loading: false }));
    return () => { alive = false; };
  }, [track?.id]);

  const lyrics = (res.id === track?.id ? res.lyrics : null) ?? storeLyrics;
  const lines = lyrics?.synced?.length ? lyrics.synced : null;
  const loading = !lyrics && res.loading;

  useEffect(() => {
    if (!lines) return;
    let raf = 0, last = -2;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (document.hidden) return;
      const t = (audioEngine.getActiveAudio()?.currentTime ?? 0) + offset;
      let lo = 0, hi = lines.length - 1, ans = -1;
      while (lo <= hi) {
        const m = (lo + hi) >> 1;
        if (lines[m].time <= t) { ans = m; lo = m + 1; } else hi = m - 1;
      }
      if (ans !== last) { last = ans; setActive(ans); }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [lines, offset]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const mark = () => { userUntil.current = Date.now() + 3500; };
    el.addEventListener('wheel', mark, { passive: true });
    el.addEventListener('touchmove', mark, { passive: true });
    return () => { el.removeEventListener('wheel', mark); el.removeEventListener('touchmove', mark); };
  }, []);

  useEffect(() => {
    const el = box.current;
    if (!el || !lines || Date.now() < userUntil.current) return;
    const line = el.querySelector<HTMLElement>(`[data-line="${Math.max(0, active)}"]`);
    if (line) el.scrollTo({ top: line.offsetTop - el.clientHeight * 0.3, behavior: reduced ? 'auto' : 'smooth' });
  }, [active, lines, reduced]);

  const seek = (time: number) => {
    userUntil.current = 0;
    usePlayerStore.getState().seekTo(Math.max(0, time - offset + 0.05));
  };
  const nudge = (d: number) => setOffset((o) => Math.round((o + d) * 100) / 100);

  const text = large ? 'text-[1.75rem] sm:text-4xl lg:text-5xl' : 'text-2xl sm:text-[1.75rem]';

  return (
    <div className={cn('relative flex flex-col min-h-0', className)}>
      <div ref={box} className={cn('relative flex-1 min-h-0 overflow-y-auto overscroll-contain no-scrollbar px-1', lines && 'lyrics-gradient')}>
        {loading ? (
          <div aria-label="Loading lyrics" className="pt-6 space-y-5">
            {[80, 62, 90, 48, 72, 56].map((w, i) => <div key={i} className="skeleton h-7 rounded-lg" style={{ width: `${w}%` }} />)}
          </div>
        ) : lines ? (
          <div className="pt-[12vh] pb-[45vh]">
            {lines.map((l, i) => (
              <button
                key={i}
                type="button"
                data-line={i}
                onClick={() => seek(l.time)}
                aria-current={i === active ? 'true' : undefined}
                className={cn(
                  'block w-full text-left py-2.5 font-headline font-extrabold tracking-tight leading-[1.15] origin-left rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-white/50',
                  'transition-[color,transform,opacity] duration-300 ease-out',
                  text,
                  i === active ? 'text-white scale-100' : cn('scale-[0.97] can-hover:hover:text-white/80', i < active ? 'text-white/35' : 'text-white/45'),
                )}
              >
                {l.text || <span aria-label="Instrumental">• • •</span>}
              </button>
            ))}
          </div>
        ) : lyrics?.plain ? (
          <p className={cn('py-6 whitespace-pre-wrap font-headline font-bold leading-snug text-white/85 select-text', large ? 'text-2xl lg:text-3xl' : 'text-xl sm:text-2xl')}>{lyrics.plain}</p>
        ) : (
          <div className="h-full min-h-[12rem] flex flex-col items-center justify-center text-center px-6">
            <span aria-hidden className="material-symbols-outlined text-5xl text-white/40">lyrics</span>
            <p className="mt-3 text-lg font-bold text-white">No lyrics for this song</p>
            <p className="mt-1 text-sm text-white/60">{track?.source === 'podcast' ? 'Lyrics aren’t available for podcasts.' : 'We couldn’t find lyrics for this track yet.'}</p>
          </div>
        )}
      </div>
      {lyrics && !loading && (
        <div className="flex items-center justify-between gap-2 pt-2 text-xs text-white/55">
          <span className="truncate">{lines ? '' : 'Not synced · '}Lyrics from {lyrics.source || 'LRCLIB'}</span>
          {lines && (
            <div role="group" aria-label="Lyrics timing" className="flex items-center gap-0.5 rounded-full bg-white/10 px-1 h-8 shrink-0">
              <button type="button" aria-label="Delay lyrics" onClick={() => nudge(-0.25)} className="w-7 h-7 rounded-full hover:bg-white/10 inline-flex items-center justify-center"><span aria-hidden className="material-symbols-outlined text-base">remove</span></button>
              <button type="button" aria-label="Reset lyrics timing" title="Reset timing" onClick={() => setOffset(0)} className="px-1.5 tabular-nums font-semibold text-white/80 min-w-[3.25rem]">{offset > 0 ? '+' : ''}{offset.toFixed(2).replace(/0$/, '')}s</button>
              <button type="button" aria-label="Advance lyrics" onClick={() => nudge(0.25)} className="w-7 h-7 rounded-full hover:bg-white/10 inline-flex items-center justify-center"><span aria-hidden className="material-symbols-outlined text-base">add</span></button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
