import TrackList from '../components/TrackList';
import { useLibraryStore, usePlayerStore } from '../store';

interface LibraryPageProps {
  view: 'liked' | 'recent' | 'queue' | 'all';
}

export default function LibraryPage({ view }: LibraryPageProps) {
  const { likedTracks, recentlyPlayed, playlists } = useLibraryStore();
  const { queue, clearQueue } = usePlayerStore();

  const pageConfig = {
    all: {
      title: 'Library',
      subtitle: `${likedTracks.length} liked, ${playlists.length} playlists`,
      tracks: likedTracks,
      emptyIcon: 'library_music',
      emptyTitle: 'Your library is empty',
      emptyDesc: 'Liked songs and playlists will appear here',
      gradient: 'from-primary/40',
    },
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
      <section className="mt-8 mb-12 px-4 md:px-0">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8 group">
          <div className="flex items-center gap-6">
            <div className={`w-20 h-20 md:w-24 md:h-24 rounded-[1.5rem] md:rounded-3xl bg-gradient-to-br ${config.gradient} to-background flex items-center justify-center shadow-lg border border-white/10 group-hover:scale-105 transition-transform`}>
              <span className="material-symbols-outlined text-3xl md:text-4xl text-white">{config.emptyIcon}</span>
            </div>
            <div>
              <h1 className="text-3xl md:text-5xl font-headline font-extrabold tracking-tight text-white mb-1 md:mb-2">{config.title}</h1>
              <p className="text-slate-400 font-medium tracking-wide uppercase text-[10px] md:text-xs">{config.subtitle}</p>
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

      {view === 'all' && (
        <section className="mb-12 px-4 md:px-0">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-headline font-bold text-white">Your Playlists</h2>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {playlists.map(p => (
              <div 
                key={p.id} 
                onClick={() => { (window as any).nuctifyNavigate(`playlist:${p.id}`) }}
                className="bg-surface-container-low/40 backdrop-blur-xl border border-white/5 rounded-3xl p-6 hover:bg-white/5 transition-all cursor-pointer group"
              >
                <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <span className="material-symbols-outlined text-primary">queue_music</span>
                </div>
                <h3 className="font-bold text-white truncate mb-1">{p.name}</h3>
                <p className="text-xs text-slate-500 uppercase tracking-widest">{p.tracks.length} Tracks</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="px-4 md:px-0">
        {view === 'all' && likedTracks.length > 0 && (
          <h2 className="text-xl font-headline font-bold text-white mb-6">Liked Songs</h2>
        )}
        
        {config.tracks.length > 0 ? (
          <section className="mb-24">
            <TrackList tracks={config.tracks} showProvider={true} />
          </section>
        ) : view !== 'all' ? (
          <div className="flex flex-col items-center justify-center p-20 text-center bg-surface-container-low/50 backdrop-blur-xl border border-white/5 rounded-3xl">
            <span className="material-symbols-outlined text-6xl text-outline mb-6">{config.emptyIcon}</span>
            <h3 className="text-2xl font-bold text-white mb-2">{config.emptyTitle}</h3>
            <p className="text-slate-400">{config.emptyDesc}</p>
          </div>
        ) : playlists.length === 0 && (
          <div className="text-center py-20 text-slate-500 italic">No content in your library yet</div>
        )}
      </div>
    </div>
  );
}
