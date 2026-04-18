import { Lyrics, LyricLine } from '../providers/types';
import { nativeFetch } from '../utils/env';

const LRCLIB_PROXY = '/api/lrclib';

function parseLRC(lrc: string): LyricLine[] {
  const lines: LyricLine[] = [];
  const regex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]\s*(.*)/g;
  let match;

while ((match = regex.exec(lrc)) !== null) {
    const minutes = parseInt(match[1], 10);
    const seconds = parseInt(match[2], 10);
    const centiseconds = parseInt(match[3], 10);
    const text = match[4].trim();

const time = minutes * 60 + seconds + centiseconds / (match[3].length === 3 ? 1000 : 100);
    if (text) {
      lines.push({ time, text });
    }
  }

return lines.sort((a, b) => a.time - b.time);
}

export async function fetchLyrics(
  title: string,
  artist: string,
  duration?: number
): Promise<Lyrics | null> {
  try {

let url = `${LRCLIB_PROXY}/api/get?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(title)}`;
    if (duration) {
      url += `&duration=${Math.round(duration)}`;
    }

let response = await nativeFetch(url, {
      headers: { 'User-Agent': 'Nuctify/0.1.0' },
    });

if (!response.ok) {
      const searchUrl = `${LRCLIB_PROXY}/api/search?q=${encodeURIComponent(`${artist} ${title}`)}`;
      response = await nativeFetch(searchUrl, {
        headers: { 'User-Agent': 'Nuctify/0.1.0' },
      });

if (!response.ok) return null;

const results = await response.json();
      if (!results || results.length === 0) return null;

const best = results[0];
      return {
        plain: best.plainLyrics || undefined,
        synced: best.syncedLyrics ? parseLRC(best.syncedLyrics) : undefined,
        source: 'LRCLIB',
      };
    }

const data = await response.json();
    return {
      plain: data.plainLyrics || undefined,
      synced: data.syncedLyrics ? parseLRC(data.syncedLyrics) : undefined,
      source: 'LRCLIB',
    };
  } catch (error) {
    console.error('[Lyrics] Fetch failed:', error);
    return null;
  }
}
