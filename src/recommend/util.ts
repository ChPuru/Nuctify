import type { Track } from '../providers/types';

export const DAY = 86_400_000;

export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** mulberry32 PRNG seeded from a string */
export function rng(seed: string): () => number {
  let a = hash(seed);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededShuffle<T>(arr: readonly T[], seed: string): T[] {
  const out = arr.slice();
  const r = rng(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const pad = (n: number) => String(n).padStart(2, '0');
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export function weekKey(d = new Date()): string {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dow = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dow);
  const y = t.getUTCFullYear();
  const wk = Math.ceil(((t.getTime() - Date.UTC(y, 0, 1)) / DAY + 1) / 7);
  return `${y}-W${pad(wk)}`;
}

const norm = (s: string) => s.toLowerCase().replace(/\(.*?\)|\[.*?\]|feat\..*|ft\..*/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
export const primaryArtist = (artist: string) => (artist || 'Unknown').split(/,|&| x | feat\.| ft\.| and /i)[0].trim() || 'Unknown';
export const artistKey = (name: string) => norm(primaryArtist(name));
export const trackKey = (t: Pick<Track, 'title' | 'artist'>) => `${norm(t.title)}|${artistKey(t.artist)}`;

export function slim(t: Track): Track {
  const { alternatives: _a, streamUrl: _s, isLiked: _l, ...rest } = t;
  return rest;
}

/** dedupe by id and normalized title|artist, optionally excluding a set of keys/ids */
export function dedupe(tracks: Track[], exclude?: Set<string>): Track[] {
  const seen = new Set<string>(exclude);
  const out: Track[] = [];
  for (const t of tracks) {
    if (!t?.id || !t.title) continue;
    const k = trackKey(t);
    if (seen.has(t.id) || seen.has(k)) continue;
    seen.add(t.id); seen.add(k);
    out.push(t);
  }
  return out;
}

/** limit how many tracks per primary artist */
export function capPerArtist(tracks: Track[], max: number): Track[] {
  const c = new Map<string, number>();
  return tracks.filter((t) => {
    const k = artistKey(t.artist);
    const n = (c.get(k) || 0) + 1;
    c.set(k, n);
    return n <= max;
  });
}

/** interleave a and b with ratio pa:pb */
export function interleave<T>(a: T[], b: T[], pa: number, pb: number): T[] {
  const out: T[] = [];
  let i = 0, j = 0;
  while (i < a.length || j < b.length) {
    for (let k = 0; k < pa && i < a.length; k++) out.push(a[i++]);
    for (let k = 0; k < pb && j < b.length; k++) out.push(b[j++]);
  }
  return out;
}

/** global concurrency limiter for registry calls (max 3 in flight) */
const MAX = 3;
let active = 0;
const waiting: (() => void)[] = [];
export async function limit<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  if (active >= MAX) await new Promise<void>((r) => waiting.push(r));
  active++;
  try {
    return await fn();
  } catch {
    return fallback;
  } finally {
    active--;
    waiting.shift()?.();
  }
}

export function gradientFor(id: string): { from: string; to: string; accent: string } {
  const h = hash(id) % 360;
  const h2 = (h + 40 + (hash(id + 'b') % 80)) % 360;
  return { from: `hsl(${h} 70% 42%)`, to: `hsl(${h2} 65% 22%)`, accent: `hsl(${(h + 180) % 360} 85% 70%)` };
}
