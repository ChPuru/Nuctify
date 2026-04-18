import { Track } from '../providers/types';
import { nativeFetch } from '../utils/env';

export interface ScrobbleConfig {
  lastfm: {
    enabled: boolean;
    apiKey: string;
    apiSecret: string;
    sessionKey: string;
    username: string;
  };
  listenbrainz: {
    enabled: boolean;
    token: string;
    username: string;
  };
}

const CONFIG_KEY = 'nuctify_scrobble_config';

function getConfig(): ScrobbleConfig {
  try {
    const stored = localStorage.getItem(CONFIG_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);

if (!parsed.lastfm.apiKey) parsed.lastfm.apiKey = import.meta.env.VITE_LASTFM_API_KEY || '';
      if (!parsed.lastfm.apiSecret) parsed.lastfm.apiSecret = import.meta.env.VITE_LASTFM_API_SECRET || '';
      return parsed;
    }
  } catch {}
  return {
    lastfm: { 
      enabled: false, 
      apiKey: import.meta.env.VITE_LASTFM_API_KEY || '', 
      apiSecret: import.meta.env.VITE_LASTFM_API_SECRET || '', 
      sessionKey: '', 
      username: '' 
    },
    listenbrainz: { enabled: false, token: '', username: '' },
  };
}

function saveConfig(config: ScrobbleConfig) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

export function getScrobbleConfig(): ScrobbleConfig {
  return getConfig();
}

export function updateScrobbleConfig(config: Partial<ScrobbleConfig>) {
  const current = getConfig();
  const updated = { ...current, ...config };
  saveConfig(updated);
  return updated;
}

async function md5(input: string): Promise<string> {

return md5Hash(input);
}

function md5Hash(string: string): string {
  function md5cycle(x: number[], k: number[]) {
    let a = x[0], b = x[1], c = x[2], d = x[3];
    a = ff(a, b, c, d, k[0], 7, -680876936); d = ff(d, a, b, c, k[1], 12, -389564586);
    c = ff(c, d, a, b, k[2], 17, 606105819); b = ff(b, c, d, a, k[3], 22, -1044525330);
    a = ff(a, b, c, d, k[4], 7, -176418897); d = ff(d, a, b, c, k[5], 12, 1200080426);
    c = ff(c, d, a, b, k[6], 17, -1473231341); b = ff(b, c, d, a, k[7], 22, -45705983);
    a = ff(a, b, c, d, k[8], 7, 1770035416); d = ff(d, a, b, c, k[9], 12, -1958414417);
    c = ff(c, d, a, b, k[10], 17, -42063); b = ff(b, c, d, a, k[11], 22, -1990404162);
    a = ff(a, b, c, d, k[12], 7, 1804603682); d = ff(d, a, b, c, k[13], 12, -40341101);
    c = ff(c, d, a, b, k[14], 17, -1502002290); b = ff(b, c, d, a, k[15], 22, 1236535329);
    a = gg(a, b, c, d, k[1], 5, -165796510); d = gg(d, a, b, c, k[6], 9, -1069501632);
    c = gg(c, d, a, b, k[11], 14, 643717713); b = gg(b, c, d, a, k[0], 20, -373897302);
    a = gg(a, b, c, d, k[5], 5, -701558691); d = gg(d, a, b, c, k[10], 9, 38016083);
    c = gg(c, d, a, b, k[15], 14, -660478335); b = gg(b, c, d, a, k[4], 20, -405537848);
    a = gg(a, b, c, d, k[9], 5, 568446438); d = gg(d, a, b, c, k[14], 9, -1019803690);
    c = gg(c, d, a, b, k[3], 14, -187363961); b = gg(b, c, d, a, k[8], 20, 1163531501);
    a = gg(a, b, c, d, k[13], 5, -1444681467); d = gg(d, a, b, c, k[2], 9, -51403784);
    c = gg(c, d, a, b, k[7], 14, 1735328473); b = gg(b, c, d, a, k[12], 20, -1926607734);
    a = hh(a, b, c, d, k[5], 4, -378558); d = hh(d, a, b, c, k[8], 11, -2022574463);
    c = hh(c, d, a, b, k[11], 16, 1839030562); b = hh(b, c, d, a, k[14], 23, -35309556);
    a = hh(a, b, c, d, k[1], 4, -1530992060); d = hh(d, a, b, c, k[4], 11, 1272893353);
    c = hh(c, d, a, b, k[7], 16, -155497632); b = hh(b, c, d, a, k[10], 23, -1094730640);
    a = hh(a, b, c, d, k[13], 4, 681279174); d = hh(d, a, b, c, k[0], 11, -358537222);
    c = hh(c, d, a, b, k[3], 16, -722521979); b = hh(b, c, d, a, k[6], 23, 76029189);
    a = hh(a, b, c, d, k[9], 4, -640364487); d = hh(d, a, b, c, k[12], 11, -421815835);
    c = hh(c, d, a, b, k[15], 16, 530742520); b = hh(b, c, d, a, k[2], 23, -995338651);
    a = ii(a, b, c, d, k[0], 6, -198630844); d = ii(d, a, b, c, k[7], 10, 1126891415);
    c = ii(c, d, a, b, k[14], 15, -1416354905); b = ii(b, c, d, a, k[5], 21, -57434055);
    a = ii(a, b, c, d, k[12], 6, 1700485571); d = ii(d, a, b, c, k[3], 10, -1894986606);
    c = ii(c, d, a, b, k[10], 15, -1051523); b = ii(b, c, d, a, k[1], 21, -2054922799);
    a = ii(a, b, c, d, k[8], 6, 1873313359); d = ii(d, a, b, c, k[15], 10, -30611744);
    c = ii(c, d, a, b, k[6], 15, -1560198380); b = ii(b, c, d, a, k[13], 21, 1309151649);
    a = ii(a, b, c, d, k[4], 6, -145523070); d = ii(d, a, b, c, k[11], 10, -1120210379);
    c = ii(c, d, a, b, k[2], 15, 718787259); b = ii(b, c, d, a, k[9], 21, -343485551);
    x[0] = add32(a, x[0]); x[1] = add32(b, x[1]); x[2] = add32(c, x[2]); x[3] = add32(d, x[3]);
  }

function cmn(q: number, a: number, b: number, x: number, s: number, t: number) {
    a = add32(add32(a, q), add32(x, t));
    return add32((a << s) | (a >>> (32 - s)), b);
  }

function ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cmn((b & c) | ((~b) & d), a, b, x, s, t);
  }
  function gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cmn((b & d) | (c & (~d)), a, b, x, s, t);
  }
  function hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cmn(b ^ c ^ d, a, b, x, s, t);
  }
  function ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cmn(c ^ (b | (~d)), a, b, x, s, t);
  }

function md5blk(s: string) {
    const md5blks: number[] = [];
    for (let i = 0; i < 64; i += 4) {
      md5blks[i >> 2] = s.charCodeAt(i) + (s.charCodeAt(i + 1) << 8) +
        (s.charCodeAt(i + 2) << 16) + (s.charCodeAt(i + 3) << 24);
    }
    return md5blks;
  }

function add32(a: number, b: number) {
    return (a + b) & 0xFFFFFFFF;
  }

const hex_chr = '0123456789abcdef'.split('');

function rhex(n: number) {
    let s = '';
    for (let j = 0; j < 4; j++) {
      s += hex_chr[(n >> (j * 8 + 4)) & 0x0F] + hex_chr[(n >> (j * 8)) & 0x0F];
    }
    return s;
  }

function hex(x: number[]) {
    return x.map(rhex).join('');
  }

let n = string.length;
  let state = [1732584193, -271733879, -1732584194, 271733878];
  let i;

for (i = 64; i <= n; i += 64) {
    md5cycle(state, md5blk(string.substring(i - 64, i)));
  }

string = string.substring(i - 64);
  const tail = Array(16).fill(0);
  for (i = 0; i < string.length; i++) {
    tail[i >> 2] |= string.charCodeAt(i) << ((i % 4) << 3);
  }
  tail[i >> 2] |= 0x80 << ((i % 4) << 3);
  if (i > 55) {
    md5cycle(state, tail);
    tail.fill(0);
  }
  tail[14] = n * 8;
  md5cycle(state, tail);
  return hex(state);
}

function generateLastfmSignature(params: Record<string, string>, secret: string): string {
  const sorted = Object.keys(params).sort();
  let signatureString = '';
  for (const key of sorted) {
    signatureString += key + params[key];
  }
  signatureString += secret;
  return md5Hash(signatureString);
}

export function getLastfmAuthUrl(apiKey: string): string {
  return `https://www.last.fm/api/auth/?api_key=${apiKey}&cb=${encodeURIComponent(window.location.origin + '/?lastfm_auth=1')}`;
}

export async function handleLastfmCallback(apiKey: string, apiSecret: string): Promise<string | null> {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');

if (!token || !params.has('lastfm_auth')) return null;

try {
    const signParams: Record<string, string> = {
      api_key: apiKey,
      method: 'auth.getSession',
      token,
    };
    const sig = generateLastfmSignature(signParams, apiSecret);

const response = await nativeFetch(
      `/api/lastfm/2.0/?method=auth.getSession&api_key=${apiKey}&token=${token}&api_sig=${sig}&format=json`
    );
    const data = await response.json();

if (data.session?.key) {
      const config = getConfig();
      config.lastfm.sessionKey = data.session.key;
      config.lastfm.username = data.session.name || '';
      config.lastfm.apiKey = apiKey;
      config.lastfm.apiSecret = apiSecret;
      config.lastfm.enabled = true;
      saveConfig(config);

window.history.replaceState({}, document.title, '/');
      return data.session.key;
    }
  } catch (error) {
    console.error('[Last.fm] Auth failed:', error);
  }

return null;
}

async function lastfmRequest(method: string, params: Record<string, string>) {
  const config = getConfig();
  if (!config.lastfm.enabled || !config.lastfm.sessionKey) return;

const allParams: Record<string, string> = {
    method,
    api_key: config.lastfm.apiKey,
    sk: config.lastfm.sessionKey,
    ...params,
  };

const sig = generateLastfmSignature(allParams, config.lastfm.apiSecret);
  allParams.api_sig = sig;
  allParams.format = 'json';

try {
    await nativeFetch('/api/lastfm/2.0/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(allParams),
    });
  } catch (error) {
    console.error(`[Last.fm] ${method} failed:`, error);
  }
}

async function listenbrainzSubmit(listenType: string, track: Track, timestamp?: number) {
  const config = getConfig();
  if (!config.listenbrainz.enabled || !config.listenbrainz.token) return;

const payload: any = {
    listen_type: listenType,
    payload: [{
      track_metadata: {
        artist_name: track.artist,
        track_name: track.title,
        release_name: track.album || undefined,
        additional_info: {
          duration_ms: track.duration * 1000,
          media_player: 'Nuctify',
          media_player_version: '0.1.0',
          submission_client: 'Nuctify',
          music_service: `nuctify.${track.source}`,
        },
      },
    }],
  };

if (timestamp && listenType !== 'playing_now') {
    payload.payload[0].listened_at = timestamp;
  }

try {
    await nativeFetch('/api/listenbrainz/1/submit-listens', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${config.listenbrainz.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.error(`[ListenBrainz] ${listenType} failed:`, error);
  }
}

export async function scrobbleNowPlaying(track: Track) {
  const config = getConfig();

if (config.lastfm.enabled) {
    lastfmRequest('track.updateNowPlaying', {
      artist: track.artist,
      track: track.title,
      album: track.album || '',
      duration: String(track.duration),
    });
  }

if (config.listenbrainz.enabled) {
    listenbrainzSubmit('playing_now', track);
  }
}

export async function scrobbleTrack(track: Track) {
  const config = getConfig();
  const timestamp = Math.floor(Date.now() / 1000);

if (config.lastfm.enabled) {
    lastfmRequest('track.scrobble', {
      artist: track.artist,
      track: track.title,
      album: track.album || '',
      timestamp: String(timestamp),
      duration: String(track.duration),
    });
  }

if (config.listenbrainz.enabled) {
    listenbrainzSubmit('single', track, timestamp);
  }
}

export function shouldScrobble(trackDuration: number, listenedDuration: number): boolean {
  if (trackDuration < 30) return false;
  const halfDuration = trackDuration / 2;
  const fourMinutes = 240;
  return listenedDuration >= Math.min(halfDuration, fourMinutes);
}

export async function validateListenBrainzToken(token: string): Promise<{ valid: boolean; username: string }> {
  try {
    const response = await nativeFetch('/api/listenbrainz/1/validate-token', {
      headers: { Authorization: `Token ${token}` },
    });
    const data = await response.json();
    return {
      valid: data.valid === true,
      username: data.user_name || '',
    };
  } catch {
    return { valid: false, username: '' };
  }
}
