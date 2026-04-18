export interface Track {
  id: string;
  title: string;
  artist: string;
  album?: string;
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
}

export interface Album {
  id: string;
  title: string;
  artist: string;
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

export type ProviderName = 'youtube' | 'soundcloud' | 'jiosaavn' | 'bandcamp';

export type RepeatMode = 'off' | 'one' | 'all';

export interface MusicProvider {
  name: ProviderName;
  displayName: string;
  icon: string;
  color: string;
  enabled: boolean;

search(query: string, limit?: number): Promise<SearchResults>;
  getStreamUrl(track: Track): Promise<StreamInfo | null>;
  getTrackInfo?(sourceId: string): Promise<Track | null>;
  getTrending?(limit?: number): Promise<Track[]>;
  getArtistTracks?(artistId: string): Promise<Track[]>;
}
