import type { Track } from '../providers/types';
import { registry } from '../providers';
import { useLibraryStore, slimTrack } from '../store';
import { requireSocial, genCode, normalizeCode, errMsg } from './common';

export interface TasteArtist { name: string; score: number }
export interface TasteTrack { track: Track; score: number }
export interface TasteProfile {
  user_id: string;
  display_name: string;
  avatar_url?: string | null;
  top_artists: TasteArtist[];
  top_tracks: TasteTrack[];
  updated_at?: string;
}
export interface BlendRow { id: string; code: string; user_a: string; user_b: string | null; created_at: string }
export type BlendOrigin = 'a' | 'b' | 'both' | 'fresh';

const DAY = 86_400_000;
const PUBLISHED_KEY = 'nuctify_taste_published';
const key = (t: Pick<Track, 'title' | 'artist'>) => `${t.title}|${t.artist}`.toLowerCase().replace(/\s+/g, ' ').trim();
const artistKey = (a: string) => a.split(/,|&| feat\.? | ft\.? | x /i)[0].trim().toLowerCase();

/** Top 50 artists/tracks from local listening history, play counts, likes and follows. */
export function buildTasteProfile(): Pick<TasteProfile, 'top_artists' | 'top_tracks'> {
  const { listeningHistory, playCounts, likedTracks, followedArtists } = useLibraryStore.getState();
  const now = Date.now();
  const tracks = new Map<string, TasteTrack>();
  const bump = (t: Track, w: number) => {
    const e = tracks.get(t.id);
    if (e) e.score += w;
    else tracks.set(t.id, { track: slimTrack(t), score: w });
  };
  // Recency-weighted history: plays in the last ~2 weeks count most.
  for (const h of listeningHistory) bump(h.track, 1 + 2 * Math.exp(-(now - h.playedAt) / (14 * DAY)));
  for (const [id, c] of Object.entries(playCounts)) {
    const e = tracks.get(id);
    if (e) e.score += Math.log2(1 + c.count);
  }
  for (const t of likedTracks) bump(t, 3);

  const artists = new Map<string, TasteArtist>();
  const addArtist = (name: string, w: number) => {
    const k = artistKey(name);
    if (!k) return;
    const e = artists.get(k);
    if (e) e.score += w;
    else artists.set(k, { name: name.split(/,|&/)[0].trim(), score: w });
  };
  for (const { track, score } of tracks.values()) addArtist(track.artist, score);
  for (const a of followedArtists) addArtist(a.name, 5);

  const round = <T extends { score: number }>(xs: T[]) => xs.sort((a, b) => b.score - a.score).slice(0, 50).map((x) => ({ ...x, score: Math.round(x.score * 100) / 100 }));
  return { top_artists: round([...artists.values()]), top_tracks: round([...tracks.values()]) };
}

/** Upserts the caller's taste profile (at most once a day unless forced). */
export async function publishTasteProfile(force = false): Promise<void> {
  const ctx = requireSocial();
  if (!ctx) return;
  const { sb, user } = ctx;
  try {
    const last = JSON.parse(localStorage.getItem(PUBLISHED_KEY) || 'null');
    if (!force && last?.userId === user.id && Date.now() - last.at < DAY) return;
  } catch { /* ignore */ }
  const profile = buildTasteProfile();
  const { error } = await sb.from('taste_profiles').upsert({
    user_id: user.id, display_name: user.displayName, avatar_url: user.avatarUrl ?? null, ...profile, updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
  try { localStorage.setItem(PUBLISHED_KEY, JSON.stringify({ userId: user.id, at: Date.now() })); } catch { /* ignore */ }
}

export async function createBlendInvite(): Promise<string> {
  const ctx = requireSocial();
  if (!ctx) throw new Error('Sign in to create a Blend');
  await publishTasteProfile(true);
  const code = genCode();
  const { error } = await ctx.sb.from('blends').insert({ code, user_a: ctx.user.id });
  if (error) throw new Error(errMsg(error));
  return code;
}

export async function joinBlend(rawCode: string): Promise<BlendRow> {
  const ctx = requireSocial();
  if (!ctx) throw new Error('Sign in to join a Blend');
  await publishTasteProfile(true);
  const { data, error } = await ctx.sb.rpc('join_blend', { p_code: normalizeCode(rawCode) });
  if (error) throw new Error(error.message);
  const row = (Array.isArray(data) ? data[0] : data) as BlendRow | null;
  if (!row) throw new Error('Blend invite not found');
  return row;
}

export async function listBlends(): Promise<BlendRow[]> {
  const ctx = requireSocial();
  if (!ctx) return [];
  const { data, error } = await ctx.sb.from('blends').select('*').order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []) as BlendRow[];
}

export async function deleteBlend(id: string): Promise<void> {
  const ctx = requireSocial();
  if (!ctx) return;
  const { error } = await ctx.sb.from('blends').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/** Loads both taste profiles of a blend: [me, them]. */
export async function loadBlendProfiles(blend: BlendRow): Promise<[TasteProfile, TasteProfile]> {
  const ctx = requireSocial();
  if (!ctx) throw new Error('Sign in to view Blends');
  const other = blend.user_a === ctx.user.id ? blend.user_b : blend.user_a;
  if (!other) throw new Error('Waiting for your friend to join');
  const { data, error } = await ctx.sb.from('taste_profiles').select('*').in('user_id', [ctx.user.id, other]);
  if (error) throw new Error(error.message);
  const rows = (data || []) as TasteProfile[];
  const mine = rows.find((r) => r.user_id === ctx.user.id);
  const theirs = rows.find((r) => r.user_id === other);
  if (!mine || !theirs) throw new Error('Taste profile missing — both people need to open the app once');
  return [mine, theirs];
}

/** Weighted overlap of normalized artist (70%) and track (30%) scores, shown as a friendly 0-100 %. */
export function tasteMatch(a: TasteProfile, b: TasteProfile): number {
  const sim = <T>(xs: T[], ys: T[], k: (x: T) => string, w: (x: T) => number) => {
    const norm = (list: T[]) => {
      const total = list.reduce((s, x) => s + w(x), 0) || 1;
      const m = new Map<string, number>();
      for (const x of list) m.set(k(x), (m.get(k(x)) || 0) + w(x) / total);
      return m;
    };
    const ma = norm(xs), mb = norm(ys);
    let s = 0;
    for (const [id, v] of ma) s += Math.min(v, mb.get(id) || 0);
    return s;
  };
  const artists = sim(a.top_artists || [], b.top_artists || [], (x) => artistKey(x.name), (x) => x.score);
  const tracks = sim(a.top_tracks || [], b.top_tracks || [], (x) => key(x.track), (x) => x.score);
  const m = 0.7 * artists + 0.3 * tracks;
  return Math.max(0, Math.min(100, Math.round(100 * Math.sqrt(m))));
}

export function sharedArtists(a: TasteProfile, b: TasteProfile): string[] {
  const theirs = new Set((b.top_artists || []).map((x) => artistKey(x.name)));
  return (a.top_artists || []).filter((x) => theirs.has(artistKey(x.name))).map((x) => x.name);
}

/**
 * 50-track Blend: shared favourites first, then both users' top tracks interleaved,
 * with fresh radio picks (seeded by shared taste) mixed in every 5th slot.
 */
export async function buildBlendPlaylist(a: TasteProfile, b: TasteProfile, size = 50): Promise<{ tracks: Track[]; origin: Record<string, BlendOrigin> }> {
  const ta = (a.top_tracks || []).map((x) => x.track).filter((t) => t?.id);
  const tb = (b.top_tracks || []).map((x) => x.track).filter((t) => t?.id);
  const bKeys = new Set(tb.map(key));
  const both = ta.filter((t) => bKeys.has(key(t)));
  const shared = new Set(sharedArtists(a, b).map(artistKey));

  // Seeds: shared tracks, then tracks by shared artists, then each user's #1.
  const seeds = [...both, ...ta.filter((t) => shared.has(artistKey(t.artist))), ...tb.filter((t) => shared.has(artistKey(t.artist))), ta[0], tb[0]]
    .filter((t): t is Track => !!t).filter((t, i, arr) => arr.findIndex((x) => key(x) === key(t)) === i).slice(0, 4);
  const radios = await Promise.all(seeds.map((s) => registry.getRadio(s, 8).catch(() => [] as Track[])));
  const knownKeys = new Set([...ta, ...tb].map(key));
  const fresh: Track[] = [];
  for (let i = 0; fresh.length < 12 && radios.some((r) => r.length > i); i++) {
    for (const r of radios) {
      const t = r[i];
      if (t && !knownKeys.has(key(t))) { knownKeys.add(key(t)); fresh.push(t); }
    }
  }

  const out: Track[] = [];
  const origin: Record<string, BlendOrigin> = {};
  const seen = new Set<string>();
  const push = (t: Track | undefined, o: BlendOrigin) => {
    if (!t || seen.has(key(t)) || out.length >= size) return false;
    seen.add(key(t));
    out.push(slimTrack(t));
    origin[t.id] = o;
    return true;
  };
  both.slice(0, 10).forEach((t) => push(t, 'both'));
  let ia = 0, ib = 0, ifr = 0;
  while (out.length < size && (ia < ta.length || ib < tb.length || ifr < fresh.length)) {
    if ((out.length + 1) % 5 === 0 && ifr < fresh.length) { push(fresh[ifr++], 'fresh'); continue; }
    while (ia < ta.length && !push(ta[ia++], 'a'));
    while (ib < tb.length && !push(tb[ib++], 'b'));
    if (ia >= ta.length && ib >= tb.length) while (ifr < fresh.length && out.length < size) push(fresh[ifr++], 'fresh');
  }
  return { tracks: out, origin };
}
