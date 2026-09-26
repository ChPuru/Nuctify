import { MusicProvider, SearchResults, Track, StreamInfo } from './types';
import { nativeFetch } from '../utils/env';

export const podcastProvider: MusicProvider = {
  name: 'podcast',
  displayName: 'Podcasts',
  icon: 'podcasts',
  color: '#8e24aa',
  enabled: true,

  async search(query: string, limit = 20, opts?: { signal?: AbortSignal }): Promise<SearchResults> {
    try {
      const response = await nativeFetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=podcastEpisode&limit=${limit}`, { signal: opts?.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      
      const tracks: Track[] = (data.results || []).filter((item: any) => item.episodeUrl || item.previewUrl).map((item: any) => ({
        id: `pc-${item.trackId}`,
        title: item.trackName,
        artist: item.artistName || 'Unknown Host',
        album: item.collectionName,
        duration: Math.round(item.trackTimeMillis / 1000) || 0,
        thumbnail: item.artworkUrl600 || item.artworkUrl100,
        source: 'podcast',
        sourceId: item.episodeUrl || item.previewUrl,
        year: item.releaseDate ? new Date(item.releaseDate).getFullYear() : undefined,
      }));

      return { tracks, albums: [], artists: [], source: 'podcast' };
    } catch (error) {
      console.error('[Podcast] Search failed:', error);
      return { tracks: [], albums: [], artists: [], source: 'podcast' };
    }
  },

  async getStreamUrl(track: Track): Promise<StreamInfo | null> {
    return {
      url: track.sourceId,
      quality: 'High',
      mimeType: 'audio/mpeg',
      cors: false,
    };
  }
};
