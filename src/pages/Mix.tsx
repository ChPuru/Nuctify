import { useEffect, useMemo } from 'react';
import { findSpec, gradientFor, useMixStore } from '../recommend';
import { useLibraryStore, usePlayerStore } from '../store';
import { useNavStore } from '../store/nav';
import { useToastStore } from '../store/toast';
import TrackList from '../components/TrackList';
import { MixCover } from '../components/MadeForYouShelf';
import { Button, EmptyState, IconButton, PageHeader, SkeletonList } from '../components/ui';

export default function MixPage({ mixId }: { mixId: string }) {
  const spec = useMemo(() => findSpec(mixId), [mixId]);
  const cached = useMixStore((s) => s.mixes[mixId]);
  const pending = useMixStore((s) => !!s.pending[mixId]);
  const ensure = useMixStore((s) => s.ensure);
  const navigate = useNavStore((s) => s.navigate);

  useEffect(() => { if (spec) void ensure(spec); }, [spec, ensure]);

  const title = cached?.title ?? spec?.title;
  const tracks = cached?.tracks ?? [];
  const kind = spec?.kind ?? (mixId.split('-')[0] as 'daily');

  if (!title) {
    return <EmptyState icon="auto_awesome" title="Mix not available" description="This mix isn’t available anymore. Your mixes change as you listen."
      action={<Button variant="primary" onClick={() => navigate('made-for-you')}>See your mixes</Button>} />;
  }

  const play = (shuffle: boolean) => tracks.length && usePlayerStore.getState().playTracks(tracks, 0, { shuffle });
  const saveAsPlaylist = () => {
    const id = useLibraryStore.getState().createPlaylist(`${title} · ${new Date().toLocaleDateString()}`, tracks);
    useToastStore.getState().addToast(`Saved “${title}” to your library`, 'success');
    if (id) navigate(`playlist:${id}`);
  };
  const mins = Math.round(tracks.reduce((a, t) => a + (t.duration || 0), 0) / 60);

  return (
    <div className="pb-6">
      <PageHeader
        eyebrow="Made for you"
        title={title}
        color={gradientFor(mixId).from}
        artwork={<MixCover spec={{ id: mixId, title, kind }} size="hero" />}
        description={cached?.description ?? spec?.description}
        meta={<><b className="text-on-surface">Nuctify</b><span>•</span><span>{tracks.length ? `${tracks.length} songs${mins ? `, about ${mins >= 60 ? `${Math.floor(mins / 60)} hr ${mins % 60} min` : `${mins} min`}` : ''}` : pending ? 'Building your mix…' : 'No songs yet'}</span>
          {spec && <><span>•</span><span>Updates {spec.period === 'week' ? 'weekly' : 'daily'}</span></>}</>}
        actions={<>
          <IconButton icon="play_arrow" label="Play" variant="primary" size="xl" filled disabled={!tracks.length} onClick={() => play(false)} />
          <IconButton icon="shuffle" label="Shuffle play" size="lg" disabled={!tracks.length} onClick={() => play(true)} />
          <Button icon="playlist_add" disabled={!tracks.length} onClick={saveAsPlaylist}>Save as playlist</Button>
          {spec && <IconButton icon="refresh" label="Rebuild mix" size="md" disabled={pending} onClick={() => void ensure(spec, true)} />}
        </>}
      />
      {tracks.length ? (
        <TrackList tracks={tracks} showProvider />
      ) : pending ? (
        <SkeletonList count={10} showIndex />
      ) : (
        <EmptyState compact icon={navigator.onLine ? 'music_off' : 'wifi_off'}
          title={navigator.onLine ? 'Couldn’t build this mix' : 'You’re offline'}
          description={navigator.onLine ? 'Sources didn’t return anything this time. Try again in a moment.' : 'Connect to the internet to build this mix.'}
          action={spec && <Button onClick={() => void ensure(spec, true)}>Try again</Button>} />
      )}
    </div>
  );
}
