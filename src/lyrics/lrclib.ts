import { Lyrics, LyricLine, Track } from '../providers/types';
import { nativeFetch } from '../utils/env';
import { registry } from '../providers';

const LRCLIB_PROXY = '/api/lrclib';
const TIMEOUT_MS = 8000;

const ENTITIES: Record<string, string> = { quot: '"', amp: '&', apos: "'", lt: '<', gt: '>', nbsp: ' ' };

export function decodeEntities(s: string): string {
  return (s || '').replace(/&(#x[0-9a-f]+|#\d+|quot|amp|apos|lt|gt|nbsp);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

const norm = (s: string) => decodeEntities(s || '')
  .normalize('NFKD')
  .replace(/\p{M}/gu, '')
  .toLowerCase()
  .replace(/&/g, ' and ')
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .trim();

const splitArtists = (a: string): string[] => {
  const d = decodeEntities(a || '');
  const parts = d.split(/\s*(?:,|&|\/|;|\bfeat\.?|\bft\.?|\bx\b|\band\b|\bwith\b)\s*/i).map(norm).filter(Boolean);
  const whole = norm(d);
  return whole && !parts.includes(whole) ? [whole, ...parts] : parts;
};

function cleanTitle(title: string): string {
  return decodeEntities(title)
    .replace(/\s*[([](?:[^)\]]*\b(?:from|feat\.?|ft\.?|official|video|audio|lyrics?|remaster(?:ed)?|live|version|edit|mix|visuali[sz]er|hd|hq|4k)\b[^)\]]*)[)\]]/gi, '')
    .replace(/\s+[-–—]\s+(?:\d{4}\s+)?(?:remaster(?:ed)?(?:\s+\d{4})?|live\b.*|radio edit|single version|album version|mono|stereo|acoustic|from\s.*|bonus track).*$/i, '')
    .replace(/\s+(?:feat\.?|ft\.?)\s.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function withTimeout<T>(p: Promise<T>, ms = TIMEOUT_MS): Promise<T | null> {
  return Promise.race([p, new Promise<null>(r => setTimeout(() => r(null), ms))]).catch(() => null);
}

async function getJSON(url: string): Promise<any> {
  return withTimeout((async () => {
    const r = await nativeFetch(url);
    return r.ok ? await r.json() : null;
  })());
}

function parseLRC(lrc: string): LyricLine[] {
  const rows = lrc.split(/\r\n|\n|\r/);
  const offTag = rows.map(r => r.match(/^\s*\[offset:\s*([+-]?\d+)\s*\]/i)).find(Boolean);
  const offset = offTag ? parseInt(offTag[1], 10) / 1000 : 0;
  const STAMP = /^\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\][ \t]*/;
  const out: LyricLine[] = [];

  for (const raw of rows) {
    let rest = raw.trimStart();
    const times: number[] = [];
    let m: RegExpExecArray | null;
    while ((m = STAMP.exec(rest))) {
      const frac = m[3] ? parseInt(m[3], 10) / 10 ** m[3].length : 0;
      times.push(+m[1] * 60 + +m[2] + frac);
      rest = rest.slice(m[0].length);
    }
    if (!times.length) continue;
    const text = rest.replace(/<\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?>/g, '').trim();
    for (const t of times) out.push({ time: Math.max(0, t - offset), text });
  }

  out.sort((a, b) => a.time - b.time);
  return out.filter((l, i, a) => l.text || (i > 0 && a[i - 1].text));
}

const cache = new Map<string, Promise<Lyrics | null>>();

export function fetchLyrics(
  title: string,
  artist: string,
  duration?: number,
  album?: string,
  source?: string
): Promise<Lyrics | null> {
  const key = `${norm(artist)}|${norm(title)}|${Math.round(duration || 0)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const p = lookup(title, artist, duration, album, source).catch(() => null);
  cache.set(key, p);
  p.then(v => { if (!v) setTimeout(() => { if (cache.get(key) === p) cache.delete(key); }, 300000); });
  if (cache.size > 200) cache.delete(cache.keys().next().value as string);
  return p;
}

async function lookup(
  title: string,
  artist: string,
  duration?: number,
  album?: string,
  source?: string
): Promise<Lyrics | null> {
  const dur = duration && duration > 0 ? duration : 0;
  let arts = splitArtists(artist);
  let t = cleanTitle(title);

  const dash = t.split(/\s+[-–—]\s+/);
  if (dash.length > 1 && (source === 'youtube' || source === 'soundcloud' || source === 'local')) {
    const left = norm(dash[0]);
    if (!arts.includes(left)) arts = [...arts, ...splitArtists(dash[0])];
    t = dash.slice(1).join(' - ');
  }
  if (!t) return null;

  const enc = encodeURIComponent;
  const cleanAlbum = album ? decodeEntities(album) : '';
  const primary = arts[0] ? decodeEntities(artist).split(/\s*,\s*/)[0] : '';
  const [exact, list] = await Promise.all([
    primary
      ? getJSON(`${LRCLIB_PROXY}/get?track_name=${enc(t)}&artist_name=${enc(primary)}${cleanAlbum ? `&album_name=${enc(cleanAlbum)}` : ''}${dur ? `&duration=${Math.round(dur)}` : ''}`)
      : Promise.resolve(null),
    getJSON(`${LRCLIB_PROXY}/search?track_name=${enc(t)}`),
  ]);

  const nt = norm(t);
  const seen = new Set<number>();
  const cands = [exact, ...(Array.isArray(list) ? list : [])]
    .filter((r: any) => r && !seen.has(r.id) && seen.add(r.id))
    .filter((r: any) => !r.instrumental && (r.syncedLyrics || r.plainLyrics))
    .filter((r: any) => norm(cleanTitle(r.trackName || '')) === nt || norm(r.trackName || '') === nt)
    .filter((r: any) => !arts.length || splitArtists(r.artistName || '').some(a => arts.includes(a)));

  cands.sort((a: any, b: any) =>
    (dur ? Math.abs((a.duration || 0) - dur) - Math.abs((b.duration || 0) - dur) : 0) ||
    (+!!b.syncedLyrics - +!!a.syncedLyrics));

  const best: any = cands[0];
  if (best) {
    const syncedOk = !dur || !best.duration || Math.abs(best.duration - dur) <= 3;
    const synced = syncedOk && best.syncedLyrics ? parseLRC(best.syncedLyrics) : [];
    const plain = best.plainLyrics || undefined;
    if (synced.length || plain) {
      return { plain, synced: synced.length ? synced : undefined, source: 'LRCLIB' };
    }
  }

  if (!primary) return null;
  const ovh = await getJSON(`https://api.lyrics.ovh/v1/${enc(primary)}/${enc(t)}`);
  if (ovh?.lyrics && ovh.lyrics.length > 100) {
    return { plain: ovh.lyrics, source: 'Lyrics.ovh' };
  }
  return null;
}

export async function searchTracksByLyrics(query: string): Promise<Track[]> {
  try {
    const results = await getJSON(`${LRCLIB_PROXY}/search?q=${encodeURIComponent(query)}`);
    if (!Array.isArray(results)) return [];

    const seen = new Set<string>();
    const hits = results.filter((r: any) => {
      const k = `${norm(r.trackName)}|${norm(r.artistName)}`;
      if (!r.trackName || seen.has(k)) return false;
      seen.add(k);
      return true;
    }).slice(0, 8);

    const resolved = await Promise.all(hits.map(async (r: any) => {
      const found = await withTimeout(registry.searchAll(`${decodeEntities(r.artistName)} ${decodeEntities(r.trackName)}`, 5), 10000);
      const tracks = found?.tracks ?? [];
      const nt = norm(cleanTitle(r.trackName));
      return tracks.find(t => norm(cleanTitle(t.title)) === nt && (!r.duration || !t.duration || Math.abs(t.duration - r.duration) <= 5))
        ?? tracks.find(t => norm(cleanTitle(t.title)) === nt)
        ?? null;
    }));

    const ids = new Set<string>();
    return resolved.filter((t): t is Track => !!t && !ids.has(t.id) && !!ids.add(t.id));
  } catch (error) {
    console.error('[Lyrics] Search failed:', error);
    return [];
  }
}
