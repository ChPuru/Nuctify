/// <reference types="vite/client" />

interface Window {
  NativeBridge: {
    updateMetadata: (title: string, artist: string) => void;
    updatePlaybackState: (isPlaying: boolean) => void;
  };
  Capacitor: any;
  __TAURI__: any;
  __TAURI_INTERNALS__: any;
}

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_SPOTIFY_CLIENT_ID: string;
  readonly VITE_DISCORD_CLIENT_ID: string;
  readonly VITE_LASTFM_API_KEY: string;
  readonly VITE_LASTFM_API_SECRET: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
