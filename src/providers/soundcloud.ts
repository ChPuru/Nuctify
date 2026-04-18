import { MusicProvider, SearchResults, Track, StreamInfo } from './types';
import { nativeFetch } from '../utils/env';

const SC_PROXY = '/api/soundcloud';
const SC_SITE_PROXY = '/api/sc-site';
const SC_CDN_PROXY = '/api/sc-cdn';

let clientId = '';

async function extractClientId(): Promise<string> {
  if (clientId) return clientId;

try {
    const response = await nativeFetch(SC_SITE_PROXY);
    const html = await response.text();

const scriptMatches = html.match(/https:\/\/a-v2\.sndcdn\.com\/assets\/([a-zA-Z0-9-]+\.js)/g) || [];

for (const fullUrl of scriptMatches.slice(-5)) {
      try {
        const assetPath = fullUrl.replace('https://a-v2.sndcdn.com', SC_CDN_PROXY);
        const scriptRes = await nativeFetch(assetPath);
        const scriptText = await scriptRes.text();
        const match = scriptText.match(/client_id:"([a-zA-Z0-9]+)"/);
        if (match) {
          clientId = match[1];
          console.log('[SoundCloud] Got client ID');
          return clientId;
        }
      } catch {
        continue;
      }
    }
  } catch (error) {
    console.error('[SoundCloud] Client ID extraction failed:', error);
  }

return '';
}

export const soundcloudProvider: MusicProvider = {
  name: 'soundcloud',
  displayName: 'SoundCloud',
  icon: '☁',
  color: '#ff5500',
  enabled: true,

async search(query: string, limit = 20): Promise<SearchResults> {
    try {
      const cid = await extractClientId();
      if (!cid) {
        console.warn('[SoundCloud] No client ID available');
        return { tracks: [], albums: [], artists: [], source: 'soundcloud' };
      }

const url = `${SC_PROXY}/search/tracks?q=${encodeURIComponent(query)}&client_id=${cid}&limit=${limit}&linked_partitioning=true`;
      const response = await nativeFetch(url);

if (!response.ok) {
        throw new Error(`SoundCloud API error: ${response.status}`);
      }

const data = await response.json();
      const tracks: Track[] = (data.collection || []).map((item: any) => ({
        id: `sc-${item.id}`,
        title: item.title || 'Unknown',
        artist: item.user?.username || 'Unknown Artist',
        album: '',
        duration: Math.round((item.full_duration || item.duration || 0) / 1000),
        thumbnail: item.artwork_url?.replace('-large', '-t500x500') || item.user?.avatar_url || '',
        source: 'soundcloud' as const,
        sourceId: String(item.id),
        genre: item.genre || '',
      }));

return { tracks, albums: [], artists: [], source: 'soundcloud' };
    } catch (error) {
      console.error('[SoundCloud] Search failed:', error);
      return { tracks: [], albums: [], artists: [], source: 'soundcloud' };
    }
  },

async getStreamUrl(track: Track): Promise<StreamInfo | null> {
    try {
      const cid = await extractClientId();
      if (!cid) return null;

const url = `${SC_PROXY}/tracks/${track.sourceId}?client_id=${cid}`;
      const response = await nativeFetch(url);
      if (!response.ok) return null;

const data = await response.json();

const progressive = data.media?.transcodings?.find(
        (t: any) => t.format?.protocol === 'progressive'
      );

if (progressive) {
        const streamRes = await nativeFetch(`${SC_PROXY}${new URL(progressive.url).pathname}?client_id=${cid}`);
        const streamData = await streamRes.json();
        return {
          url: streamData.url,
          quality: '128kbps',
          mimeType: progressive.format?.mime_type || 'audio/mpeg',
          bitrate: 128000,
        };
      }

return null;
    } catch (error) {
      console.error('[SoundCloud] Stream fetch failed:', error);
      return null;
    }
  },

async getTrending(limit = 30): Promise<Track[]> {
    try {
      const cid = await extractClientId();
      if (!cid) return [];

const url = `${SC_PROXY}/charts?kind=trending&genre=soundcloud:genres:all-music&client_id=${cid}&limit=${limit}`;
      const response = await nativeFetch(url);
      const data = await response.json();

return (data.collection || []).map((item: any) => ({
        id: `sc-${item.track?.id}`,
        title: item.track?.title || 'Unknown',
        artist: item.track?.user?.username || 'Unknown Artist',
        duration: Math.round((item.track?.full_duration || 0) / 1000),
        thumbnail: item.track?.artwork_url?.replace('-large', '-t500x500') || '',
        source: 'soundcloud' as const,
        sourceId: String(item.track?.id || ''),
      }));
    } catch {
      return [];
    }
  },
};
