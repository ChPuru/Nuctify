import { MusicProvider, SearchResults, Track, StreamInfo } from './types';
import { nativeFetch, isNativeApp } from '../utils/env';

export const youtubeProvider: MusicProvider = {
  name: 'youtube',
  displayName: 'YouTube',
  icon: '▶',
  color: '#ff0033',
  enabled: true,

  async search(query: string, limit = 20): Promise<SearchResults> {
    try {
      // Disable YouTube on Web for now as requested
      if (!isNativeApp()) {
        return { tracks: [], albums: [], artists: [], source: 'youtube' };
      }

      // Keep YouTube on Mobile (Native) as it works via CapacitorHttp
      const response = await nativeFetch(`https://pipedapi.kavin.rocks/search?q=${encodeURIComponent(query)}&filter=videos`);
      const data = await response.json();
      const items = data.items || data;
      const tracks: Track[] = items.slice(0, limit).map((item: any) => {
        const videoId = item.url?.split('v=')[1] || item.url?.split('/').pop() || '';
        return {
          id: `yt-${videoId}`,
          title: item.title,
          artist: item.uploaderName || item.uploader || 'Unknown',
          duration: item.duration || 0,
          thumbnail: item.thumbnail || '',
          source: 'youtube' as const,
          sourceId: videoId,
        };
      });
      return { tracks, albums: [], artists: [], source: 'youtube' };
    } catch (error) {
      console.error('[YouTube] Search failed:', error);
      return { tracks: [], albums: [], artists: [], source: 'youtube' };
    }
  },

  async getStreamUrl(track: Track): Promise<StreamInfo | null> {
    try {
      // YouTube streaming also disabled on web for now
      if (!isNativeApp()) return null;

      const response = await nativeFetch(`https://pipedapi.kavin.rocks/streams/${track.sourceId}`);
      const data = await response.json();
      const best = data.audioStreams?.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0))[0];
      if (!best) return null;
      return {
        url: best.url,
        quality: `${Math.round((best.bitrate || 0) / 1000)}kbps`,
        mimeType: best.format || 'audio/webm',
        bitrate: best.bitrate || 128000,
      };
    } catch (error) {
      console.error('[YouTube] Stream failed:', error);
      return null;
    }
  },

  async getTrending(limit = 30): Promise<Track[]> {
    if (!isNativeApp()) return [];
    const results = await this.search('trending music 2025', limit);
    return results.tracks;
  },
};
