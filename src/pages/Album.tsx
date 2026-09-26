import { useEffect, useState } from 'react';
import { registry } from '../providers';
import { Track, Album } from '../providers/types';
import TrackList from '../components/TrackList';
import { usePlayerStore, useLibraryStore, useDownloadsStore } from '../store';
import { useNavStore } from '../store/nav';
import { useToastStore } from '../store/toast';
import { downloadTrack } from '../audio/offline';
import { isNativeApp } from '../utils/env';
import { Button, EmptyState, IconButton, MediaCard, Menu, PageHeader, Shelf, SkeletonList, SkeletonPage, useMenuState, type MenuItem } from '../components/ui';

export async function playRemote(kind: 'album' | 'playlist', id: string, shuffle?: boolean) {
  try {
    const d = kind === 'album' ? await registry.getAlbumDetails(id) : await registry.getPlaylistDetails(id);
    if (d.tracks.length) usePlayerStore.getState().playTracks(d.tracks, 0, shuffle ? { shuffle } : undefined);
    else useToastStore.getState().addToast('Nothing playable here', 'error');
  } catch {
    useToastStore.getState().addToast(`Couldn't load ${kind}`, 'error');
  }
}

export const formatTotal = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h} hr ${m} min` : m > 0 ? `${m} min` : `${Math.round(s)} sec`;
};

export function collectionMeta(tracks: Track[]) {
  const total = tracks.reduce((a, t) => a + (t.duration || 0), 0);
  return [`${tracks.length} ${tracks.length === 1 ? 'song' : 'songs'}`, total > 0 ? formatTotal(total) : null].filter(Boolean).join(', ');
}

export async function copyLink(page: string) {
  const base = isNativeApp() ? (import.meta.env.VITE_PUBLIC_WEB_URL as string | undefined) : `${location.origin}${location.pathname}`;
  const addToast = useToastStore.getState().addToast;
  if (!base) return addToast('Sharing is not available in this build', 'error');
  const url = `${base.replace(/\/$/, '')}#${encodeURIComponent(page)}`;
  try {
    if (isNativeApp() && 'share' in navigator) await navigator.share({ url });
    else { await navigator.clipboard.writeText(url); addToast('Link copied', 'success'); }
  } catch { /* cancelled */ }
}

export function DownloadAllButton({ tracks }: { tracks: Track[] }) {
  const done = useDownloadsStore(s => tracks.reduce((n, t) => n + (s.ids.has(t.id) ? 1 : 0), 0));
  const busy = useDownloadsStore(s => tracks.some(t => t.id in s.progress));
  const [running, setRunning] = useState(false);
  const all = tracks.length > 0 && done === tracks.length;

  const run = async () => {
    const ids = useDownloadsStore.getState().ids;
    const todo = tracks.filter(t => !ids.has(t.id) && t.source !== 'local');
    if (!todo.length) return;
    setRunning(true);
    const addToast = useToastStore.getState().addToast;
    addToast(`Downloading ${todo.length} ${todo.length === 1 ? 'song' : 'songs'}…`, 'info');
    let ok = 0, i = 0;
    const worker = async () => { while (i < todo.length) { const t = todo[i++]; try { await downloadTrack(t); ok++; } catch { /* counted below */ } } };
    await Promise.all([worker(), worker()]);
    setRunning(false);
    addToast(ok === todo.length ? `Downloaded ${ok} ${ok === 1 ? 'song' : 'songs'}` : `Downloaded ${ok} of ${todo.length} songs`, ok === todo.length ? 'success' : 'warning');
  };

  const label = all ? 'Downloaded' : running || busy ? `Downloading ${done}/${tracks.length}` : 'Download';
  return (
    <IconButton
      icon={all ? 'download_done' : running || busy ? 'downloading' : 'download'}
      label={label}
      size="lg"
      active={all}
      disabled={!tracks.length || all || running}
      onClick={run}
      className={running || busy ? 'animate-pulse' : undefined}
    />
  );
}

export default function AlbumPage({ albumId }: { albumId: string }) {
  const [data, setData] = useState<{ album: Album; tracks: Track[] } | null>(null);
  const [more, setMore] = useState<Album[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const saved = useLibraryStore(s => s.savedAlbums.some(a => a.id === albumId));
  const navigate = useNavStore(s => s.navigate);
  const menu = useMenuState();

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setData(null);
    registry.getAlbumDetails(albumId)
      .then(d => {
        if (cancelled) return;
        setData(d);
        const aid = d.album.artistId;
        if (aid) registry.getArtistDetails(aid).then(a => { if (!cancelled) setMore(a.albums.filter(x => x.id !== d.album.id)); }).catch(() => {});
      })
      .catch(err => { if (!cancelled) setError(err?.message || 'Failed to load'); });
    return () => { cancelled = true; };
  }, [albumId, reload]);

  if (error) {
    return <EmptyState icon="album" title="Couldn't load album" description={error} action={<Button icon="refresh" onClick={() => setReload(r => r + 1)}>Retry</Button>} />;
  }
  if (!data) return <div><SkeletonPage /><SkeletonList count={8} showIndex className="mt-8" /></div>;

  const { album, tracks } = data;
  const player = () => usePlayerStore.getState();
  const kind = tracks.length > 0 && tracks.length <= 3 ? 'Single' : 'Album';
  const year = album.year || tracks.find(t => t.year)?.year;

  const items: MenuItem[] = [
    { label: 'Add to queue', icon: 'queue_music', disabled: !tracks.length, onSelect: () => player().addToQueue(tracks) },
    { label: 'Start radio', icon: 'radio', disabled: !tracks.length, onSelect: () => player().startRadio(tracks[0]) },
    { label: 'Save as playlist', icon: 'playlist_add', disabled: !tracks.length, onSelect: () => useLibraryStore.getState().createPlaylist(album.title, tracks) },
    ...(album.artistId ? [{ label: 'Go to artist', icon: 'person', onSelect: () => navigate(`artist:${album.artistId}`) }] : []),
    { divider: true },
    { label: isNativeApp() ? 'Share' : 'Copy link', icon: 'share', onSelect: () => copyLink(`album:${album.id}`) },
  ];

  return (
    <div className="animate-fade-in">
      <PageHeader
        image={album.thumbnail}
        eyebrow={kind}
        title={album.title}
        meta={<>
          {album.artistId
            ? <button type="button" onClick={() => navigate(`artist:${album.artistId}`)} className="font-bold text-on-surface hover:underline">{album.artist}</button>
            : <span className="font-bold text-on-surface">{album.artist}</span>}
          {year && <><span aria-hidden>•</span><span>{year}</span></>}
          <span aria-hidden>•</span><span>{collectionMeta(tracks)}</span>
        </>}
        actions={<>
          <Button variant="primary" size="lg" icon="play_arrow" disabled={!tracks.length} onClick={() => player().playTracks(tracks, 0, { shuffle: false })}>Play</Button>
          <IconButton icon="shuffle" label="Shuffle" size="lg" variant="tonal" disabled={!tracks.length} onClick={() => player().playTracks(tracks, 0, { shuffle: true })} />
          <IconButton icon={saved ? 'check_circle' : 'add_circle'} label={saved ? 'Remove from library' : 'Save to library'} size="lg" active={saved} filled={saved} onClick={() => useLibraryStore.getState().toggleSaveAlbum(album)} />
          <DownloadAllButton tracks={tracks} />
          <IconButton icon="more_horiz" label="More options" size="lg" onClick={menu.openFrom} />
        </>}
      />
      <Menu open={menu.open} anchor={menu.anchor} onClose={menu.onClose} items={items} ariaLabel="Album options" />

      <section className="mt-2">
        {tracks.length ? <TrackList tracks={tracks} showNumbers showThumbnail={false} showProvider={false} /> : <EmptyState compact icon="music_off" title="No playable tracks" />}
      </section>

      {year && <p className="mt-6 text-xs text-on-surface-variant">Released {year} · {album.artist}</p>}

      {more.length > 0 && (
        <Shelf className="mt-12" title={`More by ${album.artist}`} onSeeAll={album.artistId ? () => navigate(`artist:${album.artistId}`) : undefined} seeAllLabel="Discography">
          {more.map(a => <MediaCard key={a.id} title={a.title} subtitle={a.year ? String(a.year) : 'Album'} image={a.thumbnail} onClick={() => navigate(`album:${a.id}`)} />)}
        </Shelf>
      )}
    </div>
  );
}
