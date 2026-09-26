export interface Track {
  id: string;
  title: string;
  artist: string;
  artistId?: string;
  album?: string;
  albumId?: string;
  duration: number;
  thumbnail?: string;
  streamUrl?: string;
  source: ProviderName;
  sourceId: string;
  year?: number;
  genre?: string;
  bitrate?: number;
  isLiked?: boolean;
  alternatives?: Track[];
  language?: string;
  explicit?: boolean;
}

export interface Album {
  id: string;
  title: string;
  artist: string;
  artistId?: string;
  thumbnail?: string;
  year?: number;
  trackCount?: number;
  source: ProviderName;
  sourceId: string;
}

export interface Artist {
  id: string;
  name: string;
  image?: string;
  bio?: string;
  source: ProviderName;
  sourceId: string;
}

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  thumbnail?: string;
  trackCount?: number;
  tracks: Track[];
  createdAt: number;
  updatedAt: number;
  isUserCreated: boolean;
  isCollaborative?: boolean;
  /** Linked Supabase collab_playlists id (src/social/collab.ts). */
  collabId?: string;
  authorId?: string;
  rules?: SmartPlaylistRule[];
}

export interface SmartPlaylistRule {
  field: 'artist' | 'year' | 'genre' | 'source';
  operator: 'contains' | 'equals' | 'greater' | 'less';
  value: string | number;
}

export interface SearchResults {
  tracks: Track[];
  albums: Album[];
  artists: Artist[];
  source: ProviderName;
}

export interface StreamInfo {
  url: string;
  quality: string;
  mimeType: string;
  bitrate?: number;
  cors?: boolean;
  expiresAt?: number;
}

export interface HomeSection {
  id: string;
  title: string;
  subtitle?: string;
  tracks?: Track[];
  albums?: Album[];
  playlists?: { id: string; title: string; thumbnail?: string; source: ProviderName; sourceId: string; subtitle?: string }[];
}

export interface LyricLine {
  time: number;
  text: string;
}

export interface Lyrics {
  plain?: string;
  synced?: LyricLine[];
  source: string;
}

export type ProviderName = 'youtube' | 'soundcloud' | 'jiosaavn' | 'bandcamp' | 'local' | 'podcast';

export type RepeatMode = 'off' | 'one' | 'all';

export interface MusicProvider {
  name: ProviderName;
  displayName: string;
  icon: string;
  color: string;
  enabled: boolean;

  search(query: string, limit?: number, opts?: { signal?: AbortSignal }): Promise<SearchResults>;
  getStreamUrl(track: Track): Promise<StreamInfo | null>;
  getTrackInfo?(sourceId: string): Promise<Track | null>;
  getTrending?(limit?: number): Promise<Track[]>;
  getArtistDetails?(artistId: string): Promise<{ artist: Artist; topTracks: Track[]; albums: Album[] }>;
  getAlbumDetails?(albumId: string): Promise<{ album: Album; tracks: Track[] }>;
  getPlaylist?(playlistId: string): Promise<Track[]>;
  scanFiles?(): Promise<Track[]>;
  getRadio?(seed: Track, limit?: number): Promise<Track[]>;
  getHomeSections?(): Promise<HomeSection[]>;
  getPlaylistDetails?(playlistId: string): Promise<{ title: string; thumbnail?: string; tracks: Track[] }>;
}
