import { create } from 'zustand';
import { Track, Lyrics, RepeatMode, SearchResults } from '../providers/types';
import { registry } from '../providers';
import { fetchLyrics } from '../lyrics/lrclib';
import { scrobbleNowPlaying, scrobbleTrack, shouldScrobble } from '../integrations/scrobble';
import { useToastStore } from './toast';
import { audioEngine } from '../audio/engine';
import { getOfflineStreamUrl } from '../audio/offline';
import { isNativeApp, isTauriApp } from '../utils/env';
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';

let tauriEmit: any = null;
if (isNativeApp()) {
  import('@tauri-apps/api/event').then(m => {
    tauriEmit = m.emit;
  }).catch(() => {});
}

interface PlayerState {

currentTrack: Track | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;

queue: Track[];
  queueIndex: number;
  history: Track[];

shuffle: boolean;
  repeat: RepeatMode;

lyrics: Lyrics | null;
  lyricsVisible: boolean;

nowPlayingExpanded: boolean;

audioElement: HTMLAudioElement | null;

isLoading: boolean;
  isBuffering: boolean;

scrobbled: boolean;
  playStartTime: number;

crossfadeEnabled: boolean;

eqPreset: string;
  sleepTimerRemaining: number | null;

setTrack: (track: Track) => void;
  playTrack: (track: Track) => Promise<void>;
  togglePlay: () => void;
  pause: () => void;
  resume: () => void;
  seekTo: (time: number) => void;
  setVolume: (vol: number) => void;
  toggleMute: () => void;
  nextTrack: () => void;
  prevTrack: () => void;
  addToQueue: (track: Track) => void;
  removeFromQueue: (index: number) => void;
  clearQueue: () => void;
  setQueue: (tracks: Track[], startIndex?: number) => void;
  toggleShuffle: () => void;
  toggleRepeat: () => void;
  toggleLyrics: () => void;
  toggleNowPlaying: () => void;
  toggleCrossfade: () => void;
  setCurrentTime: (time: number) => void;

setEQPreset: (preset: string) => void;
  startSleepTimer: (minutes: number) => void;
  stopSleepTimer: () => void;
}

export const usePlayerStore = create<PlayerState>((set, get) => {

if (typeof window !== 'undefined') {
    audioEngine.onTimeUpdate = (currentTime, duration) => {
      const state = get();
      set({ currentTime, duration: duration > 0 ? duration : state.duration });

if (!state.scrobbled && state.currentTrack && duration > 0) {
        if (shouldScrobble(duration, currentTime)) {
          set({ scrobbled: true });
          scrobbleTrack(state.currentTrack).catch(() => {});
        }
      }
    };

audioEngine.onEnded = () => {
      get().nextTrack();
    };

audioEngine.onPreEnd = () => {

const state = get();
      if (state.crossfadeEnabled && state.repeat !== 'one' && state.queue.length > 0) {
        console.log('[AudioEngine] onPreEnd triggered -> Crossfading next track!');
        get().nextTrack();
      }
    };

audioEngine.onPlaying = () => set({ isPlaying: true, isBuffering: false, isLoading: false });
    audioEngine.onWaiting = () => set({ isBuffering: true });

audioEngine.onSleepTimerTick = (remainingMs) => {
      set({ sleepTimerRemaining: remainingMs });
      if (remainingMs === 0) set({ isPlaying: false });
    };

audioEngine.onError = async (e) => {
      console.error('[Audio] Playback error:', e);
      const state = get();

if (state.currentTrack?.alternatives && state.currentTrack.alternatives.length > 0) {
        const alt = state.currentTrack.alternatives.shift()!;
        console.log(`[Player] Trying fallback from ${alt.source}...`);
        const altProvider = registry.get(alt.source);
        if (altProvider) {
          try {
            const streamInfo = await altProvider.getStreamUrl(alt);
            if (streamInfo) {
              await audioEngine.playUrl(streamInfo.url, false);
              set({
                isPlaying: true,
                isLoading: false,
                isBuffering: false,
                currentTrack: { ...state.currentTrack!, streamUrl: streamInfo.url, alternatives: state.currentTrack!.alternatives },
              });
              return;
            }
          } catch {}
        }
      }

set({ isLoading: false, isBuffering: false });
    };
  }

return {
    currentTrack: null,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 0.7,
    isMuted: false,
    queue: [],
    queueIndex: -1,
    history: [],
    shuffle: false,
    repeat: 'off',
    lyrics: null,
    lyricsVisible: false,
    nowPlayingExpanded: false,
    audioElement: audioEngine.getActiveAudio(),
    crossfadeEnabled: false,
    eqPreset: 'flat',
    sleepTimerRemaining: null,
    isLoading: false,
    isBuffering: false,
    scrobbled: false,
    playStartTime: 0,

setTrack: (track) => set({ currentTrack: track }),

playTrack: async (track) => {
      const state = get();
      set({ isLoading: true, currentTrack: track, lyrics: null, scrobbled: false, playStartTime: Date.now() });

if (state.currentTrack) {
        set({ history: [...state.history.slice(-50), state.currentTrack] });
      }

try {
        let streamInfo = null;

const localUrl = await getOfflineStreamUrl(track.id);
        if (localUrl) {
          console.log('[Player] 💾 Playing from Offline DB:', track.id);
          streamInfo = { url: localUrl };
        } else {

const provider = registry.get(track.source);
          streamInfo = provider ? await provider.getStreamUrl(track) : null;

if (!streamInfo && track.alternatives) {
            for (const alt of track.alternatives) {
              const altProvider = registry.get(alt.source);
              if (altProvider) {
                streamInfo = await altProvider.getStreamUrl(alt);
                if (streamInfo) break;
              }
            }
          }
        }

if (!streamInfo) {
          console.error('[Player] No stream URL found for:', track.title);
          set({ isLoading: false });
          return;
        }

let finalUrl = streamInfo.url;
        if (isNativeApp() && track.source === 'youtube' && finalUrl.startsWith('http')) {
          if (isTauriApp()) {

try {
              console.log('[Player] YouTube in Tauri — proxying audio via Rust...');
              const { invoke, convertFileSrc } = await import('@tauri-apps/api/core');
              const filePath: string = await invoke('proxy_audio', { url: finalUrl });
              finalUrl = convertFileSrc(filePath);
              console.log('[Player] Audio proxied to local file:', filePath);
            } catch (e) {
              console.warn('[Player] Rust proxy failed, trying direct URL:', e);
            }
          } else {

try {
              console.log('[Player] YouTube on mobile — fetching audio via native HTTP...');
              const audioRes = await fetch(finalUrl);
              if (audioRes.ok) {
                const blob = await audioRes.blob();
                if ((window as any).__nuctifyBlobUrl) {
                  URL.revokeObjectURL((window as any).__nuctifyBlobUrl);
                }
                finalUrl = URL.createObjectURL(blob);
                (window as any).__nuctifyBlobUrl = finalUrl;
                console.log(`[Player] Blob URL created (${(blob.size / 1024 / 1024).toFixed(1)} MB)`);
              }
            } catch (e) {
              console.warn('[Player] Blob conversion failed, trying direct URL:', e);
            }
          }
        }

const isCrossfade = state.crossfadeEnabled && state.isPlaying;
        await audioEngine.playUrl(finalUrl, isCrossfade).catch(e => {
          console.error('[Audio] Play failed:', e);
        });

set({ isPlaying: true, isLoading: false });

if (window.NativeBridge) {

window.NativeBridge.updateMetadata(track.title, track.artist);

window.NativeBridge.updatePlaybackState(true);
        }

if ('mediaSession' in navigator) {
          navigator.mediaSession.metadata = new MediaMetadata({
            title: track.title,
            artist: track.artist,
            album: track.album || '',
            artwork: track.thumbnail ? [
              { src: track.thumbnail, sizes: '512x512', type: 'image/jpeg' },
            ] : [],
          });

navigator.mediaSession.setActionHandler('play', () => get().resume());
          navigator.mediaSession.setActionHandler('pause', () => get().pause());
          navigator.mediaSession.setActionHandler('previoustrack', () => get().prevTrack());
          navigator.mediaSession.setActionHandler('nexttrack', () => get().nextTrack());
          navigator.mediaSession.setActionHandler('seekto', (details) => {
            if (details.seekTime != null) get().seekTo(details.seekTime);
          });
        }

scrobbleNowPlaying(track).catch(() => {});

if (isNativeApp()) {
          try {

if (tauriEmit) {
              tauriEmit('track_changed', { title: track.title, artist: track.artist });
            }

let permissionGranted = await isPermissionGranted();
            if (!permissionGranted) {
              const permission = await requestPermission();
              permissionGranted = permission === 'granted';
            }
            if (permissionGranted) {
              sendNotification({ title: 'Now Playing', body: `${track.title} • ${track.artist}` });
            }
          } catch (e) {

}
        }

fetchLyrics(track.title, track.artist, track.duration).then(lyrics => {
          if (get().currentTrack?.id === track.id) {
            set({ lyrics });
          }
        });
      } catch (error) {
        console.error('[Player] Play failed:', error);
        set({ isLoading: false });
      }
    },

togglePlay: async () => {
      const { isPlaying } = get();
      if (isPlaying) {
        audioEngine.pause();
        set({ isPlaying: false });
      } else {
        await audioEngine.resume();
        set({ isPlaying: true });
      }
    },

pause: () => {
      audioEngine.pause();
      set({ isPlaying: false });

if (window.NativeBridge) window.NativeBridge.updatePlaybackState(false);
    },

resume: async () => {
      await audioEngine.resume();
      set({ isPlaying: true });

if (window.NativeBridge) window.NativeBridge.updatePlaybackState(true);
    },

seekTo: (time) => {
      audioEngine.seek(time);
      set({ currentTime: time });
    },

setVolume: (vol) => {
      audioEngine.setVolume(vol);
      set({ volume: vol, isMuted: vol === 0 });
    },

toggleMute: () => {
      const { isMuted, volume } = get();
      audioEngine.setVolume(isMuted ? volume || 0.7 : 0);
      set({ isMuted: !isMuted });
    },

nextTrack: () => {
      const { queue, queueIndex, repeat, shuffle } = get();
      if (queue.length === 0) return;

let nextIndex: number;
      if (repeat === 'one') {

audioEngine.seek(0);
        audioEngine.resume();
        return;
      } else if (shuffle) {
        nextIndex = Math.floor(Math.random() * queue.length);
      } else {
        nextIndex = queueIndex + 1;
        if (nextIndex >= queue.length) {
          if (repeat === 'all') {
            nextIndex = 0;
          } else if (get().history.length > 0 || get().currentTrack) {

const lastTrack = get().currentTrack || get().history[get().history.length - 1];
            if (lastTrack) {
              console.log('[AI DJ] Endless Radio active! Finding next track...');

registry.searchAll(`${lastTrack.artist} auto mix`, 10).then(results => {
                if (results.tracks.length > 0) {

const recentIds = get().history.map(t => t.id);
                  const freshTracks = results.tracks.filter(t => !recentIds.includes(t.id));

const djTrack = freshTracks.length > 0 
                    ? freshTracks[Math.floor(Math.random() * freshTracks.length)] 
                    : results.tracks[Math.floor(Math.random() * results.tracks.length)];

get().addToQueue(djTrack);

setTimeout(() => get().nextTrack(), 50);
                }
              }).catch(() => {});
            }
            return;
          } else {
            return;
          }
        }
      }

set({ queueIndex: nextIndex });
      get().playTrack(queue[nextIndex]);
    },

prevTrack: () => {
      const { queue, queueIndex, currentTime } = get();

if (currentTime > 3) {
        get().seekTo(0);
        return;
      }

const prevIndex = queueIndex - 1;
      if (prevIndex >= 0 && queue[prevIndex]) {
        set({ queueIndex: prevIndex });
        get().playTrack(queue[prevIndex]);
      }
    },

addToQueue: (track) => {
      set(s => ({ queue: [...s.queue, track] }));
      useToastStore.getState().addToast(`Added "${track.title}" to queue`);
    },

removeFromQueue: (index) => {
      set(s => ({
        queue: s.queue.filter((_, i) => i !== index),
        queueIndex: index < s.queueIndex ? s.queueIndex - 1 : s.queueIndex,
      }));
    },

clearQueue: () => {
      set({ queue: [], queueIndex: -1 });
      useToastStore.getState().addToast('Queue cleared');
    },

setQueue: (tracks, startIndex = 0) => {
      set({ queue: tracks, queueIndex: startIndex });
      if (tracks[startIndex]) {
        get().playTrack(tracks[startIndex]);
      }
    },

toggleShuffle: () => set(s => ({ shuffle: !s.shuffle })),
    toggleRepeat: () => set(s => ({
      repeat: s.repeat === 'off' ? 'all' : s.repeat === 'all' ? 'one' : 'off',
    })),
    toggleLyrics: () => set(s => ({
      lyricsVisible: !s.lyricsVisible,
      nowPlayingExpanded: !s.lyricsVisible ? true : s.nowPlayingExpanded
    })),
    toggleNowPlaying: () => set(s => ({ nowPlayingExpanded: !s.nowPlayingExpanded })),
    toggleCrossfade: () => set(s => ({ crossfadeEnabled: !s.crossfadeEnabled })),
    setCurrentTime: (time) => set({ currentTime: time }),

setEQPreset: (preset) => {

import('../audio/engine').then(({ EQ_PRESETS }) => {
        const bands = EQ_PRESETS[preset as keyof typeof EQ_PRESETS] || EQ_PRESETS.flat;
        audioEngine.setEQ(bands);
        set({ eqPreset: preset });
      });
    },

startSleepTimer: (minutes) => {
      audioEngine.startSleepTimer(minutes);
      set({ sleepTimerRemaining: minutes * 60 * 1000 });
    },

stopSleepTimer: () => {
      audioEngine.stopSleepTimer();
      set({ sleepTimerRemaining: null });
    },
  };
});

interface SearchState {
  query: string;
  results: SearchResults | null;
  isSearching: boolean;
  recentSearches: string[];
  setQuery: (q: string) => void;
  search: (q: string) => Promise<void>;
  clearResults: () => void;
}

export const useSearchStore = create<SearchState>((set, get) => ({
  query: '',
  results: null,
  isSearching: false,
  recentSearches: JSON.parse(localStorage.getItem('nuctify_recent_searches') || '[]'),

setQuery: (q) => set({ query: q }),

search: async (q) => {
    if (!q.trim()) return;
    set({ isSearching: true, query: q });

try {
      const results = await registry.searchAll(q);
      set({ results, isSearching: false });

const recent = get().recentSearches;
      const updated = [q, ...recent.filter(s => s !== q)].slice(0, 10);
      set({ recentSearches: updated });
      localStorage.setItem('nuctify_recent_searches', JSON.stringify(updated));
    } catch (error) {
      console.error('[Search] Failed:', error);
      set({ isSearching: false });
    }
  },

clearResults: () => set({ results: null, query: '' }),
}));

interface LibraryState {
  likedTracks: Track[];
  playlists: Array<{ id: string; name: string; tracks: Track[]; createdAt: number }>;
  recentlyPlayed: Track[];
  toggleLike: (track: Track) => void;
  isLiked: (trackId: string) => boolean;
  createPlaylist: (name: string) => void;
  addToPlaylist: (playlistId: string, track: Track) => void;
  removeFromPlaylist: (playlistId: string, trackId: string) => void;
  deletePlaylist: (playlistId: string) => void;
  addToRecentlyPlayed: (track: Track) => void;
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  likedTracks: JSON.parse(localStorage.getItem('nuctify_liked') || '[]'),
  playlists: JSON.parse(localStorage.getItem('nuctify_playlists') || '[]'),
  recentlyPlayed: JSON.parse(localStorage.getItem('nuctify_recent') || '[]'),

toggleLike: (track) => {
    const liked = get().likedTracks;
    const exists = liked.find(t => t.id === track.id);
    const updated = exists
      ? liked.filter(t => t.id !== track.id)
      : [{ ...track, isLiked: true }, ...liked];
    set({ likedTracks: updated });
    localStorage.setItem('nuctify_liked', JSON.stringify(updated));
    useToastStore.getState().addToast(
      exists ? `Removed "${track.title}" from liked` : `Saved "${track.title}" to liked`
    );
  },

isLiked: (trackId) => get().likedTracks.some(t => t.id === trackId),

createPlaylist: (name) => {
    const playlist = {
      id: `pl-${Date.now()}`,
      name,
      tracks: [],
      createdAt: Date.now(),
    };
    const updated = [...get().playlists, playlist];
    set({ playlists: updated });
    localStorage.setItem('nuctify_playlists', JSON.stringify(updated));
    useToastStore.getState().addToast(`Created playlist "${name}"`, 'success');
  },

addToPlaylist: (playlistId, track) => {
    const playlists = get().playlists.map(p => {
      if (p.id === playlistId && !p.tracks.find(t => t.id === track.id)) {
        return { ...p, tracks: [...p.tracks, track] };
      }
      return p;
    });
    set({ playlists });
    localStorage.setItem('nuctify_playlists', JSON.stringify(playlists));
  },

removeFromPlaylist: (playlistId, trackId) => {
    const playlists = get().playlists.map(p => {
      if (p.id === playlistId) {
        return { ...p, tracks: p.tracks.filter(t => t.id !== trackId) };
      }
      return p;
    });
    set({ playlists });
    localStorage.setItem('nuctify_playlists', JSON.stringify(playlists));
  },

deletePlaylist: (playlistId) => {
    const playlists = get().playlists.filter(p => p.id !== playlistId);
    set({ playlists });
    localStorage.setItem('nuctify_playlists', JSON.stringify(playlists));
  },

addToRecentlyPlayed: (track) => {
    const recent = get().recentlyPlayed;
    const updated = [track, ...recent.filter(t => t.id !== track.id)].slice(0, 50);
    set({ recentlyPlayed: updated });
    localStorage.setItem('nuctify_recent', JSON.stringify(updated));
  },
}));

if (typeof window !== 'undefined') {
  window.addEventListener('native_media_control', (e: any) => {
    try {
      const data = typeof e.detail === 'string' ? JSON.parse(e.detail) : e.detail;
      const action = data?.action;
      const store = usePlayerStore.getState();

console.log('[NativeControl] Received action:', action);

if (action === 'co.nuctify.app.PLAY' || action === 'play') store.resume();
      else if (action === 'co.nuctify.app.PAUSE' || action === 'pause') store.pause();
      else if (action === 'co.nuctify.app.NEXT' || action === 'next') store.nextTrack();
      else if (action === 'co.nuctify.app.PREV' || action === 'prev') store.prevTrack();
    } catch (err) {
      console.error('[NativeControl] Failed to parse action:', err);
    }
  });
}
