import TrackList from '../components/TrackList';
import { useLibraryStore, usePlayerStore } from '../store';

interface LibraryPageProps {
  view: 'liked' | 'recent' | 'queue';
}

export default function LibraryPage({ view }: LibraryPageProps) {
  const { likedTracks, recentlyPlayed } = useLibraryStore();
  const { queue, clearQueue } = usePlayerStore();

const pageConfig = {
    liked: {
      title: 'Liked Songs',
      subtitle: `${likedTracks.length} songs`,
      tracks: likedTracks,
      emptyIcon: 'favorite_border',
      emptyTitle: 'Songs you like will appear here',
      emptyDesc: 'Save songs by tapping the heart icon',
      gradient: 'from-[#ba9eff]',
    },
    recent: {
      title: 'Recently Played',
      subtitle: `${recentlyPlayed.length} songs`,
      tracks: recentlyPlayed,
      emptyIcon: 'history',
      emptyTitle: 'Nothing played yet',
      emptyDesc: 'Start listening and your history will show up here',
      gradient: 'from-[#53ddfc]',
    },
    queue: {
      title: 'Queue',
      subtitle: `${queue.length} songs`,
      tracks: queue,
      emptyIcon: 'queue_music',
      emptyTitle: 'Queue is empty',
      emptyDesc: 'Add songs to your queue to see them here',
      gradient: 'from-[#ec63ff]',
    },
  };

const config = pageConfig[view];

return (
    <div className="fade-in animate-[fadeIn_0.5s_ease-out]">
      <section className="mt-8 mb-12">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8 group">
          <div className="flex items-center gap-6">
            <div className={`w-24 h-24 rounded-3xl bg-gradient-to-br ${config.gradient} to-background flex items-center justify-center shadow-lg border border-white/10 group-hover:scale-105 transition-transform`}>
              <span className="material-symbols-outlined text-4xl text-white">{config.emptyIcon}</span>
            </div>
            <div>
              <h1 className="text-4xl md:text-5xl font-headline font-extrabold tracking-tight text-white mb-2">{config.title}</h1>
              <p className="text-slate-400 font-medium tracking-wide uppercase text-xs">{config.subtitle}</p>
            </div>
          </div>
          {view === 'queue' && queue.length > 0 && (
            <button 
              className="px-6 py-2 rounded-full border border-white/20 text-white font-bold text-sm hover:bg-white/10 transition-colors"
              onClick={clearQueue}
            >
              Clear Queue
            </button>
          )}
        </div>
      </section>

{config.tracks.length > 0 ? (
        <section className="mb-24">
          <TrackList tracks={config.tracks} showProvider={true} />
        </section>
      ) : (
        <div className="flex flex-col items-center justify-center p-20 text-center bg-surface-container-low/50 backdrop-blur-xl border border-white/5 rounded-3xl">
          <span className="material-symbols-outlined text-6xl text-outline mb-6">{config.emptyIcon}</span>
          <h3 className="text-2xl font-bold text-white mb-2">{config.emptyTitle}</h3>
          <p className="text-slate-400">{config.emptyDesc}</p>
        </div>
      )}
    </div>
  );
}
