import { useState, useRef, useEffect } from 'react';
import { Track } from '../providers/types';
import { usePlayerStore, useLibraryStore } from '../store';
import { formatTime } from '../utils';

interface TrackListProps {
  tracks: Track[];
  showIndex?: boolean;
  showThumbnail?: boolean;
  showProvider?: boolean;
  playlistId?: string;
}

const PROVIDER_LABELS: Record<string, string> = {
  youtube: 'YT',
  soundcloud: 'SC',
  jiosaavn: 'Jio',
  bandcamp: 'BC',
};

export default function TrackList({
  tracks,
  showIndex = true,
  showThumbnail = true,
  showProvider = true,
  playlistId,
}: TrackListProps) {
  const { currentTrack, isPlaying, setQueue, addToQueue } = usePlayerStore();
  const { toggleLike, isLiked, playlists, addToPlaylist, removeFromPlaylist } = useLibraryStore();
  const [menuTrack, setMenuTrack] = useState<{ track: Track; x: number; y: number } | null>(null);
  const [showPlaylistPicker, setShowPlaylistPicker] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuTrack(null);
        setShowPlaylistPicker(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

const handlePlay = (index: number) => {
    setQueue(tracks, index);
  };

const openContextMenu = (e: React.MouseEvent, track: Track) => {
    e.stopPropagation();
    e.preventDefault();
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setMenuTrack({ track, x: rect.right - 200, y: rect.bottom + 4 });
    setShowPlaylistPicker(false);
  };

if (tracks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center bg-surface-container-low rounded-3xl border border-white/5">
        <span className="material-symbols-outlined text-4xl text-outline mb-4">music_off</span>
        <h3 className="font-bold text-white mb-1">No tracks found</h3>
        <p className="text-sm text-slate-400">Try searching for something else</p>
      </div>
    );
  }

return (
    <>
      <div className="space-y-1">
        {tracks.map((track, index) => {
          const isCurrent = currentTrack?.id === track.id;

return (
            <div
              key={`${track.id}-${index}`}
              className={`flex items-center gap-4 p-3 rounded-2xl transition-colors group cursor-pointer border border-transparent ${
                isCurrent ? 'bg-white/10 border-white/5' : 'hover:bg-white/5'
              }`}
              onClick={() => handlePlay(index)}
            >
              {showIndex && (
                <div className="w-6 text-center flex-shrink-0 text-xs font-bold text-slate-500 group-hover:text-white transition-colors relative">
                  <span className={`${isCurrent ? 'opacity-0' : 'group-hover:opacity-0'}`}>{index + 1}</span>
                  <span
                    className={`material-symbols-outlined absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 transition-opacity ${
                      isCurrent ? 'opacity-100 text-primary filled' : 'opacity-0 group-hover:opacity-100'
                    }`}
                  >
                    {isCurrent && isPlaying ? 'pause_circle' : 'play_arrow'}
                  </span>
                </div>
              )}

{showThumbnail && (
                <div className="relative w-12 h-12 flex-shrink-0">
                  <img
                    className="w-full h-full rounded-lg object-cover"
                    src={track.thumbnail || ''}
                    alt=""
                    loading="lazy"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                  <div
                    className={`absolute inset-0 bg-black/40 flex items-center justify-center rounded-lg transition-opacity ${
                      isCurrent ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                    }`}
                  >
                    <span className={`material-symbols-outlined text-white text-xl ${isCurrent ? 'filled text-primary' : ''}`}>
                      {isCurrent && isPlaying ? 'equalizer' : 'play_arrow'}
                    </span>
                  </div>
                </div>
              )}

<div className="flex-1 min-w-0">
                <h4
                  className={`text-sm font-bold truncate ${
                    isCurrent ? 'text-primary' : 'text-white group-hover:text-primary transition-colors'
                  }`}
                >
                  {track.title}
                </h4>
                <p className="text-xs text-slate-400 truncate">{track.artist}</p>
              </div>

{showProvider && (
                <span className="text-[10px] font-bold tracking-widest uppercase px-2 py-1 bg-surface-container-high rounded text-slate-400 hidden md:block">
                  {PROVIDER_LABELS[track.source] || track.source}
                </span>
              )}

{}
              <button
                className={`material-symbols-outlined text-xl transition-colors ${
                  isLiked(track.id) ? 'text-primary filled' : 'text-slate-500 hover:text-white opacity-0 group-hover:opacity-100'
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleLike(track);
                }}
              >
                favorite
              </button>

{}
              <span className="text-xs text-slate-500 font-mono w-12 text-right hidden sm:block">{formatTime(track.duration)}</span>

{}
              <button
                className="material-symbols-outlined text-slate-500 hover:text-white transition-colors opacity-0 group-hover:opacity-100 p-1"
                onClick={(e) => openContextMenu(e, track)}
              >
                more_vert
              </button>

{}
              {playlistId && (
                <button
                  className="material-symbols-outlined text-slate-600 hover:text-error transition-colors opacity-0 group-hover:opacity-100 text-lg"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFromPlaylist(playlistId, track.id);
                  }}
                  title="Remove from playlist"
                >
                  remove_circle_outline
                </button>
              )}
            </div>
          );
        })}
      </div>

{}
      {menuTrack && (
        <div
          ref={menuRef}
          className="fixed z-[300] bg-surface-container-high/95 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.6)] py-2 w-56 animate-[fadeIn_0.1s_ease-out]"
          style={{ left: Math.min(menuTrack.x, window.innerWidth - 240), top: Math.min(menuTrack.y, window.innerHeight - 300) }}
        >
          {}
          <div className="px-4 py-2 border-b border-white/5 mb-1">
            <p className="text-xs font-bold text-white truncate">{menuTrack.track.title}</p>
            <p className="text-[10px] text-slate-400 truncate">{menuTrack.track.artist}</p>
          </div>

<button
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 hover:bg-white/5 hover:text-white transition-colors"
            onClick={() => {
              addToQueue(menuTrack.track);
              setMenuTrack(null);
            }}
          >
            <span className="material-symbols-outlined text-lg">playlist_add</span>
            Add to Queue
          </button>

<button
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 hover:bg-white/5 hover:text-white transition-colors"
            onClick={() => {
              toggleLike(menuTrack.track);
              setMenuTrack(null);
            }}
          >
            <span className={`material-symbols-outlined text-lg ${isLiked(menuTrack.track.id) ? 'filled text-primary' : ''}`}>favorite</span>
            {isLiked(menuTrack.track.id) ? 'Remove from Liked' : 'Add to Liked'}
          </button>

{}
          <div className="relative">
            <button
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 hover:bg-white/5 hover:text-white transition-colors justify-between"
              onClick={() => setShowPlaylistPicker(!showPlaylistPicker)}
            >
              <span className="flex items-center gap-3">
                <span className="material-symbols-outlined text-lg">library_add</span>
                Add to Playlist
              </span>
              <span className="material-symbols-outlined text-sm">{showPlaylistPicker ? 'expand_less' : 'expand_more'}</span>
            </button>

{showPlaylistPicker && (
              <div className="mx-2 mb-1 bg-surface-container rounded-xl border border-white/5 max-h-48 overflow-y-auto custom-scrollbar">
                {playlists.length === 0 ? (
                  <p className="text-xs text-slate-500 p-3 text-center italic">No playlists yet</p>
                ) : (
                  playlists.map((p) => (
                    <button
                      key={p.id}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-slate-300 hover:bg-white/5 hover:text-white transition-colors"
                      onClick={() => {
                        addToPlaylist(p.id, menuTrack.track);
                        setMenuTrack(null);
                        setShowPlaylistPicker(false);
                      }}
                    >
                      <span className="material-symbols-outlined text-sm opacity-50">queue_music</span>
                      <span className="truncate">{p.name}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
