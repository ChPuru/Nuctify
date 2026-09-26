import { HomeSection, MusicProvider, ProviderName, SearchResults, StreamInfo, Track } from './types';

const VERSION_TAGS = /\b(remix|mix|live|acoustic|lofi|lo-fi|slowed|reverb|sped|instrumental|karaoke|cover|version|edit|unplugged|reprise|remaster(ed)?)\b/g;

function versionTags(s: string): string {
  return Array.from(new Set((s.toLowerCase().match(VERSION_TAGS) || []).map(t => t.replace('-', '')))).sort().join(',');
}

function normalize(s: string): string {
  return (s || '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[([].*?[)\]]/g, ' ')
    .replace(/(^|[\s,])(feat\.?|ft\.?|featuring)\s.*$/i, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function similarity(na: string, nb: string): number {
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.length < 2 || nb.length < 2) return 0;
  const bigrams = new Map<string, number>();
  for (let i = 0; i < na.length - 1; i++) {
    const bi = na.substring(i, i + 2);
    bigrams.set(bi, (bigrams.get(bi) || 0) + 1);
  }
  let matches = 0;
  for (let i = 0; i < nb.length - 1; i++) {
    const bi = nb.substring(i, i + 2);
    const count = bigrams.get(bi) || 0;
    if (count > 0) {
      bigrams.set(bi, count - 1);
      matches++;
    }
  }
  return (2 * matches) / (na.length - 1 + nb.length - 1);
}

function artistSimilarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na.includes(nb) || nb.includes(na)) return 1;
  const first = (s: string) => normalize(s.split(/,|&| x | and /i)[0]);
  return Math.max(similarity(na, nb), similarity(first(a), first(b)));
}

const PROVIDER_PRIORITY: Record<string, number> = {
  jiosaavn: 4,
  youtube: 3,
  soundcloud: 2,
  bandcamp: 1,
};

const PREFIXES: Record<string, ProviderName> = {
  jio: 'jiosaavn', jiosaavn: 'jiosaavn',
  yt: 'youtube', youtube: 'youtube',
  sc: 'soundcloud', soundcloud: 'soundcloud',
  bc: 'bandcamp', bandcamp: 'bandcamp',
  pc: 'podcast', podcast: 'podcast',
  local: 'local',
};

const NON_MUSIC: ProviderName[] = ['podcast', 'local'];
const MATCH_PROVIDERS: ProviderName[] = ['jiosaavn', 'soundcloud'];
const MATCH_CACHE_KEY = 'nuctify_match_cache';
const MATCH_CACHE_MAX = 300;
const PROVIDER_TIMEOUT = 10000;
const SEARCH_TTL = 5 * 60e3;
const TRENDING_TTL = 30 * 60e3;

const emptyResults = (source: ProviderName = 'jiosaavn'): SearchResults => ({ tracks: [], albums: [], artists: [], source });

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    p.catch(() => fallback),
    new Promise<T>(resolve => { timer = setTimeout(() => resolve(fallback), ms); }),
  ]).finally(() => clearTimeout(timer));
}

function stripAlternatives(t: Track): Track {
  if (!t.alternatives) return t;
  const { alternatives: _drop, ...plain } = t;
  return plain;
}

type Keyed = { track: Track; nt: string; na: string; tags: string };

class ProviderRegistry {
  private providers: Map<ProviderName, MusicProvider> = new Map();
  private searchCache = new Map<string, { ts: number; value: SearchResults }>();
  private trendingCache: { ts: number; limit: number; value: Track[] } | null = null;
  private matchCache: Map<string, Track> | null = null;

  register(provider: MusicProvider) {
    this.providers.set(provider.name, provider);
  }

  get(name: ProviderName): MusicProvider | undefined {
    return this.providers.get(name);
  }

  getAll(): MusicProvider[] {
    return Array.from(this.providers.values());
  }

  getEnabled(): MusicProvider[] {
    return this.getAll().filter(p => p.enabled);
  }

  private musicProviders(): MusicProvider[] {
    return this.getEnabled()
      .filter(p => !NON_MUSIC.includes(p.name))
      .sort((a, b) => (PROVIDER_PRIORITY[b.name] || 0) - (PROVIDER_PRIORITY[a.name] || 0));
  }

  parseEntityId(id: string): { provider: ProviderName; rawId: string } {
    const i = id.indexOf('-');
    const provider = i > 0 ? PREFIXES[id.slice(0, i)] : undefined;
    return provider ? { provider, rawId: id.slice(i + 1) } : { provider: 'jiosaavn', rawId: id };
  }

  async searchAll(query: string, limit = 20, opts?: { signal?: AbortSignal }): Promise<SearchResults> {
    const q = query.trim();
    if (!q) return emptyResults();
    const key = `${q.toLowerCase()}|${limit}`;
    const hit = this.searchCache.get(key);
    if (hit && Date.now() - hit.ts < SEARCH_TTL) return hit.value;

    const providers = this.musicProviders();
    const results = await Promise.all(providers.map(p =>
      withTimeout(p.search(q, limit, { signal: opts?.signal }), PROVIDER_TIMEOUT, emptyResults(p.name))));

    const merged = emptyResults(providers[0]?.name);
    for (const r of results) {
      merged.tracks.push(...(r.tracks || []));
      merged.albums.push(...(r.albums || []));
      merged.artists.push(...(r.artists || []));
    }
    merged.tracks = this.deduplicateTracks(merged.tracks);

    if (!opts?.signal?.aborted && (merged.tracks.length || merged.albums.length)) {
      this.searchCache.set(key, { ts: Date.now(), value: merged });
      if (this.searchCache.size > 50) this.searchCache.delete(this.searchCache.keys().next().value!);
    }
    return merged;
  }

  async getTrendingAll(limit = 30): Promise<Track[]> {
    const c = this.trendingCache;
    if (c && c.limit >= limit && Date.now() - c.ts < TRENDING_TTL) return c.value.slice(0, limit);
    try {
      const results = await Promise.all(this.musicProviders()
        .filter(p => p.getTrending)
        .map(p => withTimeout(p.getTrending!(limit), PROVIDER_TIMEOUT, [] as Track[])));
      const tracks = this.deduplicateTracks(results.flat());
      if (tracks.length) this.trendingCache = { ts: Date.now(), limit, value: tracks };
      return tracks.slice(0, limit);
    } catch {
      return [];
    }
  }

  async getHomeSections(): Promise<HomeSection[]> {
    try {
      const results = await Promise.all(this.musicProviders()
        .filter(p => p.getHomeSections)
        .map(p => withTimeout(p.getHomeSections!(), PROVIDER_TIMEOUT, [] as HomeSection[])));
      return results.flat();
    } catch {
      return [];
    }
  }

  async getArtistDetails(artistId: string) {
    const { provider, rawId } = this.parseEntityId(artistId);
    const p = this.get(provider);
    if (!p?.getArtistDetails) throw new Error(`Provider ${provider} does not support artist details`);
    return p.getArtistDetails(rawId);
  }

  async getAlbumDetails(albumId: string) {
    const { provider, rawId } = this.parseEntityId(albumId);
    const p = this.get(provider);
    if (!p?.getAlbumDetails) throw new Error(`Provider ${provider} does not support album details`);
    return p.getAlbumDetails(rawId);
  }

  async getPlaylistDetails(playlistId: string) {
    const { provider, rawId } = this.parseEntityId(playlistId);
    const p = this.get(provider);
    if (p?.getPlaylistDetails) return p.getPlaylistDetails(rawId);
    if (p?.getPlaylist) return { title: 'Playlist', tracks: await p.getPlaylist(rawId) };
    throw new Error(`Provider ${provider} does not support playlists`);
  }

  async resolveStream(track: Track, opts?: { signal?: AbortSignal }): Promise<{ stream: StreamInfo; track: Track } | null> {
    const aborted = () => !!opts?.signal?.aborted;
    const tryTrack = async (t: Track): Promise<{ stream: StreamInfo; track: Track } | null> => {
      if (aborted()) return null;
      const p = this.get(t.source);
      if (!p) return null;
      try {
        const stream = await withTimeout(p.getStreamUrl(t), 15000, null);
        return stream?.url ? { stream, track: t } : null;
      } catch {
        return null;
      }
    };

    try {
      const direct = await tryTrack(track);
      if (direct) return direct;
      for (const alt of track.alternatives || []) {
        const r = await tryTrack(alt);
        if (r) return r;
      }
      if (NON_MUSIC.includes(track.source) || aborted()) return null;

      const cache = this.loadMatchCache();
      const cached = cache.get(track.id);
      if (cached) {
        const r = await tryTrack(cached);
        if (r) return r;
        cache.delete(track.id);
      }

      const tried = new Set([track.id, ...(track.alternatives || []).map(a => a.id)]);
      const candidates = await this.findMatches(track, opts?.signal);
      for (const c of candidates) {
        if (tried.has(c.id)) continue;
        const r = await tryTrack(c);
        if (r) {
          this.saveMatch(track.id, stripAlternatives(c));
          return r;
        }
      }
    } catch {
      /* never throw */
    }
    return null;
  }

  async getRadio(seed: Track, limit = 25): Promise<Track[]> {
    const seen = new Set<string>([seed.id]);
    const seedKey = `${normalize(seed.title)}|${normalize(seed.artist)}`;
    const out: Track[] = [];
    const add = (tracks: Track[]) => {
      for (const t of tracks) {
        if (out.length >= limit) break;
        const k = `${normalize(t.title)}|${normalize(t.artist)}`;
        if (seen.has(t.id) || seen.has(k) || k === seedKey) continue;
        seen.add(t.id);
        seen.add(k);
        out.push(stripAlternatives(t));
      }
    };
    try {
      const order = [this.get(seed.source), this.get('youtube'), this.get('jiosaavn')];
      for (const p of order) {
        if (out.length >= limit) break;
        if (!p?.enabled || !p.getRadio || NON_MUSIC.includes(p.name)) continue;
        add(await withTimeout(p.getRadio(seed, limit), PROVIDER_TIMEOUT, [] as Track[]));
      }
      if (out.length < Math.min(5, limit)) {
        const r = await this.searchAll(seed.artist.split(',')[0], limit);
        add(r.tracks);
      }
    } catch {
      /* never throw */
    }
    return out;
  }

  private async findMatches(track: Track, signal?: AbortSignal): Promise<Track[]> {
    const nt = normalize(track.title);
    const tags = versionTags(track.title);
    const query = `${track.title.replace(/[([].*?[)\]]/g, ' ')} ${track.artist.split(',')[0]}`.replace(/\s+/g, ' ').trim();
    const providers = MATCH_PROVIDERS.map(n => this.get(n)).filter((p): p is MusicProvider => !!p?.enabled);
    const results = await Promise.all(providers.map(p =>
      withTimeout(p.search(query, 10, { signal }), PROVIDER_TIMEOUT, emptyResults(p.name))));
    const scored: { t: Track; score: number }[] = [];
    for (const t of results.flatMap(r => r.tracks)) {
      if (t.id === track.id) continue;
      if (versionTags(t.title) !== tags) continue;
      if (track.duration > 0 && t.duration > 0 && Math.abs(track.duration - t.duration) > 10) continue;
      const ts = similarity(nt, normalize(t.title));
      const as = artistSimilarity(track.artist, t.artist);
      if (ts < 0.7 || as < 0.5) continue;
      scored.push({ t, score: ts * 0.6 + as * 0.4 + (PROVIDER_PRIORITY[t.source] || 0) * 0.01 });
    }
    return scored.sort((a, b) => b.score - a.score).map(s => s.t);
  }

  private loadMatchCache(): Map<string, Track> {
    if (this.matchCache) return this.matchCache;
    let entries: [string, Track][] = [];
    try { entries = JSON.parse(localStorage.getItem(MATCH_CACHE_KEY) || '[]'); } catch { /* ignore */ }
    this.matchCache = new Map(Array.isArray(entries) ? entries : []);
    return this.matchCache;
  }

  private saveMatch(id: string, match: Track) {
    const cache = this.loadMatchCache();
    cache.delete(id);
    cache.set(id, match.source !== 'jiosaavn' ? { ...match, streamUrl: undefined } : match);
    while (cache.size > MATCH_CACHE_MAX) cache.delete(cache.keys().next().value!);
    try { localStorage.setItem(MATCH_CACHE_KEY, JSON.stringify(Array.from(cache.entries()))); } catch { /* ignore */ }
  }

  private deduplicateTracks(tracks: Track[]): Track[] {
    type Group = Keyed & { alts: Track[]; sources: Set<ProviderName> };
    const groups: Group[] = [];
    const exact = new Map<string, Group>();

    const fits = (g: Group, k: Keyed) => {
      if (g.sources.has(k.track.source) || g.tags !== k.tags) return false;
      const da = g.track.duration, db = k.track.duration;
      if (da > 0 && db > 0 && Math.abs(da - db) > 4) return false;
      return true;
    };

    for (const raw of tracks) {
      const track = stripAlternatives(raw);
      const k: Keyed = { track, nt: normalize(track.title), na: normalize(track.artist), tags: versionTags(track.title) };
      let group: Group | undefined;
      if (k.nt && k.na) {
        const g = exact.get(`${k.nt}|${k.na}|${k.tags}`);
        if (g && fits(g, k)) group = g;
        if (!group) {
          group = groups.find(g => fits(g, k) && similarity(k.nt, g.nt) > 0.85 && similarity(k.na, g.na) > 0.6);
        }
      }

      if (!group) {
        const g: Group = { ...k, alts: [], sources: new Set([track.source]) };
        groups.push(g);
        if (k.nt && k.na) exact.set(`${k.nt}|${k.na}|${k.tags}`, g);
        continue;
      }

      group.sources.add(track.source);
      if ((PROVIDER_PRIORITY[track.source] || 0) > (PROVIDER_PRIORITY[group.track.source] || 0)) {
        group.alts.push(group.track);
        group.track = track;
      } else {
        group.alts.push(track);
      }
    }

    return groups.map(g => (g.alts.length ? { ...g.track, alternatives: g.alts } : g.track));
  }
}

export const registry = new ProviderRegistry();
