import { useRef, useCallback, useEffect, useState } from 'react';
import { usePlayerStore, useLibraryStore } from '../store';
import { useNavStore } from '../store/nav';
import { formatTime } from '../utils';
import { isDownloaded, downloadTrack, removeTrack } from '../audio/offline';

export default function PlayerBar() {
  const {
    currentTrack, isPlaying, currentTime, duration, volume, isMuted,
    shuffle, repeat, isLoading, isBuffering,
    togglePlay, seekTo, setVolume, toggleMute, nextTrack, prevTrack,
    toggleShuffle, toggleRepeat, toggleNowPlaying,
  } = usePlayerStore();
  const { toggleLike, isLiked, addToRecentlyPlayed } = useLibraryStore();

const progressRef = useRef<HTMLDivElement>(null);
  const volumeRef = useRef<HTMLDivElement>(null);

const [downloaded, setDownloaded] = useState(false);
  const [dlProgress, setDlProgress] = useState<number | null>(null);

useEffect(() => {
    if (currentTrack) {
      addToRecentlyPlayed(currentTrack);
      isDownloaded(currentTrack.id).then(setDownloaded);
    } else {
      setDownloaded(false);
    }
  }, [currentTrack?.id, addToRecentlyPlayed]);

const toggleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentTrack) return;
    try {
      if (downloaded) {
        await removeTrack(currentTrack.id);
        setDownloaded(false);
      } else {
        setDlProgress(0);
        await downloadTrack(currentTrack, setDlProgress);
        setDownloaded(true);
      }
    } catch (err: any) {
      alert(`Download failed: ${err.message}`);
    } finally {
      setDlProgress(null);
    }
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;

      const state = usePlayerStore.getState();
      const { currentTrack, isPlaying, currentTime, duration, volume } = state;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          state.togglePlay();
          break;
        case 'ArrowRight':
          if (e.shiftKey) state.nextTrack();
          else state.seekTo(Math.min(currentTime + 5, duration));
          break;
        case 'ArrowLeft':
          if (e.shiftKey) state.prevTrack();
          else state.seekTo(Math.max(currentTime - 5, 0));
          break;
        case 'ArrowUp':
          e.preventDefault();
          state.setVolume(Math.min(volume + 0.05, 1));
          break;
        case 'ArrowDown':
          e.preventDefault();
          state.setVolume(Math.max(volume - 0.05, 0));
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []); // Only register once

const handleProgressClick = useCallback((e: React.MouseEvent) => {
    if (!progressRef.current || !duration) return;
    const rect = progressRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    seekTo(ratio * duration);
  }, [duration, seekTo]);

const handleVolumeClick = useCallback((e: React.MouseEvent) => {
    if (!volumeRef.current) return;
    const rect = volumeRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setVolume(ratio);
  }, [setVolume]);

const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const volumePercent = isMuted ? 0 : volume * 100;

return (
    <>
      {}
      <footer className="fixed bottom-0 left-0 lg:left-64 right-0 h-24 glass-card border-t border-white/5 z-40 px-8 hidden lg:flex items-center justify-between shadow-[0_-10px_40px_rgba(0,0,0,0.5)] bg-surface-container-low/80">

<div className="flex items-center gap-4 w-1/3 min-w-0">
          {currentTrack ? (
            <>
              {currentTrack.thumbnail && (
                <img onClick={toggleNowPlaying} alt="cover" className="w-14 h-14 rounded-xl object-cover cursor-pointer hover:opacity-80 transition-opacity flex-shrink-0" src={currentTrack.thumbnail}/>
              )}
              <div className="overflow-hidden cursor-pointer" onClick={toggleNowPlaying}>
                <h4 className="text-sm font-bold text-white truncate hover:underline">{currentTrack.title}</h4>
                <p className="text-xs text-slate-400 truncate hover:underline">{currentTrack.artist}</p>
              </div>
              <button 
                onClick={(e) => { e.stopPropagation(); toggleLike(currentTrack); }}
                className={`material-symbols-outlined ml-2 cursor-pointer transition-colors ${isLiked(currentTrack.id) ? 'text-primary filled' : 'text-slate-500 hover:text-white'}`}
              >
                favorite
              </button>
            </>
          ) : (
             <div className="flex flex-col">
               <h4 className="text-sm font-bold text-slate-500">Nothing playing</h4>
               <p className="text-xs text-slate-600">Select a track</p>
             </div>
          )}
        </div>

<div className="flex flex-col items-center gap-2 w-1/3 max-w-[500px]">
          <div className="flex items-center gap-8">
            <button onClick={toggleShuffle} className={`material-symbols-outlined transition-colors cursor-pointer ${shuffle ? 'text-primary' : 'text-slate-400 hover:text-white'}`}>shuffle</button>
            <button onClick={prevTrack} className="material-symbols-outlined text-white text-2xl cursor-pointer hover:text-primary transition-colors">skip_previous</button>
            <button 
              onClick={togglePlay} 
              disabled={!currentTrack}
              className="w-12 h-12 rounded-full bg-white text-background flex items-center justify-center hover:scale-105 active:scale-95 transition-transform disabled:opacity-50"
            >
              <span className={`material-symbols-outlined text-3xl ${isPlaying && !isLoading && !isBuffering ? 'filled' : ''}`}>
                {isLoading || isBuffering ? 'hourglass_empty' : isPlaying ? 'pause' : 'play_arrow'}
              </span>
            </button>
            <button onClick={nextTrack} className="material-symbols-outlined text-white text-2xl cursor-pointer hover:text-primary transition-colors">skip_next</button>
            <button onClick={toggleRepeat} className={`material-symbols-outlined transition-colors cursor-pointer ${repeat !== 'off' ? 'text-primary' : 'text-slate-400 hover:text-white'}`}>
              {repeat === 'one' ? 'repeat_one' : 'repeat'}
            </button>
          </div>

<div className="w-full flex items-center gap-4 text-[10px] text-slate-500 font-mono font-bold">
            <span>{formatTime(currentTime)}</span>
            <div ref={progressRef} onClick={handleProgressClick} className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden cursor-pointer group relative">
              <div style={{ width: `${progress}%` }} className="absolute inset-y-0 left-0 bg-gradient-to-r from-tertiary to-primary"></div>
              <div style={{ left: `${progress}%` }} className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity -ml-1"></div>
            </div>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

<div className="flex items-center justify-end gap-6 w-1/3">
          <button onClick={toggleDownload} className="text-slate-400 hover:text-white transition-colors relative" title="Download">
            {dlProgress !== null ? <span className="text-[10px] text-primary">{Math.round(dlProgress)}%</span> : <span className={`material-symbols-outlined ${downloaded ? 'text-primary filled' : ''}`}>download</span>}
          </button>
          <div className="flex items-center gap-3 w-32 group">
            <button onClick={toggleMute} className="material-symbols-outlined text-slate-400 hover:text-white text-xl">
              {isMuted || volume === 0 ? 'volume_off' : volume < 0.5 ? 'volume_down' : 'volume_up'}
            </button>
            <div ref={volumeRef} onClick={handleVolumeClick} className="flex-1 h-1 bg-white/10 rounded-full relative cursor-pointer">
              <div style={{ width: `${volumePercent}%` }} className="absolute inset-y-0 left-0 bg-white group-hover:bg-primary transition-colors rounded-full"></div>
            </div>
          </div>
        </div>
      </footer>

      <div className="fixed bottom-20 left-4 right-4 z-40 lg:hidden">
        {currentTrack && (
          <div className="h-16 glass-card bg-surface-container-highest/95 backdrop-blur-[32px] rounded-2xl flex items-center px-4 gap-4 shadow-2xl animate-[slideUp_0.3s_ease-out] cursor-pointer" onClick={toggleNowPlaying}>
            <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0">
              <img src={currentTrack.thumbnail || ''} alt="cover" className="w-full h-full object-cover" />
            </div>
            <div className="flex-1 overflow-hidden">
              <h5 className="text-xs font-bold truncate text-white">{currentTrack.title}</h5>
              <p className="text-[10px] text-slate-400 truncate">{currentTrack.artist}</p>
            </div>
            <div className="flex gap-4 items-center" onClick={e => e.stopPropagation()}>
              <button 
                onClick={(e) => { e.stopPropagation(); toggleLike(currentTrack); }} 
                className={`material-symbols-outlined transition-colors ${isLiked(currentTrack.id) ? 'text-primary filled' : 'text-slate-400'}`}
              >
                favorite
              </button>
              <button className="text-white" onClick={(e) => { e.stopPropagation(); togglePlay(); }}>
                <span className={`material-symbols-outlined text-3xl ${isPlaying && !isLoading && !isBuffering ? 'filled' : ''}`}>
                  {isLoading || isBuffering ? 'hourglass_empty' : isPlaying ? 'pause_circle' : 'play_circle'}
                </span>
              </button>
            </div>
            <div className="absolute bottom-0 left-0 w-full h-1 bg-white/5 rounded-b-2xl overflow-hidden pointer-events-none">
              <div style={{ width: `${progress}%` }} className="h-full bg-gradient-to-r from-tertiary to-primary"></div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
