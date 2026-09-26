import { MusicProvider, SearchResults, Track, StreamInfo, Album, Artist } from './types';
import { nativeFetch, isNativeApp } from '../utils/env';

const YTM = '/api/ytm';
const CLIENT = { clientName: 'WEB_REMIX', clientVersion: '1.20250101.01.00', hl: 'en', gl: 'IN' };
const SONGS_PARAM = 'EgWKAQIIAWoKEAkQBRAKEAMQBA==';
const INSTANCE_KEY = 'nuctify_yt_instance';

const EMPTY: SearchResults = { tracks: [], albums: [], artists: [], source: 'youtube' };

async function post(endpoint: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const res = await nativeFetch(`${YTM}/${endpoint}?prettyPrint=false`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-YouTube-Client-Name': '67',
        'X-YouTube-Client-Version': CLIENT.clientVersion,
      },
      body: JSON.stringify({ context: { client: CLIENT }, ...body }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

const runsText = (t: any): string => (t?.runs || []).map((r: any) => r.text).join('');
const pageType = (r: any): string | undefined =>
  r?.navigationEndpoint?.browseEndpoint?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType;
const browseId = (r: any): string | undefined => r?.navigationEndpoint?.browseEndpoint?.browseId;

function parseDuration(s?: string): number {
  if (!s || !/^\d+(:\d{2})+$/.test(s)) return 0;
  return s.split(':').reduce((acc, p) => acc * 60 + (parseInt(p, 10) || 0), 0);
}

function bestThumb(thumbs: any[] | undefined): string {
  const t: string = thumbs?.[thumbs.length - 1]?.url || '';
  return t.replace(/=w\d+-h\d+(-[a-z0-9-]+)?$/i, '=w544-h544-l90-rj');
}

const thumbOf = (x: any) =>
  bestThumb(x?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails
    || x?.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails
    || x?.thumbnail?.croppedSquareThumbnailRenderer?.thumbnail?.thumbnails
    || x?.thumbnail?.thumbnails);

const ytId = (id?: string) => (id ? `yt-${id}` : undefined);

function parseListItem(m: any, fallback: Partial<Track> = {}): Track | null {
  const videoId = m?.playlistItemData?.videoId
    || m?.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint?.videoId;
  if (!videoId) return null;
  const cols = m.flexColumns || [];
  const title = runsText(cols[0]?.musicResponsiveListItemFlexColumnRenderer?.text);
  const runs: any[] = cols.slice(1).flatMap((c: any) => c?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || []);
  const artists = runs.filter(r => pageType(r) === 'MUSIC_PAGE_TYPE_ARTIST' || pageType(r) === 'MUSIC_PAGE_TYPE_USER_CHANNEL');
  const album = runs.find(r => pageType(r) === 'MUSIC_PAGE_TYPE_ALBUM');
  const durText = runs.map(r => r.text).find(t => /^\d+(:\d{2})+$/.test(t))
    || runsText(m.fixedColumns?.[0]?.musicResponsiveListItemFixedColumnRenderer?.text);
  const plainArtist = runs.find(r => r.text && r.text.trim() !== '•' && !/^\d+(:\d{2})+$/.test(r.text))?.text;
  return {
    id: `yt-${videoId}`,
    title: title || 'Unknown',
    artist: artists.length ? artists.map(a => a.text).join(', ') : (fallback.artist || plainArtist || 'Unknown Artist'),
    artistId: ytId(browseId(artists[0])) || fallback.artistId,
    album: album?.text || fallback.album,
    albumId: ytId(browseId(album)) || fallback.albumId,
    duration: parseDuration(durText),
    thumbnail: thumbOf(m) || fallback.thumbnail || '',
    source: 'youtube',
    sourceId: videoId,
    explicit: (m.badges || []).some((b: any) => b?.musicInlineBadgeRenderer?.icon?.iconType === 'MUSIC_EXPLICIT_BADGE') || undefined,
  };
}

function parsePanelItem(v: any): Track | null {
  if (!v?.videoId) return null;
  const runs: any[] = v.longBylineText?.runs || [];
  const artists = runs.filter(r => pageType(r) === 'MUSIC_PAGE_TYPE_ARTIST');
  const album = runs.find(r => pageType(r) === 'MUSIC_PAGE_TYPE_ALBUM');
  return {
    id: `yt-${v.videoId}`,
    title: runsText(v.title) || 'Unknown',
    artist: artists.length ? artists.map(a => a.text).join(', ') : (runs[0]?.text || 'Unknown Artist'),
    artistId: ytId(browseId(artists[0])),
    album: album?.text,
    albumId: ytId(browseId(album)),
    duration: parseDuration(runsText(v.lengthText)),
    thumbnail: thumbOf(v),
    source: 'youtube',
    sourceId: v.videoId,
  };
}

function parseTwoRow(r: any, artistName = '', artistId?: string): Album | null {
  const id = r?.navigationEndpoint?.browseEndpoint?.browseId;
  if (!id || !id.startsWith('MPRE')) return null;
  const sub: string[] = (r.subtitle?.runs || []).map((x: any) => x.text);
  const year = parseInt(sub.find(s => /^\d{4}$/.test(s)) || '', 10);
  return {
    id: `yt-${id}`,
    title: runsText(r.title),
    artist: artistName || sub.filter(s => s !== ' • ' && !/^\d{4}$/.test(s) && !/^(Album|Single|EP)$/.test(s)).join('').trim(),
    artistId,
    thumbnail: thumbOf(r),
    year: Number.isFinite(year) ? year : undefined,
    source: 'youtube',
    sourceId: id,
  };
}

const shelfTracks = (shelf: any, fallback?: Partial<Track>): Track[] =>
  (shelf?.contents || []).map((c: any) => parseListItem(c.musicResponsiveListItemRenderer, fallback)).filter(Boolean) as Track[];

function getInstance(): string {
  try { return (localStorage.getItem(INSTANCE_KEY) || '').trim().replace(/\/+$/, ''); } catch { return ''; }
}

export const youtubeProvider: MusicProvider = {
  name: 'youtube',
  displayName: 'YouTube Music',
  icon: '▶',
  color: '#ff0033',
  enabled: true,

  async search(query: string, limit = 20, opts?: { signal?: AbortSignal }): Promise<SearchResults> {
    if (!isNativeApp()) return EMPTY;
    try {
      const j = await post('search', { query, params: SONGS_PARAM }, opts?.signal);
      const sections = j?.contents?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents || [];
      const tracks = sections.flatMap((s: any) => shelfTracks(s.musicShelfRenderer)).slice(0, limit);
      return { tracks, albums: [], artists: [], source: 'youtube' };
    } catch (error) {
      console.warn('[YouTube] Search failed:', error);
      return EMPTY;
    }
  },

  async getStreamUrl(track: Track): Promise<StreamInfo | null> {
    const inst = getInstance();
    if (!isNativeApp() || !inst) return null;
    try {
      const res = await nativeFetch(`${inst}/streams/${encodeURIComponent(track.sourceId)}`);
      if (res.ok) {
        const d = await res.json();
        const best = (d.audioStreams || []).sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0))[0];
        if (best?.url) {
          return { url: best.url, quality: `${Math.round((best.bitrate || 0) / 1000)}kbps`, mimeType: best.mimeType || 'audio/webm', bitrate: best.bitrate, cors: false, expiresAt: Date.now() + 3 * 3600e3 };
        }
      }
    } catch { /* try invidious */ }
    try {
      const res = await nativeFetch(`${inst}/api/v1/videos/${encodeURIComponent(track.sourceId)}?local=true`);
      if (!res.ok) return null;
      const d = await res.json();
      const best = (d.adaptiveFormats || [])
        .filter((f: any) => String(f.type || '').startsWith('audio/'))
        .sort((a: any, b: any) => (parseInt(b.bitrate, 10) || 0) - (parseInt(a.bitrate, 10) || 0))[0];
      if (!best?.url) return null;
      const url = best.url.startsWith('/') ? inst + best.url : best.url;
      return { url, quality: `${Math.round((parseInt(best.bitrate, 10) || 0) / 1000)}kbps`, mimeType: String(best.type).split(';')[0], bitrate: parseInt(best.bitrate, 10) || undefined, cors: false, expiresAt: Date.now() + 3 * 3600e3 };
    } catch {
      return null;
    }
  },

  async getTrending(limit = 30): Promise<Track[]> {
    if (!isNativeApp()) return [];
    try {
      const j = await post('browse', { browseId: 'FEmusic_charts', formData: { selectedValues: ['IN'] } });
      const secs = j?.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents || [];
      const tracks: Track[] = secs.flatMap((s: any) => shelfTracks(s.musicShelfRenderer));
      if (!tracks.length) {
        const chart = secs
          .flatMap((s: any) => s.musicCarouselShelfRenderer?.contents || [])
          .map((c: any) => c.musicTwoRowItemRenderer?.navigationEndpoint?.browseEndpoint?.browseId)
          .find((id: any) => typeof id === 'string' && id.startsWith('VL'));
        if (chart) tracks.push(...(await this.getPlaylistDetails!(chart)).tracks);
      }
      return tracks.slice(0, limit);
    } catch {
      return [];
    }
  },

  async getRadio(seed: Track, limit = 25): Promise<Track[]> {
    if (!isNativeApp()) return [];
    let videoId = seed.source === 'youtube' ? seed.sourceId : '';
    if (!videoId) {
      const r = await this.search(`${seed.title} ${seed.artist}`, 1);
      videoId = r.tracks[0]?.sourceId || '';
    }
    if (!videoId) return [];
    try {
      const j = await post('next', { videoId, playlistId: `RDAMVM${videoId}`, isAudioOnly: true });
      const panel = j?.contents?.singleColumnMusicWatchNextResultsRenderer?.tabbedRenderer?.watchNextTabbedResultsRenderer
        ?.tabs?.[0]?.tabRenderer?.content?.musicQueueRenderer?.content?.playlistPanelRenderer?.contents || [];
      return (panel.map((p: any) => parsePanelItem(p.playlistPanelVideoRenderer)).filter(Boolean) as Track[])
        .filter(t => t.sourceId !== videoId && t.id !== seed.id)
        .slice(0, limit);
    } catch {
      return [];
    }
  },

  async getArtistDetails(artistId: string) {
    if (!isNativeApp()) throw new Error('YouTube Music is unavailable on web');
    const j = await post('browse', { browseId: artistId });
    const h = j?.header?.musicImmersiveHeaderRenderer || j?.header?.musicVisualHeaderRenderer || {};
    const name = runsText(h.title);
    const secs = j?.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents || [];
    const artist: Artist = {
      id: `yt-${artistId}`,
      name,
      image: thumbOf(h) || bestThumb(h.foregroundThumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails),
      bio: runsText(h.description),
      source: 'youtube',
      sourceId: artistId,
    };
    const topTracks: Track[] = [];
    const albums: Album[] = [];
    for (const s of secs) {
      if (s.musicShelfRenderer) topTracks.push(...shelfTracks(s.musicShelfRenderer, { artist: name, artistId: `yt-${artistId}` }));
      for (const c of s.musicCarouselShelfRenderer?.contents || []) {
        const a = parseTwoRow(c.musicTwoRowItemRenderer, name, `yt-${artistId}`);
        if (a) albums.push(a);
      }
    }
    return { artist, topTracks, albums };
  },

  async getAlbumDetails(albumId: string) {
    if (!isNativeApp()) throw new Error('YouTube Music is unavailable on web');
    const j = await post('browse', { browseId: albumId });
    const two = j?.contents?.twoColumnBrowseResultsRenderer;
    const h = two?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents?.[0]?.musicResponsiveHeaderRenderer
      || j?.header?.musicDetailHeaderRenderer || {};
    const artistRuns: any[] = (h.straplineTextOne?.runs || h.subtitle?.runs || []).filter((r: any) => pageType(r) === 'MUSIC_PAGE_TYPE_ARTIST');
    const sub: string[] = (h.subtitle?.runs || []).map((r: any) => r.text);
    const year = parseInt(sub.find(s => /^\d{4}$/.test(s)) || '', 10);
    const album: Album = {
      id: `yt-${albumId}`,
      title: runsText(h.title),
      artist: artistRuns.map(r => r.text).join(', ') || runsText(h.straplineTextOne),
      artistId: ytId(browseId(artistRuns[0])),
      thumbnail: thumbOf(h),
      year: Number.isFinite(year) ? year : undefined,
      source: 'youtube',
      sourceId: albumId,
    };
    const shelf = two?.secondaryContents?.sectionListRenderer?.contents?.[0]?.musicShelfRenderer;
    const tracks = shelfTracks(shelf, { artist: album.artist, artistId: album.artistId, album: album.title, albumId: album.id, thumbnail: album.thumbnail });
    album.trackCount = tracks.length;
    return { album, tracks };
  },

  async getPlaylistDetails(playlistId: string) {
    if (!isNativeApp()) throw new Error('YouTube Music is unavailable on web');
    const id = playlistId.startsWith('VL') ? playlistId : `VL${playlistId}`;
    const j = await post('browse', { browseId: id });
    const two = j?.contents?.twoColumnBrowseResultsRenderer;
    const h = two?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents?.[0]?.musicResponsiveHeaderRenderer
      || j?.header?.musicDetailHeaderRenderer || {};
    const c0 = two?.secondaryContents?.sectionListRenderer?.contents?.[0]
      || j?.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents?.[0];
    const shelf = c0?.musicPlaylistShelfRenderer || c0?.musicShelfRenderer;
    return { title: runsText(h.title) || 'YouTube Playlist', thumbnail: thumbOf(h), tracks: shelfTracks(shelf) };
  },

  async getPlaylist(playlistId: string): Promise<Track[]> {
    if (!isNativeApp()) return [];
    try {
      return (await this.getPlaylistDetails!(playlistId)).tracks;
    } catch {
      return [];
    }
  },
};
