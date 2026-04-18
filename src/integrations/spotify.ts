import { Track, Playlist } from '../providers/types';
import { registry } from '../providers';
import { nativeFetch } from '../utils/env';

const SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/authorize';
const SPOTIFY_TOKEN_URL = '/api/spotify-auth/api/token';
const SPOTIFY_API = '/api/spotify';

const SPOTIFY_ACCESS_TOKEN = 'nuctify_spotify_access_token';
const SPOTIFY_REFRESH_TOKEN = 'nuctify_spotify_refresh_token';
const SPOTIFY_TOKEN_EXPIRY = 'nuctify_spotify_token_expiry';
const SPOTIFY_CODE_VERIFIER = 'nuctify_spotify_code_verifier';

let clientId = import.meta.env.VITE_SPOTIFY_CLIENT_ID || '';

function generateRandomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const values = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(values).map(v => chars[v % chars.length]).join('');
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function setSpotifyClientId(id: string) {
  clientId = id;
  localStorage.setItem('nuctify_spotify_client_id', id);
}

export function getSpotifyClientId(): string {
  if (!clientId) {
    clientId = localStorage.getItem('nuctify_spotify_client_id') || import.meta.env.VITE_SPOTIFY_CLIENT_ID || '';
  }
  return clientId;
}

export function isSpotifyConnected(): boolean {
  const token = localStorage.getItem(SPOTIFY_ACCESS_TOKEN);
  const expiry = localStorage.getItem(SPOTIFY_TOKEN_EXPIRY);
  if (!token || !expiry) return false;
  return Date.now() < parseInt(expiry, 10);
}

export function getSpotifyToken(): string | null {
  if (!isSpotifyConnected()) return null;
  return localStorage.getItem(SPOTIFY_ACCESS_TOKEN);
}

export function disconnectSpotify() {
  localStorage.removeItem(SPOTIFY_ACCESS_TOKEN);
  localStorage.removeItem(SPOTIFY_REFRESH_TOKEN);
  localStorage.removeItem(SPOTIFY_TOKEN_EXPIRY);
  localStorage.removeItem(SPOTIFY_CODE_VERIFIER);
}

export async function initiateSpotifyLogin() {
  const cid = getSpotifyClientId();
  if (!cid) {
    throw new Error('Please set your Spotify Client ID in Settings first');
  }

const verifier = generateRandomString(128);
  localStorage.setItem(SPOTIFY_CODE_VERIFIER, verifier);

const challenge = await generateCodeChallenge(verifier);
  const redirectUri = window.location.origin + '/';

const params = new URLSearchParams({
    client_id: cid,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: [
      'playlist-read-private',
      'playlist-read-collaborative',
      'user-library-read',
      'user-read-recently-played',
      'user-top-read',
    ].join(' '),
    code_challenge_method: 'S256',
    code_challenge: challenge,
    state: 'nuctify-spotify-import',
  });

window.location.href = `${SPOTIFY_AUTH_URL}?${params}`;
}

export async function handleSpotifyCallback(): Promise<boolean> {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const state = params.get('state');

if (!code || state !== 'nuctify-spotify-import') return false;

const verifier = localStorage.getItem(SPOTIFY_CODE_VERIFIER);
  const cid = getSpotifyClientId();
  if (!verifier || !cid) return false;

try {
    const response = await nativeFetch(SPOTIFY_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: cid,
        grant_type: 'authorization_code',
        code,
        redirect_uri: window.location.origin + '/',
        code_verifier: verifier,
      }),
    });

if (!response.ok) {
      console.error('[Spotify] Token exchange failed:', await response.text());
      return false;
    }

const data = await response.json();
    localStorage.setItem(SPOTIFY_ACCESS_TOKEN, data.access_token);
    if (data.refresh_token) {
      localStorage.setItem(SPOTIFY_REFRESH_TOKEN, data.refresh_token);
    }
    localStorage.setItem(
      SPOTIFY_TOKEN_EXPIRY,
      String(Date.now() + (data.expires_in || 3600) * 1000)
    );

window.history.replaceState({}, document.title, '/');
    return true;
  } catch (error) {
    console.error('[Spotify] Auth error:', error);
    return false;
  }
}

async function spotifyFetch(path: string): Promise<any> {
  const token = getSpotifyToken();
  if (!token) throw new Error('Not authenticated with Spotify');

const response = await nativeFetch(`${SPOTIFY_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

if (!response.ok) {
    throw new Error(`Spotify API error: ${response.status}`);
  }

return response.json();
}

export interface SpotifyPlaylist {
  id: string;
  name: string;
  description: string;
  thumbnail: string;
  trackCount: number;
  owner: string;
}

export async function getSpotifyPlaylists(): Promise<SpotifyPlaylist[]> {
  const playlists: SpotifyPlaylist[] = [];
  let url = '/v1/me/playlists?limit=50';

while (url) {
    const data = await spotifyFetch(url);
    for (const item of data.items || []) {
      playlists.push({
        id: item.id,
        name: item.name,
        description: item.description || '',
        thumbnail: item.images?.[0]?.url || '',
        trackCount: item.tracks?.total || 0,
        owner: item.owner?.display_name || '',
      });
    }
    url = data.next ? data.next.replace('https://api.spotify.com', '') : '';
  }

return playlists;
}

export async function getSpotifyPlaylistTracks(
  playlistId: string
): Promise<{ name: string; artist: string; album: string; duration: number }[]> {
  const tracks: { name: string; artist: string; album: string; duration: number }[] = [];
  let url = `/v1/playlists/${playlistId}/tracks?limit=100&fields=next,items(track(name,artists(name),album(name),duration_ms))`;

while (url) {
    const data = await spotifyFetch(url);
    for (const item of data.items || []) {
      const t = item.track;
      if (!t || !t.name) continue;
      tracks.push({
        name: t.name,
        artist: t.artists?.map((a: any) => a.name).join(', ') || 'Unknown',
        album: t.album?.name || '',
        duration: Math.round((t.duration_ms || 0) / 1000),
      });
    }
    url = data.next ? data.next.replace('https://api.spotify.com', '') : '';
  }

return tracks;
}

export async function getSpotifyLikedSongs(): Promise<
  { name: string; artist: string; album: string; duration: number }[]
> {
  const tracks: { name: string; artist: string; album: string; duration: number }[] = [];
  let url = '/v1/me/tracks?limit=50';

while (url) {
    const data = await spotifyFetch(url);
    for (const item of data.items || []) {
      const t = item.track;
      if (!t) continue;
      tracks.push({
        name: t.name,
        artist: t.artists?.map((a: any) => a.name).join(', ') || 'Unknown',
        album: t.album?.name || '',
        duration: Math.round((t.duration_ms || 0) / 1000),
      });
    }
    url = data.next ? data.next.replace('https://api.spotify.com', '') : '';
  }

return tracks;
}

export async function importSpotifyPlaylist(
  playlistId: string,
  onProgress?: (current: number, total: number) => void
): Promise<Track[]> {
  const spotifyTracks = await getSpotifyPlaylistTracks(playlistId);
  const matchedTracks: Track[] = [];

for (let i = 0; i < spotifyTracks.length; i++) {
    const st = spotifyTracks[i];
    onProgress?.(i + 1, spotifyTracks.length);

try {

const query = `${st.artist} ${st.name}`;
      const results = await registry.searchAll(query, 5);

if (results.tracks.length > 0) {
        matchedTracks.push(results.tracks[0]);
      }

if (i < spotifyTracks.length - 1) {
        await new Promise(r => setTimeout(r, 200));
      }
    } catch {

continue;
    }
  }

return matchedTracks;
}

export async function importSpotifyLikedSongs(
  onProgress?: (current: number, total: number) => void
): Promise<Track[]> {
  const likedSongs = await getSpotifyLikedSongs();
  const matchedTracks: Track[] = [];

for (let i = 0; i < likedSongs.length; i++) {
    const st = likedSongs[i];
    onProgress?.(i + 1, likedSongs.length);

try {
      const query = `${st.artist} ${st.name}`;
      const results = await registry.searchAll(query, 3);
      if (results.tracks.length > 0) {
        matchedTracks.push(results.tracks[0]);
      }
      if (i < likedSongs.length - 1) {
        await new Promise(r => setTimeout(r, 200));
      }
    } catch {
      continue;
    }
  }

return matchedTracks;
}
