import { MusicProvider, SearchResults, Track, StreamInfo } from './types';
import { nativeFetch } from '../utils/env';

const JIOSAAVN_INSTANCES = [
  '/api/jio1',
  '/api/jio2',
];

const instanceHealth: Map<string, { failures: number; lastFail: number }> = new Map();
const FAILURE_THRESHOLD = 3;
const COOLDOWN_MS = 5 * 60 * 1000;

function isHealthy(instance: string): boolean {
  const h = instanceHealth.get(instance);
  if (!h) return true;
  if (h.failures >= FAILURE_THRESHOLD && Date.now() - h.lastFail < COOLDOWN_MS) return false;
  if (h.failures >= FAILURE_THRESHOLD) { instanceHealth.delete(instance); }
  return true;
}

function markFailed(instance: string) {
  const h = instanceHealth.get(instance) || { failures: 0, lastFail: 0 };
  h.failures++;
  h.lastFail = Date.now();
  instanceHealth.set(instance, h);
}

function markSuccess(instance: string) {
  instanceHealth.delete(instance);
}

async function safeFetch(url: string, timeoutMs = 12000): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await nativeFetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

return data.data || data;
  } catch (e: any) {
    clearTimeout(timeout);
    throw e;
  }
}

function parseTrack(item: any): Track {

let thumbnail = '';
  if (Array.isArray(item.image)) {
    thumbnail = item.image[2]?.link || item.image[2]?.url
      || item.image[1]?.link || item.image[1]?.url
      || item.image[0]?.link || item.image[0]?.url || '';
  } else if (typeof item.image === 'string') {
    thumbnail = item.image;
  }

let artist = 'Unknown Artist';
  if (item.primaryArtists && typeof item.primaryArtists === 'string') {
    artist = item.primaryArtists;
  } else if (item.artists?.primary) {
    artist = item.artists.primary.map((a: any) => a.name).join(', ');
  } else if (item.artist) {
    artist = item.artist;
  } else if (item.more_info?.artistMap?.primary_artists) {
    artist = item.more_info.artistMap.primary_artists.map((a: any) => a.name).join(', ');
  }

let bestUrl = '';
  const downloadUrls = item.downloadUrl || item.download_url || [];
  if (Array.isArray(downloadUrls) && downloadUrls.length > 0) {
    const best = downloadUrls[downloadUrls.length - 1];
    bestUrl = best?.url || best?.link || '';
  }

return {
    id: `jio-${item.id}`,
    title: item.name || item.title || item.song || 'Unknown',
    artist,
    album: item.album?.name || item.album || item.more_info?.album || '',
    duration: parseInt(item.duration || item.more_info?.duration || '0', 10),
    thumbnail,
    source: 'jiosaavn' as const,
    sourceId: item.id || '',
    year: item.year ? parseInt(item.year, 10) : undefined,
    genre: item.language || '',

streamUrl: bestUrl,
  };
}

function extractStreamUrl(song: any): StreamInfo | null {

const downloadUrls = song.downloadUrl || song.download_url || [];
  if (Array.isArray(downloadUrls) && downloadUrls.length > 0) {

const best = downloadUrls[downloadUrls.length - 1];
    const url = best?.url || best?.link;
    if (url) {
      return {
        url,
        quality: best.quality || '320kbps',
        mimeType: 'audio/mp4',
        bitrate: 320000,
      };
    }
  }

const downloadLinks = song.downloadLinks || song.download_links;
  if (downloadLinks) {

if (typeof downloadLinks === 'object' && !Array.isArray(downloadLinks)) {
      const url = downloadLinks['320kbps'] || downloadLinks['160kbps'] || downloadLinks['96kbps'];
      if (url) return { url, quality: '320kbps', mimeType: 'audio/mp4', bitrate: 320000 };
    }
  }

const directUrl = song.media_url || song.media_preview_url;
  if (directUrl) {

const fullUrl = directUrl.replace(/_96_p\.mp4$/, '_320.mp4')
                             .replace(/preview\.saavncdn\.com/, 'aac.saavncdn.com')
                             .replace(/_96\.mp4$/, '_320.mp4');
    return { url: fullUrl, quality: '320kbps', mimeType: 'audio/mp4', bitrate: 320000 };
  }

if (song.more_info?.encrypted_media_url) {
    return {
      url: song.more_info.encrypted_media_url,
      quality: '320kbps',
      mimeType: 'audio/mp4',
      bitrate: 320000,
    };
  }

return null;
}

export const jiosaavnProvider: MusicProvider = {
  name: 'jiosaavn',
  displayName: 'JioSaavn',
  icon: '♪',
  color: '#2bc5b4',
  enabled: true,

async search(query: string, limit = 20): Promise<SearchResults> {
    for (const base of JIOSAAVN_INSTANCES) {
      if (!isHealthy(base)) continue;
      try {
        const data = await safeFetch(
          `${base}/search/songs?query=${encodeURIComponent(query)}&limit=${limit}`
        );
        if (!data) continue;

const results = data.results || data || [];
        const items = Array.isArray(results) ? results : [];
        if (items.length === 0) continue;

markSuccess(base);
        const tracks: Track[] = items.slice(0, limit).map(parseTrack);
        console.log(`[JioSaavn] Found ${tracks.length} tracks via ${base}`);
        return { tracks, albums: [], artists: [], source: 'jiosaavn' };
      } catch (e: any) {
        console.warn(`[JioSaavn] ${base} search failed:`, e.message);
        markFailed(base);
      }
    }

return { tracks: [], albums: [], artists: [], source: 'jiosaavn' };
  },

async getStreamUrl(track: Track): Promise<StreamInfo | null> {

if (track.streamUrl) {
      return {
        url: track.streamUrl,
        quality: '320kbps',
        mimeType: 'audio/mp4',
        bitrate: 320000,
      };
    }

for (const base of JIOSAAVN_INSTANCES) {
      if (!isHealthy(base)) continue;
      try {

const data = await safeFetch(`${base}/songs/${track.sourceId}`);
        if (!data) continue;

const song = Array.isArray(data) ? data[0] : data;
        if (!song) continue;

const stream = extractStreamUrl(song);
        if (stream) {
          markSuccess(base);
          console.log(`[JioSaavn] Got stream URL from ${base}: ${stream.quality}`);
          return stream;
        }
      } catch (e: any) {
        console.warn(`[JioSaavn] ${base} stream failed:`, e.message);
        markFailed(base);
      }
    }

return null;
  },

async getTrending(limit = 30): Promise<Track[]> {
    for (const base of JIOSAAVN_INSTANCES) {
      if (!isHealthy(base)) continue;
      try {
        const data = await safeFetch(
          `${base}/search/songs?query=trending+bollywood+new+2025&limit=${limit}`
        );
        if (!data) continue;

const results = data.results || data || [];
        const items = Array.isArray(results) ? results : [];
        if (items.length > 0) {
          markSuccess(base);
          return items.slice(0, limit).map(parseTrack);
        }
      } catch (e: any) {
        markFailed(base);
      }
    }
    return [];
  },
};
