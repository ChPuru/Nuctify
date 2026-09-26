import { useState, useEffect, type ReactNode } from 'react';
import { registry } from '../providers';
import { useLibraryStore, usePlayerStore, useDownloadsStore, type StreamQuality } from '../store';
import { useAuthStore } from '../store/auth';
import { useToastStore } from '../store/toast';
import { usePluginStore } from '../store/plugins';
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
import { isSupabaseConfigured } from '../integrations/supabase';
import { EQ_PRESETS } from '../audio/engine';
import { THEMES, Theme } from '../utils/themes';
import { isNativeApp, isTauriApp } from '../utils/env';
import { useShallow } from 'zustand/react/shallow';
import { Button, Modal, cn } from '../components/ui';

const APP_VERSION = '0.1.0';
const toast = (m: string, t: 'success' | 'error' | 'info' = 'success') => useToastStore.getState().addToast(m, t);
const INPUT = 'w-full h-11 rounded-xl bg-on-surface/[0.06] px-4 text-sm text-on-surface placeholder:text-on-surface-variant outline-none focus:ring-2 focus:ring-primary';
const EQ_LABELS: Record<string, string> = { flat: 'Flat', bassBoost: 'Bass boost', electronic: 'Electronic', acoustic: 'Acoustic', vocalBooster: 'Vocal' };
const QUALITY: { value: StreamQuality; label: string; hint: string }[] = [
  { value: 'high', label: 'High', hint: 'Up to 320 kbps' },
  { value: 'normal', label: 'Normal', hint: '160 kbps' },
  { value: 'low', label: 'Data saver', hint: '96 kbps' },
];
const SECTIONS = [
  { id: 'playback', label: 'Playback', icon: 'play_circle' },
  { id: 'appearance', label: 'Appearance', icon: 'palette' },
  { id: 'sources', label: 'Sources', icon: 'hub' },
  { id: 'accounts', label: 'Accounts', icon: 'account_circle' },
  { id: 'storage', label: 'Storage', icon: 'storage' },
  { id: 'about', label: 'About', icon: 'info' },
];
const PROVIDER_INFO: Record<string, string> = {
  jiosaavn: 'Indian & international catalogue, high-quality streams',
  youtube: 'Huge catalogue; plays via matched sources',
  soundcloud: 'Independent artists, remixes and DJ sets',
  bandcamp: 'Independent releases',
  podcast: 'Podcasts from Apple Podcasts directory',
};

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={`settings-${id}`} aria-labelledby={`settings-${id}-h`} className="scroll-mt-24 mb-10">
      <h2 id={`settings-${id}-h`} className="text-xl sm:text-2xl font-bold text-on-surface mb-3">{title}</h2>
      <div className="rounded-xl bg-surface-container-low divide-y divide-on-surface/[0.06]">{children}</div>
    </section>
  );
}

function Row({ title, desc, children, stack }: { title: ReactNode; desc?: ReactNode; children?: ReactNode; stack?: boolean }) {
  return (
    <div className={cn('px-4 sm:px-5 py-4 flex gap-4', stack ? 'flex-col' : 'items-center justify-between')}>
      <div className="min-w-0">
        <p className="font-medium text-on-surface">{title}</p>
        {desc && <p className="text-[13px] text-on-surface-variant mt-0.5">{desc}</p>}
      </div>
      {children && <div className={cn(stack ? 'w-full' : 'shrink-0')}>{children}</div>}
    </div>
  );
}

function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: () => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={onChange}
      className={cn('relative w-12 h-7 rounded-full transition-colors duration-200 disabled:opacity-40', checked ? 'bg-primary' : 'bg-on-surface/20')}>
      <span className={cn('absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200', checked && 'translate-x-5')} />
    </button>
  );
}

function Segmented<T extends string | number>({ options, value, onChange, label }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-1 p-1 rounded-full bg-on-surface/[0.06]">
      {options.map(o => (
        <button key={String(o.value)} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={cn('h-8 px-3.5 rounded-full text-sm font-semibold transition-colors duration-150', value === o.value ? 'bg-on-surface text-background' : 'text-on-surface-variant hover:text-on-surface')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

const fmtBytes = (b: number) => b < 1024 ** 2 ? `${Math.round(b / 1024)} KB` : b < 1024 ** 3 ? `${(b / 1024 ** 2).toFixed(1)} MB` : `${(b / 1024 ** 3).toFixed(2)} GB`;

export default function SettingsPage() {
  const providers = registry.getAll().filter(p => p.name !== 'local');
  const [ytInstance, setYtInstance] = useState(() => { try { return localStorage.getItem('nuctify_yt_instance') || ''; } catch { return ''; } });
  const [, forceUpdate] = useState(0);
  const user = useAuthStore(s => s.user);
  const plugins = usePluginStore(s => s.plugins);
  const dlCount = useDownloadsStore(s => s.ids.size);
  const [usage, setUsage] = useState<number | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [ytUrl, setYtUrl] = useState('');
  const [ytImporting, setYtImporting] = useState(false);

  const [spotifyClientId, setClientId] = useState(getSpotifyClientId());
  const [spotifyConnected, setSpotifyConnected] = useState(isSpotifyConnected());
  const [spotifyPlaylists, setSpotifyPlaylists] = useState<SpotifyPlaylist[]>([]);
  const [loadingPlaylists, setLoadingPlaylists] = useState(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null);

  const [scrobbleConfig, setScrobbleConfig] = useState(getScrobbleConfig());
  const [lbToken, setLbToken] = useState(scrobbleConfig.listenbrainz.token);
  const [lbValidating, setLbValidating] = useState(false);
  const [lastfmKey, setLastfmKey] = useState(scrobbleConfig.lastfm.apiKey);
  const [lastfmSecret, setLastfmSecret] = useState(scrobbleConfig.lastfm.apiSecret);

  const p = usePlayerStore(useShallow((s) => ({
    crossfadeEnabled: s.crossfadeEnabled, toggleCrossfade: s.toggleCrossfade,
    eqPreset: s.eqPreset, setEQPreset: s.setEQPreset,
    sleepTimerRemaining: s.sleepTimerRemaining, startSleepTimer: s.startSleepTimer, stopSleepTimer: s.stopSleepTimer,
    playbackSpeed: s.playbackSpeed, setPlaybackSpeed: s.setPlaybackSpeed,
    normalizationEnabled: s.normalizationEnabled, toggleNormalization: s.toggleNormalization,
    autoplayEnabled: s.autoplayEnabled, toggleAutoplay: s.toggleAutoplay,
    theme: s.theme, setTheme: s.setTheme, aiDjEnabled: s.aiDjEnabled, toggleAiDj: s.toggleAiDj,
    streamQuality: s.streamQuality, setStreamQuality: s.setStreamQuality,
  })));

  const refreshUsage = () => { navigator.storage?.estimate?.().then(e => setUsage(e.usage ?? null)).catch(() => {}); };

  useEffect(() => {
    handleSpotifyCallback().then(success => {
      if (success) { setSpotifyConnected(true); loadPlaylists(); }
    });
    const config = getScrobbleConfig();
    if (config.lastfm.apiKey && config.lastfm.apiSecret) {
      handleLastfmCallback(config.lastfm.apiKey, config.lastfm.apiSecret).then(key => { if (key) setScrobbleConfig(getScrobbleConfig()); });
    }
    const onSpotifyConnected = () => { setSpotifyConnected(true); loadPlaylists(); };
    window.addEventListener('nuctify:spotify-connected', onSpotifyConnected);
    if (isSpotifyConnected()) loadPlaylists();
    return () => window.removeEventListener('nuctify:spotify-connected', onSpotifyConnected);
  }, []);

  useEffect(refreshUsage, [dlCount]);

  const toggleProvider = (name: string) => {
    const provider = providers.find(x => x.name === name);
    if (!provider || (provider.name === 'youtube' && !isNativeApp())) return;
    provider.enabled = !provider.enabled;
    try { localStorage.setItem('nuctify_provider_prefs', JSON.stringify(Object.fromEntries(registry.getAll().map(x => [x.name, x.enabled])))); } catch {}
    forceUpdate(n => n + 1);
  };

  const handleSpotifyConnect = async () => {
    if (!spotifyClientId.trim()) { toast('Enter your Spotify Client ID first', 'error'); return; }
    setSpotifyClientId(spotifyClientId);
    await initiateSpotifyLogin();
  };

  const loadPlaylists = async () => {
    setLoadingPlaylists(true);
    try { setSpotifyPlaylists(await getSpotifyPlaylists()); } catch (e) { console.error('Failed to load playlists:', e); }
    setLoadingPlaylists(false);
  };

  const runImport = async (fn: (cb: (c: number, t: number) => void) => Promise<any[]>, done: (tracks: any[]) => string) => {
    setImportProgress({ current: 0, total: 0 });
    try {
      const tracks = await fn((current, total) => setImportProgress({ current, total }));
      toast(done(tracks));
    } catch (e: any) {
      toast(`Import failed: ${e?.message || e}`, 'error');
    }
    setImportProgress(null);
  };

  const handleImportPlaylist = (id: string, name: string) => runImport(cb => importSpotifyPlaylist(id, cb), tracks => {
    if (tracks.length) useLibraryStore.getState().importPlaylist(name, tracks);
    return `Imported ${tracks.length} songs from “${name}”`;
  });
  const handleImportLikedSongs = () => runImport(cb => importSpotifyLikedSongs(cb), tracks => {
    if (tracks.length) useLibraryStore.getState().likeMultiple(tracks);
    return `Imported ${tracks.length} liked songs`;
  });

  const handleYtImport = async () => {
    const url = ytUrl.trim();
    const id = url.match(/[?&]list=([\w-]+)/)?.[1] || (/^[\w-]+$/.test(url) ? url : null);
    if (!id) { toast('Enter a valid YouTube playlist link or ID', 'error'); return; }
    setYtImporting(true);
    try {
      const details = await registry.getPlaylistDetails(`yt-${id}`);
      if (details.tracks.length) {
        useLibraryStore.getState().importPlaylist(details.title || `YouTube playlist`, details.tracks);
        setYtUrl('');
        toast(`Imported ${details.tracks.length} songs`);
      } else toast('No songs found in that playlist', 'error');
    } catch (e: any) {
      toast(`Import failed: ${e?.message || e}`, 'error');
    }
    setYtImporting(false);
  };

  const handleLbConnect = async () => {
    if (!lbToken.trim()) return;
    setLbValidating(true);
    const result = await validateListenBrainzToken(lbToken);
    if (result.valid) {
      setScrobbleConfig(updateScrobbleConfig({ listenbrainz: { enabled: true, token: lbToken, username: result.username } }));
      toast(`Connected to ListenBrainz as ${result.username}`);
    } else toast('Invalid ListenBrainz token', 'error');
    setLbValidating(false);
  };

  const handleLastfmConnect = () => {
    if (!lastfmKey.trim() || !lastfmSecret.trim()) { toast('Enter your Last.fm API key and secret', 'error'); return; }
    updateScrobbleConfig({ lastfm: { ...scrobbleConfig.lastfm, apiKey: lastfmKey, apiSecret: lastfmSecret } });
    window.location.href = getLastfmAuthUrl(lastfmKey);
  };

  const scanLocal = async () => {
    const local = registry.getAll().find(x => x.name === 'local');
    if (!local?.scanFiles) return;
    const tracks = await local.scanFiles();
    if (tracks.length) { useLibraryStore.getState().likeMultiple(tracks); toast(`Added ${tracks.length} local songs to Liked Songs`); }
    else toast('No music files found in your Music folder', 'info');
  };

  const clearDownloads = async () => {
    setConfirmClear(false);
    const dl = useDownloadsStore.getState();
    await Promise.all([...dl.ids].map(id => dl.remove(id)));
    toast('Downloads removed', 'info');
    refreshUsage();
  };

  const clearCache = async () => {
    try {
      ['nuctify_match_cache', 'nuctify_sc_client_id'].forEach(k => localStorage.removeItem(k));
      if ('caches' in window) await Promise.all((await caches.keys()).map(k => caches.delete(k)));
    } catch {}
    toast('Cache cleared');
    refreshUsage();
  };

  const goto = (id: string) => document.getElementById(`settings-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const customColor = (() => { try { return localStorage.getItem('nuctify_custom_color') || '#ba9eff'; } catch { return '#ba9eff'; } })();
  const redirect = isNativeApp() ? 'nuctify://callback' : window.location.origin + '/';

  return (
    <div className="animate-fade-in pb-8">
      <header className="pt-2 sm:pt-6 mb-5">
        <h1 className="font-headline font-extrabold text-3xl sm:text-5xl tracking-tight text-on-surface">Settings</h1>
      </header>

      <div className="lg:grid lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-10 max-w-5xl">
        <nav aria-label="Settings sections" className="mb-6 lg:mb-0">
          <ul className="flex lg:flex-col gap-2 lg:gap-0.5 overflow-x-auto no-scrollbar -mx-4 px-4 lg:mx-0 lg:px-0 lg:sticky lg:top-[calc(var(--topnav-h)+1rem)]">
            {SECTIONS.map(s => (
              <li key={s.id} className="shrink-0">
                <button type="button" onClick={() => goto(s.id)}
                  className="flex items-center gap-3 h-8 lg:h-10 px-3.5 lg:px-3 rounded-full lg:rounded-lg w-full text-sm font-semibold bg-on-surface/[0.08] lg:bg-transparent text-on-surface lg:text-on-surface-variant hover:text-on-surface lg:hover:bg-on-surface/[0.06] transition-colors">
                  <span aria-hidden className="material-symbols-outlined text-xl hidden lg:inline">{s.icon}</span>{s.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0">
          <Section id="playback" title="Playback">
            <Row title="Streaming quality" desc={QUALITY.find(q => q.value === p.streamQuality)?.hint + ' · applies to the next song'} stack>
              <Segmented label="Streaming quality" options={QUALITY} value={p.streamQuality} onChange={p.setStreamQuality} />
            </Row>
            <Row title="Crossfade" desc="Blend the end of one song into the next"><Switch label="Crossfade" checked={p.crossfadeEnabled} onChange={p.toggleCrossfade} /></Row>
            <Row title="Normalize volume" desc="Keep a consistent loudness across songs"><Switch label="Normalize volume" checked={p.normalizationEnabled} onChange={p.toggleNormalization} /></Row>
            <Row title="Autoplay" desc="Keep playing similar songs when your queue ends"><Switch label="Autoplay" checked={p.autoplayEnabled} onChange={p.toggleAutoplay} /></Row>
            <Row title="Equalizer" desc="Some sources can’t be equalized">
              <select value={p.eqPreset} onChange={e => p.setEQPreset(e.target.value)} aria-label="Equalizer preset"
                className="h-10 rounded-full bg-on-surface/[0.08] pl-4 pr-8 text-sm font-semibold text-on-surface border-none focus:ring-2 focus:ring-primary cursor-pointer">
                {Object.keys(EQ_PRESETS).map(k => <option key={k} value={k}>{EQ_LABELS[k] || k}</option>)}
              </select>
            </Row>
            <Row title="Playback speed" stack>
              <Segmented label="Playback speed" value={p.playbackSpeed} onChange={p.setPlaybackSpeed}
                options={[0.5, 0.75, 1, 1.25, 1.5, 2].map(v => ({ value: v, label: `${v}×` }))} />
            </Row>
            <Row title="Sleep timer" desc={p.sleepTimerRemaining ? `Stops in ${Math.ceil(p.sleepTimerRemaining / 60000)} min` : 'Off'} stack>
              <div className="flex flex-wrap gap-2">
                {[15, 30, 45, 60, 90].map(m => <Button key={m} size="sm" onClick={() => { p.startSleepTimer(m); toast(`Sleep timer set for ${m} min`, 'info'); }}>{m} min</Button>)}
                {p.sleepTimerRemaining !== null && <Button size="sm" variant="danger" onClick={p.stopSleepTimer}>Turn off</Button>}
              </div>
            </Row>
            <Row title={<>AI DJ <span className="ml-1 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/20 text-primary align-middle">Beta</span></>} desc="Announces songs and artists between tracks">
              <Switch label="AI DJ" checked={p.aiDjEnabled} onChange={p.toggleAiDj} />
            </Row>
          </Section>

          <Section id="appearance" title="Appearance">
            <Row title="Theme" stack>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {(Object.keys(THEMES) as Exclude<Theme, 'custom'>[]).map(t => (
                  <button key={t} type="button" aria-pressed={p.theme === t} onClick={() => p.setTheme(t)}
                    className={cn('rounded-xl p-1.5 text-left transition-shadow ring-2', p.theme === t ? 'ring-primary' : 'ring-transparent hover:ring-on-surface/20')}>
                    <div className="h-14 rounded-lg flex items-end p-2 gap-1" style={{ background: THEMES[t]['--background'] }}>
                      <span className="w-5 h-5 rounded-full" style={{ background: THEMES[t]['--primary'] }} />
                      <span className="w-3 h-3 rounded-full" style={{ background: THEMES[t]['--secondary'] }} />
                    </div>
                    <p className="text-xs font-semibold text-on-surface capitalize mt-1.5 px-0.5">{t}</p>
                  </button>
                ))}
                <button type="button" aria-pressed={p.theme === 'custom'} onClick={() => p.setTheme('custom', customColor)}
                  className={cn('rounded-xl p-1.5 text-left ring-2', p.theme === 'custom' ? 'ring-primary' : 'ring-transparent hover:ring-on-surface/20')}>
                  <div className="h-14 rounded-lg bg-gradient-to-br from-primary to-secondary" />
                  <p className="text-xs font-semibold text-on-surface mt-1.5 px-0.5">Custom</p>
                </button>
              </div>
            </Row>
            {p.theme === 'custom' && (
              <Row title="Accent colour" desc="Used for buttons, highlights and the progress bar">
                <input type="color" aria-label="Accent colour" defaultValue={customColor} onChange={e => p.setTheme('custom', e.target.value)}
                  className="w-11 h-11 rounded-full bg-transparent border-none cursor-pointer" />
              </Row>
            )}
          </Section>

          <Section id="sources" title="Sources">
            {providers.map(pr => {
              const blocked = pr.name === 'youtube' && !isNativeApp();
              return (
                <Row key={pr.name} title={<span className="capitalize">{pr.name === 'jiosaavn' ? 'JioSaavn' : pr.name === 'soundcloud' ? 'SoundCloud' : pr.name === 'youtube' ? 'YouTube Music' : pr.name}</span>}
                  desc={blocked ? 'Available in the desktop and Android apps' : PROVIDER_INFO[pr.name]}>
                  <Switch label={`Enable ${pr.name}`} checked={pr.enabled && !blocked} disabled={blocked} onChange={() => toggleProvider(pr.name)} />
                </Row>
              );
            })}
            <Row title="Custom YouTube instance" desc="Optional Piped/Invidious API. Leave empty for the default. Applies after restart." stack>
              <input id="yt-instance" type="url" inputMode="url" value={ytInstance} placeholder="https://pipedapi.example.com" className={INPUT}
                onChange={e => {
                  const v = e.target.value.trim();
                  setYtInstance(e.target.value);
                  try { if (v) localStorage.setItem('nuctify_yt_instance', v); else localStorage.removeItem('nuctify_yt_instance'); } catch {}
                }} />
            </Row>
            {isTauriApp() && <Row title="Local files" desc="Scan your Music folder for MP3/FLAC files"><Button size="sm" icon="folder_open" onClick={scanLocal}>Scan</Button></Row>}
          </Section>

          <Section id="accounts" title="Accounts">
            <Row title="Nuctify account" desc={user ? `Signed in as ${user.email || user.displayName}${isSupabaseConfigured() && !user.id.startsWith('local-') ? ' · library syncs across devices' : ' · stored on this device'}` : 'Sign in to sync your library across devices'}>
              {user ? (
                <div className="flex gap-2">
                  {isSupabaseConfigured() && !user.id.startsWith('local-') && <Button size="sm" icon="sync" onClick={() => useLibraryStore.getState().syncToCloud().then(() => toast('Library synced'), () => toast('Sync failed', 'error'))}>Sync</Button>}
                  <Button size="sm" variant="ghost" onClick={() => useAuthStore.getState().signOut()}>Log out</Button>
                </div>
              ) : <Button size="sm" variant="primary" onClick={() => useAuthStore.getState().openAuthModal()}>Sign in</Button>}
            </Row>

            <Row title="Spotify" desc={spotifyConnected ? 'Import your playlists and liked songs' : <>Connect with your <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer" className="text-primary hover:underline">Spotify app Client ID</a>. Redirect URI: <code className="text-on-surface break-all">{redirect}</code></>} stack>
              {!spotifyConnected ? (
                <div className="flex flex-col sm:flex-row gap-2">
                  <input type="text" placeholder="Client ID" aria-label="Spotify Client ID" value={spotifyClientId} onChange={e => setClientId(e.target.value)} className={INPUT} />
                  <Button variant="primary" onClick={handleSpotifyConnect}>Connect</Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" icon="favorite" disabled={!!importProgress} onClick={handleImportLikedSongs}>Import liked songs</Button>
                    <Button size="sm" icon="refresh" variant="ghost" loading={loadingPlaylists} onClick={loadPlaylists}>Refresh</Button>
                    <Button size="sm" variant="ghost" onClick={() => { disconnectSpotify(); setSpotifyConnected(false); setSpotifyPlaylists([]); }}>Disconnect</Button>
                  </div>
                  {importProgress && (
                    <div role="status">
                      <p className="text-xs text-on-surface-variant mb-1.5">Importing {importProgress.current} / {importProgress.total || '…'}</p>
                      <div className="h-1 rounded-full bg-on-surface/10 overflow-hidden"><div className="h-full bg-primary transition-[width]" style={{ width: `${importProgress.total ? (importProgress.current / importProgress.total) * 100 : 0}%` }} /></div>
                    </div>
                  )}
                  {spotifyPlaylists.length > 0 && (
                    <ul className="max-h-72 overflow-y-auto -mx-2">
                      {spotifyPlaylists.map(pl => (
                        <li key={pl.id} className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-on-surface/[0.04]">
                          <div className="min-w-0 flex-1"><p className="text-sm font-medium text-on-surface truncate">{pl.name}</p><p className="text-xs text-on-surface-variant">{pl.trackCount} songs</p></div>
                          <Button size="sm" variant="outline" disabled={!!importProgress} onClick={() => handleImportPlaylist(pl.id, pl.name)}>Import</Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </Row>

            {isNativeApp() && (
              <Row title="YouTube Music playlist" desc="Paste a playlist link or ID to import it" stack>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input type="text" value={ytUrl} onChange={e => setYtUrl(e.target.value)} placeholder="https://music.youtube.com/playlist?list=…" aria-label="YouTube playlist URL" className={INPUT} />
                  <Button variant="primary" loading={ytImporting} onClick={handleYtImport}>Import</Button>
                </div>
              </Row>
            )}

            <Row title="Last.fm" desc={scrobbleConfig.lastfm.sessionKey ? `Scrobbling as ${scrobbleConfig.lastfm.username}` : 'Scrobble what you listen to'} stack={!scrobbleConfig.lastfm.sessionKey}>
              {scrobbleConfig.lastfm.sessionKey ? (
                <Button size="sm" variant="ghost" onClick={() => setScrobbleConfig(updateScrobbleConfig({ lastfm: { enabled: false, apiKey: lastfmKey, apiSecret: lastfmSecret, sessionKey: '', username: '' } }))}>Disconnect</Button>
              ) : (
                <div className="flex flex-col sm:flex-row gap-2">
                  <input type="text" placeholder="API key" aria-label="Last.fm API key" value={lastfmKey} onChange={e => setLastfmKey(e.target.value)} className={INPUT} />
                  <input type="password" placeholder="Shared secret" aria-label="Last.fm shared secret" value={lastfmSecret} onChange={e => setLastfmSecret(e.target.value)} className={INPUT} />
                  <Button variant="primary" onClick={handleLastfmConnect}>Connect</Button>
                </div>
              )}
            </Row>

            <Row title="ListenBrainz" desc={scrobbleConfig.listenbrainz.enabled ? `Submitting listens as ${scrobbleConfig.listenbrainz.username}` : 'Submit your listens to ListenBrainz'} stack={!scrobbleConfig.listenbrainz.enabled}>
              {scrobbleConfig.listenbrainz.enabled ? (
                <Button size="sm" variant="ghost" onClick={() => { setScrobbleConfig(updateScrobbleConfig({ listenbrainz: { enabled: false, token: '', username: '' } })); setLbToken(''); }}>Disconnect</Button>
              ) : (
                <div className="flex flex-col sm:flex-row gap-2">
                  <input type="password" placeholder="User token" aria-label="ListenBrainz user token" value={lbToken} onChange={e => setLbToken(e.target.value)} className={INPUT} />
                  <Button variant="primary" loading={lbValidating} disabled={!lbToken.trim()} onClick={handleLbConnect}>Connect</Button>
                </div>
              )}
            </Row>
          </Section>

          <Section id="storage" title="Storage">
            <Row title="Downloads" desc={`${dlCount} ${dlCount === 1 ? 'song' : 'songs'} available offline${usage !== null ? ` · ${fmtBytes(usage)} used by Nuctify` : ''}`}>
              <Button size="sm" variant="danger" disabled={!dlCount} onClick={() => setConfirmClear(true)}>Remove all</Button>
            </Row>
            <Row title="Cache" desc="Clears cached song matches and temporary data. Your library is not affected.">
              <Button size="sm" onClick={clearCache}>Clear cache</Button>
            </Row>
            {plugins.length > 0 && plugins.map(pl => (
              <Row key={pl.id} title={`Plugin: ${pl.name}`} desc={`${pl.description} · v${pl.version} by ${pl.author}`}>
                <div className="flex items-center gap-2">
                  <Switch label={`Enable ${pl.name}`} checked={pl.enabled} onChange={() => usePluginStore.getState().togglePlugin(pl.id)} />
                  <Button size="sm" variant="ghost" aria-label={`Remove ${pl.name}`} icon="delete" onClick={() => usePluginStore.getState().removePlugin(pl.id)} />
                </div>
              </Row>
            ))}
          </Section>

          <Section id="about" title="About">
            <Row title="Nuctify" desc={`Version ${APP_VERSION} · ${isTauriApp() ? 'Desktop' : isNativeApp() ? 'Android' : 'Web'}`} />
            <Row title="Keyboard shortcuts" desc="Space play/pause · Shift+←/→ previous/next · Ctrl/⌘+K search · Ctrl/⌘+L like" />
          </Section>
        </div>
      </div>

      <Modal open={confirmClear} onClose={() => setConfirmClear(false)} size="sm" title="Remove all downloads?"
        description={`${dlCount} songs will no longer be available offline.`}
        footer={<><Button variant="ghost" onClick={() => setConfirmClear(false)}>Cancel</Button><Button variant="danger" onClick={clearDownloads}>Remove</Button></>} />
    </div>
  );
}
