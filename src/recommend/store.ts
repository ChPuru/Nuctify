import { useMemo } from 'react';
import { create } from 'zustand';
import { useLibraryStore } from '../store';
import type { Track } from '../providers/types';
import { buildProfile, type LibrarySnapshot, type Profile } from './profile';
import { buildMix, describe, getSpecs, isColdStart, type MixSpec } from './mixes';
import { dayKey, slim, weekKey } from './util';

export interface CachedMix { id: string; title: string; description: string; key: string; tracks: Track[]; at: number }

const KEY = 'nuctify_mixes';
const periodKey = (period: MixSpec['period']) => (period === 'week' ? weekKey() : dayKey());
const valid = (m: CachedMix) => m && Array.isArray(m.tracks) && (m.key === dayKey() || m.key === weekKey());

function load(): Record<string, CachedMix> {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}') as Record<string, CachedMix>;
    return Object.fromEntries(Object.entries(raw).filter(([, m]) => valid(m)));
  } catch {
    return {};
  }
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
function save(mixes: Record<string, CachedMix>) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const list = Object.values(mixes).filter(valid).sort((a, b) => b.at - a.at);
    for (let n = list.length; n > 0; n = Math.floor(n / 2)) {
      try { localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(list.slice(0, n).map((m) => [m.id, m])))); return; } catch { /* quota: keep fewer */ }
    }
  }, 400);
}

const snapshot = (): LibrarySnapshot => {
  const s = useLibraryStore.getState();
  return {
    listeningHistory: s.listeningHistory, playCounts: s.playCounts, likedTracks: s.likedTracks,
    followedArtists: s.followedArtists ?? [], savedAlbums: s.savedAlbums ?? [], playlists: s.playlists,
  };
};

let profileCache: { sig: string; p: Profile } | undefined;
export function currentProfile(lib = snapshot()): Profile {
  const sig = `${lib.listeningHistory.length}:${lib.listeningHistory[0]?.playedAt}:${lib.likedTracks.length}:${lib.followedArtists.length}:${lib.savedAlbums.length}:${lib.playlists.length}:${dayKey()}`;
  if (profileCache?.sig !== sig) profileCache = { sig, p: buildProfile(lib) };
  return profileCache.p;
}

interface MixState {
  mixes: Record<string, CachedMix>;
  pending: Record<string, boolean>;
  ensure: (spec: MixSpec, force?: boolean) => Promise<CachedMix | null>;
}

const inflight = new Map<string, Promise<CachedMix | null>>();

export const useMixStore = create<MixState>((set, get) => ({
  mixes: load(),
  pending: {},
  ensure: (spec, force) => {
    const key = periodKey(spec.period);
    const cached = get().mixes[spec.id];
    if (!force && cached?.key === key && cached.tracks.length) return Promise.resolve(cached);
    const running = inflight.get(spec.id);
    if (running) return running;
    set((s) => ({ pending: { ...s.pending, [spec.id]: true } }));
    const job = (async () => {
      try {
        const tracks = (await buildMix(spec, currentProfile(), key)).map(slim);
        const lead = spec.kind === 'artist' ? spec.artists?.[0]?.name : undefined;
        const description = spec.kind === 'daily' || spec.kind === 'artist' || spec.kind === 'time' || spec.kind === 'weekday'
          ? describe(tracks, lead) || spec.description
          : spec.description;
        const mix: CachedMix = { id: spec.id, title: spec.title, description, key, tracks, at: Date.now() };
        if (tracks.length) {
          set((s) => ({ mixes: { ...s.mixes, [spec.id]: mix } }));
          save(get().mixes);
        }
        return mix;
      } catch {
        return null;
      } finally {
        inflight.delete(spec.id);
        set((s) => { const { [spec.id]: _, ...pending } = s.pending; return { pending }; });
      }
    })();
    inflight.set(spec.id, job);
    return job;
  },
}));

const EMPTY: never[] = [];

/** Reactive list of available mixes computed from local library data (sync, cheap). */
export function useMixSpecs(): { specs: MixSpec[]; cold: boolean } {
  const listeningHistory = useLibraryStore((s) => s.listeningHistory);
  const playCounts = useLibraryStore((s) => s.playCounts);
  const likedTracks = useLibraryStore((s) => s.likedTracks);
  const followedArtists = useLibraryStore((s) => s.followedArtists) ?? EMPTY;
  const savedAlbums = useLibraryStore((s) => s.savedAlbums) ?? EMPTY;
  const playlists = useLibraryStore((s) => s.playlists);
  const hour = new Date().getHours();
  return useMemo(() => {
    const lib: LibrarySnapshot = { listeningHistory, playCounts, likedTracks, followedArtists, savedAlbums, playlists };
    const p = currentProfile(lib);
    return { specs: getSpecs(p, lib), cold: isColdStart(p, lib) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listeningHistory, playCounts, likedTracks, followedArtists, savedAlbums, playlists, hour]);
}

export function findSpec(id: string): MixSpec | undefined {
  const lib = snapshot();
  return getSpecs(currentProfile(lib), lib).find((s) => s.id === id);
}
