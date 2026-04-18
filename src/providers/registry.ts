import { MusicProvider, ProviderName, SearchResults, Track } from './types';

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/\[.*?\]/g, '')
    .replace(/feat\.?.*$/i, '')
    .replace(/ft\.?.*$/i, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1;
  if (na.length < 2 || nb.length < 2) return 0;

const bigrams = new Map<string, number>();
  for (let i = 0; i < na.length - 1; i++) {
    const bi = na.substring(i, i + 2);
    bigrams.set(bi, (bigrams.get(bi) || 0) + 1);
  }

let matches = 0;
  for (let i = 0; i < nb.length - 1; i++) {
    const bi = nb.substring(i, i + 2);
    const count = bigrams.get(bi) || 0;
    if (count > 0) {
      bigrams.set(bi, count - 1);
      matches++;
    }
  }

return (2 * matches) / (na.length - 1 + nb.length - 1);
}

const PROVIDER_PRIORITY: Record<string, number> = {
  jiosaavn: 3,
  youtube: 2,
  soundcloud: 1,
  bandcamp: 0,
};

class ProviderRegistry {
  private providers: Map<ProviderName, MusicProvider> = new Map();

register(provider: MusicProvider) {
    this.providers.set(provider.name, provider);
  }

get(name: ProviderName): MusicProvider | undefined {
    return this.providers.get(name);
  }

getAll(): MusicProvider[] {
    return Array.from(this.providers.values());
  }

getEnabled(): MusicProvider[] {
    return this.getAll().filter(p => p.enabled);
  }

async searchAll(query: string, limit = 20): Promise<SearchResults> {
    const enabled = this.getEnabled();
    if (enabled.length === 0) {
      return { tracks: [], albums: [], artists: [], source: 'youtube' };
    }

const results = await Promise.allSettled(
      enabled.map(p => p.search(query, limit))
    );

const merged: SearchResults = {
      tracks: [],
      albums: [],
      artists: [],
      source: 'youtube',
    };

for (const result of results) {
      if (result.status === 'fulfilled') {
        merged.tracks.push(...result.value.tracks);
        merged.albums.push(...result.value.albums);
        merged.artists.push(...result.value.artists);
      }
    }

merged.tracks = this.deduplicateTracks(merged.tracks);

return merged;
  }

async getTrendingAll(limit = 30): Promise<Track[]> {
    const enabled = this.getEnabled();
    const results = await Promise.allSettled(
      enabled
        .filter(p => p.getTrending)
        .map(p => p.getTrending!(limit))
    );

const tracks: Track[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled') {
        tracks.push(...result.value);
      }
    }

return this.deduplicateTracks(tracks);
  }

private deduplicateTracks(tracks: Track[]): Track[] {
    const groups: { key: string; primary: Track; alternatives: Track[] }[] = [];

for (const track of tracks) {
      const normTitle = normalize(track.title);
      const normArtist = normalize(track.artist);

let matched = false;
      for (const group of groups) {
        const existingTitle = normalize(group.primary.title);
        const existingArtist = normalize(group.primary.artist);

const titleSim = similarity(normTitle, existingTitle);
        const artistSim = similarity(normArtist, existingArtist);

if (titleSim > 0.8 && artistSim > 0.6) {

const existingPriority = PROVIDER_PRIORITY[group.primary.source] || 0;
          const newPriority = PROVIDER_PRIORITY[track.source] || 0;

if (newPriority > existingPriority) {
            group.alternatives.push(group.primary);
            group.primary = { ...track, alternatives: [...group.alternatives] };
          } else {
            group.alternatives.push(track);
            group.primary.alternatives = [...group.alternatives];
          }
          matched = true;
          break;
        }
      }

if (!matched) {
        groups.push({ key: `${normTitle}|${normArtist}`, primary: track, alternatives: [] });
      }
    }

return groups.map(g => g.primary);
  }
}

export const registry = new ProviderRegistry();
