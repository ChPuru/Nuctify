import type { Album, Artist, Playlist, Track } from '../providers/types';
import type { HistoryEntry } from '../store';
import { DAY, artistKey, primaryArtist, trackKey } from './util';

export interface LibrarySnapshot {
  listeningHistory: HistoryEntry[];
  playCounts: Record<string, { count: number; title: string; artist: string; source: string; thumbnail?: string; lastPlayed: number }>;
  likedTracks: Track[];
  followedArtists: Artist[];
  savedAlbums: Album[];
  playlists: Playlist[];
}

export interface ArtistStat {
  key: string;
  name: string;
  artistId?: string;
  image?: string;
  weight: number;
  tracks: Map<string, number>; // track id -> score
  language?: string;
  genre?: string;
  followed?: boolean;
}

export type TimeBucket = 'morning' | 'afternoon' | 'evening' | 'night';
export const bucketOf = (hour: number): TimeBucket =>
  hour >= 5 && hour < 12 ? 'morning' : hour >= 12 && hour < 17 ? 'afternoon' : hour >= 17 && hour < 22 ? 'evening' : 'night';

export interface Profile {
  index: Map<string, Track>;
  known: Set<string>;
  liked: Set<string>;
  artists: ArtistStat[];
  byKey: Map<string, ArtistStat>;
  cooc: Map<string, number>;
  skipped: Set<string>;
  overplayed: Set<string>;
  buckets: Record<TimeBucket, Map<string, number>>;
  weekdays: Map<string, number>[];
  recent30: Map<string, number>;
  lastPlayed: Map<string, number>;
  plays: Map<string, number>;
  historySize: number;
}

const inc = (m: Map<string, number>, k: string, v = 1) => m.set(k, (m.get(k) || 0) + v);
const pairKey = (a: string, b: string) => (a < b ? `${a}\u0001${b}` : `${b}\u0001${a}`);
const mode = (m: Map<string, number>) => [...m].sort((a, b) => b[1] - a[1])[0]?.[0];

export function buildProfile(lib: LibrarySnapshot, now = Date.now()): Profile {
  const index = new Map<string, Track>();
  const known = new Set<string>();
  const addTrack = (t: Track) => {
    if (!t?.id) return;
    if (!index.has(t.id)) index.set(t.id, t);
    known.add(t.id); known.add(trackKey(t));
  };
  const hist = lib.listeningHistory || [];
  hist.forEach((e) => addTrack(e.track));
  lib.likedTracks.forEach(addTrack);
  lib.playlists.forEach((p) => p.tracks.forEach(addTrack));

  const byKey = new Map<string, ArtistStat & { langs: Map<string, number>; genres: Map<string, number> }>();
  const stat = (t: { artist: string; artistId?: string; thumbnail?: string }) => {
    const key = artistKey(t.artist);
    let s = byKey.get(key);
    if (!s) byKey.set(key, (s = { key, name: primaryArtist(t.artist), weight: 0, tracks: new Map(), langs: new Map(), genres: new Map() }));
    if (!s.artistId && t.artistId) s.artistId = t.artistId;
    return s;
  };

  // skip detection: history is newest-first; a track is "skipped" when the next one started soon after it
  const skips = new Map<string, number>();
  const completes = new Map<string, number>();
  for (let i = 1; i < hist.length; i++) {
    const e = hist[i], listened = hist[i - 1].playedAt - e.playedAt;
    const dur = (e.track.duration || 180) * 1000;
    inc(listened < Math.min(30_000, dur * 0.4) ? skips : completes, e.track.id);
  }
  const skipped = new Set([...skips].filter(([id, n]) => n >= 2 && n > (completes.get(id) || 0)).map(([id]) => id));

  const buckets: Record<TimeBucket, Map<string, number>> = { morning: new Map(), afternoon: new Map(), evening: new Map(), night: new Map() };
  const weekdays = Array.from({ length: 7 }, () => new Map<string, number>());
  const recent30 = new Map<string, number>();
  const week = new Map<string, number>();
  const lastPlayed = new Map<string, number>();
  const plays = new Map<string, number>();
  const cooc = new Map<string, number>();

  let session = new Set<string>();
  const flush = () => {
    const a = [...session].slice(0, 12);
    for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) inc(cooc, pairKey(a[i], a[j]));
    session = new Set();
  };

  hist.forEach((e, i) => {
    const t = e.track, age = now - e.playedAt, isSkip = skips.has(t.id) && skipped.has(t.id);
    const w = (isSkip ? 0.2 : 1) * (0.35 + Math.exp(-age / (30 * DAY)));
    const s = stat(t);
    s.weight += w;
    inc(s.tracks, t.id, w);
    if (t.language) inc(s.langs, t.language.toLowerCase());
    if (t.genre) inc(s.genres, t.genre.toLowerCase());
    if (!s.image && t.thumbnail) s.image = t.thumbnail;
    inc(plays, t.id);
    if (!lastPlayed.has(t.id)) lastPlayed.set(t.id, e.playedAt);
    if (age < 30 * DAY) inc(recent30, t.id);
    if (age < 7 * DAY) inc(week, t.id);
    const d = new Date(e.playedAt);
    if (!isSkip) { inc(buckets[bucketOf(d.getHours())], t.id); inc(weekdays[d.getDay()], t.id); }
    if (i > 0 && hist[i - 1].playedAt - e.playedAt > 30 * 60_000) flush();
    session.add(s.key);
  });
  flush();

  // play counts beyond the capped history
  for (const [id, pc] of Object.entries(lib.playCounts || {})) {
    if (!pc || typeof pc.count !== 'number') continue;
    if (!lastPlayed.has(id) || pc.lastPlayed > lastPlayed.get(id)!) lastPlayed.set(id, pc.lastPlayed);
    if ((plays.get(id) || 0) < pc.count) plays.set(id, pc.count);
    if (!index.has(id)) continue;
    const s = stat(index.get(id)!);
    const extra = Math.max(0, pc.count - (s.tracks.has(id) ? 1 : 0)) * 0.15;
    s.weight += extra;
    inc(s.tracks, id, extra);
  }
  for (const t of lib.likedTracks) {
    const s = stat(t);
    s.weight += 1.5;
    inc(s.tracks, t.id, 2);
    if (!s.image && t.thumbnail) s.image = t.thumbnail;
  }
  for (const a of lib.followedArtists) {
    const s = stat({ artist: a.name, artistId: a.id });
    s.weight += 4;
    s.followed = true;
    if (a.image) s.image = a.image;
  }
  for (const al of lib.savedAlbums) stat({ artist: al.artist, artistId: al.artistId }).weight += 1;

  const artists = [...byKey.values()]
    .map(({ langs, genres, ...s }) => ({ ...s, language: mode(langs), genre: mode(genres) }))
    .filter((s) => s.key && s.key !== 'unknown')
    .sort((a, b) => b.weight - a.weight);

  return {
    index, known, liked: new Set(lib.likedTracks.map((t) => t.id)),
    artists, byKey: new Map(artists.map((a) => [a.key, a])), cooc,
    skipped, overplayed: new Set([...week].filter(([, n]) => n >= 6).map(([id]) => id)),
    buckets, weekdays, recent30, lastPlayed, plays, historySize: hist.length,
  };
}

export interface Cluster { artists: ArtistStat[]; weight: number }

/** Greedy clustering of artists by co-listening sessions, language and genre (max 6 clusters). */
export function clusterArtists(p: Profile, max = 6): Cluster[] {
  const pool = p.artists.filter((a) => a.weight >= 1).slice(0, 60);
  const sim = (a: ArtistStat, b: ArtistStat) => {
    const c = p.cooc.get(pairKey(a.key, b.key)) || 0;
    let s = c / Math.sqrt(Math.max(1, a.weight) * Math.max(1, b.weight));
    if (a.language && a.language === b.language) s += 0.3;
    if (a.genre && a.genre === b.genre) s += 0.3;
    return s;
  };
  const clusters: Cluster[] = [];
  for (const a of pool) {
    let best: Cluster | undefined, bestS = 0;
    for (const c of clusters) {
      const s = c.artists.slice(0, 5).reduce((m, b) => Math.max(m, sim(a, b)), 0);
      if (s > bestS) { bestS = s; best = c; }
    }
    if (best && (bestS >= 0.45 || clusters.length >= max)) {
      best.artists.push(a); best.weight += a.weight;
    } else if (clusters.length < max) {
      clusters.push({ artists: [a], weight: a.weight });
    }
  }
  return clusters.filter((c) => c.weight >= 3 || c.artists.length > 1).sort((a, b) => b.weight - a.weight);
}

export const topTracks = (m: Map<string, number>, p: Profile, n: number) =>
  [...m].sort((a, b) => b[1] - a[1]).map(([id]) => p.index.get(id)).filter((t): t is Track => !!t).slice(0, n);
