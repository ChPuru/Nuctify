import CollabButton from '../components/CollabButton';
import { useEffect, useMemo, useState } from 'react';
import { useLibraryStore, usePlayerStore } from '../store';
import { useToastStore } from '../store/toast';
import { useAuthStore } from '../store/auth';
import { useNavStore } from '../store/nav';
import TrackList from '../components/TrackList';
import { sharePlaylist } from '../integrations/supabase';
import { registry } from '../providers';
import { Track } from '../providers/types';
import { isNativeApp } from '../utils/env';
import { Artwork, Button, EmptyState, IconButton, Menu, Modal, PageHeader, SkeletonList, SkeletonPage, useMenuState, type MenuItem } from '../components/ui';
import { DownloadAllButton, collectionMeta, copyLink } from './Album';

const FIELD = 'w-full h-11 px-3.5 rounded-lg bg-surface-container-high border border-transparent text-on-surface placeholder:text-on-surface-variant outline-none focus:border-on-surface/30 transition-colors';

function Collage({ cover, tracks }: { cover?: string; tracks: Track[] }) {
  const thumbs = [...new Set(tracks.map(t => t.thumbnail).filter(Boolean) as string[])].slice(0, 4);
  if (cover || thumbs.length < 4) return <Artwork src={cover || thumbs[0]} size="hero" rounded="xl" icon="queue_music" priority className="shadow-overlay" />;
  return (
    <div className="grid grid-cols-2 w-48 h-48 sm:w-56 sm:h-56 lg:w-60 lg:h-60 rounded-xl overflow-hidden shadow-overlay shrink-0 bg-surface-container-high">
      {thumbs.map(src => <Artwork key={src} src={src} size="fill" rounded="md" className="!rounded-none" />)}
    </div>
  );
}

function Recommendations({ playlistId, tracks }: { playlistId: string; tracks: Track[] }) {
  const [recs, setRecs] = useState<Track[] | null>(null);
  const [seedKey, setSeedKey] = useState(0);
  const seed = tracks.length ? tracks[seedKey % tracks.length] : undefined;
  const seedId = seed?.id;

  useEffect(() => {
    if (!seed) return;
    let cancelled = false;
    setRecs(null);
    registry.getRadio(seed, 20).then(r => { if (!cancelled) setRecs(r); }).catch(() => { if (!cancelled) setRecs([]); });
    return () => { cancelled = true; };
  }, [seedId, seedKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const inList = useMemo(() => new Set(tracks.map(t => t.id)), [tracks]);
  const visible = (recs ?? []).filter(t => !inList.has(t.id)).slice(0, 8);
  if (!seed || (recs && !visible.length)) return null;

  const add = (t: Track) => {
    if (useLibraryStore.getState().addToPlaylist(playlistId, t)) useToastStore.getState().addToast(`Added "${t.title}"`, 'success');
  };

  return (
    <section className="mt-12" aria-labelledby="recs-h">
      <div className="flex items-end justify-between gap-4 mb-3">
        <div>
          <h2 id="recs-h" className="text-xl sm:text-2xl font-bold text-on-surface">Recommended</h2>
          <p className="text-sm text-on-surface-variant">Based on what's in this playlist</p>
        </div>
        <Button variant="ghost" size="sm" icon="refresh" onClick={() => setSeedKey(k => k + 1)}>Refresh</Button>
      </div>
      {!recs ? <SkeletonList count={4} /> : (
        <ul className="space-y-1">
          {visible.map(t => (
            <li key={t.id} className="flex items-center gap-3 p-2 -mx-2 rounded-lg can-hover:hover:bg-on-surface/[0.05] transition-colors">
              <button type="button" onClick={() => usePlayerStore.getState().playTracks([t])} className="flex items-center gap-3 flex-1 min-w-0 text-left" aria-label={`Play ${t.title}`}>
                <Artwork src={t.thumbnail} size="sm" rounded="md" />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-on-surface truncate">{t.title}</span>
                  <span className="block text-xs text-on-surface-variant truncate">{t.artist}</span>
                </span>
              </button>
              <Button size="sm" variant="outline" onClick={() => add(t)}>Add</Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function PlaylistPage({ playlistId, remoteId }: { playlistId?: string; remoteId?: string }) {
  const local = useLibraryStore(s => (playlistId ? s.playlists.find(p => p.id === playlistId) : undefined));
  const pinned = useLibraryStore(s => !!playlistId && s.pinnedPlaylists.includes(playlistId));
  const user = useAuthStore(s => s.user);
  const navigate = useNavStore(s => s.navigate);
  const menu = useMenuState();
  const [remote, setRemote] = useState<{ title: string; thumbnail?: string; tracks: Track[] } | null>(null);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', thumbnail: '' });

  useEffect(() => {
    if (!remoteId) return;
    let cancelled = false;
    setRemoteError(null);
    setRemote(null);
    registry.getPlaylistDetails(remoteId)
      .then(d => { if (!cancelled) setRemote(d); })
      .catch(err => { if (!cancelled) setRemoteError(err?.message || 'Failed to load playlist'); });
    return () => { cancelled = true; };
  }, [remoteId, reload]);

  const tracks = (remoteId ? remote?.tracks : local?.tracks) ?? [];
  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? tracks.filter(t => `${t.title} ${t.artist} ${t.album ?? ''}`.toLowerCase().includes(q)) : tracks;
  }, [tracks, filter]);

  if (remoteId && !remote && !remoteError) return <div><SkeletonPage /><SkeletonList count={8} className="mt-8" /></div>;

  if (remoteId ? !remote : !local) {
    return (
      <EmptyState
        icon="playlist_remove"
        title={remoteId ? "Couldn't load playlist" : 'Playlist not found'}
        description={remoteId ? remoteError || 'Playlist unavailable' : 'This playlist may have been deleted.'}
        action={remoteId
          ? <Button icon="refresh" onClick={() => setReload(r => r + 1)}>Retry</Button>
          : <Button onClick={() => navigate('library')}>Go to Library</Button>}
      />
    );
  }

  const name = remoteId ? remote!.title : local!.name;
  const cover = remoteId ? remote!.thumbnail : local!.thumbnail;
  const smart = !!local?.rules;
  const player = () => usePlayerStore.getState();
  const lib = () => useLibraryStore.getState();
  const addToast = useToastStore.getState().addToast;

  const handleShare = async () => {
    if (!local) return;
    if (!user) return useAuthStore.getState().openAuthModal();
    const base = isNativeApp() ? (import.meta.env.VITE_PUBLIC_WEB_URL as string | undefined) : window.location.origin;
    if (!base) return addToast('Sharing is not available in this build', 'error');
    addToast('Generating share link…', 'info');
    const shareId = await sharePlaylist(local, user.displayName || 'Anonymous').catch(() => null);
    if (!shareId) return addToast('Failed to generate share link', 'error');
    const url = `${base.replace(/\/$/, '')}/#shared:${shareId}`;
    try {
      if (isNativeApp() && 'share' in navigator) await navigator.share({ title: local.name, url });
      else { await navigator.clipboard.writeText(url); addToast('Share link copied', 'success'); }
    } catch {
      window.prompt('Copy this link', url);
    }
  };

  const openEdit = () => {
    if (!local) return;
    setForm({ name: local.name, description: local.description ?? '', thumbnail: local.thumbnail ?? '' });
    setEditing(true);
  };
  const saveEdit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!playlistId || !form.name.trim()) return;
    lib().updatePlaylistDetails(playlistId, { name: form.name.trim(), description: form.description.trim(), thumbnail: form.thumbnail.trim() });
    setEditing(false);
    addToast('Playlist updated', 'success');
  };
  const doDelete = () => {
    if (!playlistId) return;
    lib().deletePlaylist(playlistId);
    setConfirmDelete(false);
    navigate('library');
    addToast(`Deleted "${name}"`, 'info');
  };

  const items: MenuItem[] = remoteId ? [
    { label: 'Add to queue', icon: 'queue_music', disabled: !tracks.length, onSelect: () => player().addToQueue(tracks) },
    { label: 'Start radio', icon: 'radio', disabled: !tracks.length, onSelect: () => player().startRadio(tracks[0]) },
    { label: isNativeApp() ? 'Share' : 'Copy link', icon: 'share', onSelect: () => copyLink(`remote-playlist:${remoteId}`) },
  ] : [
    ...(!smart ? [{ label: 'Edit details', icon: 'edit', onSelect: openEdit }] : []),
    { label: pinned ? 'Unpin' : 'Pin to top', icon: 'push_pin', checked: pinned, onSelect: () => lib().togglePinPlaylist(playlistId!) },
    { label: 'Add to queue', icon: 'queue_music', disabled: !tracks.length, onSelect: () => player().addToQueue(tracks) },
    { label: 'Start radio', icon: 'radio', disabled: !tracks.length, onSelect: () => player().startRadio(tracks[0]) },
    { label: 'Share', icon: 'share', onSelect: handleShare },
    { divider: true },
    { label: 'Delete playlist', icon: 'delete', danger: true, onSelect: () => setConfirmDelete(true) },
  ];

  return (
    <div className="animate-fade-in">
      <PageHeader
        image={cover || tracks[0]?.thumbnail}
        artwork={<Collage cover={cover} tracks={tracks} />}
        eyebrow={smart ? 'Smart playlist' : 'Playlist'}
        title={!remoteId && !smart ? <button type="button" onClick={openEdit} className="text-left hover:underline decoration-2 underline-offset-8">{name}</button> : name}
        description={local?.description}
        meta={<span>{collectionMeta(tracks)}</span>}
        actions={<>
          <Button variant="primary" size="lg" icon="play_arrow" disabled={!tracks.length} onClick={() => player().playTracks(tracks, 0, { shuffle: false })}>Play</Button>
          <IconButton icon="shuffle" label="Shuffle" size="lg" variant="tonal" disabled={!tracks.length} onClick={() => player().playTracks(tracks, 0, { shuffle: true })} />
          {remoteId
            ? <IconButton icon="library_add" label="Save as playlist" size="lg" disabled={!tracks.length} onClick={() => lib().createPlaylist(name, tracks)} />
            : <IconButton icon="push_pin" label={pinned ? 'Unpin' : 'Pin to top'} size="lg" active={pinned} filled={pinned} onClick={() => lib().togglePinPlaylist(playlistId!)} />}
          {!remoteId && playlistId && <CollabButton playlistId={playlistId} />}
          <DownloadAllButton tracks={tracks} />
          <IconButton icon="more_horiz" label="More options" size="lg" onClick={menu.openFrom} />
        </>}
      />
      <Menu open={menu.open} anchor={menu.anchor} onClose={menu.onClose} items={items} ariaLabel="Playlist options" />

      {tracks.length > 8 && (
        <div className="relative max-w-xs mb-3">
          <span aria-hidden className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-xl pointer-events-none">search</span>
          <input
            type="search"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Find in playlist"
            aria-label="Find in playlist"
            className="w-full h-9 pl-10 pr-3 rounded-md bg-on-surface/[0.07] text-sm text-on-surface placeholder:text-on-surface-variant outline-none focus:bg-on-surface/[0.12] transition-colors [&::-webkit-search-cancel-button]:hidden"
          />
        </div>
      )}

      {tracks.length > 0 ? (
        shown.length ? (
          <TrackList
            tracks={shown}
            showProvider
            playlistId={remoteId || smart ? undefined : playlistId}
            onReorder={!remoteId && !smart && !filter.trim() ? (from, to) => lib().reorderPlaylistTracks(playlistId!, from, to) : undefined}
          />
        ) : <EmptyState compact icon="search_off" title={`No songs match "${filter}"`} />
      ) : (
        <EmptyState
          icon="library_add"
          title={remoteId ? 'This playlist is empty' : "Let's find something for your playlist"}
          description={remoteId ? undefined : 'Search for songs and use the ⋮ menu on any track to add it here.'}
          action={remoteId ? undefined : <Button variant="primary" icon="search" onClick={() => navigate('search')}>Find songs</Button>}
        />
      )}

      {!remoteId && !smart && playlistId && tracks.length > 0 && <Recommendations playlistId={playlistId} tracks={tracks} />}

      <Modal
        open={editing}
        onClose={() => setEditing(false)}
        title="Edit details"
        size="sm"
        footer={<>
          <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
          <Button variant="primary" disabled={!form.name.trim()} onClick={() => saveEdit()}>Save</Button>
        </>}
      >
        <form onSubmit={saveEdit} className="space-y-4">
          <div className="flex gap-4 items-start">
            <Artwork src={form.thumbnail || cover || tracks[0]?.thumbnail} size="lg" rounded="lg" icon="queue_music" />
            <div className="flex-1 min-w-0 space-y-3">
              <label className="block">
                <span className="text-xs font-semibold text-on-surface-variant">Name</span>
                <input className={`${FIELD} mt-1`} value={form.name} maxLength={100} autoFocus onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-on-surface-variant">Cover image URL</span>
                <input className={`${FIELD} mt-1`} value={form.thumbnail} type="url" placeholder="https://…" onChange={e => setForm(f => ({ ...f, thumbnail: e.target.value }))} />
              </label>
            </div>
          </div>
          <label className="block">
            <span className="text-xs font-semibold text-on-surface-variant">Description</span>
            <textarea className={`${FIELD} mt-1 h-24 py-2.5 resize-none`} value={form.description} maxLength={300} placeholder="Add an optional description" onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </label>
          <button type="submit" hidden />
        </form>
      </Modal>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete playlist?"
        description={`"${name}" will be removed from your library. This can't be undone.`}
        size="sm"
        footer={<>
          <Button variant="ghost" onClick={() => setConfirmDelete(false)}>Cancel</Button>
          <Button variant="danger" icon="delete" onClick={doDelete}>Delete</Button>
        </>}
      />
    </div>
  );
}
