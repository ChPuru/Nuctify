import { useState } from 'react';
import SearchBar from '../components/SearchBar';
import TrackList from '../components/TrackList';
import { useSearchStore, usePlayerStore } from '../store';

type TabType = 'tracks' | 'albums' | 'artists';

export default function SearchPage() {
  const { results, isSearching, query, recentSearches, search } = useSearchStore();
  const { setQueue } = usePlayerStore();
  const [activeTab, setActiveTab] = useState<TabType>('tracks');

return (
    <div className="fade-in animate-[fadeIn_0.5s_ease-out] w-full">
      {}
      <section className="mb-12">
        <SearchBar />
      </section>

{}
      {!results && recentSearches.length > 0 && (
        <section className="mb-12">
          <div className="flex justify-between items-center mb-6">
            <h2 className="font-headline text-2xl font-bold text-white">Recent Searches</h2>
            <button className="text-[10px] font-bold uppercase tracking-widest text-primary cursor-pointer hover:text-white transition-colors">Clear all</button>
          </div>
          <div className="flex gap-4 overflow-x-auto custom-scrollbar pb-4 -mx-6 px-6 lg:mx-0 lg:px-0">
            {recentSearches.map((s) => (
              <div
                key={s}
                onClick={() => search(s)}
                className="flex-shrink-0 flex items-center gap-3 bg-surface-container-high p-3 pr-5 rounded-2xl border border-white/5 hover:bg-surface-container-highest transition-colors cursor-pointer group"
              >
                <div className="h-12 w-12 rounded-lg overflow-hidden bg-surface flex items-center justify-center">
                  <span className="material-symbols-outlined text-outline">history</span>
                </div>
                <div>
                  <p className="font-bold text-sm text-white">{s}</p>
                  <p className="text-[10px] text-outline-variant uppercase tracking-wider">Search</p>
                </div>
                <span className="material-symbols-outlined text-outline-variant text-[16px] group-hover:text-error transition-colors pl-2" onClick={(e) => { e.stopPropagation();  }}>close</span>
              </div>
            ))}
          </div>
        </section>
      )}

{}
      {isSearching && (
        <div className="flex justify-center items-center py-20">
          <div className="w-10 h-10 border-4 border-surface border-t-primary rounded-full animate-spin"></div>
        </div>
      )}

{}
      {results && !isSearching && (
        <div className="animate-[slideIn_0.3s_ease-out]">

{}
          <div className="flex gap-4 mb-8 border-b border-white/10 pb-4 overflow-x-auto custom-scrollbar">
            <button
              className={`px-4 py-2 rounded-full font-bold text-sm transition-all whitespace-nowrap ${activeTab === 'tracks' ? 'bg-white text-background' : 'text-slate-400 hover:text-white hover:bg-white/10'}`}
              onClick={() => setActiveTab('tracks')}
            >
              Songs ({results.tracks.length})
            </button>
            <button
              className={`px-4 py-2 rounded-full font-bold text-sm transition-all whitespace-nowrap ${activeTab === 'albums' ? 'bg-white text-background' : 'text-slate-400 hover:text-white hover:bg-white/10'}`}
              onClick={() => setActiveTab('albums')}
            >
              Albums ({results.albums.length})
            </button>
            <button
              className={`px-4 py-2 rounded-full font-bold text-sm transition-all whitespace-nowrap ${activeTab === 'artists' ? 'bg-white text-background' : 'text-slate-400 hover:text-white hover:bg-white/10'}`}
              onClick={() => setActiveTab('artists')}
            >
              Artists ({results.artists.length})
            </button>
          </div>

{}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-20">
            {}
            {activeTab === 'tracks' && results.tracks.length > 0 && (
              <div className="lg:col-span-5 flex flex-col gap-4">
                <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Top Result</h3>
                <div
                  className="group relative bg-surface-container-low rounded-3xl p-6 overflow-hidden border border-white/5 cursor-pointer hover:bg-surface-container transition-all min-h-[280px] flex flex-col justify-end"
                  onClick={() => { setQueue(results.tracks, 0); }}
                >
                  {}
                  <div className="absolute inset-0 z-0 opacity-20">
                    <img src={results.tracks[0].thumbnail || ''} alt="" className="w-full h-full object-cover blur-3xl scale-150" />
                  </div>

<div className="relative z-10 flex flex-col gap-5">
                    <div className="flex items-start justify-between">
                      <img
                        src={results.tracks[0].thumbnail || ''}
                        alt="Top Result"
                        className="w-28 h-28 rounded-2xl shadow-2xl object-cover ring-2 ring-white/10 group-hover:ring-primary/30 transition-all"
                      />
                      <span className="inline-flex px-3 py-1 rounded-full bg-primary/20 text-primary text-[10px] font-bold tracking-widest uppercase">
                        Song
                      </span>
                    </div>

<div>
                      <h2 className="font-headline text-2xl lg:text-3xl font-extrabold text-white truncate leading-tight mb-1 group-hover:text-primary transition-colors">
                        {results.tracks[0].title}
                      </h2>
                      <p className="text-sm text-slate-400 font-medium truncate">{results.tracks[0].artist}</p>
                      <span className="text-[10px] text-slate-500 font-mono uppercase tracking-widest mt-1 inline-block">
                        {results.tracks[0].source}
                      </span>
                    </div>
                  </div>

{}
                  <button
                    className="absolute bottom-6 right-6 w-12 h-12 rounded-full bg-gradient-to-r from-primary to-secondary flex items-center justify-center shadow-[0_0_20px_rgba(186,158,255,0.3)] opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all active:scale-90 z-20"
                    onClick={(e) => { e.stopPropagation(); setQueue(results.tracks, 0); }}
                  >
                    <span className="material-symbols-outlined text-2xl filled text-on-primary-container">play_arrow</span>
                  </button>
                </div>
              </div>
            )}

{}
            <div className={`flex flex-col gap-6 ${activeTab === 'tracks' && results.tracks.length > 0 ? 'lg:col-span-7' : 'lg:col-span-12'}`}>
              {activeTab === 'tracks' && results.tracks.length > 0 && (
                 <>
                   <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Songs</h3>
                   <TrackList tracks={results.tracks.slice(1)} showProvider={true} />
                 </>
              )}

{activeTab === 'tracks' && results.tracks.length === 0 && (
                <div className="flex flex-col items-center justify-center p-20 text-center col-span-12">
                  <span className="material-symbols-outlined text-6xl text-outline mb-6">search_off</span>
                  <h3 className="text-2xl font-bold text-white mb-2">No songs found for "{query}"</h3>
                  <p className="text-slate-400">Try a different search term or check your spelling</p>
                </div>
              )}

{activeTab === 'albums' && (
                <div className="flex flex-col items-center justify-center p-20 text-center">
                  <span className="material-symbols-outlined text-6xl text-outline mb-6">album</span>
                  <h3 className="text-2xl font-bold text-white mb-2">Album browsing coming soon</h3>
                  <p className="text-slate-400">For now, search for songs by album name directly</p>
                </div>
              )}

{activeTab === 'artists' && (
                <div className="flex flex-col items-center justify-center p-20 text-center">
                  <span className="material-symbols-outlined text-6xl text-outline mb-6">mic_external_on</span>
                  <h3 className="text-2xl font-bold text-white mb-2">Artist pages coming soon</h3>
                  <p className="text-slate-400">For now, search for songs by artist name directly</p>
                </div>
              )}
            </div>

</div>
        </div>
      )}
    </div>
  );
}
