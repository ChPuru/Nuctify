import { useCallback, useEffect, useRef, useState } from 'react';
import type { Track } from '../providers/types';
import { usePlayerStore, useLibraryStore } from '../store';
import { useAuthStore } from '../store/auth';
import {
  createBlendInvite, joinBlend, listBlends, deleteBlend, loadBlendProfiles, tasteMatch, sharedArtists, buildBlendPlaylist, publishTasteProfile,
  type BlendRow, type TasteProfile, type BlendOrigin,
} from '../social/blend';
import { useSocialStatus, shareLink, copyText, toast, errMsg, normalizeCode } from '../social/common';
import { Button, Chip, EmptyState, PageHeader, SkeletonList } from '../components/ui';
import { SocialGate, Avatar, SocialTrackRow } from './Jam';

interface Loaded { blend: BlendRow; me: TasteProfile; them: TasteProfile; match: number }

function BlendDetail({ data, onBack }: { data: Loaded; onBack: () => void }) {
  const { me, them, match } = data;
  const [tracks, setTracks] = useState<Track[] | null>(null);
  const [origin, setOrigin] = useState<Record<string, BlendOrigin>>({});
  const build = useCallback(() => {
    setTracks(null);
    buildBlendPlaylist(me, them).then((r) => { setTracks(r.tracks); setOrigin(r.origin); })
      .catch((e) => { toast(errMsg(e), 'error'); setTracks([]); });
  }, [me, them]);
  useEffect(build, [build]);
  const title = `${me.display_name || 'You'} + ${them.display_name || 'Friend'}`;
  const label = (o?: BlendOrigin) => o === 'both' ? 'you both love this' : o === 'fresh' ? 'fresh pick' : o === 'a' ? `from ${me.display_name || 'you'}` : o === 'b' ? `from ${them.display_name || 'them'}` : undefined;
  const shared = sharedArtists(me, them).slice(0, 12);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Blend"
        title={title}
        artwork={
          <div className="flex -space-x-6 shrink-0" aria-hidden>
            <Avatar name={me.display_name || 'You'} src={me.avatar_url} size={112} />
            <Avatar name={them.display_name || 'Friend'} src={them.avatar_url} size={112} />
          </div>
        }
        meta={<><span className="font-bold text-primary">{match}% taste match</span><span>· {tracks?.length ?? '…'} songs</span></>}
        actions={<>
          <Button variant="primary" icon="play_arrow" disabled={!tracks?.length} onClick={() => tracks && usePlayerStore.getState().playTracks(tracks, 0)}>Play</Button>
          <Button variant="secondary" icon="library_add" disabled={!tracks?.length} onClick={() => tracks && useLibraryStore.getState().createPlaylist(`Blend · ${title}`, tracks)}>Save as playlist</Button>
          <Button variant="ghost" icon="refresh" onClick={build}>Refresh</Button>
          <Button variant="ghost" icon="arrow_back" onClick={onBack}>All Blends</Button>
        </>}
      />
      {shared.length > 0 && (
        <section aria-label="Artists you share" className="flex flex-wrap gap-2">
          {shared.map((a) => <Chip key={a} label={a} icon="person" />)}
        </section>
      )}
      {!tracks ? <SkeletonList /> : tracks.length ? (
        <ol>{tracks.map((t, i) => (
          <SocialTrackRow key={t.id} track={t} sub={label(origin[t.id])} onPlay={() => usePlayerStore.getState().playTracks(tracks, i)} />
        ))}</ol>
      ) : <EmptyState icon="queue_music" title="Not enough listening yet" description="Play some music, then refresh — Blends are built from both of your listening histories." />}
    </div>
  );
}

function BlendHome({ joinCode }: { joinCode?: string }) {
  const userId = useAuthStore((s) => s.user?.id);
  const [rows, setRows] = useState<BlendRow[] | null>(null);
  const [loaded, setLoaded] = useState<Record<string, Loaded>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');
  const joined = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const list = await listBlends();
      setRows(list);
      const done = await Promise.all(list.filter((b) => b.user_b).map(async (blend) => {
        try { const [me, them] = await loadBlendProfiles(blend); return { blend, me, them, match: tasteMatch(me, them) }; } catch { return null; }
      }));
      setLoaded(Object.fromEntries(done.filter((x): x is Loaded => !!x).map((x) => [x.blend.id, x])));
    } catch (e) {
      setRows([]);
      toast(`Couldn't load Blends: ${errMsg(e)}`, 'error');
    }
  }, []);

  const join = useCallback(async (c: string) => {
    setBusy(true);
    try {
      const row = await joinBlend(c);
      await refresh();
      if (row.user_b) setOpen(row.id);
      toast(row.user_a === userId && !row.user_b ? 'This is your own invite — share it with a friend' : 'Blend ready!', 'success');
    } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  }, [refresh, userId]);

  useEffect(() => {
    if (joinCode && !joined.current) {
      joined.current = true;
      // Drop the code from the URL without remounting the page.
      try { window.history.replaceState({ page: 'blend' }, '', '#blend'); } catch { /* ignore */ }
      join(joinCode);
    } else refresh();
  }, [joinCode, join, refresh]);

  const invite = async () => {
    setBusy(true);
    try {
      const c = await createBlendInvite();
      await copyText(shareLink('blend', c), 'Blend invite link');
      refresh();
    } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  };

  if (open && loaded[open]) return <BlendDetail data={loaded[open]} onBack={() => setOpen(null)} />;
  const pending = (rows || []).filter((b) => !b.user_b);
  const ready = (rows || []).filter((b) => b.user_b && loaded[b.id]);

  return (
    <div className="space-y-8">
      <BlendIntro />
      <div className="flex flex-wrap gap-3 items-center">
        <Button variant="primary" icon="person_add" loading={busy} onClick={invite}>Invite a friend</Button>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (code) join(code); }}>
          <label htmlFor="blend-code" className="sr-only">Blend invite code</label>
          <input id="blend-code" value={code} onChange={(e) => setCode(normalizeCode(e.target.value))} placeholder="Invite code" autoComplete="off"
            className="w-36 h-10 px-4 rounded-full bg-on-surface/[0.08] font-mono uppercase tracking-widest outline-none focus:ring-2 focus:ring-primary" />
          <Button type="submit" variant="secondary" disabled={code.length < 4 || busy}>Join</Button>
        </form>
        <Button variant="ghost" icon="sync" onClick={() => publishTasteProfile(true).then(() => { toast('Taste profile updated', 'success'); refresh(); }, (e) => toast(errMsg(e), 'error'))}>Update my taste</Button>
      </div>

      {!rows ? <SkeletonList /> : (
        <>
          {ready.length > 0 ? (
            <ul className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(220px,1fr))]">
              {ready.map((b) => {
                const d = loaded[b.id];
                return (
                  <li key={b.id}>
                    <button type="button" onClick={() => setOpen(b.id)} className="w-full text-left rounded-2xl bg-on-surface/[0.05] hover:bg-on-surface/[0.09] p-4 space-y-3 transition-colors">
                      <span className="flex -space-x-3"><Avatar name={d.me.display_name || 'You'} src={d.me.avatar_url} size={52} /><Avatar name={d.them.display_name || 'Friend'} src={d.them.avatar_url} size={52} /></span>
                      <span className="block font-bold truncate">Blend with {d.them.display_name || 'a friend'}</span>
                      <span className="block text-sm text-primary font-semibold">{d.match}% taste match</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : <EmptyState icon="diversity_1" title="No Blends yet" description="Invite a friend — you'll get a shared playlist made from both of your tastes, plus a taste match score." />}

          {pending.length > 0 && (
            <section aria-labelledby="blend-pending" className="space-y-2">
              <h2 id="blend-pending" className="font-headline font-bold text-lg">Pending invites</h2>
              <ul className="space-y-2">
                {pending.map((b) => (
                  <li key={b.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-on-surface/[0.05] px-4 py-2">
                    <span className="font-mono tracking-widest font-bold">{b.code}</span>
                    <span className="text-xs text-on-surface-variant flex-1">Waiting for a friend to join</span>
                    <Button size="sm" variant="secondary" icon="link" onClick={() => copyText(shareLink('blend', b.code), 'Blend invite link')}>Copy link</Button>
                    <Button size="sm" variant="ghost" icon="delete" onClick={() => deleteBlend(b.id).then(refresh, (e) => toast(errMsg(e), 'error'))}>Cancel</Button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

const BlendIntro = () => <PageHeader icon="diversity_1" eyebrow="Made for two" title="Blend" description="Combine your taste with a friend's into one playlist that updates as you both listen." />;

export default function BlendPage({ code }: { code?: string }) {
  const status = useSocialStatus();
  return (
    <div className="space-y-6 pb-8">
      {status !== 'ready' && <BlendIntro />}
      <SocialGate what="Blend">{status === 'ready' && <BlendHome joinCode={code || undefined} />}</SocialGate>
    </div>
  );
}
