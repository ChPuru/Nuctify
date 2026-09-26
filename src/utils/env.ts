export const isNativeApp = () => {
  const isCapacitor = !!window.Capacitor;
  const isTauri = !!(window.__TAURI_INTERNALS__ || window.__TAURI__);
  const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  
  return isCapacitor || isTauri || (isMobileUA && (window.location.protocol === 'capacitor:' || window.location.protocol === 'tauri:'));
};

export const isTauriApp = () => {

return !!(window.__TAURI_INTERNALS__ || window.__TAURI__);
};

export const NATIVE_API_MAP: Record<string, string> = {
  '/api/jsv': 'https://www.jiosaavn.com/api.php',
  '/api/jio1': 'https://saavn.sumit.co/api',
  '/api/ytm': 'https://music.youtube.com/youtubei/v1',
  '/api/soundcloud': 'https://api-v2.soundcloud.com',
  '/api/sc-site': 'https://soundcloud.com',
  '/api/sc-cdn': 'https://a-v2.sndcdn.com',
  '/api/lrclib': 'https://lrclib.net/api',
  '/api/spotify-auth': 'https://accounts.spotify.com',
  '/api/spotify': 'https://api.spotify.com',
  '/api/listenbrainz': 'https://api.listenbrainz.org',
  '/api/lastfm': 'https://ws.audioscrobbler.com',
  '/api/bandcamp': 'https://bandcamp.com',
  '/api/itunes': 'https://itunes.apple.com',
};

const SORTED_MAP = Object.entries(NATIVE_API_MAP).sort((a, b) => b[0].length - a[0].length);

export const resolveEndpoint = (url: string): string => {
  if (isNativeApp()) {
    for (const [proxyRoot, realRoot] of SORTED_MAP) {
      if (url.startsWith(proxyRoot)) {
        const next = url.charAt(proxyRoot.length);
        if (next === '' || next === '/' || next === '?') return realRoot + url.slice(proxyRoot.length);
      }
    }
  }
  return url;
};

let tauriFetchP: Promise<typeof globalThis.fetch | null> | null = null;
const getTauriFetch = () =>
  (tauriFetchP ??= import('@tauri-apps/plugin-http')
    .then(m => m.fetch as unknown as typeof globalThis.fetch)
    .catch(() => null));

export const nativeFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const resolved = resolveEndpoint(url);

  if (isTauriApp() && /^https?:/i.test(resolved)) {
    const tf = await getTauriFetch();
    if (tf) {
      const headers = new Headers(init?.headers);
      if (!headers.has('Origin') && /(^|\.)youtube\.com$/.test(new URL(resolved).hostname)) {
        headers.set('Origin', 'https://music.youtube.com');
      }
      if (!headers.has('User-Agent')) headers.set('User-Agent', navigator.userAgent);
      return tf(resolved, { connectTimeout: 10000, ...init, headers } as RequestInit);
    }
  }

  return typeof input === 'string' || input instanceof URL ? fetch(resolved, init) : fetch(input, init);
};
