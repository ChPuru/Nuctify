import type { RealtimeChannel } from '@supabase/supabase-js';
import type { Playlist, Track } from '../providers/types';
import { useLibraryStore, slimTrack } from '../store';
import { useAuthStore } from '../store/auth';
import { getSupabase } from '../integrations/supabase';
import { requireSocial, socialStatus, genCode, normalizeCode, toast } from './common';

/**
 * Collaborative playlists: the shared copy lives in `collab_playlists` (tracks jsonb of CollabEntry);
 * each member keeps a linked local playlist (`collabId`). Local edits are diffed against the last
 * known remote state and pushed via atomic RPCs; remote changes arrive via postgres_changes.
 */

export interface CollabEntry { track: Track; addedBy: { id: string; name: string }; addedAt: number }
export interface CollabRow { id: string; code: string; name: string; owner: string; tracks: CollabEntry[]; updated_at: string }
export interface CollabMember { user_id: string; display_name: string; avatar_url?: string | null }
export type LinkedPlaylist = Playlist & { collabId?: string; collabCode?: string; collabAddedBy?: Record<string, string> };

const BASE_KEY = 'nuctify_collab_base';
const PLAYLISTS_KEY = 'nuctify_playlists';

/**
 * collabId -> track ids last seen remotely + when we applied them. Persisted so offline edits can be pushed later.
 * A linked playlist whose updatedAt is newer than `at` has un-pushed local edits; older/equal means it's a stale copy
 * (e.g. restored from cloud library sync) and the server wins.
 */
type Base = { ids: string[]; at: number };
const base: Record<string, Base> = (() => {
  try {
    const v = JSON.parse(localStorage.getItem(BASE_KEY) || '{}') || {};
    return Object.fromEntries(Object.entries(v).filter(([, b]) => Array.isArray((b as Base)?.ids))) as Record<string, Base>;
  } catch { return {}; }
})();
const saveBase = () => { try { localStorage.setItem(BASE_KEY, JSON.stringify(base)); } catch { /* ignore */ } };

const channels = new Map<string, RealtimeChannel>();
// supabase-js reuses channels by topic, so they must be removed (not just unsubscribed).
const dropChannel = (id: string) => { const c = channels.get(id); if (c) getSupabase()?.removeChannel(c); channels.delete(id); };
let started = false;
let unsubLib: (() => void) | null = null;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let applying = false;

const linked = (): LinkedPlaylist[] => (useLibraryStore.getState().playlists as LinkedPlaylist[]).filter((p) => !!p.collabId);
export const findLinked = (collabId: string) => linked().find((p) => p.collabId === collabId);
const hasLocalEdits = (p: LinkedPlaylist | undefined, b: Base | undefined): p is LinkedPlaylist =>
  !!p && !!b && p.updatedAt > b.at && p.tracks.map((t) => t.id).join('|') !== b.ids.join('|');

function writePlaylists(update: (p: LinkedPlaylist) => LinkedPlaylist | null) {
  applying = true;
  try {
    const playlists = (useLibraryStore.getState().playlists as LinkedPlaylist[])
      .map((p) => update(p)).filter((p): p is LinkedPlaylist => !!p);
    useLibraryStore.setState({ playlists });
    try { localStorage.setItem(PLAYLISTS_KEY, JSON.stringify(playlists)); } catch { /* ignore */ }
  } finally {
    applying = false;
  }
}

/** Adopt the server copy, re-applying any not-yet-pushed local adds/removes on top of it. */
function applyRemote(row: Pick<CollabRow, 'id' | 'tracks'> & Partial<CollabRow>) {
  const entries = Array.isArray(row.tracks) ? row.tracks.filter((e) => e?.track?.id) : [];
  const remoteIds = new Set(entries.map((e) => e.track.id));
  const now = Date.now();
  let tracks = entries.map((e) => slimTrack(e.track));
  let updatedAt = now;
  const p = findLinked(row.id);
  const prev = base[row.id];
  if (hasLocalEdits(p, prev)) {
    const old = new Set(prev!.ids);
    const local = new Set(p.tracks.map((t) => t.id));
    const adds = p.tracks.filter((t) => !old.has(t.id) && !remoteIds.has(t.id));
    const removes = new Set(prev!.ids.filter((id) => !local.has(id) && remoteIds.has(id)));
    if (adds.length || removes.size) {
      tracks = [...tracks.filter((t) => !removes.has(t.id)), ...adds];
      updatedAt = now + 1;
      schedulePush();
    }
  }
  base[row.id] = { ids: entries.map((e) => e.track.id), at: now };
  saveBase();
  const addedBy = Object.fromEntries(entries.map((e) => [e.track.id, e.addedBy?.name || '']));
  writePlaylists((x) => x.collabId !== row.id ? x : {
    ...x, ...(row.name ? { name: row.name } : {}), tracks, collabAddedBy: addedBy, isCollaborative: true, updatedAt,
  });
}

function unlink(collabId: string, reason?: string) {
  dropChannel(collabId);
  delete base[collabId];
  saveBase();
  writePlaylists((p) => {
    if (p.collabId !== collabId) return p;
    const { collabId: _c, collabCode: _k, collabAddedBy: _a, ...rest } = p;
    return { ...rest, isCollaborative: false };
  });
  if (reason) toast(reason);
}

async function rpcTracks(fn: string, args: object, collabId: string) {
  const sb = getSupabase();
  if (!sb) return;
  const { data, error } = await sb.rpc(fn, args);
  if (error) { toast(`Collaborative sync failed: ${error.message}`, 'error'); return; }
  if (Array.isArray(data)) applyRemote({ id: collabId, tracks: data as CollabEntry[] });
}

/** Push local adds/removes of every linked playlist (diff vs last remote state); stale copies pull instead. */
async function pushLocal() {
  if (socialStatus() !== 'ready') return;
  const user = useAuthStore.getState().user!;
  for (const p of linked()) {
    const id = p.collabId!;
    const b = base[id];
    if (!b) continue;
    const remote = new Set(b.ids);
    const local = new Set(p.tracks.map((t) => t.id));
    const added = p.tracks.filter((t) => !remote.has(t.id));
    const removed = b.ids.filter((tid) => !local.has(tid));
    if (!added.length && !removed.length) continue;
    if (p.updatedAt <= b.at) { await pull(id); continue; }
    if (added.length) {
      const entries: CollabEntry[] = added.map((t) => ({ track: slimTrack(t), addedBy: { id: user.id, name: user.displayName }, addedAt: Date.now() }));
      await rpcTracks('collab_add_tracks', { p_id: id, p_entries: entries }, id);
    }
    if (removed.length) await rpcTracks('collab_remove_tracks', { p_id: id, p_track_ids: removed }, id);
  }
}
function schedulePush() {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => { pushLocal().catch(() => {}); }, 500);
}

function subscribe(collabId: string) {
  const sb = getSupabase();
  if (!sb || channels.has(collabId)) return;
  const ch = sb.channel(`collab:${collabId}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'collab_playlists', filter: `id=eq.${collabId}` },
      ({ new: row }) => { if (row && (row as CollabRow).id) applyRemote(row as CollabRow); })
    // DELETE events can't be filtered server-side; the old record carries the primary key.
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'collab_playlists' },
      ({ old }) => { if ((old as { id?: string })?.id === collabId) unlink(collabId, 'A collaborative playlist was deleted by its owner'); })
    .subscribe();
  channels.set(collabId, ch);
}

async function pull(collabId: string) {
  const sb = getSupabase();
  if (!sb) return;
  const { data, error } = await sb.from('collab_playlists').select('id,name,tracks').eq('id', collabId).maybeSingle();
  if (error) return; // offline / transient: keep local copy
  if (!data) unlink(collabId, 'You no longer have access to a collaborative playlist');
  else applyRemote(data as CollabRow);
}

/** On start: push offline edits first, otherwise adopt the server copy. */
async function refresh(collabId: string) {
  if (hasLocalEdits(findLinked(collabId), base[collabId])) await pushLocal();
  else await pull(collabId);
}

/** Starts realtime sync for all linked playlists; idempotent, re-runs on sign-in. */
export function startCollabSync() {
  if (started) return;
  started = true;
  const boot = () => {
    if (socialStatus() !== 'ready') return;
    for (const p of linked()) { subscribe(p.collabId!); refresh(p.collabId!).catch(() => {}); }
  };
  boot();
  useAuthStore.subscribe((s, prev) => {
    if (s.user?.id === prev.user?.id) return;
    [...channels.keys()].forEach(dropChannel);
    boot();
  });
  unsubLib = useLibraryStore.subscribe((s, prev) => {
    if (applying || s.playlists === prev.playlists) return;
    const ids = new Set((s.playlists as LinkedPlaylist[]).map((p) => p.collabId).filter(Boolean));
    // Deleted linked playlist locally -> stop listening (membership stays; re-join via link).
    [...channels.keys()].forEach((id) => { if (!ids.has(id)) dropChannel(id); });
    ids.forEach((id) => subscribe(id!));
    schedulePush();
  });
}
export const stopCollabSync = () => { unsubLib?.(); unsubLib = null; started = false; };

/** Turn a local playlist into a collaborative one. Returns the invite code. */
export async function makeCollaborative(playlistId: string): Promise<string | null> {
  const ctx = requireSocial();
  if (!ctx) return null;
  const p = (useLibraryStore.getState().playlists as LinkedPlaylist[]).find((x) => x.id === playlistId);
  if (!p) return null;
  if (p.collabId && p.collabCode) return p.collabCode;
  const code = genCode(8);
  const entries: CollabEntry[] = p.tracks.map((t) => ({ track: slimTrack(t), addedBy: { id: ctx.user.id, name: ctx.user.displayName }, addedAt: Date.now() }));
  const { data, error } = await ctx.sb.rpc('create_collab', {
    p_code: code, p_name: p.name, p_tracks: entries, p_display_name: ctx.user.displayName, p_avatar: ctx.user.avatarUrl ?? null,
  });
  if (error || !data) { toast(`Couldn't make playlist collaborative: ${error?.message || 'unknown error'}`, 'error'); return null; }
  const collabId = String(data);
  base[collabId] = { ids: p.tracks.map((t) => t.id), at: Date.now() };
  saveBase();
  writePlaylists((x) => x.id === playlistId ? { ...x, collabId, collabCode: code, isCollaborative: true, authorId: ctx.user.id,
    collabAddedBy: Object.fromEntries(p.tracks.map((t) => [t.id, ctx.user.displayName])) } : x);
  startCollabSync();
  subscribe(collabId);
  return code;
}

/** Join via invite code and import as a linked local playlist. Returns the local playlist id. */
export async function joinCollab(rawCode: string): Promise<string | null> {
  const ctx = requireSocial();
  if (!ctx) return null;
  const { data, error } = await ctx.sb.rpc('join_collab', {
    p_code: normalizeCode(rawCode), p_display_name: ctx.user.displayName, p_avatar: ctx.user.avatarUrl ?? null,
  });
  const row = (Array.isArray(data) ? data[0] : data) as CollabRow | null;
  if (error || !row) { toast(error?.message || 'Invite not found', 'error'); return null; }
  const existing = findLinked(row.id);
  let localId = existing?.id;
  if (!localId) {
    localId = `pl-${Date.now()}`;
    const pl: LinkedPlaylist = {
      id: localId, name: row.name, tracks: [], createdAt: Date.now(), updatedAt: Date.now(),
      isUserCreated: true, isCollaborative: true, authorId: row.owner, collabId: row.id, collabCode: row.code,
    };
    applying = true;
    try { useLibraryStore.setState((s) => ({ playlists: [...s.playlists, pl] })); } finally { applying = false; }
  }
  applyRemote(row);
  startCollabSync();
  subscribe(row.id);
  return localId;
}

export async function leaveCollab(playlistId: string): Promise<void> {
  const p = (useLibraryStore.getState().playlists as LinkedPlaylist[]).find((x) => x.id === playlistId);
  if (!p?.collabId) return;
  const sb = getSupabase();
  if (sb) await sb.rpc('leave_collab', { p_id: p.collabId });
  unlink(p.collabId, 'Left collaborative playlist — kept a local copy');
}

export async function listMembers(collabId: string): Promise<CollabMember[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data } = await sb.from('collab_members').select('user_id,display_name,avatar_url').eq('playlist_id', collabId);
  return (data || []) as CollabMember[];
}

export async function previewCollab(rawCode: string): Promise<{ name: string; owner_name: string; track_count: number } | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.rpc('preview_collab', { p_code: normalizeCode(rawCode) });
  const row = Array.isArray(data) ? data[0] : data;
  return row || null;
}
