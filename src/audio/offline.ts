import type Dexie from 'dexie';
import type { EntityTable } from 'dexie';
import { Track } from '../providers/types';
import { registry } from '../providers';
import { nativeFetch, isTauriApp } from '../utils/env';

export interface OfflineTrack {
  id: string;
  track: Track;
  blob: Blob;
  downloadedAt: number;
}

type OfflineDB = Dexie & { tracks: EntityTable<OfflineTrack, 'id'> };

const IDS_KEY = 'nuctify_dl_ids';
let dbPromise: Promise<OfflineDB> | null = null;
let ids: Set<string> | null = null;
const objectUrls: string[] = [];

export type DownloadEvent = { ids: Set<string>; progress: Record<string, number> };
const listeners = new Set<(e: DownloadEvent) => void>();
const progress: Record<string, number> = {};

function emit() {
  const e: DownloadEvent = { ids: new Set(ids || []), progress: { ...progress } };
  listeners.forEach(cb => { try { cb(e); } catch { /* ignore */ } });
}

export function onChange(cb: (e: DownloadEvent) => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export async function getDownloadedIds(): Promise<Set<string>> {
  return new Set(await getIds());
}

export function getDownloadProgress(): Record<string, number> {
  return { ...progress };
}

function getDb(): Promise<OfflineDB> {
  return (dbPromise ??= import('dexie').then(({ default: DexieCtor }) => {
    const db = new DexieCtor('NuctifyOfflineDB') as OfflineDB;
    db.version(1).stores({ tracks: 'id, downloadedAt' });
    return db;
  }));
}

function saveIds() {
  try { localStorage.setItem(IDS_KEY, JSON.stringify(Array.from(ids || []))); } catch { /* ignore */ }
}

async function getIds(): Promise<Set<string>> {
  if (ids) return ids;
  let stored: string | null = null;
  try { stored = localStorage.getItem(IDS_KEY); } catch { /* ignore */ }
  if (stored) {
    try { ids = new Set(JSON.parse(stored)); return ids; } catch { /* rebuild */ }
  }
  const db = await getDb();
  ids = new Set((await db.tracks.toCollection().primaryKeys()) as string[]);
  saveIds();
  return ids;
}

export async function isDownloaded(trackId: string): Promise<boolean> {
  return (await getIds()).has(trackId);
}

export async function downloadTrack(track: Track, onProgress?: (percent: number) => void): Promise<void> {
  if (track.id in progress) return;
  progress[track.id] = 0;
  emit();
  let last = 0;
  try {
    await fetchAndStore(track, (p) => {
      progress[track.id] = p;
      onProgress?.(p);
      const now = Date.now();
      if (now - last > 250 || p >= 100) { last = now; emit(); }
    });
  } finally {
    delete progress[track.id];
    emit();
  }
}

async function fetchAndStore(track: Track, onProgress: (percent: number) => void): Promise<void> {
  const resolved = await registry.resolveStream(track);
  if (!resolved) throw new Error('Could not resolve stream URL for downloading.');
  const streamUrl = resolved.stream.url;

  const response = isTauriApp() ? await nativeFetch(streamUrl) : await fetch(streamUrl);
  if (!response.ok) throw new Error(`Network error while downloading track (HTTP ${response.status})`);
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
      if (total > 0) onProgress(Math.round((received / total) * 100));
    }
  }

  const blob = new Blob(chunks as BlobPart[], { type: response.headers.get('content-type') || resolved.stream.mimeType || 'audio/mpeg' });
  const { alternatives: _alts, streamUrl: _url, ...plain } = track;

  const db = await getDb();
  await db.tracks.put({ id: track.id, track: plain, blob, downloadedAt: Date.now() });
  (await getIds()).add(track.id);
  saveIds();
}

export async function removeTrack(trackId: string): Promise<void> {
  const db = await getDb();
  await db.tracks.delete(trackId);
  (await getIds()).delete(trackId);
  saveIds();
  emit();
}

export async function getOfflineStreamUrl(trackId: string): Promise<string | null> {
  if (!(await getIds()).has(trackId)) return null;
  const db = await getDb();
  const offlineData = await db.tracks.get(trackId);
  if (!offlineData) return null;
  const url = URL.createObjectURL(offlineData.blob);
  objectUrls.push(url);
  while (objectUrls.length > 2) URL.revokeObjectURL(objectUrls.shift()!);
  return url;
}

export async function getAllOfflineTracks(): Promise<Track[]> {
  const db = await getDb();
  const records = await db.tracks.orderBy('downloadedAt').reverse().toArray();
  return records.map(r => r.track);
}
