import { useMemo } from 'react';
import { useAuthStore } from '../store/auth';
import { useLibraryStore, usePlayerStore } from '../store';
import { useNavStore } from '../store/nav';
import { isSupabaseConfigured } from '../integrations/supabase';
import TrackList from '../components/TrackList';
import type { Track } from '../providers/types';
import { Artwork, Button, EmptyState, MediaCard, PageHeader, Shelf } from '../components/ui';

export default function ProfilePage() {
  const user = useAuthStore(s => s.user);
  const liked = useLibraryStore(s => s.likedTracks);
  const history = useLibraryStore(s => s.listeningHistory);
  const playCounts = useLibraryStore(s => s.playCounts);
  const playlists = useLibraryStore(s => s.playlists);
  const followed = useLibraryStore(s => s.followedArtists);
  const navigate = useNavStore(s => s.navigate);

  const { topTracks, topArtists, plays } = useMemo(() => {
    const since = Date.now() - 28 * 864e5;
    const counts = new Map<string, { track: Track; n: number }>();
    const artists = new Map<string, { name: string; id?: string; image?: string; n: number }>();
    for (const { track, playedAt } of history) {
      if (playedAt < since) break;
      const c = counts.get(track.id);
      if (c) c.n++; else counts.set(track.id, { track, n: 1 });
      const a = artists.get(track.artist);
      if (a) a.n++; else artists.set(track.artist, { name: track.artist, id: track.artistId, image: track.thumbnail, n: 1 });
    }
    const tt = [...counts.values()].sort((a, b) => b.n - a.n).slice(0, 10).map(c => c.track);
    return {
      topTracks: tt.length ? tt : liked.slice(0, 10),
      topArtists: [...artists.values()].sort((a, b) => b.n - a.n).slice(0, 10),
      plays: Object.values(playCounts).reduce((a, b) => a + b.count, 0),
    };
  }, [history, liked, playCounts]);

  if (!user) {
    return (
      <EmptyState icon="account_circle" title="Sign in to see your profile" description="Keep your likes, playlists and history in sync on every device."
        action={<Button variant="primary" size="lg" onClick={() => useAuthStore.getState().openAuthModal()}>Sign in</Button>} />
    );
  }

  const isCloud = !user.id.startsWith('local-') && isSupabaseConfigured();
  const publicPlaylists = playlists.filter(p => !p.rules);
  const name = user.displayName || 'You';

  return (
    <div className="animate-fade-in pb-8">
      <PageHeader
        eyebrow="Profile"
        title={name}
        image={user.avatarUrl ?? null}
        shape="circle"
        artwork={user.avatarUrl ? undefined : (
          <div className="w-40 h-40 sm:w-52 sm:h-52 rounded-full bg-gradient-to-br from-primary to-secondary text-on-primary flex items-center justify-center shadow-overlay">
            <span className="font-headline font-extrabold text-6xl sm:text-7xl">{name[0]?.toUpperCase()}</span>
          </div>
        )}
        meta={<>
          <span>{publicPlaylists.length} playlists</span><span aria-hidden>•</span>
          <span>{liked.length} liked songs</span><span aria-hidden>•</span>
          <span>{plays} plays</span>
          {isCloud && <><span aria-hidden>•</span><span className="inline-flex items-center gap-1 text-primary"><span aria-hidden className="material-symbols-outlined filled text-base">cloud_done</span>Synced</span></>}
        </>}
        description={user.email}
        actions={<>
          <Button icon="insights" onClick={() => navigate('stats')}>Your stats</Button>
          <Button icon="settings" variant="ghost" onClick={() => navigate('settings')}>Settings</Button>
          <Button icon="logout" variant="ghost" onClick={() => { useAuthStore.getState().signOut(); navigate('home'); }}>Log out</Button>
        </>}
      />

      {topArtists.length > 0 && (
        <Shelf title="Top artists this month" subtitle="Only visible to you" className="mb-8">
          {topArtists.map(a => (
            <MediaCard key={a.name} title={a.name} subtitle={`${a.n} plays`} image={a.image} shape="circle" onClick={a.id ? () => navigate(`artist:${a.id}`) : undefined} />
          ))}
        </Shelf>
      )}

      <section className="mb-10">
        <div className="flex items-end justify-between mb-3">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-on-surface">{history.length ? 'Top songs this month' : 'Liked songs'}</h2>
            <p className="text-sm text-on-surface-variant">Only visible to you</p>
          </div>
          <Button size="sm" variant="ghost" onClick={() => navigate('stats')}>Show all</Button>
        </div>
        <TrackList tracks={topTracks} showHeader={false} emptyTitle="Nothing here yet" emptyDescription="Play some music to see your top songs." />
      </section>

      {publicPlaylists.length > 0 && (
        <Shelf title="Playlists" className="mb-8" onSeeAll={() => navigate('library')}>
          {publicPlaylists.map(p => (
            <MediaCard key={p.id} title={p.name} subtitle={`${p.tracks.length} songs`} image={p.thumbnail || p.tracks.find(t => t.thumbnail)?.thumbnail} icon="queue_music"
              onClick={() => navigate(`playlist:${p.id}`)} onPlay={p.tracks.length ? () => usePlayerStore.getState().playTracks(p.tracks) : undefined} />
          ))}
        </Shelf>
      )}

      {followed.length > 0 && (
        <Shelf title="Following" className="mb-8">
          {followed.map(a => <MediaCard key={a.id} title={a.name} subtitle="Artist" image={a.image} shape="circle" onClick={() => navigate(`artist:${a.id}`)} />)}
        </Shelf>
      )}

      {!isCloud && (
        <div className="flex items-center gap-4 rounded-xl bg-surface-container p-4">
          <Artwork icon="cloud_off" size="sm" rounded="full" />
          <p className="text-sm text-on-surface-variant flex-1">Your library is stored on this device only.</p>
        </div>
      )}
    </div>
  );
}
