import { useState, useMemo, useCallback, useEffect, useRef, memo, type MouseEvent, type RefObject } from 'react';
import { Track } from '../providers/types';
import { usePlayerStore, useLibraryStore, useDownloadsStore } from '../store';
import { useNavStore } from '../store/nav';
import { useToastStore } from '../store/toast';
import { formatTime } from '../utils';
import TrackContextMenu from './TrackContextMenu';
import { Artwork, EmptyState, cn, useIsTouch, useMediaQuery, type MenuAnchor } from './ui';

interface TrackListProps {
  tracks: Track[];
  showIndex?: boolean;
  showNumbers?: boolean;
  showThumbnail?: boolean;
  showProvider?: boolean;
  showAlbum?: boolean;
  showHeader?: boolean;
  playlistId?: string;
  onReorder?: (oldIndex: number, newIndex: number) => void;
  emptyTitle?: string;
  emptyDescription?: string;
}

const PROVIDER_LABELS: Record<string, string> = { youtube: 'YT', soundcloud: 'SC', jiosaavn: 'Jio', bandcamp: 'BC', local: 'Local', podcast: 'Pod' };
const REVEAL = 'can-hover:opacity-0 can-hover:group-hover:opacity-100 focus-visible:opacity-100';
const VIRTUALIZE_AT = 200;
const EQ_CSS = '@keyframes nq-eq{0%,100%{transform:scaleY(.35)}50%{transform:scaleY(1)}}';

const Equalizer = ({ active }: { active: boolean }) => (
  <span aria-hidden className="inline-flex items-end gap-[2px] h-3.5 w-3.5">
    {[0, 0.25, 0.5].map(d => (
      <span key={d} className="w-[3px] h-full rounded-sm bg-primary origin-bottom"
        style={active ? { animation: `nq-eq 0.9s ease-in-out ${d}s infinite` } : { transform: `scaleY(${0.4 + d})` }} />
    ))}
  </span>
);

interface RowProps {
  track: Track;
  index: number;
  isCurrent: boolean;
  isPlaying: boolean;
  liked: boolean;
  dl?: number | true;
  selected: boolean;
  touch: boolean;
  showIndex: boolean;
  showThumbnail: boolean;
  showProvider: boolean;
  showAlbum: boolean;
  height?: number;
  draggable: boolean;
  dragged: boolean;
  dragOver: boolean;
  onPlay: (index: number) => void;
  onSelect: (index: number) => void;
  onMenu: (index: number, anchor: MenuAnchor) => void;
  onLike: (track: Track) => void;
  onNavigate: (page: string) => void;
  onDragStart: (index: number) => void;
  onDragOver: (index: number | null) => void;
  onDrop: (index: number) => void;
}

const stop = (fn: () => void) => (e: MouseEvent) => { e.stopPropagation(); fn(); };

const TrackRow = memo(function TrackRow({
  track, index, isCurrent, isPlaying, liked, dl, selected, touch, showIndex, showThumbnail, showProvider, showAlbum, height,
  draggable, dragged, dragOver, onPlay, onSelect, onMenu, onLike, onNavigate, onDragStart, onDragOver, onDrop,
}: RowProps) {
  const playIcon = isCurrent && isPlaying ? 'pause' : 'play_arrow';
  return (
    <div
      role="listitem"
      tabIndex={0}
      aria-label={`${track.title} by ${track.artist}`}
      aria-current={isCurrent || undefined}
      draggable={draggable}
      onDragStart={draggable ? (e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(index)); onDragStart(index); } : undefined}
      onDragOver={draggable ? (e) => { e.preventDefault(); onDragOver(index); } : undefined}
      onDragLeave={draggable ? () => onDragOver(null) : undefined}
      onDrop={draggable ? (e) => { e.preventDefault(); onDrop(index); } : undefined}
      onDragEnd={draggable ? () => onDrop(-1) : undefined}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPlay(index); }
        else if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) { e.preventDefault(); onMenu(index, e.currentTarget); }
      }}
      onContextMenu={(e) => { e.preventDefault(); onMenu(index, { x: e.clientX, y: e.clientY }); }}
      onClick={() => (touch ? onPlay(index) : onSelect(index))}
      onDoubleClick={touch ? undefined : () => onPlay(index)}
      style={height ? { height } : { contentVisibility: 'auto', containIntrinsicSize: '0 64px' }}
      className={cn(
        'group flex items-center gap-3 px-2 sm:px-3 rounded-lg cursor-pointer select-none transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-primary',
        !height && 'h-16 lg:h-14',
        selected ? 'bg-on-surface/[0.12]' : isCurrent ? 'bg-on-surface/[0.06]' : 'hover:bg-on-surface/[0.06] active:bg-on-surface/[0.1]',
        dragged && 'opacity-40', dragOver && 'ring-2 ring-primary/60',
      )}
    >
      {showIndex && (
        <div className="hidden sm:flex w-8 shrink-0 items-center justify-center text-sm tabular-nums text-on-surface-variant">
          <span className={cn(isCurrent ? 'hidden' : 'can-hover:group-hover:hidden')}>{index + 1}</span>
          {isCurrent && isPlaying && <span className="can-hover:group-hover:hidden"><Equalizer active /></span>}
          <button type="button" aria-label={isCurrent && isPlaying ? 'Pause' : `Play ${track.title}`} onClick={stop(() => onPlay(index))}
            className={cn('hidden can-hover:group-hover:inline-flex', isCurrent ? 'text-primary' : 'text-on-surface', isCurrent && !isPlaying && '!inline-flex')}>
            <span aria-hidden className="material-symbols-outlined filled text-xl">{playIcon}</span>
          </button>
        </div>
      )}

      {showThumbnail && (
        <div className="relative shrink-0">
          <Artwork src={track.thumbnail} size="sm" rounded="md" className="lg:w-10 lg:h-10" />
          {!showIndex && isCurrent && (
            <div aria-hidden className="absolute inset-0 rounded-md bg-black/50 flex items-center justify-center"><Equalizer active={isPlaying} /></div>
          )}
          {showIndex && isCurrent && (
            <div aria-hidden className="sm:hidden absolute inset-0 rounded-md bg-black/50 flex items-center justify-center"><Equalizer active={isPlaying} /></div>
          )}
        </div>
      )}

      <div className="flex-1 min-w-0">
        <p className={cn('text-[15px] lg:text-sm font-medium truncate', isCurrent ? 'text-primary' : 'text-on-surface')}>{track.title}</p>
        <p className="text-[13px] text-on-surface-variant truncate flex items-center gap-1 mt-0.5">
          {track.explicit && <span aria-label="Explicit" className="shrink-0 inline-flex items-center justify-center w-4 h-4 rounded-sm bg-on-surface-variant/30 text-on-surface text-[10px] font-bold">E</span>}
          {dl === true && <span aria-label="Downloaded" className="material-symbols-outlined filled shrink-0 text-primary text-base">arrow_circle_down</span>}
          {typeof dl === 'number' && (
            <span role="progressbar" aria-label="Downloading" aria-valuenow={Math.round(dl)} className="shrink-0 w-3.5 h-3.5 rounded-full"
              style={{ background: `conic-gradient(rgb(var(--primary)) ${dl}%, rgb(var(--on-surface) / 0.2) 0)` }} />
          )}
          {showProvider && <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide px-1 rounded bg-on-surface/[0.08] lg:hidden">{PROVIDER_LABELS[track.source] || track.source}</span>}
          {track.artistId ? (
            <button type="button" tabIndex={-1} className="truncate hover:text-on-surface hover:underline" onClick={stop(() => onNavigate(`artist:${track.artistId}`))}>{track.artist}</button>
          ) : <span className="truncate">{track.artist}</span>}
        </p>
      </div>

      {showAlbum && (
        <div className="hidden lg:block flex-1 min-w-0 text-sm text-on-surface-variant truncate">
          {track.album && track.albumId ? (
            <button type="button" tabIndex={-1} className="truncate max-w-full hover:text-on-surface hover:underline" onClick={stop(() => onNavigate(`album:${track.albumId}`))}>{track.album}</button>
          ) : track.album}
        </div>
      )}

      {showProvider && (
        <span className="hidden lg:block w-12 text-center text-[10px] font-bold tracking-wider uppercase text-on-surface-variant">{PROVIDER_LABELS[track.source] || track.source}</span>
      )}

      <button
        type="button"
        aria-label={liked ? `Remove ${track.title} from Liked Songs` : `Save ${track.title} to Liked Songs`}
        aria-pressed={liked}
        onClick={stop(() => onLike(track))}
        className={cn('w-9 h-9 shrink-0 hidden sm:inline-flex items-center justify-center rounded-full transition-[opacity,color] duration-150 active:scale-90',
          liked ? 'text-primary' : cn('text-on-surface-variant hover:text-on-surface', REVEAL))}
      >
        <span aria-hidden className={cn('material-symbols-outlined text-xl', liked && 'filled')}>favorite</span>
      </button>

      <span className="hidden sm:block w-12 text-right text-sm tabular-nums text-on-surface-variant">{track.duration ? formatTime(track.duration) : ''}</span>

      <button
        type="button"
        aria-label={`More options for ${track.title}`}
        aria-haspopup="menu"
        onClick={(e) => { e.stopPropagation(); onMenu(index, e.currentTarget); }}
        className={cn('w-9 h-9 shrink-0 inline-flex items-center justify-center rounded-full text-on-surface-variant hover:text-on-surface hover:bg-on-surface/[0.08] transition-opacity duration-150', REVEAL)}
      >
        <span aria-hidden className="material-symbols-outlined text-xl">more_vert</span>
      </button>
    </div>
  );
});

function useWindow(enabled: boolean, count: number, rowH: number, ref: RefObject<HTMLDivElement>) {
  const [range, setRange] = useState<[number, number]>([0, Math.min(count, 40)]);
  useEffect(() => {
    if (!enabled) return;
    let raf = 0;
    const calc = () => {
      raf = 0;
      const el = ref.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      const start = Math.max(0, Math.floor(-top / rowH) - 10);
      const end = Math.min(count, Math.ceil((window.innerHeight - top) / rowH) + 10);
      setRange(r => (r[0] === start && r[1] === end ? r : [start, Math.max(start, end)]));
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(calc); };
    calc();
    window.addEventListener('scroll', on, { passive: true });
    window.addEventListener('resize', on);
    return () => { window.removeEventListener('scroll', on); window.removeEventListener('resize', on); if (raf) cancelAnimationFrame(raf); };
  }, [enabled, count, rowH, ref]);
  return range;
}

export default function TrackList({
  tracks, showIndex = true, showNumbers = false, showThumbnail = true, showProvider = false, showAlbum = true, showHeader = true,
  playlistId, onReorder, emptyTitle = 'No songs here yet', emptyDescription,
}: TrackListProps) {
  const currentId = usePlayerStore(s => s.currentTrack?.id);
  const isPlaying = usePlayerStore(s => s.isPlaying);
  const likedTracks = useLibraryStore(s => s.likedTracks);
  const toggleLike = useLibraryStore(s => s.toggleLike);
  const dlIds = useDownloadsStore(s => s.ids);
  const dlProgress = useDownloadsStore(s => s.progress);
  const navigate = useNavStore(s => s.navigate);
  const touch = useIsTouch();
  const desktop = useMediaQuery('(min-width: 1024px)');
  const [menu, setMenu] = useState<{ index: number; track: Track; anchor: MenuAnchor } | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const likedIds = useMemo(() => new Set(likedTracks.map(t => t.id)), [likedTracks]);
  const virtual = tracks.length > VIRTUALIZE_AT;
  const rowH = desktop ? 56 : 64;
  const [start, end] = useWindow(virtual, tracks.length, rowH, listRef);
  const idx = showIndex || showNumbers;

  useEffect(() => { setSelected(null); }, [tracks]);

  const handlePlay = useCallback((index: number) => {
    const t = tracks[index];
    const s = usePlayerStore.getState();
    if (t && t.id === s.currentTrack?.id) s.togglePlay();
    else s.setQueue(tracks, index);
  }, [tracks]);

  const handleMenu = useCallback((index: number, anchor: MenuAnchor) => {
    const track = tracks[index];
    if (track) setMenu({ index, track, anchor });
  }, [tracks]);
  const closeMenu = useCallback(() => setMenu(null), []);

  const removable = !!playlistId && !useLibraryStore.getState().playlists.find(p => p.id === playlistId)?.rules;
  const handleRemove = useCallback((track: Track, index: number) => {
    if (!playlistId) return;
    const lib = useLibraryStore.getState();
    lib.removeFromPlaylist(playlistId, track.id);
    useToastStore.getState().addToast(`Removed "${track.title}"`, 'info', {
      action: {
        label: 'Undo',
        onClick: () => {
          const l = useLibraryStore.getState();
          if (!l.addToPlaylist(playlistId, track)) return;
          const len = l.playlists.find(p => p.id === playlistId)?.tracks.length ?? 0;
          if (index < len - 1) l.reorderPlaylistTracks(playlistId, len - 1, index);
        },
      },
    });
  }, [playlistId]);

  const handleDrop = useCallback((index: number) => {
    if (onReorder && draggedIndex !== null && index >= 0 && draggedIndex !== index) onReorder(draggedIndex, index);
    setDraggedIndex(null);
    setDragOverIndex(null);
  }, [onReorder, draggedIndex]);

  if (tracks.length === 0) return <EmptyState compact icon="music_off" title={emptyTitle} description={emptyDescription} />;

  const rows = (virtual ? tracks.slice(start, end) : tracks).map((track, i) => {
    const index = virtual ? start + i : i;
    return (
      <TrackRow
        key={`${track.id}-${index}`}
        track={track}
        index={index}
        isCurrent={currentId === track.id}
        isPlaying={isPlaying}
        liked={likedIds.has(track.id)}
        dl={dlIds.has(track.id) ? true : dlProgress[track.id]}
        selected={selected === index}
        touch={touch}
        showIndex={idx}
        showThumbnail={showThumbnail}
        showProvider={showProvider}
        showAlbum={showAlbum}
        height={virtual ? rowH : undefined}
        draggable={!!onReorder && !virtual && !touch}
        dragged={draggedIndex === index}
        dragOver={dragOverIndex === index}
        onPlay={handlePlay}
        onSelect={setSelected}
        onMenu={handleMenu}
        onLike={toggleLike}
        onNavigate={navigate}
        onDragStart={setDraggedIndex}
        onDragOver={setDragOverIndex}
        onDrop={handleDrop}
      />
    );
  });

  return (
    <>
      <style>{EQ_CSS}</style>
      {showHeader && idx && (
        <div aria-hidden className="hidden lg:flex items-center gap-3 px-3 h-9 mb-2 border-b border-on-surface/10 text-xs font-medium uppercase tracking-wider text-on-surface-variant">
          <span className="w-8 text-center">#</span>
          {showThumbnail && <span className="w-10" />}
          <span className="flex-1">Title</span>
          {showAlbum && <span className="flex-1">Album</span>}
          {showProvider && <span className="w-12 text-center">Source</span>}
          <span className="w-9" />
          <span className="w-12 text-right material-symbols-outlined text-base">schedule</span>
          <span className="w-9" />
        </div>
      )}
      <div ref={listRef} role="list" className="relative" style={virtual ? { height: tracks.length * rowH } : undefined}>
        {virtual ? <div style={{ transform: `translateY(${start * rowH}px)` }}>{rows}</div> : rows}
      </div>
      {menu && (
        <TrackContextMenu
          key={`${menu.track.id}-${menu.index}`}
          track={menu.track}
          anchor={menu.anchor}
          onClose={closeMenu}
          onRemove={removable ? () => handleRemove(menu.track, menu.index) : undefined}
        />
      )}
    </>
  );
}
