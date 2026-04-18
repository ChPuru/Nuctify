import { useState, useEffect } from 'react';
import { registry } from '../providers';
import { useLibraryStore, usePlayerStore } from '../store';
import {
  getSpotifyClientId, setSpotifyClientId, isSpotifyConnected,
  initiateSpotifyLogin, disconnectSpotify, getSpotifyPlaylists,
  importSpotifyPlaylist, importSpotifyLikedSongs, handleSpotifyCallback,
  SpotifyPlaylist,
} from '../integrations/spotify';
import {
  getScrobbleConfig, updateScrobbleConfig, getLastfmAuthUrl,
  handleLastfmCallback, validateListenBrainzToken,
} from '../integrations/scrobble';

export default function SettingsPage() {
  const providers = registry.getAll();
  const [, forceUpdate] = useState(0);

const [spotifyClientId, setClientId] = useState(getSpotifyClientId());
  const [spotifyConnected, setSpotifyConnected] = useState(isSpotifyConnected());
  const [spotifyPlaylists, setSpotifyPlaylists] = useState<SpotifyPlaylist[]>([]);
  const [loadingPlaylists, setLoadingPlaylists] = useState(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null);
  const [importResult, setImportResult] = useState<string | null>(null);

const [scrobbleConfig, setScrobbleConfig] = useState(getScrobbleConfig());
  const [lbToken, setLbToken] = useState(scrobbleConfig.listenbrainz.token);
  const [lbValidating, setLbValidating] = useState(false);
  const [lastfmKey, setLastfmKey] = useState(scrobbleConfig.lastfm.apiKey);
  const [lastfmSecret, setLastfmSecret] = useState(scrobbleConfig.lastfm.apiSecret);

const { toggleLike } = useLibraryStore();
  const {
    crossfadeEnabled, toggleCrossfade,
    eqPreset, setEQPreset,
    sleepTimerRemaining, startSleepTimer, stopSleepTimer
  } = usePlayerStore();

useEffect(() => {
    handleSpotifyCallback().then(success => {
      if (success) {
        setSpotifyConnected(true);
        loadPlaylists();
      }
    });

const config = getScrobbleConfig();
    if (config.lastfm.apiKey && config.lastfm.apiSecret) {
      handleLastfmCallback(config.lastfm.apiKey, config.lastfm.apiSecret).then(key => {
        if (key) {
          setScrobbleConfig(getScrobbleConfig());
        }
      });
    }
  }, []);

const toggleProvider = (name: string) => {
    const provider = providers.find(p => p.name === name);
    if (provider) {
      provider.enabled = !provider.enabled;
      forceUpdate(n => n + 1);
    }
  };

const handleSpotifyConnect = async () => {
    if (!spotifyClientId.trim()) {
      alert('Please enter your Spotify Client ID first');
      return;
    }
    setSpotifyClientId(spotifyClientId);
    await initiateSpotifyLogin();
  };

const loadPlaylists = async () => {
    setLoadingPlaylists(true);
    try {
      const playlists = await getSpotifyPlaylists();
      setSpotifyPlaylists(playlists);
    } catch (e) {
      console.error('Failed to load playlists:', e);
    }
    setLoadingPlaylists(false);
  };

const handleImportPlaylist = async (playlistId: string, playlistName: string) => {
    setImportProgress({ current: 0, total: 0 });
    setImportResult(null);
    try {
      const tracks = await importSpotifyPlaylist(playlistId, (current, total) => {
        setImportProgress({ current, total });
      });
      setImportResult(`✅ Imported ${tracks.length} tracks from "${playlistName}"`);
      for (const t of tracks) { toggleLike(t); }
    } catch (e: any) {
      setImportResult(`❌ Import failed: ${e.message}`);
    }
    setImportProgress(null);
  };

const handleImportLikedSongs = async () => {
    setImportProgress({ current: 0, total: 0 });
    setImportResult(null);
    try {
      const tracks = await importSpotifyLikedSongs((current, total) => {
        setImportProgress({ current, total });
      });
      setImportResult(`✅ Imported ${tracks.length} liked songs from Spotify`);
      for (const t of tracks) { toggleLike(t); }
    } catch (e: any) {
      setImportResult(`❌ Import failed: ${e.message}`);
    }
    setImportProgress(null);
  };

const handleLbConnect = async () => {
    if (!lbToken.trim()) return;
    setLbValidating(true);
    const result = await validateListenBrainzToken(lbToken);
    if (result.valid) {
      const updated = updateScrobbleConfig({
        listenbrainz: { enabled: true, token: lbToken, username: result.username },
      });
      setScrobbleConfig(updated);
      alert(`✅ Connected to ListenBrainz as ${result.username}`);
    } else {
      alert('❌ Invalid token. Check your ListenBrainz settings page.');
    }
    setLbValidating(false);
  };

const handleLbDisconnect = () => {
    const updated = updateScrobbleConfig({
      listenbrainz: { enabled: false, token: '', username: '' },
    });
    setScrobbleConfig(updated);
    setLbToken('');
  };

const handleLastfmConnect = async () => {
    if (!lastfmKey.trim() || !lastfmSecret.trim()) {
      alert('Please provide Last.fm API Key and Secret');
      return;
    }
    updateScrobbleConfig({
      lastfm: { ...scrobbleConfig.lastfm, apiKey: lastfmKey, apiSecret: lastfmSecret }
    });
    window.location.href = getLastfmAuthUrl(lastfmKey);
  };

const handleLastfmDisconnect = () => {
    const updated = updateScrobbleConfig({
      lastfm: { enabled: false, apiKey: lastfmKey, apiSecret: lastfmSecret, sessionKey: '', username: '' },
    });
    setScrobbleConfig(updated);
  };

return (
    <div className="fade-in animate-[fadeIn_0.5s_ease-out]">
      <section className="mb-12">
        <h1 className="text-4xl font-headline font-extrabold tracking-tight text-white mb-2">Settings</h1>
        <p className="text-slate-400">Configure providers, audio, and integrations</p>
      </section>

<div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-24">

{}
        <section className="bg-surface-container-low/50 backdrop-blur-xl border border-white/5 rounded-[2rem] p-8 glass-card">
          <div className="flex items-center gap-3 mb-8">
            <span className="material-symbols-outlined text-primary text-3xl">equalizer</span>
            <h2 className="text-2xl font-bold font-headline text-white">Audio & Playback</h2>
          </div>

<div className="space-y-6">
            <div className="flex justify-between items-center group cursor-pointer" onClick={toggleCrossfade}>
              <div>
                <h4 className="font-bold text-white mb-1">Crossfade</h4>
                <p className="text-xs text-slate-400">Smooth transition between tracks</p>
              </div>
              <div className={`w-12 h-6 rounded-full relative transition-colors ${crossfadeEnabled ? 'bg-primary' : 'bg-surface-variant'}`}>
                 <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${crossfadeEnabled ? 'left-7' : 'left-1'}`}></div>
              </div>
            </div>

<div>
              <h4 className="font-bold text-white mb-1">Equalizer Preset</h4>
              <p className="text-xs text-slate-400 mb-3">Adjust frequencies</p>
              <select 
                value={eqPreset} 
                onChange={e => setEQPreset(e.target.value)} 
                className="w-full bg-surface-container-high border-none rounded-xl py-3 px-4 text-white focus:ring-2 focus:ring-primary appearance-none cursor-pointer"
              >
                <option value="flat">Flat (Default)</option>
                <option value="bassBoost">Bass Boost</option>
                <option value="acoustic">Acoustic</option>
                <option value="electronic">Electronic</option>
                <option value="vocalBooster">Vocal Booster</option>
              </select>
            </div>

<div>
              <h4 className="font-bold text-white mb-1">Sleep Timer</h4>
              <p className="text-xs text-slate-400 mb-3">
                Stop automatically after: {sleepTimerRemaining ? `${Math.ceil(sleepTimerRemaining / 60000)} mins left` : 'Off'}
              </p>
              <div className="flex gap-2 mb-2 flex-wrap">
                {[15, 30, 45, 60].map(mins => (
                  <button 
                    key={mins}
                    onClick={() => startSleepTimer(mins)}
                    className="px-4 py-2 rounded-lg bg-surface-container-highest hover:bg-white/10 text-xs font-bold text-white transition-colors"
                  >
                    {mins}m
                  </button>
                ))}
                {sleepTimerRemaining !== null && (
                  <button onClick={stopSleepTimer} className="px-4 py-2 rounded-lg bg-error/20 text-error hover:bg-error/30 text-xs font-bold transition-colors">
                    Turn Off
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>

{}
        <section className="bg-surface-container-low/50 backdrop-blur-xl border border-white/5 rounded-[2rem] p-8 glass-card">
           <div className="flex items-center gap-3 mb-8">
            <span className="material-symbols-outlined text-secondary text-3xl">hub</span>
            <h2 className="text-2xl font-bold font-headline text-white">Music Providers</h2>
          </div>
          <div className="space-y-4">
            {providers.map(p => (
              <div key={p.name} className="flex justify-between items-center p-4 rounded-2xl bg-surface-container-high/50 border border-white/5 cursor-pointer group hover:bg-surface-container-high transition-colors" onClick={() => toggleProvider(p.name)}>
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-surface flex items-center justify-center text-sm font-bold uppercase tracking-widest text-slate-300">
                    {p.name.substring(0, 2)}
                  </div>
                  <div>
                    <h4 className="font-bold text-white capitalize">{p.name}</h4>
                    <span className="text-[10px] font-mono text-slate-400">{p.enabled ? 'Active' : 'Disabled'}</span>
                  </div>
                </div>
                <div className={`w-12 h-6 rounded-full relative transition-colors ${p.enabled ? 'bg-secondary' : 'bg-surface-variant'}`}>
                   <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${p.enabled ? 'left-7' : 'left-1'}`}></div>
                </div>
              </div>
            ))}
          </div>
        </section>

{}
        <section className="bg-surface-container-low/50 backdrop-blur-xl border border-white/5 rounded-[2rem] p-8 glass-card">
           <div className="flex items-center gap-3 mb-8">
            <span className="material-symbols-outlined text-tertiary text-3xl">hearing</span>
            <h2 className="text-2xl font-bold font-headline text-white">ListenBrainz</h2>
          </div>
          <div className="space-y-4">
            {scrobbleConfig.listenbrainz.enabled ? (
              <div className="p-4 bg-tertiary/10 border border-tertiary/20 rounded-2xl flex justify-between items-center">
                 <div>
                   <p className="text-sm font-bold text-tertiary">Connected</p>
                   <p className="text-xs text-slate-400">Scrobbling as {scrobbleConfig.listenbrainz.username}</p>
                 </div>
                 <button onClick={handleLbDisconnect} className="px-4 py-2 bg-surface text-xs font-bold text-white rounded-lg hover:bg-surface-variant transition-colors">Disconnect</button>
              </div>
            ) : (
              <div className="space-y-3">
                <input
                  type="password"
                  placeholder="ListenBrainz User Token"
                  value={lbToken}
                  onChange={e => setLbToken(e.target.value)}
                  className="w-full bg-surface-container border-none rounded-xl py-3 pl-4 text-sm text-white focus:ring-2 focus:ring-tertiary"
                />
                <button 
                  onClick={handleLbConnect} 
                  disabled={lbValidating} 
                  className="w-full py-3 bg-tertiary text-on-tertiary font-bold rounded-xl text-sm"
                >
                  {lbValidating ? 'Validating...' : 'Connect'}
                </button>
              </div>
            )}
          </div>
        </section>

{}
        <section className="bg-surface-container-low/50 backdrop-blur-xl border border-white/5 rounded-[2rem] p-8 glass-card">
           <div className="flex justify-between items-center mb-8">
             <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-[#1DB954] text-3xl">library_music</span>
                <h2 className="text-2xl font-bold font-headline text-white">Spotify Import</h2>
             </div>
             {spotifyConnected && (
               <button onClick={disconnectSpotify} className="text-xs text-error font-bold uppercase hover:underline">Disconnect</button>
             )}
          </div>

<div className="space-y-6">
            {!spotifyConnected ? (
              <div className="space-y-3">
                <p className="text-xs text-slate-400 mb-2">Provide your <a href="https://developer.spotify.com/dashboard" target="_blank" className="text-primary hover:underline">Spotify Client ID</a> (must have redirect URI set to current URL).</p>
                <input
                  type="text"
                  placeholder="Client ID (or fallback to .env)"
                  value={spotifyClientId}
                  onChange={e => setClientId(e.target.value)}
                  className="w-full bg-surface-container-high border-none rounded-xl py-3 pl-4 text-sm text-white focus:ring-2 focus:ring-[#1DB954]"
                />
                <button onClick={handleSpotifyConnect} className="w-full py-3 bg-[#1DB954] text-black font-bold rounded-xl text-sm">
                  Connect Account
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <button onClick={handleImportLikedSongs} className="w-full py-3 border border-[#1DB954] text-[#1DB954] hover:bg-[#1DB954] hover:text-black font-bold rounded-xl text-sm transition-colors">
                  Import Liked Songs
                </button>

<div className="pt-4 border-t border-white/10">
                  <div className="flex justify-between items-center mb-4">
                    <h4 className="font-bold text-white">Your Playlists</h4>
                    <button onClick={loadPlaylists} disabled={loadingPlaylists} className="text-xs text-[#1DB954]">{loadingPlaylists ? 'Loading...' : 'Refresh'}</button>
                  </div>

<div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar pr-2">
                    {spotifyPlaylists.map(p => (
                      <div key={p.id} className="flex justify-between items-center p-3 rounded-xl bg-surface-container-high group">
                        <div className="flex-1 min-w-0 pr-4">
                          <p className="text-sm font-bold text-white truncate">{p.name}</p>
                          <p className="text-[10px] text-slate-400">{p.trackCount} tracks</p>
                        </div>
                        <button onClick={() => handleImportPlaylist(p.id, p.name)} className="text-xs font-bold px-3 py-1 bg-surface rounded-lg text-[#1DB954] group-hover:bg-[#1DB954] group-hover:text-black transition-colors">
                          Import
                        </button>
                      </div>
                    ))}
                    {spotifyPlaylists.length === 0 && <p className="text-xs text-slate-500">No playlists found</p>}
                  </div>
                </div>

{importProgress && (
                  <div className="p-3 rounded-xl bg-primary/20 border border-primary text-center">
                    <p className="text-xs text-white font-bold mb-1">Importing: {importProgress.current} / {importProgress.total}</p>
                    <div className="w-full h-1 bg-white/20 rounded-full mt-2 overflow-hidden">
                      <div className="h-full bg-primary" style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}></div>
                    </div>
                  </div>
                )}
                {importResult && (
                  <div className="p-3 rounded-xl bg-surface-container text-xs text-white font-mono break-words">{importResult}</div>
                )}
              </div>
            )}
          </div>
        </section>

</div>
    </div>
  );
}
