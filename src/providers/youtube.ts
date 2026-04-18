import { MusicProvider, SearchResults, Track, StreamInfo } from './types';
import { nativeFetch } from '../utils/env';

const INVIDIOUS_INSTANCES = [
  '/api/inv1',
  '/api/inv2',
  '/api/inv3',
  '/api/invidious1',
];

const PIPED_INSTANCES = [
  '/api/piped1',
  '/api/piped2',
  '/api/piped3',
];

const instanceHealth: Map<string, { failures: number; lastFail: number }> = new Map();
const FAILURE_THRESHOLD = 3;
const COOLDOWN_MS = 5 * 60 * 1000;

function isHealthy(instance: string): boolean {
  const h = instanceHealth.get(instance);
  if (!h) return true;
  if (h.failures >= FAILURE_THRESHOLD) {

if (Date.now() - h.lastFail > COOLDOWN_MS) {
      instanceHealth.delete(instance);
      return true;
    }
    return false;
  }
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

async function safeFetch(url: string, timeoutMs = 10000): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await nativeFetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e: any) {
    clearTimeout(timeout);
    throw e;
  }
}

function cleanArtistName(name: string): string {
  return name
    .replace(/ - Topic$/i, '')
    .replace(/VEVO$/i, '')
    .replace(/ Official$/i, '')
    .replace(/ Music$/i, '')
    .trim();
}

async function searchWithRotation(query: string, limit: number): Promise<Track[]> {

for (const base of INVIDIOUS_INSTANCES) {
    if (!isHealthy(base)) continue;
    try {
      const data = await safeFetch(
        `${base}/api/v1/search?q=${encodeURIComponent(query)}&type=video&sort_by=relevance`
      );
      if (!Array.isArray(data)) continue;

markSuccess(base);
      return data
        .filter((item: any) => item.type === 'video' && item.lengthSeconds > 0)
        .slice(0, limit)
        .map((item: any) => ({
          id: `yt-${item.videoId}`,
          title: item.title || 'Unknown',
          artist: cleanArtistName(item.author || 'Unknown Artist'),
          album: '',
          duration: item.lengthSeconds || 0,
          thumbnail: item.videoThumbnails?.[4]?.url
            || item.videoThumbnails?.[3]?.url
            || item.videoThumbnails?.[0]?.url
            || '',
          source: 'youtube' as const,
          sourceId: item.videoId || '',
        }));
    } catch (e: any) {
      console.warn(`[YouTube] Invidious ${base} search failed:`, e.message);
      markFailed(base);
    }
  }

for (const base of PIPED_INSTANCES) {
    if (!isHealthy(base)) continue;
    try {
      const data = await safeFetch(
        `${base}/search?q=${encodeURIComponent(query)}&filter=videos`
      );
      if (!data?.items?.length && !Array.isArray(data)) continue;

const items = data.items || data;
      markSuccess(base);

return items
        .filter((item: any) => item.duration > 0)
        .slice(0, limit)
        .map((item: any) => {

const videoId = item.url?.replace('/watch?v=', '') || '';
          return {
            id: `yt-${videoId}`,
            title: item.title || 'Unknown',
            artist: cleanArtistName(item.uploaderName || item.uploader || 'Unknown Artist'),
            album: '',
            duration: item.duration || 0,
            thumbnail: item.thumbnail || '',
            source: 'youtube' as const,
            sourceId: videoId,
          };
        });
    } catch (e: any) {
      console.warn(`[YouTube] Piped ${base} search failed:`, e.message);
      markFailed(base);
    }
  }

return [];
}

async function getStreamWithRotation(videoId: string): Promise<StreamInfo | null> {

for (const base of PIPED_INSTANCES) {
    if (!isHealthy(base)) continue;
    try {
      const data = await safeFetch(`${base}/streams/${videoId}`);

if (data?.audioStreams?.length) {
        markSuccess(base);

const best = data.audioStreams
          .filter((s: any) => !s.videoOnly)
          .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0))[0];

if (best?.url) {
          return {
            url: best.url,
            quality: best.quality || `${Math.round((best.bitrate || 0) / 1000)}kbps`,
            mimeType: best.mimeType || 'audio/mp4',
            bitrate: best.bitrate || 0,
          };
        }
      }
    } catch (e: any) {
      console.warn(`[YouTube] Piped ${base} stream failed:`, e.message);
      markFailed(base);
    }
  }

for (const base of INVIDIOUS_INSTANCES) {
    if (!isHealthy(base)) continue;
    try {
      const data = await safeFetch(`${base}/api/v1/videos/${videoId}`);

if (data?.adaptiveFormats) {
        const audioFormats = data.adaptiveFormats
          .filter((f: any) => f.type?.startsWith('audio/'))
          .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));

if (audioFormats.length > 0) {
          markSuccess(base);
          const best = audioFormats[0];
          return {
            url: best.url,
            quality: `${Math.round((best.bitrate || 0) / 1000)}kbps`,
            mimeType: best.type?.split(';')[0] || 'audio/webm',
            bitrate: best.bitrate,
          };
        }
      }

if (data?.formatStreams?.length) {
        markSuccess(base);
        const stream = data.formatStreams[0];
        if (stream?.url) {
          return {
            url: stream.url,
            quality: stream.qualityLabel || 'auto',
            mimeType: stream.type?.split(';')[0] || 'video/mp4',
          };
        }
      }
    } catch (e: any) {
      console.warn(`[YouTube] Invidious ${base} stream failed:`, e.message);
      markFailed(base);
    }
  }

return null;
}

export const youtubeProvider: MusicProvider = {
  name: 'youtube',
  displayName: 'YouTube',
  icon: '▶',
  color: '#ff0033',
  enabled: true,

async search(query: string, limit = 20): Promise<SearchResults> {
    try {
      const tracks = await searchWithRotation(query, limit);
      console.log(`[YouTube] Found ${tracks.length} tracks for "${query}"`);
      return { tracks, albums: [], artists: [], source: 'youtube' };
    } catch (error) {
      console.error('[YouTube] Search failed entirely:', error);
      return { tracks: [], albums: [], artists: [], source: 'youtube' };
    }
  },

async getStreamUrl(track: Track): Promise<StreamInfo | null> {
    try {
      return await getStreamWithRotation(track.sourceId);
    } catch (error) {
      console.error('[YouTube] Stream fetch failed entirely:', error);
      return null;
    }
  },

async getTrending(limit = 30): Promise<Track[]> {

for (const base of PIPED_INSTANCES) {
      if (!isHealthy(base)) continue;
      try {
        const data = await safeFetch(`${base}/trending?region=IN`);
        if (Array.isArray(data) && data.length > 0) {
          markSuccess(base);
          return data
            .filter((item: any) => item.duration > 0)
            .slice(0, limit)
            .map((item: any) => {
              const videoId = item.url?.replace('/watch?v=', '') || '';
              return {
                id: `yt-${videoId}`,
                title: item.title || 'Unknown',
                artist: cleanArtistName(item.uploaderName || item.uploader || 'Unknown Artist'),
                duration: item.duration || 0,
                thumbnail: item.thumbnail || '',
                source: 'youtube' as const,
                sourceId: videoId,
              };
            });
        }
      } catch (e: any) {
        console.warn(`[YouTube] Piped ${base} trending failed:`, e.message);
        markFailed(base);
      }
    }

return searchWithRotation('trending music 2025', limit);
  },
};
