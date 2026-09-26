import { MusicProvider, SearchResults, Track, StreamInfo, Album, Artist } from './types';
import { nativeFetch } from '../utils/env';

const SC_PROXY = '/api/soundcloud';
const SC_SITE_PROXY = '/api/sc-site';
const SC_CDN_PROXY = '/api/sc-cdn';
const CID_KEY = 'nuctify_sc_client_id';
const CID_TTL = 12 * 3600e3;

const EMPTY: SearchResults = { tracks: [], albums: [], artists: [], source: 'soundcloud' };

let clientId = '';
let cidPromise: Promise<string> | null = null;

function withTimeout(ms: number, signal?: AbortSignal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  return { signal: controller.signal, done: () => { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); } };
}

async function fetchText(url: string, ms = 12000): Promise<string> {
  const t = withTimeout(ms);
  try {
    const res = await nativeFetch(url, { signal: t.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    t.done();
  }
}

function extractClientId(force = false): Promise<string> {
  if (!force) {
    if (clientId) return Promise.resolve(clientId);
    try {
      const c = JSON.parse(localStorage.getItem(CID_KEY) || 'null');
      if (c?.id && Date.now() - c.ts < CID_TTL) return Promise.resolve((clientId = c.id));
    } catch { /* ignore */ }
  }
  return (cidPromise ??= (async () => {
    const html = await fetchText(SC_SITE_PROXY);
    const scripts = (html.match(/https:\/\/a-v2\.sndcdn\.com\/assets\/[a-zA-Z0-9-]+\.js/g) || []).reverse();
    for (const src of scripts) {
      try {
        const js = await fetchText(src.replace('https://a-v2.sndcdn.com', SC_CDN_PROXY), 20000);
        const m = js.match(/client_id\s*[:=]\s*"?([a-zA-Z0-9]{32})/);
        if (m) {
          clientId = m[1];
          try { localStorage.setItem(CID_KEY, JSON.stringify({ id: clientId, ts: Date.now() })); } catch { /* ignore */ }
          return clientId;
        }
      } catch { /* next script */ }
    }
    throw new Error('SoundCloud client_id not found');
  })().finally(() => { cidPromise = null; }));
}

function invalidateClientId() {
  clientId = '';
  try { localStorage.removeItem(CID_KEY); } catch { /* ignore */ }
}

async function scJson(pathAndQuery: string, signal?: AbortSignal): Promise<any> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const cid = await extractClientId(attempt > 0);
    const sep = pathAndQuery.includes('?') ? '&' : '?';
    const t = withTimeout(12000, signal);
    try {
      const res = await nativeFetch(`${SC_PROXY}${pathAndQuery}${sep}client_id=${cid}`, { signal: t.signal });
      if (res.status === 401 || res.status === 403) {
        invalidateClientId();
        continue;
      }
      if (!res.ok) throw new Error(`SoundCloud API error: ${res.status}`);
      return await res.json();
    } finally {
      t.done();
    }
  }
  throw new Error('SoundCloud unauthorized');
}

const art = (u?: string) => (u ? u.replace('-large', '-t500x500') : '');

const isPlayable = (item: any) =>
  item?.kind === 'track' && item.policy !== 'SNIP' && item.policy !== 'BLOCK' && item.streamable !== false;

function parseTrack(item: any): Track {
  return {
    id: `sc-${item.id}`,
    title: item.title || 'Unknown',
    artist: item.publisher_metadata?.artist || item.user?.username || 'Unknown Artist',
    artistId: item.user?.id ? `sc-${item.user.id}` : undefined,
    album: item.publisher_metadata?.album_title || '',
    duration: Math.round((item.duration || item.full_duration || 0) / 1000),
    thumbnail: art(item.artwork_url) || art(item.user?.avatar_url),
    source: 'soundcloud',
    sourceId: String(item.id),
    genre: item.genre || '',
    explicit: item.publisher_metadata?.explicit || undefined,
  };
}

function parseAlbum(item: any): Album {
  return {
    id: `sc-${item.id}`,
    title: item.title || 'Unknown',
    artist: item.user?.username || 'Unknown',
    artistId: item.user?.id ? `sc-${item.user.id}` : undefined,
    thumbnail: art(item.artwork_url) || art(item.user?.avatar_url),
    trackCount: item.track_count,
    source: 'soundcloud',
    sourceId: String(item.id),
  };
}

function parseUser(item: any): Artist {
  return {
    id: `sc-${item.id}`,
    name: item.username,
    image: art(item.avatar_url),
    bio: item.description || '',
    source: 'soundcloud',
    sourceId: String(item.id),
  };
}

async function hydrate(items: any[]): Promise<any[]> {
  const missing = items.filter(t => t && !t.media && t.id).map(t => t.id);
  if (!missing.length) return items;
  try {
    const full: any[] = await scJson(`/tracks?ids=${missing.slice(0, 50).join(',')}`);
    const byId = new Map(full.map(t => [t.id, t]));
    return items.map(t => byId.get(t?.id) || t);
  } catch {
    return items;
  }
}

export const soundcloudProvider: MusicProvider = {
  name: 'soundcloud',
  displayName: 'SoundCloud',
  icon: '☁',
  color: '#ff5500',
  enabled: true,

  async search(query: string, limit = 20, opts?: { signal?: AbortSignal }): Promise<SearchResults> {
    const q = encodeURIComponent(query);
    try {
      const [tracks, albums, users] = await Promise.all([
        scJson(`/search/tracks?q=${q}&limit=${limit}`, opts?.signal),
        scJson(`/search/albums?q=${q}&limit=6`, opts?.signal).catch(() => null),
        scJson(`/search/users?q=${q}&limit=6`, opts?.signal).catch(() => null),
      ]);
      return {
        tracks: (tracks?.collection || []).filter(isPlayable).map(parseTrack),
        albums: (albums?.collection || []).map(parseAlbum),
        artists: (users?.collection || []).map(parseUser),
        source: 'soundcloud',
      };
    } catch (error) {
      console.warn('[SoundCloud] Search failed:', error);
      return EMPTY;
    }
  },

  async getStreamUrl(track: Track): Promise<StreamInfo | null> {
    try {
      const data = await scJson(`/tracks/${track.sourceId}`);
      if (data.policy === 'BLOCK') return null;
      const tcs: any[] = (data.media?.transcodings || []).filter((t: any) => !t.snipped);
      const pick = tcs.find(t => t.format?.protocol === 'progressive');
      if (!pick) return null;
      const auth = data.track_authorization ? `?track_authorization=${encodeURIComponent(data.track_authorization)}` : '';
      const { url } = await scJson(`${new URL(pick.url).pathname}${auth}`);
      if (!url) return null;
      return {
        url,
        quality: '128kbps',
        mimeType: pick.format?.mime_type || 'audio/mpeg',
        bitrate: 128000,
        cors: /(^|\.)sndcdn\.com$/.test(new URL(url).hostname),
        expiresAt: Date.now() + 20 * 60e3,
      };
    } catch (error) {
      console.warn('[SoundCloud] Stream fetch failed:', error);
      return null;
    }
  },

  async getTrending(limit = 30): Promise<Track[]> {
    try {
      const data = await scJson(`/charts?kind=trending&genre=soundcloud:genres:all-music&limit=${limit}`);
      const items = await hydrate((data.collection || []).map((i: any) => i.track));
      return items.filter(isPlayable).map(parseTrack);
    } catch {
      return [];
    }
  },

  async getArtistDetails(artistId: string) {
    const [user, tracks, albums] = await Promise.all([
      scJson(`/users/${artistId}`),
      scJson(`/users/${artistId}/toptracks?limit=30`).catch(() => scJson(`/users/${artistId}/tracks?limit=30`)),
      scJson(`/users/${artistId}/albums?limit=30`).catch(() => null),
    ]);
    return {
      artist: parseUser(user),
      topTracks: (tracks?.collection || []).filter(isPlayable).map(parseTrack),
      albums: (albums?.collection || []).map(parseAlbum),
    };
  },

  async getAlbumDetails(albumId: string) {
    const pl = await scJson(`/playlists/${albumId}`);
    const items = await hydrate(pl.tracks || []);
    return { album: parseAlbum(pl), tracks: items.filter(isPlayable).map(parseTrack) };
  },

  async getPlaylistDetails(playlistId: string) {
    const { album, tracks } = await this.getAlbumDetails!(playlistId);
    return { title: album.title, thumbnail: album.thumbnail, tracks };
  },
};
