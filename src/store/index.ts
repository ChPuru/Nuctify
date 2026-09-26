import { create } from 'zustand';
import { Track, Lyrics, RepeatMode, SearchResults, SmartPlaylistRule, Playlist, Artist, Album } from '../providers/types';
import { registry } from '../providers';
import { scrobbleNowPlaying, scrobbleTrack, shouldScrobble } from '../integrations/scrobble';
import { syncUserData, fetchUserData } from '../integrations/supabase';
import { useAuthStore } from './auth';
import { useToastStore } from './toast';
import { audioEngine, EQ_PRESETS } from '../audio/engine';
import { getOfflineStreamUrl, getDownloadedIds, getDownloadProgress, onChange as onDownloadsChange, downloadTrack, removeTrack } from '../audio/offline';
import { isTauriApp } from '../utils/env';
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';
import { Theme, applyTheme } from '../utils/themes';
import { fetchLyrics, searchTracksByLyrics } from '../lyrics/lrclib';

/** Jam (social/jam.ts) hooks. intercept returns true when a guest action must not run locally. */
export type JamAction = 'play' | 'pause' | 'resume' | 'seek' | 'next' | 'prev';
export const jamHooks: { intercept?: (action: JamAction, data?: unknown) => boolean; changed?: () => void } = {};

let tauriEmit: ((event: string, payload?: unknown) => Promise<void>) | null = null;
if (isTauriApp()) {
  import('@tauri-apps/api/event').then(m => {
    tauriEmit = m.emit;
  }).catch(() => {});
}
const emitTauri = (event: string, payload?: unknown) => {
  if (tauriEmit) tauriEmit(event, payload).catch(() => {});
};

function load<T>(key: string, fallback: T, guard: (v: any) => boolean = Array.isArray): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const v = JSON.parse(raw);
    return guard(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

const isObject = (v: any) => !!v && typeof v === 'object' && !Array.isArray(v);

function persist(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error('[Storage] Failed to save', key, e);
  }
}

const slimAlt = (t: Track): Track => ({
  id: t.id, title: t.title, artist: t.artist, duration: t.duration, source: t.source, sourceId: t.sourceId,
});

export const slimTrack = (t: Track): Track => {
  const { alternatives, streamUrl, ...rest } = t;
  const out: Track = { ...rest };
  if (t.source === 'jiosaavn' && streamUrl) out.streamUrl = streamUrl;
  if (alternatives?.length) out.alternatives = alternatives.slice(0, 2).map(slimAlt);
  return out;
};

const slimPlaylist = (p: Playlist): Playlist => ({ ...p, tracks: (p.tracks || []).map(slimTrack) });

const PREFS_KEY = 'nuctify_player_prefs';
export type StreamQuality = 'high' | 'normal' | 'low';
type PlayerPrefs = {
  streamQuality: StreamQuality;
  volume: number; isMuted: boolean; crossfadeEnabled: boolean; eqPreset: string; playbackSpeed: number;
  normalizationEnabled: boolean; autoplayEnabled: boolean; shuffle: boolean; repeat: RepeatMode;
};
const defaultPrefs: PlayerPrefs = {
  streamQuality: 'high',
  volume: 0.7, isMuted: false, crossfadeEnabled: false, eqPreset: 'flat', playbackSpeed: 1.0,
  normalizationEnabled: false, autoplayEnabled: true, shuffle: false, repeat: 'off',
};
const savedPrefs: PlayerPrefs = { ...defaultPrefs, ...load<Partial<PlayerPrefs>>(PREFS_KEY, {}, isObject) };
if (typeof savedPrefs.volume !== 'number' || !isFinite(savedPrefs.volume)) savedPrefs.volume = defaultPrefs.volume;
if (!['off', 'one', 'all'].includes(savedPrefs.repeat)) savedPrefs.repeat = 'off';
if (!(savedPrefs.eqPreset in EQ_PRESETS)) savedPrefs.eqPreset = 'flat';
if (!['high', 'normal', 'low'].includes(savedPrefs.streamQuality)) savedPrefs.streamQuality = 'high';

audioEngine.setVolume(savedPrefs.isMuted ? 0 : savedPrefs.volume);
audioEngine.setEQ(EQ_PRESETS[savedPrefs.eqPreset as keyof typeof EQ_PRESETS]);
audioEngine.setPlaybackRate(savedPrefs.playbackSpeed || 1);
audioEngine.setNormalization(!!savedPrefs.normalizationEnabled);

let playSeq = 0;
let activeSeq = 0;
let skipHistoryOnce = false;
let radioInFlight = false;
let consecutiveFailures = 0;
let offlineBlobUrl: string | null = null;
const altCursor = new Map<string, number>();
const shufflePlayed = new Set<string>();

function setOfflineBlob(url: string | null) {
  const old = offlineBlobUrl;
  offlineBlobUrl = url;
  if (old && old !== url) setTimeout(() => URL.revokeObjectURL(old), 10000);
}

function setMediaSessionState(playing: boolean) {
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
  if (window.NativeBridge) window.NativeBridge.updatePlaybackState(playing);
  emitTauri('playback_status', playing);
}

function updatePositionState(position: number, duration: number) {
  if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return;
  if (!duration || !isFinite(duration) || position > duration) return;
  try {
    navigator.mediaSession.setPositionState({ duration, position: Math.max(0, position), playbackRate: audioEngine.getPlaybackRate() || 1 });
  } catch {}
}

async function tryPlay(url: string, cors: boolean, crossfade: boolean): Promise<boolean> {
  try {
    await audioEngine.playUrl(url, { crossfade, cors });
    return true;
  } catch (e) {
    console.warn('[Player] Play failed:', e);
    return false;
  }
}

async function startStream(track: Track, seq: number, crossfade: boolean): Promise<boolean> {
  const stale = () => seq !== playSeq;

  const localUrl = await getOfflineStreamUrl(track.id).catch(() => null);
  if (localUrl) {
    if (stale()) { URL.revokeObjectURL(localUrl); return true; }
    if (await tryPlay(localUrl, true, crossfade)) {
      if (stale()) return true;
      setOfflineBlob(localUrl);
      return true;
    }
    URL.revokeObjectURL(localUrl);
    if (stale()) return true;
  }

  const res = await registry.resolveStream(track).catch(() => null);
  if (stale()) return true;
  if (!res) return false;
  if (await tryPlay(res.stream.url, res.stream.cors !== false, crossfade)) return true;
  if (stale()) return true;

  for (const alt of track.alternatives ?? []) {
    if (alt.id === res.track.id) continue;
    const info = await registry.get(alt.source)?.getStreamUrl(alt).catch(() => null);
    if (stale()) return true;
    if (info && await tryPlay(info.url, info.cors !== false, false)) return true;
    if (stale()) return true;
  }
  return false;
}

function onPlaybackFailed(track: Track) {
  const s = usePlayerStore.getState();
  audioEngine.pause();
  usePlayerStore.setState({ isLoading: false, isBuffering: false, isPlaying: false });
  setMediaSessionState(false);
  consecutiveFailures++;
  if (consecutiveFailures >= Math.min(5, Math.max(1, s.queue.length))) {
    consecutiveFailures = 0;
    useToastStore.getState().addToast('Stopped: tracks failed to play', 'error');
    return;
  }
  useToastStore.getState().addToast(`Couldn't play "${track.title}"`, 'error');
  if (s.queue.length > 1 || s.autoplayEnabled) s.nextTrack();
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
  playbackSpeed: number;
  normalizationEnabled: boolean;
  autoplayEnabled: boolean;
  theme: Theme;
  partyRoomId: string | null;
  isHost: boolean;
  aiDjEnabled: boolean;
  karaokeMode: boolean;
  streamQuality: StreamQuality;

setTrack: (track: Track) => void;
  playTrack: (track: Track) => Promise<void>;
  togglePlay: () => void;
  pause: () => void;
  resume: () => void;
  seekTo: (time: number) => void;
  setVolume: (vol: number) => void;
  toggleMute: () => void;
  nextTrack: () => boolean;
  prevTrack: () => void;
  addToQueue: (track: Track | Track[]) => void;
  playNext: (track: Track) => void;
  playTracks: (tracks: Track[], startIndex?: number, opts?: { shuffle?: boolean }) => void;
  startRadio: (seed: Track) => void;
  clearUpcoming: () => void;
  setStreamQuality: (q: StreamQuality) => void;
  removeFromQueue: (index: number) => void;
  reorderQueue: (oldIndex: number, newIndex: number) => void;
  clearQueue: () => void;
  setQueue: (tracks: Track[], startIndex?: number) => void;
  toggleShuffle: () => void;
  toggleRepeat: () => void;
  toggleLyrics: () => void;
  toggleNowPlaying: () => void;
  toggleCrossfade: () => void;
  toggleKaraokeMode: () => void;
  setCurrentTime: (time: number) => void;

setEQPreset: (preset: string) => void;
  startSleepTimer: (minutes: number) => void;
  stopSleepTimer: () => void;
  setPlaybackSpeed: (speed: number) => void;
  toggleNormalization: () => void;
  toggleAutoplay: () => void;
  setTheme: (theme: Theme, customColor?: string) => void;
  joinParty: (roomId: string) => void;
  leaveParty: () => void;
  createParty: () => void;
  toggleAiDj: () => void;
}

export const usePlayerStore = create<PlayerState>((set, get) => {
  let initialTheme: Theme = 'midnight' as Theme;
  try {
    initialTheme = (localStorage.getItem('nuctify_theme') as Theme) || initialTheme;
  } catch {}
  if (typeof window !== 'undefined') applyTheme(initialTheme);

  const autoRadio = () => {
    if (radioInFlight) return;
    const s = get();
    const seed = s.currentTrack || s.history[s.history.length - 1];
    if (!seed) return;
    radioInFlight = true;
    const seq = playSeq;
    set({ isLoading: true });
    registry.getRadio(seed, 10).then(tracks => {
      const st = get();
      const known = new Set([...st.history.map(t => t.id), ...st.queue.map(t => t.id), st.currentTrack?.id]);
      const fresh = (tracks || []).filter(t => !known.has(t.id)).slice(0, 5);
      if (!fresh.length) {
        set({ isLoading: false });
        useToastStore.getState().addToast('Radio: Could not find similar tracks', 'error');
        return;
      }
      set(q => ({ queue: [...q.queue, ...fresh], isLoading: false }));
      radioInFlight = false;
      if (seq === playSeq) get().nextTrack();
    }).catch(() => {
      set({ isLoading: false });
      useToastStore.getState().addToast('Radio: Error finding tracks', 'error');
    }).finally(() => {
      radioInFlight = false;
    });
  };

  if (typeof window !== 'undefined') {
    audioEngine.onPreEnd = () => {
      const s = get();
      if (!s.crossfadeEnabled || s.repeat === 'one' || !s.isPlaying || activeSeq !== playSeq) return false;
      const atEnd = s.queueIndex + 1 >= s.queue.length;
      if (atEnd && !s.shuffle && s.repeat !== 'all' && !s.autoplayEnabled) return false;
      return s.nextTrack();
    };

    audioEngine.onEnded = () => {
      const s = get();
      if (s.repeat === 'one') {
        set({ scrobbled: false, playStartTime: Date.now() });
        audioEngine.seek(0);
        audioEngine.resume().catch(() => {});
        return;
      }
      if (!s.nextTrack()) {
        set({ isPlaying: false });
        setMediaSessionState(false);
      }
    };

    audioEngine.onPlaying = () => {
      consecutiveFailures = 0;
      set({ isPlaying: true, isBuffering: false, isLoading: false });
    };
    audioEngine.onWaiting = () => set({ isBuffering: true });

    audioEngine.onSleepTimerTick = (remainingMs) => {
      set({ sleepTimerRemaining: remainingMs });
      if (remainingMs === 0) {
        set({ isPlaying: false });
        setMediaSessionState(false);
      }
    };

    audioEngine.onError = async (e) => {
      console.error('[Audio] Playback error:', e);
      const track = get().currentTrack;
      if (!track) return;
      const seq = playSeq;
      const alts = track.alternatives ?? [];
      let i = altCursor.get(track.id) ?? 0;
      while (i < alts.length) {
        const alt = alts[i++];
        altCursor.set(track.id, i);
        const info = await registry.get(alt.source)?.getStreamUrl(alt).catch(() => null);
        if (seq !== playSeq) return;
        if (info && await tryPlay(info.url, info.cors !== false, false)) return;
        if (seq !== playSeq) return;
      }
      onPlaybackFailed(track);
    };
  }

return {
    currentTrack: null,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: savedPrefs.volume,
    isMuted: savedPrefs.isMuted,
    queue: [],
    queueIndex: -1,
    history: [],
    shuffle: savedPrefs.shuffle,
    repeat: savedPrefs.repeat,
    lyrics: null,
    lyricsVisible: false,
    nowPlayingExpanded: false,
    audioElement: audioEngine.getActiveAudio(),
    crossfadeEnabled: savedPrefs.crossfadeEnabled,
    eqPreset: savedPrefs.eqPreset,
    sleepTimerRemaining: null,
    playbackSpeed: savedPrefs.playbackSpeed,
    normalizationEnabled: savedPrefs.normalizationEnabled,
    autoplayEnabled: savedPrefs.autoplayEnabled,
    theme: initialTheme,
    isLoading: false,
    isBuffering: false,
    scrobbled: false,
    karaokeMode: false,
    streamQuality: savedPrefs.streamQuality,
    playStartTime: 0,
    partyRoomId: null,
    isHost: false,
    aiDjEnabled: false,

setTrack: (track) => set({ currentTrack: track }),

playTrack: async (track) => {
      if (jamHooks.intercept?.('play', track)) return;
      const seq = ++playSeq;
      const stale = () => seq !== playSeq;
      const state = get();

      if (state.aiDjEnabled && 'speechSynthesis' in window) {
        const msg = new SpeechSynthesisUtterance(`Next up, we have ${track.title} by ${track.artist}. Enjoy.`);
        msg.rate = 0.9;
        msg.pitch = 1.1;
        window.speechSynthesis.speak(msg);
      }

      const addHistory = !skipHistoryOnce && state.currentTrack && state.currentTrack.id !== track.id;
      skipHistoryOnce = false;
      altCursor.delete(track.id);
      shufflePlayed.add(track.id);

      set({
        isLoading: true,
        isBuffering: false,
        currentTrack: track,
        lyrics: null,
        scrobbled: false,
        playStartTime: Date.now(),
        currentTime: 0,
        duration: track.duration || 0,
        ...(addHistory ? { history: [...state.history.slice(-50), state.currentTrack!] } : {}),
      });

      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: track.title,
          artist: track.artist,
          album: track.album || '',
          artwork: track.thumbnail ? [{ src: track.thumbnail, sizes: '512x512' }] : [],
        });
      }

      if (track.source !== 'podcast') {
        fetchLyrics(track.title, track.artist, track.duration, track.album, track.source).then(lyrics => {
          if (!stale()) set({ lyrics });
        }).catch(() => {});
      }

      const crossfade = state.crossfadeEnabled && state.isPlaying;
      let ok = false;
      try {
        ok = await startStream(track, seq, crossfade);
      } catch (error) {
        console.error('[Player] Play failed:', error);
      }
      if (stale()) return;
      if (!ok) {
        onPlaybackFailed(track);
        return;
      }

      activeSeq = seq;
      if (!offlineBlobUrl || audioEngine.getActiveAudio().src !== offlineBlobUrl) setOfflineBlob(null);
      set({ isPlaying: true, isLoading: false, audioElement: audioEngine.getActiveAudio() });

      if (window.NativeBridge) window.NativeBridge.updateMetadata(track.title, track.artist);
      setMediaSessionState(true);
      emitTauri('track_changed', { title: track.title, artist: track.artist });
      scrobbleNowPlaying(track).catch(() => {});
      useLibraryStore.getState().addToRecentlyPlayed(track);

      if (isTauriApp()) {
        try {
          let permissionGranted = await isPermissionGranted();
          if (!permissionGranted) permissionGranted = (await requestPermission()) === 'granted';
          if (permissionGranted && !stale()) sendNotification({ title: 'Now Playing', body: `${track.title} • ${track.artist}` });
        } catch {}
      }
    },

togglePlay: () => {
      if (get().isPlaying) get().pause();
      else get().resume();
    },

pause: () => {
      if (jamHooks.intercept?.('pause')) return;
      audioEngine.pause();
      set({ isPlaying: false });
      setMediaSessionState(false);
      jamHooks.changed?.();
    },

resume: async () => {
      const { currentTrack, isLoading } = get();
      if (!currentTrack || jamHooks.intercept?.('resume')) return;
      if (!audioEngine.hasSource()) {
        if (!isLoading) get().playTrack(currentTrack);
        return;
      }
      try {
        await audioEngine.resume();
      } catch (e) {
        console.warn('[Player] Resume failed:', e);
        return;
      }
      set({ isPlaying: true });
      setMediaSessionState(true);
      jamHooks.changed?.();
    },

seekTo: (time) => {
      if (jamHooks.intercept?.('seek', time)) return;
      audioEngine.seek(time);
      set({ currentTime: time });
      updatePositionState(time, get().duration);
      jamHooks.changed?.();
    },

setVolume: (vol) => {
      audioEngine.setVolume(vol);
      set({ volume: vol, isMuted: vol === 0 });
    },

toggleMute: () => {
      const { isMuted, volume } = get();
      if (isMuted) {
        const v = volume || 0.7;
        audioEngine.setVolume(v);
        set({ isMuted: false, volume: v });
      } else {
        audioEngine.setVolume(0);
        set({ isMuted: true });
      }
    },

nextTrack: () => {
      if (jamHooks.intercept?.('next')) return false;
      const { queue, queueIndex, repeat, shuffle, autoplayEnabled } = get();
      if (queue.length === 0) return false;

      let nextIndex = -1;
      if (shuffle && queue.length > 1) {
        let pool = queue.map((_, i) => i).filter(i => i !== queueIndex && !shufflePlayed.has(queue[i].id));
        if (!pool.length && repeat === 'all') {
          shufflePlayed.clear();
          pool = queue.map((_, i) => i).filter(i => i !== queueIndex);
        }
        if (pool.length) nextIndex = pool[Math.floor(Math.random() * pool.length)];
      } else if (queueIndex + 1 < queue.length) {
        nextIndex = queueIndex + 1;
      } else if (repeat === 'all') {
        nextIndex = 0;
      }

      if (nextIndex < 0) {
        if (!autoplayEnabled) return false;
        autoRadio();
        return true;
      }

      set({ queueIndex: nextIndex });
      get().playTrack(queue[nextIndex]);
      return true;
    },

prevTrack: () => {
      if (jamHooks.intercept?.('prev')) return;
      const { queue, queueIndex, shuffle, history, repeat } = get();

      if (audioEngine.getActiveAudio().currentTime > 3) {
        get().seekTo(0);
        return;
      }

      if (shuffle && history.length) {
        const prev = history[history.length - 1];
        const idx = queue.findIndex(t => t.id === prev.id);
        set({ history: history.slice(0, -1), ...(idx >= 0 ? { queueIndex: idx } : {}) });
        skipHistoryOnce = true;
        get().playTrack(prev);
        return;
      }

      let prevIndex = queueIndex - 1;
      if (prevIndex < 0 && repeat === 'all') prevIndex = queue.length - 1;
      if (prevIndex >= 0 && queue[prevIndex]) {
        set({ queueIndex: prevIndex });
        get().playTrack(queue[prevIndex]);
      } else {
        get().seekTo(0);
      }
    },

addToQueue: (track) => {
      const list = Array.isArray(track) ? track : [track];
      if (!list.length) return;
      set(s => ({ queue: [...s.queue, ...list] }));
      useToastStore.getState().addToast(list.length === 1 ? `Added "${list[0].title}" to queue` : `Added ${list.length} tracks to queue`);
    },

    playNext: (track) => {
      const s = get();
      if (!s.currentTrack && !s.queue.length) {
        get().setQueue([track], 0);
        return;
      }
      const at = s.queueIndex + 1;
      const rest = s.queue.slice(at).filter(t => t.id !== track.id);
      set({ queue: [...s.queue.slice(0, at), track, ...rest] });
      shufflePlayed.delete(track.id);
      useToastStore.getState().addToast(`"${track.title}" will play next`);
    },

    playTracks: (tracks, startIndex = 0, opts) => {
      if (!tracks.length) return;
      let start = Math.min(Math.max(0, startIndex), tracks.length - 1);
      if (opts?.shuffle !== undefined) set({ shuffle: opts.shuffle });
      if (opts?.shuffle) start = Math.floor(Math.random() * tracks.length);
      get().setQueue([...tracks], start);
    },

    startRadio: (seed) => {
      get().setQueue([seed], 0);
      const seq = playSeq;
      useToastStore.getState().addToast(`Starting radio from "${seed.title}"`);
      registry.getRadio(seed, 30).then(tracks => {
        const st = get();
        if (seq !== playSeq && st.queue[0]?.id !== seed.id) return;
        const known = new Set(st.queue.map(t => t.id));
        const fresh = (tracks || []).filter(t => !known.has(t.id) && (known.add(t.id), true));
        if (!fresh.length) {
          useToastStore.getState().addToast('Radio: Could not find similar tracks', 'error');
          return;
        }
        set(q => ({ queue: [...q.queue, ...fresh] }));
      }).catch(() => useToastStore.getState().addToast('Radio: Error finding tracks', 'error'));
    },

    clearUpcoming: () => set(s => ({ queue: s.queue.slice(0, Math.max(0, s.queueIndex + 1)) })),

    setStreamQuality: (q) => set({ streamQuality: q }),

    removeFromQueue: (index) => {
      set(s => ({
        queue: s.queue.filter((_, i) => i !== index),
        queueIndex: index <= s.queueIndex ? s.queueIndex - 1 : s.queueIndex,
      }));
    },

    reorderQueue: (oldIndex, newIndex) => {
      const { queue, queueIndex } = get();
      const newQueue = [...queue];
      const [moved] = newQueue.splice(oldIndex, 1);
      newQueue.splice(newIndex, 0, moved);

      let newQueueIndex = queueIndex;
      if (queueIndex === oldIndex) {
        newQueueIndex = newIndex;
      } else if (queueIndex > oldIndex && queueIndex <= newIndex) {
        newQueueIndex--;
      } else if (queueIndex < oldIndex && queueIndex >= newIndex) {
        newQueueIndex++;
      }

      set({ queue: newQueue, queueIndex: newQueueIndex });
    },

clearQueue: () => {
      set({ queue: [], queueIndex: -1 });
      shufflePlayed.clear();
      useToastStore.getState().addToast('Queue cleared');
    },

setQueue: (tracks, startIndex = 0) => {
      shufflePlayed.clear();
      set({ queue: tracks, queueIndex: startIndex });
      if (tracks[startIndex]) {
        get().playTrack(tracks[startIndex]);
      }
    },

toggleShuffle: () => {
      shufflePlayed.clear();
      set(s => ({ shuffle: !s.shuffle }));
    },
    toggleRepeat: () => set(s => ({
      repeat: s.repeat === 'off' ? 'all' : s.repeat === 'all' ? 'one' : 'off',
    })),
    toggleLyrics: () => set(s => ({
      lyricsVisible: !s.lyricsVisible,
      nowPlayingExpanded: !s.lyricsVisible ? true : s.nowPlayingExpanded
    })),
    toggleNowPlaying: () => set(s => ({ nowPlayingExpanded: !s.nowPlayingExpanded })),
    toggleCrossfade: () => set(s => ({ crossfadeEnabled: !s.crossfadeEnabled })),
    toggleKaraokeMode: () => set(s => ({ karaokeMode: !s.karaokeMode })),
    setCurrentTime: (time) => set({ currentTime: time }),

setEQPreset: (preset) => {
      const key = (preset in EQ_PRESETS ? preset : 'flat') as keyof typeof EQ_PRESETS;
      audioEngine.setEQ(EQ_PRESETS[key]);
      set({ eqPreset: key });
    },

startSleepTimer: (minutes) => {
      audioEngine.startSleepTimer(minutes);
      set({ sleepTimerRemaining: minutes * 60 * 1000 });
    },

stopSleepTimer: () => {
      audioEngine.stopSleepTimer();
      set({ sleepTimerRemaining: null });
    },

    setPlaybackSpeed: (speed) => {
      audioEngine.setPlaybackRate(speed);
      set({ playbackSpeed: speed });
    },

    toggleNormalization: () => {
      const enabled = !get().normalizationEnabled;
      audioEngine.setNormalization(enabled);
      set({ normalizationEnabled: enabled });
    },

    toggleAutoplay: () => set(s => ({ autoplayEnabled: !s.autoplayEnabled })),

    setTheme: (theme, customColor) => {
      applyTheme(theme, customColor);
      set({ theme });
    },
    // Listening party == Jam (src/social/jam.ts owns the realtime session and mirrors partyRoomId/isHost here).
    joinParty: (code) => { import('../social/jam').then(m => m.joinJam(code)).catch(() => {}); },
    leaveParty: () => { import('../social/jam').then(m => m.leaveJam()).catch(() => {}); },
    createParty: () => { import('../social/jam').then(m => m.startJam()).catch(() => {}); },
    toggleAiDj: () => set(s => ({ aiDjEnabled: !s.aiDjEnabled })),
  };
});

usePlayerStore.subscribe((s, p) => {
  if (
    s.volume !== p.volume || s.isMuted !== p.isMuted || s.crossfadeEnabled !== p.crossfadeEnabled ||
    s.eqPreset !== p.eqPreset || s.playbackSpeed !== p.playbackSpeed || s.normalizationEnabled !== p.normalizationEnabled ||
    s.autoplayEnabled !== p.autoplayEnabled || s.shuffle !== p.shuffle || s.repeat !== p.repeat ||
    s.streamQuality !== p.streamQuality
  ) {
    persist(PREFS_KEY, {
      volume: s.volume, isMuted: s.isMuted, crossfadeEnabled: s.crossfadeEnabled, eqPreset: s.eqPreset,
      playbackSpeed: s.playbackSpeed, normalizationEnabled: s.normalizationEnabled, autoplayEnabled: s.autoplayEnabled,
      shuffle: s.shuffle, repeat: s.repeat, streamQuality: s.streamQuality,
    });
  }
});

interface SearchState {
  query: string;
  results: SearchResults | null;
  isSearching: boolean;
  searchByLyrics: boolean;
  recentSearches: string[];
  setQuery: (q: string) => void;
  setSearchByLyrics: (val: boolean) => void;
  search: (q: string) => Promise<void>;
  clearResults: () => void;
}

let searchSeq = 0;
let searchCtrl: AbortController | null = null;

export const useSearchStore = create<SearchState>((set, get) => ({
  query: '',
  results: null,
  isSearching: false,
  searchByLyrics: false,
  recentSearches: load<string[]>('nuctify_recent_searches', []).filter(s => typeof s === 'string'),

setQuery: (q) => set({ query: q }),
setSearchByLyrics: (val) => set({ searchByLyrics: val }),

search: async (raw) => {
    const q = raw.trim();
    if (!q) return;
    searchCtrl?.abort();
    const ctrl = searchCtrl = new AbortController();
    const seq = ++searchSeq;
    set({ isSearching: true, query: q });

try {
      let results: SearchResults;
      if (get().searchByLyrics) {
        results = {
          tracks: await searchTracksByLyrics(q),
          albums: [],
          artists: [],
          source: 'youtube'
        };
      } else {
        results = await registry.searchAll(q, 20, { signal: ctrl.signal });
      }
      if (seq !== searchSeq) return;
      set({ results, isSearching: false });

const recent = get().recentSearches;
      const updated = [q, ...recent.filter(s => s !== q)].slice(0, 10);
      set({ recentSearches: updated });
      persist('nuctify_recent_searches', updated);
    } catch (error) {
      if (seq !== searchSeq) return;
      console.error('[Search] Failed:', error);
      set({ isSearching: false });
    }
  },

clearResults: () => {
    searchCtrl?.abort();
    searchSeq++;
    set({ results: null, query: '', isSearching: false });
  },
}));

interface LibraryState {
  likedTracks: Track[];
  playlists: Playlist[];
  recentlyPlayed: Track[];
  playCounts: Record<string, { count: number; title: string; artist: string; source: string; thumbnail?: string; lastPlayed: number }>;
  listeningHistory: HistoryEntry[];
  followedArtists: Artist[];
  savedAlbums: Album[];
  pinnedPlaylists: string[];
  toggleLike: (track: Track) => void;
  isLiked: (trackId: string) => boolean;
  createPlaylist: (name: string, tracks?: Track[]) => string;
  addToPlaylist: (playlistId: string, track: Track) => boolean;
  addTracksToPlaylist: (playlistId: string, tracks: Track[]) => number;
  renamePlaylist: (playlistId: string, name: string) => void;
  updatePlaylistDetails: (playlistId: string, details: { name?: string; description?: string; thumbnail?: string }) => void;
  reorderPlaylistTracks: (playlistId: string, from: number, to: number) => void;
  togglePinPlaylist: (playlistId: string) => void;
  isPinned: (playlistId: string) => boolean;
  toggleFollowArtist: (artist: Artist) => void;
  isFollowing: (artistId: string) => boolean;
  toggleSaveAlbum: (album: Album) => void;
  isAlbumSaved: (albumId: string) => boolean;
  addToHistory: (track: Track) => void;
  getRecentlyPlayed: (limit?: number) => Track[];
  getHistorySince: (since: number) => HistoryEntry[];
  clearHistory: () => void;
  removeFromPlaylist: (playlistId: string, trackId: string) => void;
  deletePlaylist: (playlistId: string) => void;
  addToRecentlyPlayed: (track: Track) => void;
  incrementPlayCount: (track: Track) => void;
  importPlaylist: (name: string, tracks: Track[]) => void;
  likeMultiple: (tracks: Track[]) => void;
  createSmartPlaylist: (name: string, rules: SmartPlaylistRule[]) => void;
  refreshSmartPlaylists: () => void;
  syncToCloud: () => Promise<void>;
  fetchFromCloud: () => Promise<void>;
}

export interface HistoryEntry { track: Track; playedAt: number }

const DIRTY_KEY = 'nuctify_sync_dirty';
const HISTORY_KEY = 'nuctify_history';
const ARTISTS_KEY = 'nuctify_followed_artists';
const ALBUMS_KEY = 'nuctify_saved_albums';
const PINNED_KEY = 'nuctify_pinned_playlists';
const HISTORY_MAX = 500;

const validHistory = (v: any): v is HistoryEntry => isObject(v) && isObject(v.track) && typeof v.playedAt === 'number';
const mergeHistory = (a: HistoryEntry[], b: HistoryEntry[]): HistoryEntry[] => {
  const seen = new Set<string>();
  return [...a, ...b].filter(validHistory).sort((x, y) => y.playedAt - x.playedAt).filter(e => {
    const k = `${e.track.id}@${e.playedAt}`;
    return seen.has(k) ? false : (seen.add(k), true);
  }).slice(0, HISTORY_MAX);
};
const validEntity = (a: any) => isObject(a) && typeof a.id === 'string';
let syncTimer: ReturnType<typeof setTimeout> | null = null;
let syncChain: Promise<void> = Promise.resolve();

const markDirty = () => {
  try { localStorage.setItem(DIRTY_KEY, '1'); } catch {}
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => useLibraryStore.getState().syncToCloud(), 1500);
};

const savePlaylists = (playlists: Playlist[]) => {
  persist('nuctify_playlists', playlists);
  markDirty();
};

const saveLiked = (liked: Track[]) => {
  persist('nuctify_liked', liked);
  markDirty();
};

const touch = (p: Playlist): Playlist => ({ ...p, updatedAt: Date.now() });
const saveAndSync = (key: string, value: unknown) => {
  persist(key, value);
  markDirty();
};
let historyTimer: ReturnType<typeof setTimeout> | null = null;

export const useLibraryStore = create<LibraryState>((set, get) => ({
  likedTracks: load<Track[]>('nuctify_liked', []).filter(isObject).map(slimTrack),
  playlists: load<Playlist[]>('nuctify_playlists', []).filter(p => isObject(p) && Array.isArray(p.tracks)).map(slimPlaylist),
  recentlyPlayed: load<Track[]>('nuctify_recent', []).filter(isObject),
  playCounts: load('nuctify_play_counts', {}, isObject),
  listeningHistory: load<HistoryEntry[]>(HISTORY_KEY, []).filter(validHistory).slice(0, HISTORY_MAX),
  followedArtists: load<Artist[]>(ARTISTS_KEY, []).filter(validEntity),
  savedAlbums: load<Album[]>(ALBUMS_KEY, []).filter(validEntity),
  pinnedPlaylists: load<string[]>(PINNED_KEY, []).filter(id => typeof id === 'string'),

toggleLike: (track) => {
    const liked = get().likedTracks;
    const exists = liked.some(t => t.id === track.id);
    const updated = exists
      ? liked.filter(t => t.id !== track.id)
      : [{ ...slimTrack(track), isLiked: true }, ...liked];
    set({ likedTracks: updated });
    saveLiked(updated);
    get().refreshSmartPlaylists();
    useToastStore.getState().addToast(
      exists ? `Removed "${track.title}" from liked` : `Saved "${track.title}" to liked`
    );
  },

isLiked: (trackId) => get().likedTracks.some(t => t.id === trackId),

createPlaylist: (name, tracks = []) => {
    const seen = new Set<string>();
    const playlist: Playlist = {
      id: `pl-${Date.now()}`,
      name,
      tracks: tracks.filter(t => !seen.has(t.id) && (seen.add(t.id), true)).map(slimTrack),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isUserCreated: true,
    };
    const updated = [...get().playlists, playlist];
    set({ playlists: updated });
    savePlaylists(updated);
    useToastStore.getState().addToast(`Created playlist "${name}"`, 'success');
    return playlist.id;
  },

  createSmartPlaylist: (name, rules) => {
    const playlist: Playlist = {
      id: `smart-${Date.now()}`,
      name,
      tracks: [],
      rules,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isUserCreated: true,
    };
    set(s => ({ playlists: [...s.playlists, playlist] }));
    get().refreshSmartPlaylists();
  },

  refreshSmartPlaylists: () => {
    const { likedTracks, playlists } = get();
    if (!playlists.some(p => p.rules && p.rules.length > 0)) return;
    const updated = playlists.map(p => {
      if (!p.rules || p.rules.length === 0) return p;

      const smartTracks = likedTracks.filter(track => {
        return p.rules!.every(rule => {
          const val = track[rule.field as keyof Track];
          if (val === undefined || val === null) return false;

          switch (rule.operator) {
            case 'contains': return String(val).toLowerCase().includes(String(rule.value).toLowerCase());
            case 'equals': return String(val).toLowerCase() === String(rule.value).toLowerCase();
            case 'greater': return Number(val) > Number(rule.value);
            case 'less': return Number(val) < Number(rule.value);
            default: return false;
          }
        });
      });

      return touch({ ...p, tracks: smartTracks });
    });
    set({ playlists: updated });
    savePlaylists(updated);
  },

addToPlaylist: (playlistId, track) => get().addTracksToPlaylist(playlistId, [track]) > 0,

  addTracksToPlaylist: (playlistId, tracks) => {
    let added = 0;
    const playlists = get().playlists.map(p => {
      if (p.id !== playlistId) return p;
      const ids = new Set(p.tracks.map(t => t.id));
      const fresh = tracks.filter(t => !ids.has(t.id) && (ids.add(t.id), true));
      added = fresh.length;
      return added ? touch({ ...p, tracks: [...p.tracks, ...fresh.map(slimTrack)] }) : p;
    });
    if (!added) return 0;
    set({ playlists });
    savePlaylists(playlists);
    return added;
  },

  renamePlaylist: (playlistId, name) => get().updatePlaylistDetails(playlistId, { name }),

  updatePlaylistDetails: (playlistId, details) => {
    const clean: Partial<Playlist> = {};
    if (details.name !== undefined && details.name.trim()) clean.name = details.name.trim();
    if (details.description !== undefined) clean.description = details.description.trim() || undefined;
    if (details.thumbnail !== undefined) clean.thumbnail = details.thumbnail || undefined;
    const playlists = get().playlists.map(p => p.id === playlistId ? touch({ ...p, ...clean }) : p);
    set({ playlists });
    savePlaylists(playlists);
  },

  reorderPlaylistTracks: (playlistId, from, to) => {
    const playlists = get().playlists.map(p => {
      if (p.id !== playlistId || from === to || from < 0 || to < 0 || from >= p.tracks.length || to >= p.tracks.length) return p;
      const tracks = [...p.tracks];
      const [moved] = tracks.splice(from, 1);
      tracks.splice(to, 0, moved);
      return touch({ ...p, tracks });
    });
    set({ playlists });
    savePlaylists(playlists);
  },

  togglePinPlaylist: (playlistId) => {
    const cur = get().pinnedPlaylists;
    const pinnedPlaylists = cur.includes(playlistId) ? cur.filter(id => id !== playlistId) : [playlistId, ...cur];
    set({ pinnedPlaylists });
    saveAndSync(PINNED_KEY, pinnedPlaylists);
  },

  isPinned: (playlistId) => get().pinnedPlaylists.includes(playlistId),

  toggleFollowArtist: (artist) => {
    const cur = get().followedArtists;
    const exists = cur.some(a => a.id === artist.id);
    const { bio: _bio, ...slim } = artist;
    const followedArtists = exists ? cur.filter(a => a.id !== artist.id) : [slim, ...cur];
    set({ followedArtists });
    saveAndSync(ARTISTS_KEY, followedArtists);
    useToastStore.getState().addToast(exists ? `Unfollowed ${artist.name}` : `Following ${artist.name}`);
  },

  isFollowing: (artistId) => get().followedArtists.some(a => a.id === artistId),

  toggleSaveAlbum: (album) => {
    const cur = get().savedAlbums;
    const exists = cur.some(a => a.id === album.id);
    const savedAlbums = exists ? cur.filter(a => a.id !== album.id) : [album, ...cur];
    set({ savedAlbums });
    saveAndSync(ALBUMS_KEY, savedAlbums);
    useToastStore.getState().addToast(exists ? `Removed "${album.title}" from library` : `Saved "${album.title}" to library`);
  },

  isAlbumSaved: (albumId) => get().savedAlbums.some(a => a.id === albumId),

  addToHistory: (track) => {
    const listeningHistory = [{ track: slimTrack(track), playedAt: Date.now() }, ...get().listeningHistory].slice(0, HISTORY_MAX);
    set({ listeningHistory });
    if (historyTimer) clearTimeout(historyTimer);
    historyTimer = setTimeout(() => persist(HISTORY_KEY, get().listeningHistory), 1000);
  },

  getRecentlyPlayed: (limit = 50) => {
    const seen = new Set<string>();
    const out: Track[] = [];
    for (const e of get().listeningHistory) {
      if (seen.has(e.track.id)) continue;
      seen.add(e.track.id);
      out.push(e.track);
      if (out.length >= limit) break;
    }
    return out;
  },

  getHistorySince: (since) => get().listeningHistory.filter(e => e.playedAt >= since),

  clearHistory: () => {
    set({ listeningHistory: [], recentlyPlayed: [] });
    persist(HISTORY_KEY, []);
    persist('nuctify_recent', []);
    markDirty();
  },

removeFromPlaylist: (playlistId, trackId) => {
    const playlists = get().playlists.map(p => {
      if (p.id === playlistId) {
        return touch({ ...p, tracks: p.tracks.filter(t => t.id !== trackId) });
      }
      return p;
    });
    set({ playlists });
    savePlaylists(playlists);
  },

deletePlaylist: (playlistId) => {
    const playlists = get().playlists.filter(p => p.id !== playlistId);
    set({ playlists });
    savePlaylists(playlists);
  },

  addToRecentlyPlayed: (track) => {
    get().addToHistory(track);
    const recent = get().recentlyPlayed;
    if (recent[0]?.id === track.id) return;
    const updated = [slimTrack(track), ...recent.filter(t => t.id !== track.id)].slice(0, 50);
    set({ recentlyPlayed: updated });
    persist('nuctify_recent', updated);
  },
  incrementPlayCount: (track) => {
    let counts = { ...get().playCounts };
    const existing = counts[track.id];
    counts[track.id] = {
      count: (existing?.count || 0) + 1,
      title: track.title,
      artist: track.artist,
      source: track.source,
      thumbnail: track.thumbnail,
      lastPlayed: Date.now(),
    };
    const keys = Object.keys(counts);
    if (keys.length > 2000) {
      counts = Object.fromEntries(
        Object.entries(counts).sort((a, b) => b[1].lastPlayed - a[1].lastPlayed).slice(0, 2000)
      );
    }
    set({ playCounts: counts });
    persist('nuctify_play_counts', counts);
  },
  importPlaylist: (name, tracks) => {
    const playlist: Playlist = {
      id: `pl-${Date.now()}`,
      name,
      tracks: tracks.map(slimTrack),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isUserCreated: true,
    };
    const updated = [...get().playlists, playlist];
    set({ playlists: updated });
    savePlaylists(updated);
    useToastStore.getState().addToast(`Imported playlist "${name}" with ${tracks.length} tracks`, 'success');
  },
  likeMultiple: (tracks) => {
    const liked = get().likedTracks;
    const ids = new Set(liked.map(l => l.id));
    const newItems = tracks.filter(t => !ids.has(t.id));
    if (newItems.length === 0) return;
    const updated = [...newItems.map(t => ({ ...slimTrack(t), isLiked: true })), ...liked];
    set({ likedTracks: updated });
    saveLiked(updated);
    get().refreshSmartPlaylists();
  },
  syncToCloud: () => {
    syncChain = syncChain.then(async () => {
      const user = useAuthStore.getState().user;
      if (!user || user.id.startsWith('local-')) return;
      try {
        await syncUserData(user.id, 'liked', get().likedTracks);
        await syncUserData(user.id, 'playlists', get().playlists);
        const { followedArtists, savedAlbums, pinnedPlaylists, listeningHistory } = get();
        await syncUserData(user.id, 'library', { followedArtists, savedAlbums, pinnedPlaylists });
        await syncUserData(user.id, 'history', listeningHistory);
        try { localStorage.removeItem(DIRTY_KEY); } catch {}
      } catch (e) {
        console.error('[Sync] Upload failed:', e);
      }
    });
    return syncChain;
  },
  fetchFromCloud: async () => {
    const user = useAuthStore.getState().user;
    if (!user || user.id.startsWith('local-')) return;
    if (typeof location !== 'undefined' && location.hash.includes('mini-player')) return;

    let dirty = false;
    try { dirty = localStorage.getItem(DIRTY_KEY) === '1'; } catch {}
    if (dirty) {
      await get().syncToCloud();
      return;
    }

    const [liked, playlists, library, history] = await Promise.all([
      fetchUserData(user.id, 'liked').catch(() => null),
      fetchUserData(user.id, 'playlists').catch(() => null),
      fetchUserData(user.id, 'library').catch(() => null),
      fetchUserData(user.id, 'history').catch(() => null),
    ]);

    let stillClean = true;
    try { stillClean = localStorage.getItem(DIRTY_KEY) !== '1'; } catch {}
    if (!stillClean) return;

    if (Array.isArray(liked)) {
      const slim = liked.filter(isObject).map(slimTrack);
      set({ likedTracks: slim });
      persist('nuctify_liked', slim);
    }
    if (Array.isArray(playlists)) {
      const slim = playlists.filter((p: any) => isObject(p) && Array.isArray(p.tracks)).map(slimPlaylist);
      set({ playlists: slim });
      persist('nuctify_playlists', slim);
    }
    if (isObject(library)) {
      const st = get();
      const followedArtists: Artist[] = Array.isArray(library.followedArtists) ? library.followedArtists.filter(validEntity) : st.followedArtists;
      const savedAlbums: Album[] = Array.isArray(library.savedAlbums) ? library.savedAlbums.filter(validEntity) : st.savedAlbums;
      const pinnedPlaylists: string[] = Array.isArray(library.pinnedPlaylists) ? library.pinnedPlaylists.filter((id: any) => typeof id === 'string') : st.pinnedPlaylists;
      set({ followedArtists, savedAlbums, pinnedPlaylists });
      persist(ARTISTS_KEY, followedArtists);
      persist(ALBUMS_KEY, savedAlbums);
      persist(PINNED_KEY, pinnedPlaylists);
    }
    if (Array.isArray(history)) {
      const remote: HistoryEntry[] = history.filter(validHistory).map((e: HistoryEntry) => ({ track: slimTrack(e.track), playedAt: e.playedAt }));
      const listeningHistory = mergeHistory(get().listeningHistory, remote);
      set({ listeningHistory });
      persist(HISTORY_KEY, listeningHistory);
    }
  },
}));

audioEngine.onTimeUpdate = (currentTime, duration) => {
  const state = usePlayerStore.getState();
  if (activeSeq !== playSeq) return;
  usePlayerStore.setState({ currentTime, duration: duration > 0 ? duration : state.duration });

  if (Math.floor(currentTime) % 5 === 0) updatePositionState(currentTime, duration);

  if (!state.scrobbled && state.currentTrack && duration > 0 && shouldScrobble(duration, currentTime)) {
    usePlayerStore.setState({ scrobbled: true });
    scrobbleTrack(state.currentTrack).catch(() => {});
    useLibraryStore.getState().incrementPlayCount(state.currentTrack);
  }
};

if (typeof window !== 'undefined') {
  if ('mediaSession' in navigator) {
    const setHandler = (action: MediaSessionAction, handler: MediaSessionActionHandler) => {
      try { navigator.mediaSession.setActionHandler(action, handler); } catch {}
    };
    setHandler('play', () => usePlayerStore.getState().resume());
    setHandler('pause', () => usePlayerStore.getState().pause());
    setHandler('previoustrack', () => usePlayerStore.getState().prevTrack());
    setHandler('nexttrack', () => { usePlayerStore.getState().nextTrack(); });
    setHandler('seekto', (details) => {
      if (details.seekTime != null) usePlayerStore.getState().seekTo(details.seekTime);
    });
  }

  window.addEventListener('native_media_control', (e: any) => {
    try {
      const data = typeof e.detail === 'string' ? JSON.parse(e.detail) : e.detail;
      const action = data?.action;
      const store = usePlayerStore.getState();

if (action === 'co.nuctify.app.PLAY' || action === 'play') store.resume();
      else if (action === 'co.nuctify.app.PAUSE' || action === 'pause') store.pause();
      else if (action === 'co.nuctify.app.NEXT' || action === 'next') store.nextTrack();
      else if (action === 'co.nuctify.app.PREV' || action === 'prev') store.prevTrack();
    } catch (err) {
      console.error('[NativeControl] Failed to parse action:', err);
    }
  });
}

interface DownloadsState {
  ids: Set<string>;
  progress: Record<string, number>;
  isDownloaded: (id: string) => boolean;
  download: (track: Track) => Promise<boolean>;
  remove: (id: string) => Promise<void>;
}

export const useDownloadsStore = create<DownloadsState>((set, get) => {
  onDownloadsChange(e => set({ ids: e.ids, progress: e.progress }));
  getDownloadedIds().then(ids => set({ ids, progress: getDownloadProgress() })).catch(() => {});
  return {
    ids: new Set<string>(),
    progress: {},
    isDownloaded: (id) => get().ids.has(id),
    download: async (track) => {
      if (get().ids.has(track.id) || track.id in get().progress) return true;
      try {
        await downloadTrack(track);
        useToastStore.getState().addToast(`Downloaded "${track.title}"`, 'success');
        return true;
      } catch (e: any) {
        useToastStore.getState().addToast(`Download failed: ${e?.message || track.title}`, 'error');
        return false;
      }
    },
    remove: async (id) => {
      try {
        await removeTrack(id);
      } catch {
        useToastStore.getState().addToast('Could not remove download', 'error');
      }
    },
  };
});
