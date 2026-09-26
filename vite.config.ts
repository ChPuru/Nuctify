import { defineConfig, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const ROUTES: Record<string, string> = {
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

const proxy: Record<string, ProxyOptions> = {};
for (const [prefix, target] of Object.entries(ROUTES).sort((a, b) => b[0].length - a[0].length)) {
  const u = new URL(target);
  const base = u.pathname.replace(/\/$/, '');
  proxy[`^${prefix}(?=[/?]|$)`] = {
    target: u.origin,
    changeOrigin: true,
    rewrite: (p) => base + p.slice(prefix.length),
    headers: prefix === '/api/lrclib' ? { 'User-Agent': 'Nuctify (https://github.com/ChPuru/Nuctify)' } : undefined,
    configure: (px) => { px.on('proxyRes', (res) => { delete res.headers['www-authenticate']; }); },
  };
}

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    strictPort: true,
    proxy,
  },
});
