import { MusicProvider, SearchResults, Track, StreamInfo, Album, Artist, HomeSection } from './types';
import { nativeFetch } from '../utils/env';
import { decryptSaavnUrl } from './jiosaavn-crypto';
import { decodeHtml } from './html';

const JSV = '/api/jsv';
const JIO_FALLBACK = '/api/jio1';
const COMMON = '_format=json&_marker=0&api_version=4&ctx=web6dot0';

async function getJson(url: string, signal?: AbortSignal, timeoutMs = 12000): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const res = await nativeFetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return JSON.parse(await res.text());
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

function jsv(call: string, params: Record<string, string | number> = {}, signal?: AbortSignal): Promise<any> {
  const qs = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
  return getJson(`${JSV}?__call=${call}&${COMMON}${qs ? `&${qs}` : ''}`, signal);
}

const hiRes = (u?: string) => (u || '').replace(/(50x50|150x150)/, '500x500').replace(/^http:/, 'https:');

function pickImage(img: any): string {
  if (Array.isArray(img)) {
    const i = img[2] || img[img.length - 1] || img[0];
    return hiRes(i?.url || i?.link || '');
  }
  return typeof img === 'string' ? hiRes(img) : '';
}

const prefixed = (id: any) => (id ? `jio-${id}` : undefined);

function mediaUrl(item: any): string {
  const mi = item.more_info || {};
  const enc = mi.encrypted_media_url || item.encrypted_media_url;
  if (enc) {
    try {
      const url = decryptSaavnUrl(enc);
      if (/^https?:\/\//.test(url)) {
        const hq = (mi['320kbps'] ?? item['320kbps']) === 'true';
        return url.replace(/^http:/, 'https:').replace(/_96(_p)?\.mp4$/, hq ? '_320.mp4' : '_160.mp4');
      }
    } catch { /* ignore */ }
  }
  const dl = item.downloadUrl || item.download_url;
  if (Array.isArray(dl) && dl.length) {
    const best = dl[dl.length - 1];
    return best?.url || best?.link || '';
  }
  return '';
}

function parseTrack(item: any): Track {
  const mi = item.more_info || {};
  const primary = mi.artistMap?.primary_artists || item.artists?.primary;
  let artist = '';
  if (Array.isArray(primary) && primary.length) artist = primary.map((a: any) => String(a.name).trim()).join(', ');
  else if (typeof item.primaryArtists === 'string') artist = item.primaryArtists;
  else if (mi.music) artist = mi.music;
  else if (item.subtitle) artist = String(item.subtitle).split(' - ')[0];

  const albumName = typeof item.album === 'string' ? item.album : item.album?.name || mi.album || '';
  const year = parseInt(item.year, 10);
  return {
    id: `jio-${item.id}`,
    title: decodeHtml(item.title || item.name || item.song) || 'Unknown',
    artist: decodeHtml(artist) || 'Unknown Artist',
    artistId: prefixed(primary?.[0]?.id),
    album: decodeHtml(albumName),
    albumId: prefixed(item.album?.id || mi.album_id || item.albumid),
    duration: parseInt(mi.duration || item.duration || '0', 10) || 0,
    thumbnail: pickImage(item.image),
    source: 'jiosaavn',
    sourceId: String(item.id || ''),
    year: Number.isFinite(year) ? year : undefined,
    language: item.language || undefined,
    explicit: item.explicit_content === '1' || item.explicitContent === true || undefined,
    streamUrl: mediaUrl(item) || undefined,
  };
}

function parseAlbum(a: any, fallbackArtist = ''): Album {
  const mi = a.more_info || {};
  const primary = mi.artistMap?.primary_artists;
  const year = parseInt(a.year || mi.year, 10);
  const count = parseInt(mi.song_count || a.list_count, 10);
  return {
    id: `jio-${a.id}`,
    title: decodeHtml(a.title || a.name),
    artist: decodeHtml(primary?.map((p: any) => String(p.name).trim()).join(', ') || mi.music || a.subtitle || fallbackArtist),
    artistId: prefixed(primary?.[0]?.id),
    thumbnail: pickImage(a.image),
    year: Number.isFinite(year) ? year : undefined,
    trackCount: Number.isFinite(count) && count > 0 ? count : undefined,
    source: 'jiosaavn',
    sourceId: String(a.id),
  };
}

function parseArtist(a: any): Artist {
  return {
    id: `jio-${a.id ?? a.artistId}`,
    name: decodeHtml(a.title || a.name),
    image: pickImage(a.image),
    source: 'jiosaavn',
    sourceId: String(a.id ?? a.artistId),
  };
}

const songsOf = (d: any): any[] => {
  if (Array.isArray(d)) return d;
  if (Array.isArray(d?.songs)) return d.songs;
  if (Array.isArray(d?.list)) return d.list;
  if (Array.isArray(d?.results)) return d.results;
  return d && typeof d === 'object' ? Object.values(d).filter((v: any) => v && v.id && v.type === 'song') : [];
};

const playable = (t: Track) => !!t.sourceId;

function streamQuality(): 'high' | 'normal' | 'low' {
  try {
    const q = JSON.parse(localStorage.getItem('nuctify_player_prefs') || '{}')?.streamQuality;
    return q === 'normal' || q === 'low' ? q : 'high';
  } catch {
    return 'high';
  }
}

function applyQuality(url: string): string {
  const q = streamQuality();
  if (q === 'high') return url;
  const m = url.match(/_(320|160|96)(_p)?\.mp4$/);
  if (!m) return url;
  const target = q === 'low' ? 96 : Math.min(160, Number(m[1]));
  return url.replace(/_(320|160|96)(_p)?\.mp4$/, `_${target}.mp4`);
}

export const jiosaavnProvider: MusicProvider = {
  name: 'jiosaavn',
  displayName: 'JioSaavn',
  icon: '♪',
  color: '#2bc5b4',
  enabled: true,

  async search(query: string, limit = 20, opts?: { signal?: AbortSignal }): Promise<SearchResults> {
    const signal = opts?.signal;
    const [songs, ac] = await Promise.all([
      jsv('search.getResults', { q: query, n: limit, p: 1 }, signal).catch(() => null),
      jsv('autocomplete.get', { query }, signal).catch(() => null),
    ]);

    let tracks: Track[] = songsOf(songs).map(parseTrack).filter(playable);
    if (!tracks.length && !signal?.aborted) {
      try {
        const d = await getJson(`${JIO_FALLBACK}/search/songs?query=${encodeURIComponent(query)}&limit=${limit}`, signal, 8000);
        tracks = songsOf(d?.data ?? d).map(parseTrack).filter(playable);
      } catch { /* ignore */ }
    }

    const albums: Album[] = (ac?.albums?.data || []).map((a: any) => parseAlbum(a));
    const artists: Artist[] = (ac?.artists?.data || []).filter((a: any) => a.type === 'artist').map(parseArtist);
    return { tracks: tracks.slice(0, limit), albums, artists, source: 'jiosaavn' };
  },

  async getStreamUrl(track: Track): Promise<StreamInfo | null> {
    let url = track.streamUrl && /^https:\/\/[^/]*saavncdn\.com\//.test(track.streamUrl) ? track.streamUrl : '';
    if (!url) {
      try {
        const d = await jsv('song.getDetails', { pids: track.sourceId });
        const song = songsOf(d).find((s: any) => String(s.id) === track.sourceId) || songsOf(d)[0] || d?.[track.sourceId];
        if (song) url = mediaUrl(song);
      } catch (e: any) {
        console.warn('[JioSaavn] stream lookup failed:', e?.message);
      }
    }
    if (!url) return null;
    url = applyQuality(url);
    const kbps = /_320\.mp4/.test(url) ? 320 : /_160\.mp4/.test(url) ? 160 : 96;
    return {
      url,
      quality: `${kbps}kbps`,
      mimeType: 'audio/mp4',
      bitrate: kbps * 1000,
      cors: /^https:\/\/aac\.saavncdn\.com\//.test(url),
    };
  },

  async getTrackInfo(sourceId: string): Promise<Track | null> {
    try {
      const d = await jsv('song.getDetails', { pids: sourceId });
      const song = songsOf(d)[0] || d?.[sourceId];
      return song ? parseTrack(song) : null;
    } catch {
      return null;
    }
  },

  async getTrending(limit = 30): Promise<Track[]> {
    try {
      const d = await jsv('content.getTrending', { entity_type: 'song', entity_language: 'hindi' });
      return (Array.isArray(d) ? d : []).filter((s: any) => s.type === 'song').map(parseTrack).slice(0, limit);
    } catch {
      return [];
    }
  },

  async getHomeSections(): Promise<HomeSection[]> {
    const d = await jsv('webapi.getLaunchData');
    const titles: Record<string, string> = Object.fromEntries(Object.entries(d?.modules || {}).map(([k, v]: any) => [k, v?.title]));
    const sections: HomeSection[] = [];
    const toPlaylists = (items: any[]) => items
      .filter((p: any) => p.type === 'playlist')
      .map((p: any) => ({
        id: `jio-${p.id}`,
        title: decodeHtml(p.title),
        thumbnail: pickImage(p.image),
        source: 'jiosaavn' as const,
        sourceId: String(p.id),
        subtitle: decodeHtml(p.subtitle || p.more_info?.firstname || ''),
      }));
    for (const key of ['new_trending', 'charts', 'new_albums', 'top_playlists']) {
      const items: any[] = Array.isArray(d?.[key]) ? d[key] : [];
      if (!items.length) continue;
      const tracks = items.filter(i => i.type === 'song').map(parseTrack);
      const albums = items.filter(i => i.type === 'album').map(a => parseAlbum(a));
      const playlists = toPlaylists(items);
      sections.push({
        id: `jio-${key}`,
        title: decodeHtml(titles[key]) || key,
        ...(tracks.length ? { tracks } : {}),
        ...(albums.length ? { albums } : {}),
        ...(playlists.length ? { playlists } : {}),
      });
    }
    return sections;
  },

  async getArtistDetails(artistId: string) {
    const d = await jsv('artist.getArtistPageDetails', {
      artistId, n_song: 50, n_album: 50, page: 0, sort_order: 'desc', category: 'popularity',
    });
    if (!d || (!d.artistId && !d.name)) throw new Error('Failed to fetch artist details');
    let bio = '';
    try { bio = typeof d.bio === 'string' ? JSON.parse(d.bio || '[]')?.[0]?.text || '' : d.bio?.[0]?.text || ''; } catch { /* ignore */ }
    const name = decodeHtml(d.name);
    return {
      artist: {
        id: `jio-${d.artistId || artistId}`,
        name,
        image: pickImage(d.image),
        bio: decodeHtml(bio),
        source: 'jiosaavn' as const,
        sourceId: String(d.artistId || artistId),
      },
      topTracks: (d.topSongs || []).map(parseTrack),
      albums: [...(d.topAlbums || []), ...(d.singles || [])].map((a: any) => parseAlbum(a, name)),
    };
  },

  async getAlbumDetails(albumId: string) {
    const d = await jsv('content.getAlbumDetails', { albumid: albumId });
    if (!d || !d.id) throw new Error('Failed to fetch album details');
    const tracks: Track[] = (d.list || d.songs || []).map(parseTrack);
    const album = parseAlbum(d);
    album.trackCount = tracks.length || album.trackCount;
    return { album, tracks };
  },

  async getPlaylistDetails(playlistId: string) {
    const d = await jsv('playlist.getDetails', { listid: playlistId, n: 100, p: 1 });
    if (!d || !Array.isArray(d.list)) throw new Error('Failed to fetch playlist');
    return { title: decodeHtml(d.title || d.listname), thumbnail: pickImage(d.image), tracks: d.list.map(parseTrack) };
  },

  async getRadio(seed: Track, limit = 25): Promise<Track[]> {
    const artistRaw = seed.source === 'jiosaavn' && seed.artistId?.startsWith('jio-') ? seed.artistId.slice(4) : '';
    let tracks: Track[] = [];
    if (artistRaw) {
      try { tracks = (await this.getArtistDetails!(artistRaw)).topTracks; } catch { /* ignore */ }
    }
    if (tracks.length < 5) {
      const r = await this.search(seed.artist.split(',')[0], limit);
      tracks = tracks.concat(r.tracks);
    }
    return tracks.filter(t => t.id !== seed.id).slice(0, limit);
  },
};
