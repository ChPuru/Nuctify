export const isNativeApp = () => {

const isCapacitor = !!window.Capacitor;

const isTauri = !!(window.__TAURI_INTERNALS__ || window.__TAURI__);

return isCapacitor || isTauri;
};

export const isTauriApp = () => {

return !!(window.__TAURI_INTERNALS__ || window.__TAURI__);
};

export const NATIVE_API_MAP: Record<string, string> = {

'/api/inv1': 'https://invidious.projectsegfau.lt',
  '/api/inv2': 'https://yewtu.be',
  '/api/inv3': 'https://iv.ggtyler.dev',
  '/api/invidious1': 'https://inv.nadeko.net',

'/api/piped1': 'https://pipedapi.kavin.rocks',
  '/api/piped2': 'https://piped.video',
  '/api/piped3': 'https://pipedapi.kavin.rocks',

'/api/jio1': 'https://saavn.sumit.co',
  '/api/jio2': 'https://jiosaavn-api-privatecvc2.vercel.app',
  '/api/jiosaavn1': 'https://jiosaavn-api-privatecvc2.vercel.app',

'/api/soundcloud': 'https://api-v2.soundcloud.com',
  '/api/sc-site': 'https://soundcloud.com',
  '/api/sc-cdn': 'https://a-v2.sndcdn.com',

'/api/lrclib': 'https://lrclib.net',

'/api/spotify-auth': 'https://accounts.spotify.com',
  '/api/spotify': 'https://api.spotify.com',

  '/api/listenbrainz': 'https://api.listenbrainz.org',
  '/api/lastfm': 'https://ws.audioscrobbler.com',
  '/api/bandcamp': 'https://bandcamp.com',
};

export const resolveEndpoint = (url: string): string => {
  if (isNativeApp()) {

const sorted = Object.entries(NATIVE_API_MAP).sort((a, b) => b[0].length - a[0].length);
    for (const [proxyRoot, realRoot] of sorted) {
      if (url.startsWith(proxyRoot)) {
        return url.replace(proxyRoot, realRoot);
      }
    }
  }
  return url;
};

let tauriFetch: typeof globalThis.fetch | null = null;
let tauriFetchLoaded = false;

async function getTauriFetch(): Promise<typeof globalThis.fetch | null> {
  if (tauriFetchLoaded) return tauriFetch;
  tauriFetchLoaded = true;
  try {
    const mod = await import('@tauri-apps/plugin-http');
    tauriFetch = mod.fetch;
    console.log('[Env] Tauri HTTP plugin loaded successfully');
    return tauriFetch;
  } catch (e) {
    console.warn('[Env] Tauri HTTP plugin not available, using standard fetch');
    return null;
  }
}

export const nativeFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  if (typeof input === 'string') {
    const resolved = resolveEndpoint(input);

    if (isTauriApp()) {
      const tf = await getTauriFetch();
      if (tf) return tf(resolved, init);
    }

    if (!!window.Capacitor) {
      try {
        const { CapacitorHttp } = await import('@capacitor/core');
        const options = {
          url: resolved,
          method: init?.method || 'GET',
          headers: (init?.headers as any) || {},
          data: init?.body,
        };
        const resp = await CapacitorHttp.request(options);
        return new Response(typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data), {
          status: resp.status,
          headers: resp.headers,
        });
      } catch (e) {
        console.warn('[Env] CapacitorHttp failed, falling back to fetch', e);
      }
    }

    return fetch(resolved, init);
  }
  return fetch(input, init);
};
