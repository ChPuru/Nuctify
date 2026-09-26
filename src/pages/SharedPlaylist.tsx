import { useState, useEffect } from 'react';
import { getSharedPlaylist } from '../integrations/supabase';
import { usePlayerStore, useLibraryStore } from '../store';
import { useToastStore } from '../store/toast';
import TrackList from '../components/TrackList';
import { Track } from '../providers/types';
import { formatTime } from '../utils';
import { Button, EmptyState, IconButton, PageHeader, Skeleton, SkeletonList } from '../components/ui';

const SAFE_SOURCES = ['jiosaavn', 'youtube', 'soundcloud', 'bandcamp', 'podcast'];

function sanitize(tracks: unknown): Track[] {
  if (!Array.isArray(tracks)) return [];
  return tracks
    .filter((t: any) => t && typeof t.id === 'string' && typeof t.title === 'string' && SAFE_SOURCES.includes(t.source))
    .slice(0, 1000)
    .map((t: any) => ({
      id: t.id,
      title: String(t.title),
      artist: String(t.artist ?? ''),
      artistId: typeof t.artistId === 'string' ? t.artistId : undefined,
      album: typeof t.album === 'string' ? t.album : undefined,
      albumId: typeof t.albumId === 'string' ? t.albumId : undefined,
      duration: Number(t.duration) || 0,
      thumbnail: typeof t.thumbnail === 'string' && /^https:\/\//.test(t.thumbnail) ? t.thumbnail : undefined,
      source: t.source,
      sourceId: String(t.sourceId ?? ''),
    }));
}

interface Shared { name: string; author_name?: string; tracks: Track[] }

export default function SharedPlaylistPage({ shareId }: { shareId: string }) {
  const [playlist, setPlaylist] = useState<Shared | null>(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setSaved(false);
    getSharedPlaylist(shareId).then(p => {
      if (cancelled) return;
      setPlaylist(p ? { name: String(p.name ?? 'Shared playlist'), author_name: typeof p.author_name === 'string' ? p.author_name : undefined, tracks: sanitize(p.tracks) } : null);
      setLoading(false);
    }, () => { if (!cancelled) { setPlaylist(null); setLoading(false); } });
    return () => { cancelled = true; };
  }, [shareId]);

  if (loading) {
    return (
      <div className="pt-8" aria-busy="true">
        <div className="flex flex-col sm:flex-row items-center sm:items-end gap-6 mb-8">
          <Skeleton className="w-48 h-48 sm:w-56 sm:h-56" rounded="rounded-xl" />
          <div className="flex-1 w-full space-y-3 flex flex-col items-center sm:items-start"><Skeleton className="h-10 w-2/3" /><Skeleton className="h-4 w-40" /></div>
        </div>
        <SkeletonList count={8} />
      </div>
    );
  }

  if (!playlist) {
    return <EmptyState icon="link_off" title="This link doesn’t work anymore" description="The shared playlist may have been removed or the link is incomplete." />;
  }

  const { tracks } = playlist;
  const total = tracks.reduce((a, t) => a + (t.duration || 0), 0);
  const play = (shuffle: boolean) => tracks.length && usePlayerStore.getState().playTracks(tracks, 0, { shuffle });
  const save = () => {
    if (saved) return;
    setSaved(true);
    useLibraryStore.getState().importPlaylist(playlist.name, tracks);
    useToastStore.getState().addToast('Saved to Your Library', 'success');
  };

  return (
    <div className="animate-fade-in pb-8">
      <PageHeader
        eyebrow="Shared playlist"
        title={playlist.name}
        image={tracks.find(t => t.thumbnail)?.thumbnail ?? null}
        icon="queue_music"
        meta={<>
          {playlist.author_name && <span className="font-semibold text-on-surface">{playlist.author_name}</span>}
          {playlist.author_name && <span aria-hidden>•</span>}
          <span>{tracks.length} songs</span>
          {total > 0 && <><span aria-hidden>•</span><span>{total >= 3600 ? `${Math.floor(total / 3600)} hr ${Math.round((total % 3600) / 60)} min` : formatTime(total)}</span></>}
        </>}
        actions={<>
          <IconButton icon="play_arrow" label="Play" variant="primary" size="xl" filled disabled={!tracks.length} onClick={() => play(false)} />
          <IconButton icon="shuffle" label="Shuffle play" variant="tonal" size="lg" disabled={!tracks.length} onClick={() => play(true)} />
          <Button variant={saved ? 'secondary' : 'outline'} icon={saved ? 'check' : 'add'} disabled={saved} onClick={save}>{saved ? 'Saved' : 'Save to library'}</Button>
        </>}
      />
      <TrackList tracks={tracks} showProvider emptyTitle="This playlist is empty" />
    </div>
  );
}
