import { registry } from './registry';
import { youtubeProvider } from './youtube';
import { soundcloudProvider } from './soundcloud';
import { jiosaavnProvider } from './jiosaavn';
import { bandcampProvider } from './bandcamp';
import { localFileProvider } from './local';
import { podcastProvider } from './podcast';

registry.register(youtubeProvider);
registry.register(soundcloudProvider);
registry.register(jiosaavnProvider);
registry.register(bandcampProvider);
registry.register(localFileProvider);
registry.register(podcastProvider);

export { registry };
export type { Track, Album, Artist, Playlist, SearchResults, StreamInfo, MusicProvider, ProviderName, Lyrics, LyricLine, RepeatMode, HomeSection } from './types';
