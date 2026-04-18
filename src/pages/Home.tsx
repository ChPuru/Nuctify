import { useState, useEffect } from 'react';
import { usePlayerStore, useLibraryStore } from '../store';
import { registry } from '../providers';
import { Track } from '../providers/types';
import { isNativeApp } from '../utils/env';

export default function HomePage() {
  const [trending, setTrending] = useState<Track[]>([]);
  const { setQueue } = usePlayerStore();
  const { recentlyPlayed } = useLibraryStore();

useEffect(() => {
    loadTrending();
  }, []);

const loadTrending = async () => {
    try {
      const tracks = await registry.getTrendingAll(20);
      setTrending(tracks);
    } catch (error) {
      console.error('Failed to load trending:', error);
    }
  };

const playTrack = (track: Track, list: Track[]) => {
    setQueue(list, list.findIndex(t => t.id === track.id));
  };

const recentTrack = recentlyPlayed[0];

return (
    <div className="fade-in animate-[fadeIn_0.5s_ease-out]">

{recentTrack && (
        <section className="mb-12">
          <div className="flex justify-between items-end mb-8">
            <div>
              <span className="text-[10px] text-primary tracking-[0.2em] mb-2 block uppercase font-bold">Resuming Session</span>
              <h2 className="text-4xl font-headline font-extrabold tracking-tight text-white">Recently Played</h2>
            </div>
            <button className="text-secondary text-sm font-bold flex items-center gap-2 hover:gap-3 transition-all">
              View History <span className="material-symbols-outlined text-sm">arrow_forward</span>
            </button>
          </div>

<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 relative group overflow-hidden rounded-[2rem] h-[400px] cursor-pointer" onClick={() => playTrack(recentTrack, recentlyPlayed)}>
              <img className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" src={recentTrack.thumbnail || ''} alt={recentTrack.title} />
              <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/40 to-transparent"></div>
              <div className="absolute inset-x-0 bottom-0 p-10 backdrop-blur-md bg-surface-container-low/30 border-t border-white/10">
                <div className="flex justify-between items-end">
                  <div className="max-w-[70%]">
                    <h3 className="text-3xl font-headline font-extrabold mb-2 text-white truncate">{recentTrack.title}</h3>
                    <p className="text-slate-300 font-medium tracking-wide truncate">{recentTrack.artist} • {recentTrack.source.toUpperCase()}</p>
                  </div>
                  <button className="w-16 h-16 rounded-full glass-gradient flex items-center justify-center shadow-2xl active:scale-90 transition-transform">
                    <span className="material-symbols-outlined text-black text-3xl filled">play_arrow</span>
                  </button>
                </div>
              </div>
            </div>

{recentlyPlayed[1] && (
              <div className="relative group overflow-hidden rounded-[2rem] h-[400px] cursor-pointer" onClick={() => playTrack(recentlyPlayed[1], recentlyPlayed)}>
                <img className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" src={recentlyPlayed[1].thumbnail || ''} alt={recentlyPlayed[1].title} />
                <div className="absolute inset-0 bg-gradient-to-t from-surface-container-lowest via-transparent to-transparent"></div>
                <div className="absolute inset-x-0 bottom-0 p-8 py-10 backdrop-blur-md bg-surface-container-high/40">
                  <h4 className="text-xl font-headline font-bold text-white truncate">{recentlyPlayed[1].title}</h4>
                  <p className="text-slate-400 text-sm truncate">{recentlyPlayed[1].artist}</p>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

<section className="mb-16">
        <h2 className="text-2xl font-headline font-bold mb-8 text-white">Trending Now</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
          {trending.slice(0, 10).map((track, idx) => (
            <div key={track.id} className={`group flex flex-col gap-4 cursor-pointer ${idx >= 4 ? 'hidden lg:flex' : ''}`} onClick={() => playTrack(track, trending)}>
              <div className="aspect-square rounded-2xl overflow-hidden relative glass-card">
                <img className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" src={track.thumbnail || ''} alt={track.title} />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <span className="material-symbols-outlined text-white text-5xl filled shadow-2xl">play_circle</span>
                </div>
              </div>
              <div className="px-1">
                <h4 className="font-bold text-white group-hover:text-primary transition-colors truncate">{track.title}</h4>
                <p className="text-xs text-slate-500 uppercase tracking-widest font-bold mt-1 truncate">{track.artist}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

<section className="mb-12">
        <h2 className="text-2xl font-headline font-bold mb-8 text-white">Curated For You</h2>
        <div className="flex gap-6 overflow-x-auto pb-6 custom-scrollbar">
          <div className="flex-none w-72 p-1 rounded-[2.5rem] bg-gradient-to-br from-primary to-secondary transition-transform hover:scale-105 cursor-pointer" onClick={() => {}}>
            <div className="bg-surface rounded-[2.4rem] p-6 h-full flex flex-col justify-between">
              <div>
                <div className="flex gap-1 mb-4">
                  <div className="w-1.5 h-6 bg-tertiary rounded-full"></div>
                  <div className="w-1.5 h-10 bg-primary rounded-full"></div>
                  <div className="w-1.5 h-8 bg-secondary rounded-full"></div>
                </div>
                <h4 className="text-2xl font-bold font-headline mb-2 leading-tight text-white">Global Hits</h4>
                <p className="text-sm text-slate-400">The most streamed tracks worldwide, right now.</p>
              </div>
            </div>
          </div>

<div className="flex-none w-72 p-1 rounded-[2.5rem] bg-gradient-to-br from-secondary to-tertiary transition-transform hover:scale-105 cursor-pointer" onClick={() => {}}>
            <div className="bg-surface rounded-[2.4rem] p-6 h-full flex flex-col justify-between">
              <div>
                <div className="flex gap-1 mb-4">
                  <div className="w-1.5 h-10 bg-secondary rounded-full"></div>
                  <div className="w-1.5 h-6 bg-tertiary rounded-full"></div>
                  <div className="w-1.5 h-8 bg-primary rounded-full"></div>
                </div>
                <h4 className="text-2xl font-bold font-headline mb-2 leading-tight text-white">Weekend Warmup</h4>
                <p className="text-sm text-slate-400">High-energy anthems for your night out.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {!isNativeApp() && (
        <section className="mb-24 mt-12">
        <div className="relative overflow-hidden rounded-[3rem] bg-surface-container-high/30 border border-white/5 p-12 lg:p-20">
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/20 blur-[120px] rounded-full pointer-events-none -translate-y-1/2 translate-x-1/2" />

<div className="relative z-10 flex flex-col lg:flex-row items-center justify-between gap-12">
            <div className="max-w-2xl text-center lg:text-left">
              <span className="text-secondary font-bold tracking-[0.3em] uppercase text-[10px] mb-4 block">Take it with you</span>
              <h2 className="text-4xl md:text-6xl font-headline font-extrabold tracking-tight text-white mb-6">Nuctify, everywhere.</h2>
              <p className="text-lg text-slate-400 font-medium leading-relaxed mb-10">
                Experience the ultimate music aggregator with native performance. Get global media keys, Discord integration, and background playback.
              </p>

              <div className="flex flex-wrap justify-center lg:justify-start gap-4">
                <a 
                  href="https://github.com/ChPuru/Nuctify/releases/download/exe/Nuctify_0.1.0_x64-setup.exe" 
                  className="group flex items-center gap-4 px-8 py-4 bg-white text-black rounded-2xl font-bold transition-all hover:scale-105 active:scale-95"
                >
                  <span className="material-symbols-outlined text-2xl">desktop_windows</span>
                  <div className="text-left">
                    <p className="text-[10px] uppercase tracking-wider opacity-60">Download for</p>
                    <p className="text-lg leading-tight">Windows (.exe)</p>
                  </div>
                </a>

<a 
                  href="https://github.com/ChPuru/Nuctify/releases/download/apk/app-release.apk" 
                  className="group flex items-center gap-4 px-8 py-4 bg-surface-container-highest border border-white/10 text-white rounded-2xl font-bold transition-all hover:bg-white/10 hover:scale-105 active:scale-95"
                >
                  <span className="material-symbols-outlined text-2xl">android</span>
                  <div className="text-left">
                    <p className="text-[10px] uppercase tracking-wider opacity-60">Download for</p>
                    <p className="text-lg leading-tight">Android (.apk)</p>
                  </div>
                </a>
              </div>
            </div>

<div className="relative w-full lg:w-1/3 flex justify-center">
              <div className="relative w-48 h-48 bg-gradient-to-br from-primary to-secondary rounded-full animate-pulse blur-3xl opacity-20 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
              <div className="relative z-10 glass-card p-6 rounded-3xl border border-white/20 transform rotate-6 hover:rotate-0 transition-transform duration-500 shadow-2xl">
                <span className="material-symbols-outlined text-[120px] text-white opacity-20">install_mobile</span>
              </div>
            </div>
          </div>
        </div>
      </section>
      )}

</div>
  );
}
