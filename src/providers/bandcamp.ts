import { MusicProvider, SearchResults, Track, StreamInfo } from './types';
import { nativeFetch } from '../utils/env';

export const bandcampProvider: MusicProvider = {
  name: 'bandcamp',
  displayName: 'Bandcamp',
  icon: '♫',
  color: '#1da0c3',
  enabled: false,

async search(query: string, limit = 20): Promise<SearchResults> {
    try {

const response = await nativeFetch('/api/bandcamp/api/bcsearch_public_api/1/autocomplete_elastic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ search_text: query, search_filter: 't', full_page: false, fan_id: null }),
      });
      if (!response.ok) {
        return { tracks: [], albums: [], artists: [], source: 'bandcamp' };
      }

const data = await response.json();
      const tracks: Track[] = (data.auto?.results || [])
        .filter((item: any) => item.type === 't')
        .slice(0, limit)
        .map((item: any) => ({
          id: `bc-${item.id}`,
          title: item.name || 'Unknown',
          artist: item.band_name || 'Unknown Artist',
          album: item.album_name || '',
          duration: 0,
          thumbnail: item.img || '',
          source: 'bandcamp' as const,
          sourceId: String(item.id || ''),
        }));

return { tracks, albums: [], artists: [], source: 'bandcamp' };
    } catch (error) {
      console.error('[Bandcamp] Search failed:', error);
      return { tracks: [], albums: [], artists: [], source: 'bandcamp' };
    }
  },

async getStreamUrl(track: Track): Promise<StreamInfo | null> {

try {

console.warn('[Bandcamp] Streaming not available in web mode');
      return null;
    } catch {
      return null;
    }
  },
};
