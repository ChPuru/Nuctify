import { MusicProvider, SearchResults, Track, StreamInfo } from './types';

// For Tauri, we use @tauri-apps/api/fs
// For Capacitor, we use @capacitor/filesystem

export const localFileProvider: MusicProvider = {
  name: 'local',
  displayName: 'Local Files',
  icon: 'folder_open',
  color: '#9e9e9e',
  enabled: true,

  async search(): Promise<SearchResults> {
    // Local search is handled by the internal library store filtering for source: 'local'
    return { tracks: [], albums: [], artists: [], source: 'local' };
  },

  async getStreamUrl(track: Track): Promise<StreamInfo | null> {
    let url = track.sourceId;
    if (url && !/^(https?|blob|data|asset):/i.test(url) && (window as any).__TAURI_INTERNALS__) {
      const { convertFileSrc } = await import('@tauri-apps/api/core');
      url = convertFileSrc(url);
    }
    return {
      url,
      cors: true,
      quality: 'Original',
      mimeType: 'audio/mpeg',
    };
  },

  async scanFiles(): Promise<Track[]> {
    if (typeof window === 'undefined' || !(window as any).__TAURI_INTERNALS__) return [];

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const files: any[] = await invoke('scan_local_music');
      
      return files.map(file => ({
        id: file.id,
        title: file.title,
        artist: file.artist,
        duration: 0, // Metadata extraction would need another crate like 'lofty' or 'symphonia'
        source: 'local',
        sourceId: file.path,
        thumbnail: '', // Could extract embedded art later
      }));
    } catch (e) {
      console.error('[LocalProvider] Scan failed:', e);
      return [];
    }
  }
};
