import { useEffect, useState } from 'react';
import { Track } from '../providers/types';
import { useLibraryStore, usePlayerStore, useDownloadsStore } from '../store';
import { useNavStore } from '../store/nav';
import { useToastStore } from '../store/toast';
import { isNativeApp } from '../utils/env';
import { Menu, Modal, Artwork, Button, type MenuAnchor, type MenuItem } from './ui';

interface TrackContextMenuProps {
  track: Track;
  anchor?: MenuAnchor;
  x?: number;
  y?: number;
  onClose: () => void;
  onRemove?: () => void;
}

const toast = (m: string, t: 'success' | 'info' | 'error' = 'success') => useToastStore.getState().addToast(m, t);

async function shareTrack(track: Track) {
  const base = isNativeApp() ? (import.meta.env.VITE_PUBLIC_WEB_URL as string | undefined) : window.location.origin;
  const path = track.albumId ? `album:${track.albumId}` : track.artistId ? `artist:${track.artistId}` : '';
  const url = base ? `${base.replace(/\/$/, '')}/${path ? `#${encodeURIComponent(path)}` : ''}` : undefined;
  const text = `${track.title} — ${track.artist}`;
  try {
    if (navigator.share) { await navigator.share({ title: track.title, text, url }); return; }
    await navigator.clipboard.writeText(url ? `${text}\n${url}` : text);
    toast('Link copied');
  } catch (e: any) {
    if (e?.name !== 'AbortError') toast('Could not share', 'error');
  }
}

export function PlaylistPicker({ tracks, open, onClose }: { tracks: Track[]; open: boolean; onClose: () => void }) {
  const playlists = useLibraryStore(s => s.playlists);
  const [name, setName] = useState<string | null>(null);
  const manual = playlists.filter(p => !p.rules).sort((a, b) => b.updatedAt - a.updatedAt);
  useEffect(() => { if (!open) setName(null); }, [open]);

  const pick = (id: string, pname: string) => {
    const lib = useLibraryStore.getState();
    const n = tracks.length === 1 ? (lib.addToPlaylist(id, tracks[0]) ? 1 : 0) : lib.addTracksToPlaylist(id, tracks);
    toast(n ? `Added to ${pname}` : `Already in ${pname}`, n ? 'success' : 'info');
    onClose();
  };
  const create = (e: React.FormEvent) => {
    e.preventDefault();
    const v = name?.trim();
    if (!v) return;
    useLibraryStore.getState().createPlaylist(v, tracks);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Add to playlist" size="sm" bodyClassName="px-2 pb-3">
      {name === null ? (
        <button type="button" onClick={() => setName('')} className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-on-surface/[0.06] text-left">
          <span className="w-12 h-12 rounded-lg bg-on-surface/10 flex items-center justify-center"><span aria-hidden className="material-symbols-outlined">add</span></span>
          <span className="font-semibold text-on-surface">New playlist</span>
        </button>
      ) : (
        <form onSubmit={create} className="flex gap-2 p-2">
          <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Playlist name" aria-label="Playlist name" enterKeyHint="done"
            className="flex-1 min-w-0 h-10 rounded-full bg-on-surface/[0.08] px-4 text-sm text-on-surface placeholder:text-on-surface-variant outline-none focus:ring-2 focus:ring-primary" />
          <Button type="submit" variant="primary" disabled={!name.trim()}>Create</Button>
        </form>
      )}
      <div className="mt-1">
        {manual.map(p => (
          <button key={p.id} type="button" onClick={() => pick(p.id, p.name)} className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-on-surface/[0.06] text-left">
            <Artwork src={p.thumbnail || p.tracks[0]?.thumbnail} size="sm" icon="queue_music" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold text-on-surface">{p.name}</span>
              <span className="block text-xs text-on-surface-variant">{p.tracks.length} songs</span>
            </span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

export default function TrackContextMenu({ track, anchor, x, y, onClose, onRemove }: TrackContextMenuProps) {
  const [view, setView] = useState<'menu' | 'picker' | null>('menu');
  const liked = useLibraryStore(s => s.likedTracks.some(t => t.id === track.id));
  const downloaded = useDownloadsStore(s => s.ids.has(track.id));
  const progress = useDownloadsStore(s => s.progress[track.id]);
  const navigate = useNavStore(s => s.navigate);

  useEffect(() => { if (view === null) onClose(); }, [view, onClose]);

  const p = usePlayerStore.getState;
  const canDownload = track.source !== 'local';
  const items: MenuItem[] = [
    { label: 'Play next', icon: 'playlist_play', onSelect: () => p().playNext(track) },
    { label: 'Add to queue', icon: 'queue_music', onSelect: () => p().addToQueue(track) },
    { label: 'Add to playlist', icon: 'playlist_add', keepOpen: true, onSelect: () => setView('picker') },
    { label: liked ? 'Remove from Liked Songs' : 'Save to Liked Songs', icon: liked ? 'heart_minus' : 'favorite', onSelect: () => useLibraryStore.getState().toggleLike(track) },
    ...(onRemove ? [{ label: 'Remove from this playlist', icon: 'remove_circle', onSelect: onRemove }] : []),
    { divider: true },
    { label: 'Start radio', icon: 'sensors', onSelect: () => p().startRadio(track) },
    ...(track.artistId ? [{ label: 'Go to artist', icon: 'person', onSelect: () => navigate(`artist:${track.artistId}`) }] : []),
    ...(track.albumId ? [{ label: 'Go to album', icon: 'album', onSelect: () => navigate(`album:${track.albumId}`) }] : []),
    { divider: true },
    ...(canDownload ? [progress !== undefined
      ? { label: `Downloading… ${Math.round(progress)}%`, icon: 'downloading', disabled: true }
      : downloaded
        ? { label: 'Remove download', icon: 'delete', onSelect: () => { useDownloadsStore.getState().remove(track.id).then(() => toast('Download removed', 'info')); } }
        : { label: 'Download', icon: 'download', onSelect: () => { useDownloadsStore.getState().download(track); } }] : []),
    { label: 'Share', icon: 'share', onSelect: () => { shareTrack(track); } },
  ];

  return (
    <>
      <Menu
        open={view === 'menu'}
        onClose={() => setView(v => (v === 'menu' ? null : v))}
        anchor={anchor ?? { x: x ?? 0, y: y ?? 0 }}
        ariaLabel={`Options for ${track.title}`}
        width={260}
        header={
          <div className="flex items-center gap-3 min-w-0">
            <Artwork src={track.thumbnail} size="xs" rounded="md" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-on-surface truncate">{track.title}</p>
              <p className="text-xs text-on-surface-variant truncate">{track.artist}</p>
            </div>
          </div>
        }
        items={items}
      />
      <PlaylistPicker tracks={[track]} open={view === 'picker'} onClose={() => setView(null)} />
    </>
  );
}
