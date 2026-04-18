import { registry } from './registry';
import { youtubeProvider } from './youtube';
import { soundcloudProvider } from './soundcloud';
import { jiosaavnProvider } from './jiosaavn';
import { bandcampProvider } from './bandcamp';

registry.register(youtubeProvider);
registry.register(soundcloudProvider);
registry.register(jiosaavnProvider);
registry.register(bandcampProvider);

export { registry };
export type { Track, Album, Artist, Playlist, SearchResults, StreamInfo, MusicProvider, ProviderName, Lyrics, LyricLine, RepeatMode } from './types';
