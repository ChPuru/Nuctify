import { create } from 'zustand';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { Track } from '../providers/types';
import { usePlayerStore, jamHooks, slimTrack, type JamAction } from '../store';
import { audioEngine } from '../audio/engine';
import { getSupabase } from '../integrations/supabase';
import { requireSocial, genCode, normalizeCode, toast } from './common';

/**
 * Jam = realtime group session on a Supabase broadcast/presence channel `jam:<code>` (no table needed).
 * The host is the source of truth: it broadcasts a snapshot on every change and every 5s;
 * guests follow it and send `add` / `control` requests.
 */

export interface JamMember { id: string; name: string; avatar?: string; host: boolean }

interface JamSnapshot {
  track: Track | null;
  upcoming: Track[];
  isPlaying: boolean;
  position: number;
  updatedAt: number;
  guestControl: boolean;
  addedBy: Record<string, string>;
  hostName: string;
}

interface JamState {
  code: string | null;
  isHost: boolean;
  status: 'idle' | 'connecting' | 'live';
  members: JamMember[];
  guestControl: boolean;
  /** trackId -> display name of whoever added it */
  addedBy: Record<string, string>;
  hostName: string | null;
}

const IDLE: JamState = { code: null, isHost: false, status: 'idle', members: [], guestControl: false, addedBy: {}, hostName: null };
export const useJamStore = create<JamState>(() => ({ ...IDLE }));

let channel: RealtimeChannel | null = null;
let me: JamMember | null = null;
let session = 0;
let applying = false;
let gotState = false;
let hostSeen = false;
let heartbeat: ReturnType<typeof setInterval> | null = null;
let debounce: ReturnType<typeof setTimeout> | null = null;
let joinTimer: ReturnType<typeof setTimeout> | null = null;
let hostGoneTimer: ReturnType<typeof setTimeout> | null = null;
let unsubPlayer: (() => void) | null = null;
let knownMembers = new Set<string>();

const player = () => usePlayerStore.getState();
const audioPos = () => audioEngine.getActiveAudio()?.currentTime ?? player().currentTime;
/** Run a player action without it being intercepted as a guest request. */
function run<T>(fn: () => T): T {
  applying = true;
  try { return fn(); } finally { applying = false; }
}

function send(event: string, payload: object) {
  channel?.send({ type: 'broadcast', event, payload }).catch(() => {});
}

// ---------- host ----------
function snapshot(): JamSnapshot {
  const s = player();
  const { guestControl, addedBy } = useJamStore.getState();
  const upcoming = s.queue.slice(s.queueIndex + 1, s.queueIndex + 51).map(slimTrack);
  const ids = new Set([s.currentTrack?.id, ...upcoming.map((t) => t.id)]);
  return {
    track: s.currentTrack ? slimTrack(s.currentTrack) : null,
    upcoming,
    isPlaying: s.isPlaying,
    position: audioPos(),
    updatedAt: Date.now(),
    guestControl,
    addedBy: Object.fromEntries(Object.entries(addedBy).filter(([id]) => ids.has(id))),
    hostName: me?.name ?? 'Host',
  };
}
const broadcastState = () => { if (useJamStore.getState().isHost) send('state', snapshot()); };
const scheduleBroadcast = () => {
  if (debounce) clearTimeout(debounce);
  debounce = setTimeout(broadcastState, 150);
};

function hostAdd(track: Track, by: string) {
  player().addToQueue(track);
  useJamStore.setState((s) => ({ addedBy: { ...s.addedBy, [track.id]: by } }));
  scheduleBroadcast();
}

function onAdd(p: { track?: Track; by?: string }) {
  if (!useJamStore.getState().isHost || !p?.track?.id) return;
  hostAdd(p.track, p.by || 'Guest');
  toast(`${p.by || 'A guest'} added "${p.track.title}"`);
}

function onControl(p: { action?: JamAction; data?: unknown; fromId?: string }) {
  const st = useJamStore.getState();
  if (!st.isHost || !st.guestControl || !p?.action) return;
  const s = player();
  switch (p.action) {
    case 'play': if ((p.data as Track)?.id) { s.playNext(p.data as Track); s.nextTrack(); } break;
    case 'pause': s.pause(); break;
    case 'resume': s.resume(); break;
    case 'seek': if (typeof p.data === 'number') s.seekTo(p.data); break;
    case 'next': {
      // Guests' players fire `next` when their copy ends; ignore stale/near-end requests (host ends naturally).
      const remaining = (s.duration || 0) - audioPos();
      if (p.fromId === s.currentTrack?.id && !(s.duration && remaining < 4)) s.nextTrack();
      break;
    }
    case 'prev': s.prevTrack(); break;
  }
  scheduleBroadcast();
}

// ---------- guest ----------
function onState(snap: JamSnapshot) {
  if (useJamStore.getState().isHost || !snap) return;
  gotState = true;
  if (joinTimer) { clearTimeout(joinTimer); joinTimer = null; }
  useJamStore.setState({ guestControl: !!snap.guestControl, addedBy: snap.addedBy || {}, hostName: snap.hostName || null, status: 'live' });
  const recvAt = performance.now();
  const expected = () => snap.position + (snap.isPlaying ? (performance.now() - recvAt) / 1000 : 0);
  const s = player();
  if (!snap.track) {
    if (s.isPlaying) run(() => s.pause());
    return;
  }
  const queue = [snap.track, ...(snap.upcoming || [])];
  if (s.currentTrack?.id !== snap.track.id) {
    usePlayerStore.setState({ queue, queueIndex: 0 });
    const mySession = session;
    const p = run(() => s.playTrack(snap.track!));
    Promise.resolve(p).then(() => {
      if (mySession !== session || player().currentTrack?.id !== snap.track!.id) return;
      const pos = expected();
      if (pos > 2) run(() => player().seekTo(pos));
      if (!snap.isPlaying) run(() => player().pause());
    });
    return;
  }
  const cur = s.queue.slice(s.queueIndex).map((t) => t.id).join('|');
  if (cur !== queue.map((t) => t.id).join('|')) usePlayerStore.setState({ queue, queueIndex: 0 });
  if (s.isLoading) return;
  if (snap.isPlaying !== s.isPlaying) run(() => (snap.isPlaying ? s.resume() : s.pause()));
  const pos = expected();
  if (Math.abs(audioPos() - pos) > 3) run(() => s.seekTo(pos));
}

function intercept(action: JamAction, data?: unknown): boolean {
  if (applying || !channel) return false;
  const st = useJamStore.getState();
  if (st.isHost) return false;
  const s = player();
  if (action === 'play') {
    const t = data as Track;
    if (!t?.id || t.id === s.currentTrack?.id) return false;
    if (st.guestControl) send('control', { action, data: slimTrack(t), by: me?.name });
    else requestAdd(t);
    return true;
  }
  // A guest's failed load also calls next(); don't let that skip the host's track.
  if (action === 'next' && !s.isPlaying && audioPos() < 1) return true;
  if (st.guestControl) {
    send('control', { action, data, fromId: s.currentTrack?.id, by: me?.name });
  } else if (action === 'pause' || action === 'resume' || action === 'seek' || action === 'prev') {
    toast('Only the host controls playback in this Jam');
  }
  return true;
}

// ---------- presence ----------
function onPresence() {
  if (!channel) return;
  const state = channel.presenceState<JamMember>();
  const members = Object.values(state).map((m) => m[0]).filter((m): m is JamMember & { presence_ref: string } => !!m?.id)
    .map(({ id, name, avatar, host }) => ({ id, name, avatar, host }))
    .sort((a, b) => Number(b.host) - Number(a.host) || a.name.localeCompare(b.name));
  useJamStore.setState({ members });
  const { isHost } = useJamStore.getState();
  if (isHost) {
    if (members.some((m) => !knownMembers.has(m.id))) scheduleBroadcast();
    knownMembers = new Set(members.map((m) => m.id));
    return;
  }
  if (members.some((m) => m.host)) {
    hostSeen = true;
    if (hostGoneTimer) { clearTimeout(hostGoneTimer); hostGoneTimer = null; }
  } else if (hostSeen && !hostGoneTimer) {
    hostGoneTimer = setTimeout(() => { toast('The host left — Jam ended'); leaveJam(true); }, 15000);
  }
}

// ---------- lifecycle ----------
function teardown(pending?: Promise<unknown>) {
  session++;
  [heartbeat].forEach((t) => t && clearInterval(t));
  [debounce, joinTimer, hostGoneTimer].forEach((t) => t && clearTimeout(t));
  heartbeat = debounce = joinTimer = hostGoneTimer = null;
  unsubPlayer?.();
  unsubPlayer = null;
  if (channel) {
    const ch = channel;
    channel = null;
    const remove = () => { getSupabase()?.removeChannel(ch); };
    if (pending) pending.finally(remove); else remove();
  }
  jamHooks.intercept = undefined;
  jamHooks.changed = undefined;
  gotState = hostSeen = false;
  knownMembers = new Set();
  useJamStore.setState({ ...IDLE });
  usePlayerStore.setState({ partyRoomId: null, isHost: false });
}

function open(code: string, host: boolean): boolean {
  const ctx = requireSocial();
  if (!ctx) return false;
  teardown();
  const mySession = session;
  const { sb, user } = ctx;
  me = { id: user.id, name: user.displayName, avatar: user.avatarUrl, host };
  const ch = sb.channel(`jam:${code}`, { config: { broadcast: { self: false }, presence: { key: user.id } } });
  ch.on('broadcast', { event: 'state' }, ({ payload }) => onState(payload as JamSnapshot))
    .on('broadcast', { event: 'add' }, ({ payload }) => onAdd(payload))
    .on('broadcast', { event: 'control' }, ({ payload }) => onControl(payload))
    .on('broadcast', { event: 'end' }, () => { if (!useJamStore.getState().isHost) { toast('The host ended the Jam'); leaveJam(true); } })
    .on('presence', { event: 'sync' }, onPresence)
    .subscribe((status) => {
      if (mySession !== session) return;
      if (status === 'SUBSCRIBED') {
        ch.track({ ...me }).catch(() => {});
        if (host) { useJamStore.setState({ status: 'live' }); broadcastState(); }
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        toast('Jam connection problem — retrying…', 'warning');
      }
    });
  channel = ch;
  useJamStore.setState({ ...IDLE, code, isHost: host, status: 'connecting', hostName: host ? me.name : null });
  usePlayerStore.setState({ partyRoomId: code, isHost: host });
  jamHooks.intercept = intercept;
  if (host) {
    jamHooks.changed = scheduleBroadcast;
    unsubPlayer = usePlayerStore.subscribe((s, p) => {
      if (s.currentTrack?.id !== p.currentTrack?.id || s.isPlaying !== p.isPlaying || s.queue !== p.queue || s.queueIndex !== p.queueIndex) scheduleBroadcast();
    });
    heartbeat = setInterval(broadcastState, 5000);
  } else {
    joinTimer = setTimeout(() => {
      if (!gotState && mySession === session) { toast(`No active Jam found for code ${code}`, 'error'); leaveJam(true); }
    }, 12000);
  }
  return true;
}

/** Host a new Jam. Returns its code, or null if unavailable (not configured / signed out). */
export function startJam(): string | null {
  const code = genCode();
  if (!open(code, true)) return null;
  toast(`Jam started · code ${code}`, 'success');
  return code;
}

export function joinJam(rawCode: string): boolean {
  const code = normalizeCode(rawCode);
  if (code.length < 4) { toast('Enter a valid Jam code', 'error'); return false; }
  const cur = useJamStore.getState();
  if (cur.code === code) return true;
  if (!open(code, false)) return false;
  toast(`Joining Jam ${code}…`);
  return true;
}

/** Leave (guest) or end (host) the Jam. */
export function leaveJam(silent = false) {
  const { code, isHost } = useJamStore.getState();
  if (!code) return;
  teardown(isHost ? channel?.send({ type: 'broadcast', event: 'end', payload: {} }).catch(() => {}) : undefined);
  if (!silent) toast(isHost ? 'Jam ended' : 'Left the Jam');
}

/** Add a song to the shared queue (host adds directly, guests request it). */
export function requestAdd(track: Track) {
  const st = useJamStore.getState();
  if (!st.code) { player().addToQueue(track); return; }
  if (st.isHost) hostAdd(track, me?.name || 'Host');
  else send('add', { track: slimTrack(track), by: me?.name || 'Guest' });
  toast(`Added "${track.title}" to the Jam`, 'success');
}

export function setGuestControl(on: boolean) {
  if (!useJamStore.getState().isHost) return;
  useJamStore.setState({ guestControl: on });
  broadcastState();
}
