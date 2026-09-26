import { useEffect, useState } from 'react';
import { registry } from '../providers';
import { Track, Artist, Album } from '../providers/types';
import TrackList from '../components/TrackList';
import { useNavStore } from '../store/nav';
import { usePlayerStore, useLibraryStore } from '../store';
import { Button, EmptyState, IconButton, MediaCard, Menu, PageHeader, Shelf, SkeletonList, SkeletonPage, useMenuState } from '../components/ui';
import { copyLink, playRemote } from './Album';
import { isNativeApp } from '../utils/env';

export default function ArtistPage({ artistId }: { artistId: string }) {
  const [data, setData] = useState<{ artist: Artist; topTracks: Track[]; albums: Album[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [bioOpen, setBioOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const following = useLibraryStore(s => s.followedArtists.some(a => a.id === artistId));
  const navigate = useNavStore(s => s.navigate);
  const menu = useMenuState();

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setData(null);
    registry.getArtistDetails(artistId)
      .then(d => { if (!cancelled) setData(d); })
      .catch(err => { if (!cancelled) setError(err?.message || 'Failed to load'); });
    return () => { cancelled = true; };
  }, [artistId, reload]);

  if (error) {
    return <EmptyState icon="person_off" title="Couldn't load artist" description={error} action={<Button icon="refresh" onClick={() => setReload(r => r + 1)}>Retry</Button>} />;
  }
  if (!data) return <div><SkeletonPage /><SkeletonList count={5} showIndex className="mt-8" /></div>;

  const { artist, topTracks, albums } = data;
  const player = () => usePlayerStore.getState();
  const singles = albums.filter(a => a.trackCount !== undefined && a.trackCount <= 3);
  const fullAlbums = albums.filter(a => !singles.includes(a));
  const sortYear = (l: Album[]) => [...l].sort((a, b) => (b.year || 0) - (a.year || 0));
  const card = (a: Album) => (
    <MediaCard key={a.id} title={a.title} subtitle={[a.year, singles.includes(a) ? 'Single' : 'Album'].filter(Boolean).join(' • ')} image={a.thumbnail} onClick={() => navigate(`album:${a.id}`)} onPlay={() => playRemote('album', a.id)} />
  );

  return (
    <div className="animate-fade-in">
      <PageHeader
        image={artist.image}
        shape="circle"
        icon="person"
        eyebrow="Artist"
        title={artist.name}
        meta={<span>{[topTracks.length && `${topTracks.length} popular songs`, albums.length && `${albums.length} releases`].filter(Boolean).join(' • ')}</span>}
        actions={<>
          <Button variant="primary" size="lg" icon="play_arrow" disabled={!topTracks.length} onClick={() => player().playTracks(topTracks, 0, { shuffle: false })}>Play</Button>
          <IconButton icon="shuffle" label="Shuffle" size="lg" variant="tonal" disabled={!topTracks.length} onClick={() => player().playTracks(topTracks, 0, { shuffle: true })} />
          <Button variant={following ? 'outline' : 'secondary'} icon={following ? 'check' : 'person_add'} onClick={() => useLibraryStore.getState().toggleFollowArtist(artist)} aria-pressed={following}>
            {following ? 'Following' : 'Follow'}
          </Button>
          <IconButton icon="radio" label="Artist radio" size="lg" disabled={!topTracks.length} onClick={() => player().startRadio(topTracks[0])} />
          <IconButton icon="more_horiz" label="More options" size="lg" onClick={menu.openFrom} />
        </>}
      />
      <Menu
        open={menu.open}
        anchor={menu.anchor}
        onClose={menu.onClose}
        ariaLabel="Artist options"
        items={[
          { label: 'Add popular to queue', icon: 'queue_music', disabled: !topTracks.length, onSelect: () => player().addToQueue(topTracks) },
          { label: 'Save popular as playlist', icon: 'playlist_add', disabled: !topTracks.length, onSelect: () => useLibraryStore.getState().createPlaylist(`${artist.name} essentials`, topTracks) },
          { divider: true },
          { label: isNativeApp() ? 'Share' : 'Copy link', icon: 'share', onSelect: () => copyLink(`artist:${artist.id}`) },
        ]}
      />

      <div className="space-y-12 mt-2">
        <section aria-labelledby="popular-h">
          <h2 id="popular-h" className="text-xl sm:text-2xl font-bold text-on-surface mb-3">Popular</h2>
          {topTracks.length ? (
            <>
              <TrackList tracks={showAll ? topTracks : topTracks.slice(0, 5)} showNumbers showProvider={false} />
              {topTracks.length > 5 && (
                <Button variant="ghost" size="sm" className="mt-2" onClick={() => setShowAll(v => !v)}>{showAll ? 'Show less' : 'See more'}</Button>
              )}
            </>
          ) : <EmptyState compact icon="music_off" title="No tracks available" />}
        </section>

        {fullAlbums.length > 0 && <Shelf title="Albums">{sortYear(fullAlbums).map(card)}</Shelf>}
        {singles.length > 0 && <Shelf title="Singles & EPs">{sortYear(singles).map(card)}</Shelf>}

        {artist.bio && (
          <section aria-labelledby="about-h" className="max-w-3xl">
            <h2 id="about-h" className="text-xl sm:text-2xl font-bold text-on-surface mb-3">About</h2>
            <div className="rounded-2xl bg-surface-container p-5 sm:p-6">
              <p className={`text-sm sm:text-base text-on-surface-variant leading-relaxed whitespace-pre-line ${bioOpen ? '' : 'line-clamp-4'}`}>{artist.bio}</p>
              {artist.bio.length > 240 && (
                <Button variant="ghost" size="sm" className="mt-3 -ml-3" iconRight={bioOpen ? 'expand_less' : 'expand_more'} aria-expanded={bioOpen} onClick={() => setBioOpen(o => !o)}>
                  {bioOpen ? 'Show less' : 'Read more'}
                </Button>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
