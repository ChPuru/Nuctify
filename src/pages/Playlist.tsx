import { useLibraryStore, usePlayerStore } from '../store';
import TrackList from '../components/TrackList';

interface PlaylistPageProps {
  playlistId: string;
}

export default function PlaylistPage({ playlistId }: PlaylistPageProps) {
  const { playlists, deletePlaylist } = useLibraryStore();
  const { setQueue } = usePlayerStore();
  const playlist = playlists.find((p) => p.id === playlistId);

if (!playlist) {
    return (
      <div className="flex flex-col items-center justify-center p-20 text-center">
        <span className="material-symbols-outlined text-6xl text-outline mb-6">playlist_remove</span>
        <h3 className="text-2xl font-bold text-white mb-2">Playlist not found</h3>
        <p className="text-slate-400">This playlist may have been deleted</p>
      </div>
    );
  }

const totalDuration = playlist.tracks.reduce((acc, t) => acc + (t.duration || 0), 0);
  const formatDurationLong = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h} hr ${m} min` : `${m} min`;
  };

const handlePlayAll = () => {
    if (playlist.tracks.length > 0) {
      setQueue(playlist.tracks, 0);
    }
  };

const handleShuffle = () => {
    if (playlist.tracks.length > 0) {
      const shuffled = [...playlist.tracks].sort(() => Math.random() - 0.5);
      setQueue(shuffled, 0);
    }
  };

return (
    <div className="fade-in animate-[fadeIn_0.5s_ease-out]">
      {}
      <section className="mb-10">
        <div className="flex flex-col md:flex-row md:items-end gap-8 mb-8">
          {}
          <div className="w-48 h-48 md:w-56 md:h-56 rounded-3xl bg-gradient-to-br from-primary/30 to-secondary/30 border border-white/10 flex-shrink-0 overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.4)] relative group">
            {playlist.tracks.length >= 4 ? (
              <div className="grid grid-cols-2 w-full h-full">
                {playlist.tracks.slice(0, 4).map((t, i) => (
                  <img key={i} src={t.thumbnail || ''} alt="" className="w-full h-full object-cover" />
                ))}
              </div>
            ) : playlist.tracks.length > 0 && playlist.tracks[0].thumbnail ? (
              <img src={playlist.tracks[0].thumbnail} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <span className="material-symbols-outlined text-6xl text-white/20">queue_music</span>
              </div>
            )}
          </div>

{}
          <div className="flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary mb-2">Playlist</p>
            <h1 className="text-4xl md:text-6xl font-headline font-extrabold tracking-tight text-white mb-4 leading-tight">
              {playlist.name}
            </h1>
            <p className="text-sm text-slate-400 font-medium">
              {playlist.tracks.length} {playlist.tracks.length === 1 ? 'song' : 'songs'}
              {totalDuration > 0 && <span className="text-slate-600 mx-2">•</span>}
              {totalDuration > 0 && formatDurationLong(totalDuration)}
            </p>
          </div>
        </div>

{}
        <div className="flex items-center gap-4">
          <button
            onClick={handlePlayAll}
            disabled={playlist.tracks.length === 0}
            className="w-14 h-14 rounded-full bg-gradient-to-r from-primary to-secondary flex items-center justify-center text-on-primary-container shadow-[0_8px_24px_rgba(186,158,255,0.3)] hover:scale-105 active:scale-95 transition-transform disabled:opacity-40"
          >
            <span className="material-symbols-outlined text-3xl filled">play_arrow</span>
          </button>
          <button
            onClick={handleShuffle}
            disabled={playlist.tracks.length === 0}
            className="w-14 h-14 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white hover:bg-white/10 active:scale-95 transition-all disabled:opacity-40"
          >
            <span className="material-symbols-outlined text-2xl">shuffle</span>
          </button>
          <button
            onClick={() => deletePlaylist(playlistId)}
            className="ml-auto text-slate-500 hover:text-error transition-colors"
            title="Delete Playlist"
          >
            <span className="material-symbols-outlined text-2xl">delete_outline</span>
          </button>
        </div>
      </section>

{}
      {playlist.tracks.length > 0 ? (
        <TrackList tracks={playlist.tracks} showProvider={true} playlistId={playlistId} />
      ) : (
        <div className="flex flex-col items-center justify-center p-16 text-center bg-surface-container-low/50 backdrop-blur-xl border border-white/5 rounded-3xl">
          <span className="material-symbols-outlined text-5xl text-outline mb-4">library_add</span>
          <h3 className="text-xl font-bold text-white mb-2">This playlist is empty</h3>
          <p className="text-sm text-slate-400 max-w-sm">
            Search for songs and use the <span className="text-primary font-bold">⋮</span> menu on any track to add it here
          </p>
        </div>
      )}
    </div>
  );
}
