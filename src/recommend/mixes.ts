import { registry } from '../providers';
import type { Track } from '../providers/types';
import { bucketOf, clusterArtists, topTracks, type ArtistStat, type LibrarySnapshot, type Profile, type TimeBucket } from './profile';
import { DAY, artistKey, capPerArtist, dedupe, interleave, limit, primaryArtist, seededShuffle } from './util';

export type MixKind = 'daily' | 'time' | 'weekday' | 'onrepeat' | 'rewind' | 'discover' | 'release' | 'artist' | 'album';
export type MixGroup = 'daily' | 'now' | 'top' | 'special';

export interface MixSpec {
  id: string;
  kind: MixKind;
  group: MixGroup;
  title: string;
  description: string;
  period: 'day' | 'week';
  highlight?: boolean;
  image?: string;
  /** internal build inputs */
  artists?: ArtistStat[];
  bucket?: TimeBucket;
  weekday?: number;
  albumId?: string;
}

export const TIME_LABEL: Record<TimeBucket, string> = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening', night: 'Late Night' };
const TIME_ORDER: TimeBucket[] = ['morning', 'afternoon', 'evening', 'night'];
const TIME_DESC: Record<TimeBucket, string> = {
  morning: 'Ease into the day with what you play in the mornings',
  afternoon: 'Your afternoon go-tos, plus a few new finds',
  evening: 'Wind down with your evening favourites',
  night: 'For the late hours — the songs you keep coming back to after dark',
};
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const names = (a: ArtistStat[]) => {
  const n = a.slice(0, 3).map((x) => x.name);
  return n.length ? `${n.join(', ')}${a.length > 3 ? ' and more' : ''}` : '';
};
const slug = (s: string) => encodeURIComponent(s).replace(/%20/g, '_');

export const isColdStart = (p: Profile, lib: LibrarySnapshot) =>
  p.historySize < 8 && lib.likedTracks.length < 5 && lib.followedArtists.length < 3;

export function getSpecs(p: Profile, lib: LibrarySnapshot, now = new Date()): MixSpec[] {
  const specs: MixSpec[] = [];
  clusterArtists(p).forEach((c, i) => specs.push({
    id: `daily-${i + 1}`, kind: 'daily', group: 'daily', period: 'day', title: `Daily Mix ${i + 1}`,
    description: names(c.artists), artists: c.artists, image: c.artists[0]?.image,
  }));

  const cur = bucketOf(now.getHours());
  const enough = (m: Map<string, number>) => m.size >= 3 && [...m.values()].reduce((a, b) => a + b, 0) >= 4;
  for (const b of [cur, ...TIME_ORDER.filter((x) => x !== cur)]) {
    if (!enough(p.buckets[b])) continue;
    specs.push({ id: `time-${b}`, kind: 'time', group: 'now', period: 'day', title: `${TIME_LABEL[b]} Mix`, description: TIME_DESC[b], bucket: b, highlight: b === cur });
  }
  const dow = now.getDay();
  if (enough(p.weekdays[dow])) {
    specs.push({ id: `weekday-${dow}`, kind: 'weekday', group: 'now', period: 'day', title: `Your ${WEEKDAYS[dow]}`, description: `What you usually play on ${WEEKDAYS[dow]}s, and some new ones`, weekday: dow, highlight: true });
  }

  p.artists.slice(0, 6).forEach((a) => specs.push({
    id: `artist-${a.artistId ?? 'n_' + slug(a.key)}`, kind: 'artist', group: 'top', period: 'day', title: `${a.name} Mix`,
    description: `${a.name} and similar artists`, artists: [a], image: a.image,
  }));
  lib.savedAlbums.slice(0, 4).forEach((al) => specs.push({
    id: `album-${al.id}`, kind: 'album', group: 'top', period: 'day', title: `More like ${al.title}`,
    description: `Inspired by ${al.title} by ${al.artist}`, albumId: al.id, image: al.thumbnail,
  }));

  if (p.artists.length) {
    specs.push({ id: 'discover-weekly', kind: 'discover', group: 'special', period: 'week', title: 'Discover Weekly', description: 'Your weekly mixtape of fresh music. Refreshes every Monday.', artists: p.artists.slice(0, 8) });
    specs.push({ id: 'release-radar', kind: 'release', group: 'special', period: 'week', title: 'Release Radar', description: 'Catch the latest releases from artists you follow and love.', artists: releaseArtists(p) });
  }
  if ([...p.recent30.values()].some((n) => n >= 2)) specs.push({ id: 'on-repeat', kind: 'onrepeat', group: 'special', period: 'day', title: 'On Repeat', description: 'Songs you can’t stop playing right now' });
  if (rewindCandidates(p, now.getTime()).length >= 5) specs.push({ id: 'repeat-rewind', kind: 'rewind', group: 'special', period: 'week', title: 'Repeat Rewind', description: 'Past favourites you haven’t played in a while' });
  return specs;
}

const releaseArtists = (p: Profile) => {
  const followed = p.artists.filter((a) => a.followed && a.artistId);
  const rest = p.artists.filter((a) => !a.followed && a.artistId).slice(0, 8);
  return [...followed, ...rest].slice(0, 12);
};

function rewindCandidates(p: Profile, now: number): Track[] {
  const cutoff = now - 60 * DAY;
  return [...p.index.values()]
    .filter((t) => !p.skipped.has(t.id) && (p.liked.has(t.id) || (p.plays.get(t.id) || 0) >= 3))
    .filter((t) => { const lp = p.lastPlayed.get(t.id); return lp === undefined ? p.liked.has(t.id) : lp < cutoff; })
    .sort((a, b) => (p.plays.get(b.id) || 0) - (p.plays.get(a.id) || 0));
}

// ---------- registry helpers (all concurrency-limited, never throw) ----------
const radio = (seed: Track, n: number) => limit(() => registry.getRadio(seed, n), [] as Track[]);

async function artistTopTracks(a: Pick<ArtistStat, 'name' | 'artistId' | 'key'>): Promise<Track[]> {
  if (a.artistId) {
    const d = await limit(() => registry.getArtistDetails(a.artistId!), null);
    if (d?.topTracks?.length) return d.topTracks;
  }
  const r = await limit(() => registry.searchAll(a.name, 20), null);
  return (r?.tracks || []).filter((t) => artistKey(t.artist) === a.key || t.artist.toLowerCase().includes(a.name.toLowerCase()));
}

const favourites = (p: Profile, artists: ArtistStat[]) => {
  const scores = new Map<string, number>();
  for (const a of artists) for (const [id, s] of a.tracks) scores.set(id, s);
  return topTracks(scores, p, 60).filter((t) => !p.skipped.has(t.id) && !p.overplayed.has(t.id));
};

const clean = (p: Profile, tracks: Track[], opts: { exclude?: Track[]; unknownOnly?: boolean } = {}) => {
  const ex = new Set<string>(opts.exclude?.map((t) => t.id));
  if (opts.unknownOnly) p.known.forEach((k) => ex.add(k));
  return dedupe(tracks, ex).filter((t) => !p.skipped.has(t.id) && t.source !== 'podcast');
};

/** ~40% known favourites, ~60% fresh related tracks */
async function blend(p: Profile, seedKey: string, favs: Track[], extraFresh: Promise<Track[]>[] = [], size = 50): Promise<Track[]> {
  const fav = seededShuffle(favs.slice(0, 40), seedKey).slice(0, Math.round(size * 0.4));
  const seeds = favs.slice(0, 3);
  const lists = await Promise.all([...seeds.map((s) => radio(s, 25)), ...extraFresh]);
  const fresh = capPerArtist(seededShuffle(clean(p, lists.flat(), { exclude: fav }), seedKey + 'f'), 5).slice(0, size - fav.length);
  return dedupe(interleave(fav, fresh, 2, 3)).slice(0, size);
}

export async function buildMix(spec: MixSpec, p: Profile, periodKey: string): Promise<Track[]> {
  const seed = `${spec.id}:${periodKey}`;
  const now = Date.now();
  switch (spec.kind) {
    case 'daily': {
      const a = spec.artists || [];
      const favs = favourites(p, a);
      const thin = a.slice(0, 2).map((x) => artistTopTracks(x));
      return blend(p, seed, favs, thin);
    }
    case 'time':
    case 'weekday': {
      const m = spec.kind === 'time' ? p.buckets[spec.bucket!] : p.weekdays[spec.weekday!];
      return blend(p, seed, topTracks(m, p, 40).filter((t) => !p.skipped.has(t.id) && !p.overplayed.has(t.id)));
    }
    case 'artist': {
      const a = spec.artists![0];
      const top = await artistTopTracks(a);
      const own = dedupe([...favourites(p, [a]), ...top]);
      return blend(p, seed, own.length ? own : top, top.slice(0, 2).map((t) => radio(t, 20)));
    }
    case 'album': {
      const d = await limit(() => registry.getAlbumDetails(spec.albumId!), null);
      const tracks = d?.tracks || [];
      if (!tracks.length) return [];
      const seeds = seededShuffle(tracks, seed).slice(0, 3);
      const lists = await Promise.all(seeds.map((s) => radio(s, 20)));
      const fresh = capPerArtist(seededShuffle(clean(p, lists.flat(), { exclude: tracks }), seed), 4).slice(0, 35);
      return dedupe(interleave(seeds.slice(0, 5), fresh, 1, 4)).slice(0, 40);
    }
    case 'onrepeat': {
      const m = new Map([...p.recent30].filter(([, n]) => n >= 2));
      return topTracks(m.size ? m : p.recent30, p, 50).filter((t) => !p.skipped.has(t.id));
    }
    case 'rewind':
      return seededShuffle(rewindCandidates(p, now).slice(0, 80), seed).slice(0, 50);
    case 'discover': {
      const artists = spec.artists || [];
      const seeds = (await Promise.all(artists.slice(0, 6).map(async (a) => {
        const f = favourites(p, [a])[0];
        return f ?? (await artistTopTracks(a))[0];
      }))).filter((t): t is Track => !!t);
      const lists = await Promise.all(seeds.map((s) => radio(s, 30)));
      const fresh = clean(p, lists.flat(), { unknownOnly: true });
      // prefer artists the user hasn't heard
      const newArtists = fresh.filter((t) => !p.byKey.has(artistKey(t.artist)));
      const rest = fresh.filter((t) => p.byKey.has(artistKey(t.artist)));
      return capPerArtist(seededShuffle([...seededShuffle(newArtists, seed), ...rest.slice(0, 10)].slice(0, 60), seed), 2).slice(0, 30);
    }
    case 'release': {
      const year = new Date().getFullYear();
      const out: Track[] = [];
      await Promise.all((spec.artists || []).map(async (a) => {
        const d = await limit(() => registry.getArtistDetails(a.artistId!), null);
        if (!d) return;
        const albums = [...(d.albums || [])].sort((x, y) => (y.year || 0) - (x.year || 0));
        const recent = albums.filter((al) => (al.year || 0) >= year - 1).slice(0, 2);
        const picks = recent.length ? recent : albums.slice(0, albums.some((al) => al.year) ? 0 : 1);
        const tracks = (await Promise.all(picks.map((al) => limit(() => registry.getAlbumDetails(al.id), null))))
          .flatMap((r) => (r?.tracks || []).slice(0, 3).map((t) => ({ ...t, year: t.year ?? r?.album.year })));
        const newTop = (d.topTracks || []).filter((t) => (t.year || 0) >= year - 1).slice(0, 3);
        out.push(...tracks, ...newTop);
      }));
      const sorted = seededShuffle(dedupe(out), seed).sort((x, y) => (y.year || 0) - (x.year || 0));
      return capPerArtist(sorted.filter((t) => !p.skipped.has(t.id)), 4).slice(0, 30);
    }
  }
}

/** "Arijit Singh, Pritam and more" style description from actual mix contents */
export function describe(tracks: Track[], lead?: string): string {
  const c = new Map<string, number>();
  tracks.forEach((t) => { const n = primaryArtist(t.artist); c.set(n, (c.get(n) || 0) + 1); });
  const top = [...c].sort((a, b) => b[1] - a[1]).map(([n]) => n).filter((n) => n !== lead && n !== 'Unknown');
  const list = (lead ? [lead, ...top] : top).slice(0, 3);
  return list.length ? `${list.join(', ')}${c.size > list.length ? ' and more' : ''}` : '';
}
