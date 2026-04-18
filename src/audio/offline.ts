import Dexie, { type EntityTable } from 'dexie';
import { Track } from '../providers/types';
import { registry } from '../providers';

export interface OfflineTrack {
  id: string;
  track: Track;
  blob: Blob;
  downloadedAt: number;
}

const db = new Dexie('NuctifyOfflineDB') as Dexie & {
  tracks: EntityTable<OfflineTrack, 'id'>;
};

db.version(1).stores({
  tracks: 'id, downloadedAt',
});

export async function isDownloaded(trackId: string): Promise<boolean> {
  const count = await db.tracks.where('id').equals(trackId).count();
  return count > 0;
}

export async function downloadTrack(track: Track, onProgress?: (percent: number) => void): Promise<void> {
  let streamUrl = track.streamUrl;

if (!streamUrl) {
    const provider = registry.get(track.source);
    if (!provider) throw new Error(`Provider ${track.source} not found.`);
    const streamInfo = await provider.getStreamUrl(track);
    if (!streamInfo) throw new Error('Could not resolve stream URL for downloading.');
    streamUrl = streamInfo.url;
  }

const response = await fetch(streamUrl);
  if (!response.ok) throw new Error('Network error while downloading track');
  if (!response.body) throw new Error('ReadableStream not supported in this browser.');

const contentLength = response.headers.get('content-length');
  const total = contentLength ? parseInt(contentLength, 10) : 0;

let received = 0;
  const chunks: Uint8Array[] = [];

const reader = response.body.getReader();

while (true) {
    const { done, value } = await reader.read();
    if (done) break;

if (value) {
      chunks.push(value);
      received += value.length;
      if (total > 0 && onProgress) {
        onProgress(Math.round((received / total) * 100));
      }
    }
  }

const blob = new Blob(chunks as any[], { type: response.headers.get('content-type') || 'audio/mpeg' });

await db.tracks.put({
    id: track.id,
    track,
    blob,
    downloadedAt: Date.now(),
  });
}

export async function removeTrack(trackId: string): Promise<void> {
  await db.tracks.delete(trackId);
}

export async function getOfflineStreamUrl(trackId: string): Promise<string | null> {
  const offlineData = await db.tracks.get(trackId);
  if (!offlineData) return null;

return URL.createObjectURL(offlineData.blob);
}

export async function getAllOfflineTracks(): Promise<Track[]> {
  const records = await db.tracks.orderBy('downloadedAt').reverse().toArray();
  return records.map(r => r.track);
}
