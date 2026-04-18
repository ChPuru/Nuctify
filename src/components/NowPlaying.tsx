import { useEffect, useRef } from 'react';
import { usePlayerStore } from '../store';
import { formatTime } from '../utils';
import { useDrag } from '@use-gesture/react';

export default function NowPlaying() {
  const {
    currentTrack, isPlaying, currentTime, duration,
    lyrics, nowPlayingExpanded, volume, isMuted,
    togglePlay, toggleNowPlaying, seekTo, nextTrack, prevTrack, setVolume, toggleMute
  } = usePlayerStore();
  const lyricsRef = useRef<HTMLDivElement>(null);
  const lastActiveIndexRef = useRef<number>(-1);
  const progressRef = useRef<HTMLDivElement>(null);
  const volumeRef = useRef<HTMLDivElement>(null);

useEffect(() => {
    if (!nowPlayingExpanded || !lyrics?.synced || !lyricsRef.current) return;

const activeIndex = lyrics.synced.findIndex((line, i) => {
      const next = lyrics.synced![i + 1];
      return currentTime >= line.time && (!next || currentTime < next.time);
    });

if (activeIndex >= 0 && activeIndex !== lastActiveIndexRef.current) {
      lastActiveIndexRef.current = activeIndex;
      const lines = lyricsRef.current.querySelectorAll('.lyric-line');
      if (lines[activeIndex]) {
        lines[activeIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [currentTime, lyrics, nowPlayingExpanded]);

const bindGestures = useDrag(({ swipe: [swipeX] }) => {
    if (swipeX === -1) nextTrack();
    else if (swipeX === 1) prevTrack();
  });

const handleProgressClick = (e: React.MouseEvent) => {
    if (!progressRef.current || !duration) return;
    const rect = progressRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    seekTo(ratio * duration);
  };

const handleVolumeClick = (e: React.MouseEvent) => {
    if (!volumeRef.current) return;
    const rect = volumeRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setVolume(ratio);
  };

if (!nowPlayingExpanded) return null;

const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const volumePercent = isMuted ? 0 : volume * 100;

return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-background selection:bg-secondary/30 selection:text-white" style={{ touchAction: 'none' }}>

{}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/80 z-10" />
        <img 
          src={currentTrack?.thumbnail || ''} 
          className="w-full h-full object-cover scale-110 blur-[80px] opacity-60" 
          alt="" 
        />
      </div>

{}
      <header className="relative w-full h-20 px-8 flex items-center justify-between z-50 flex-shrink-0">
        <div className="flex items-center gap-4">
          <div onClick={toggleNowPlaying} className="w-10 h-10 rounded-full bg-surface-container-highest flex items-center justify-center cursor-pointer hover:bg-white/10 transition-colors">
            <span className="material-symbols-outlined text-white">expand_more</span>
          </div>
          <div className="hidden md:block">
            <p className="text-[10px] font-label font-bold uppercase tracking-[0.2em] text-on-surface-variant">Now Playing</p>
            <p className="font-headline font-bold text-sm tracking-tight text-white">{currentTrack?.title}</p>
          </div>
        </div>

<div className="flex items-center gap-3">
          <button className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-all">
            <span className="material-symbols-outlined text-white">more_vert</span>
          </button>
          <button onClick={toggleNowPlaying} className="hidden md:flex ml-4 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur-md items-center gap-2 group transition-all">
            <span className="material-symbols-outlined text-sm group-hover:rotate-90 transition-transform">close</span>
            <span className="text-xs font-bold uppercase tracking-widest">Close</span>
          </button>
        </div>
      </header>

{}
      <main className="relative flex-1 flex flex-col lg:flex-row items-center justify-center lg:justify-between px-8 lg:px-24 pb-32 z-20 overflow-hidden">

{}
        <div className="w-full lg:w-1/2 flex flex-col items-center lg:items-start text-center lg:text-left space-y-8 flex-shrink-0">
          <div className="relative group">
            <div className="absolute -inset-4 bg-gradient-to-r from-primary to-secondary opacity-20 blur-2xl transition-opacity"></div>
            <div className="relative w-64 h-64 md:w-80 md:h-80 lg:w-[420px] lg:h-[420px] rounded-2xl overflow-hidden shadow-[0_40px_100px_rgba(0,0,0,0.5)]">
              <img 
                {...bindGestures()}
                src={currentTrack?.thumbnail || ''} 
                className="w-full h-full object-cover select-none" 
                draggable="false"
                style={{ touchAction: 'pan-y' }}
              />
            </div>
          </div>

<div className="space-y-2 max-w-[420px] w-full px-4 lg:px-0">
            <h1 className="text-3xl md:text-5xl lg:text-5xl font-headline font-extrabold tracking-tight text-white truncate">{currentTrack?.title}</h1>
            <p className="text-lg md:text-xl font-body text-secondary font-medium tracking-wide truncate">{currentTrack?.artist}</p>
          </div>
        </div>

{}
        <div className="flex flex-col w-full lg:w-1/2 h-full max-w-xl lg:pl-12 justify-center pb-24 mt-8 lg:mt-0">
          <div className="h-[300px] md:h-[400px] lg:h-[500px] overflow-y-auto custom-scrollbar lyrics-gradient px-4" ref={lyricsRef}>
            <div className="space-y-8 pb-[150px] pt-[100px] lg:pb-[250px] lg:pt-[200px]">
              {lyrics?.synced ? (
                lyrics.synced.map((line, i) => {
                  const isActive = lyrics.synced!.findIndex((l, j) => {
                    const next = lyrics.synced![j + 1];
                    return currentTime >= l.time && (!next || currentTime < next.time);
                  }) === i;

return (
                    <p
                      key={i}
                      className={`lyric-line font-headline cursor-pointer transition-all duration-300 ${isActive ? 'text-3xl md:text-4xl lg:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white via-white to-white/40 leading-tight' : 'text-xl md:text-2xl lg:text-3xl font-bold text-white/20 hover:text-white/40'}`}
                      onClick={() => seekTo(line.time)}
                    >
                      {line.text}
                    </p>
                  );
                })
              ) : lyrics?.plain ? (
                <p className="text-xl md:text-2xl font-headline font-bold text-white/60 whitespace-pre-wrap leading-relaxed px-2">
                  {lyrics.plain}
                </p>
              ) : (
                <p className="text-xl md:text-2xl font-headline font-bold text-white/20 px-2">
                  No lyrics available.
                </p>
              )}
            </div>
          </div>
        </div>
      </main>

{}
      <section className="absolute bottom-0 left-0 w-full z-50 p-6 md:p-8 flex-shrink-0">
        <div className="bg-surface-container-low/40 backdrop-blur-3xl border border-white/10 rounded-[2.5rem] p-6 md:p-8 max-w-7xl mx-auto flex flex-col md:flex-row items-center gap-6 md:gap-12 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">

{}
          <div className="w-full md:flex-1 order-1">
            <div className="flex justify-between items-center mb-3">
              <span className="text-[10px] font-label font-bold tracking-widest text-on-surface-variant font-mono">{formatTime(currentTime)}</span>
              <span className="text-[10px] font-label font-bold tracking-widest text-on-surface-variant font-mono">{formatTime(duration)}</span>
            </div>
            <div className="relative w-full h-1.5 bg-white/10 rounded-full group cursor-pointer" ref={progressRef} onClick={handleProgressClick}>
              <div style={{ width: `${progress}%` }} className="absolute top-0 left-0 h-full bg-gradient-to-r from-tertiary via-primary to-secondary rounded-full">
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity translate-x-2"></div>
              </div>
            </div>
          </div>

{}
          <div className="flex items-center gap-6 md:gap-8 order-2">
            <button className="text-on-surface-variant hover:text-white transition-colors" onClick={() => {}}>
              <span className="material-symbols-outlined text-2xl">shuffle</span>
            </button>
            <button className="text-white hover:text-secondary transition-colors cursor-pointer" onClick={prevTrack}>
              <span className="material-symbols-outlined text-3xl">skip_previous</span>
            </button>

{}
            <button onClick={togglePlay} className="w-16 h-16 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-on-primary-container shadow-[0_8px_24px_rgba(186,158,255,0.4)] active:scale-95 transition-transform flex-shrink-0">
              <span className={`material-symbols-outlined text-4xl ${isPlaying ? 'filled' : ''}`}>
                {isPlaying ? 'pause' : 'play_arrow'}
              </span>
            </button>

<button className="text-white hover:text-secondary transition-colors cursor-pointer" onClick={nextTrack}>
              <span className="material-symbols-outlined text-3xl">skip_next</span>
            </button>
            <button className="text-on-surface-variant hover:text-white transition-colors">
              <span className="material-symbols-outlined text-2xl">repeat</span>
            </button>
          </div>

{}
          <div className="hidden lg:flex items-center gap-6 order-3">
            <div className="flex items-center gap-3">
              <button onClick={toggleMute} className="material-symbols-outlined text-on-surface-variant hover:text-white">
                {isMuted || volume === 0 ? 'volume_off' : volume < 0.5 ? 'volume_down' : 'volume_up'}
              </button>
              <div ref={volumeRef} onClick={handleVolumeClick} className="w-24 h-1 bg-white/10 rounded-full relative overflow-hidden cursor-pointer">
                <div style={{ width: `${volumePercent}%` }} className="absolute left-0 top-0 h-full bg-white rounded-full"></div>
              </div>
            </div>
          </div>
        </div>
      </section>

</div>
  );
}
