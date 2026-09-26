import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Track } from '../providers/types';
import { registry } from '../providers';
import { usePlayerStore } from '../store';
import { useAuthStore } from '../store/auth';
import { useJamStore, startJam, joinJam, leaveJam, requestAdd, setGuestControl } from '../social/jam';
import { useSocialStatus, shareLink, copyText, normalizeCode } from '../social/common';
import { initSocial } from '../social';
import { Artwork, Button, EmptyState, PageHeader, cn } from '../components/ui';

// ---------- shared social UI bits (also used by Blend / CollabJoin) ----------
export function SocialGate({ children, what }: { children: ReactNode; what: string }) {
  const status = useSocialStatus();
  useEffect(() => { initSocial(); }, []);
  if (status === 'not-configured') {
    return <EmptyState icon="cloud_off" title="Cloud features aren't set up" description={`${what} needs Supabase. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then run supabase/schema.sql.`} />;
  }
  if (status === 'signed-out') {
    return <EmptyState icon="account_circle" title="Sign in to continue" description={`${what} is tied to your account so friends can see who's who.`}
      action={<Button variant="primary" icon="login" onClick={() => useAuthStore.getState().openAuthModal()}>Sign in</Button>} />;
  }
  return <>{children}</>;
}

export function Avatar({ name, src, size = 36, className }: { name: string; src?: string | null; size?: number; className?: string }) {
  return (
    <span title={name} style={{ width: size, height: size, fontSize: size * 0.42 }}
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full overflow-hidden bg-primary/20 text-primary font-bold ring-2 ring-background', className)}>
      {src ? <img src={src} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : (name.trim()[0] || '?').toUpperCase()}
    </span>
  );
}

export function SocialTrackRow({ track, sub, action, onPlay, active }: { track: Track; sub?: ReactNode; action?: ReactNode; onPlay?: () => void; active?: boolean }) {
  return (
    <li className={cn('flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-on-surface/[0.06]', active && 'bg-primary/10')}>
      <button type="button" onClick={onPlay} disabled={!onPlay} className="flex items-center gap-3 min-w-0 flex-1 text-left" aria-label={onPlay ? `Play ${track.title}` : undefined}>
        <Artwork src={track.thumbnail} size="xs" rounded="md" icon="music_note" />
        <span className="min-w-0">
          <span className={cn('block truncate text-sm font-semibold', active ? 'text-primary' : 'text-on-surface')}>{track.title}</span>
          <span className="block truncate text-xs text-on-surface-variant">{track.artist}{sub ? <> · {sub}</> : null}</span>
        </span>
      </button>
      {action}
    </li>
  );
}

// ---------- Jam page ----------
function AddSongs() {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) { setResults([]); return; }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      setLoading(true);
      registry.searchAll(query, 10, { signal: ctrl.signal })
        .then((r) => { if (!ctrl.signal.aborted) setResults(r.tracks.slice(0, 10)); })
        .finally(() => { if (!ctrl.signal.aborted) setLoading(false); });
    }, 300);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q]);
  return (
    <section aria-labelledby="jam-add" className="space-y-2">
      <h2 id="jam-add" className="font-headline font-bold text-lg">Add songs</h2>
      <label className="relative block">
        <span className="sr-only">Search songs to add</span>
        <span aria-hidden className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">search</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search for a song" autoComplete="off"
          className="w-full h-11 pl-10 pr-4 rounded-full bg-on-surface/[0.08] text-sm outline-none focus:ring-2 focus:ring-primary" />
      </label>
      {loading && <p className="text-xs text-on-surface-variant px-2">Searching…</p>}
      <ul>
        {results.map((t) => (
          <SocialTrackRow key={t.id} track={t}
            action={<Button size="sm" variant="secondary" icon="add" onClick={() => requestAdd(t)} aria-label={`Add ${t.title} to Jam`}>Add</Button>} />
        ))}
      </ul>
    </section>
  );
}

function Lobby({ initialCode }: { initialCode?: string }) {
  const [code, setCode] = useState(initialCode ?? '');
  return (
    <div className="grid gap-4 sm:grid-cols-2 max-w-3xl">
      <div className="rounded-2xl bg-on-surface/[0.05] p-5 space-y-3">
        <h2 className="font-headline font-bold text-lg">Start a Jam</h2>
        <p className="text-sm text-on-surface-variant">Listen together in real time. Friends join with a code or link and can add songs to your queue.</p>
        <Button variant="primary" icon="podcasts" onClick={() => startJam()}>Start a Jam</Button>
      </div>
      <form className="rounded-2xl bg-on-surface/[0.05] p-5 space-y-3" onSubmit={(e) => { e.preventDefault(); joinJam(code); }}>
        <h2 className="font-headline font-bold text-lg">Join a Jam</h2>
        <label htmlFor="jam-code" className="text-sm text-on-surface-variant block">Enter the 6-character code</label>
        <div className="flex gap-2">
          <input id="jam-code" value={code} onChange={(e) => setCode(normalizeCode(e.target.value))} placeholder="ABC123" maxLength={12} autoComplete="off"
            className="min-w-0 flex-1 h-10 px-4 rounded-full bg-on-surface/[0.08] font-mono tracking-widest uppercase outline-none focus:ring-2 focus:ring-primary" />
          <Button type="submit" variant="secondary" disabled={code.length < 4}>Join</Button>
        </div>
      </form>
    </div>
  );
}

function LiveJam() {
  const code = useJamStore((s) => s.code)!;
  const isHost = useJamStore((s) => s.isHost);
  const status = useJamStore((s) => s.status);
  const members = useJamStore((s) => s.members);
  const guestControl = useJamStore((s) => s.guestControl);
  const addedBy = useJamStore((s) => s.addedBy);
  const hostName = useJamStore((s) => s.hostName);
  const current = usePlayerStore((s) => s.currentTrack);
  const queue = usePlayerStore((s) => s.queue);
  const queueIndex = usePlayerStore((s) => s.queueIndex);
  const upcoming = queue.slice(queueIndex + 1, queueIndex + 51);
  const link = shareLink('jam', code);

  return (
    <div className="space-y-8">
      <PageHeader
        icon="groups"
        eyebrow={isHost ? 'Your Jam' : `${hostName ?? 'Host'}'s Jam`}
        title={<span className="font-mono tracking-widest">{code}</span>}
        description={status === 'connecting' ? 'Connecting…' : isHost ? 'Share the code or link. You control playback.' : guestControl ? 'Everyone can control playback.' : 'The host controls playback — you can add songs.'}
        meta={<span>{members.length || 1} listening</span>}
        actions={<>
          <Button variant="primary" icon="link" onClick={() => copyText(link, 'Jam link')}>Copy link</Button>
          <Button variant="secondary" icon="content_copy" onClick={() => copyText(code, 'Jam code')}>Copy code</Button>
          <Button variant="danger" icon={isHost ? 'stop_circle' : 'logout'} onClick={() => leaveJam()}>{isHost ? 'End Jam' : 'Leave'}</Button>
        </>}
      />

      <section aria-labelledby="jam-people" className="space-y-3">
        <h2 id="jam-people" className="font-headline font-bold text-lg">Participants</h2>
        <ul className="flex flex-wrap gap-3">
          {members.map((m) => (
            <li key={m.id} className="flex items-center gap-2 rounded-full bg-on-surface/[0.06] pr-3">
              <Avatar name={m.name} src={m.avatar} size={32} />
              <span className="text-sm font-semibold">{m.name}</span>
              {m.host && <span className="text-[10px] font-bold uppercase text-primary">Host</span>}
            </li>
          ))}
        </ul>
        {isHost && (
          <label className="flex items-center gap-3 text-sm cursor-pointer w-fit">
            <input type="checkbox" checked={guestControl} onChange={(e) => setGuestControl(e.target.checked)} className="w-4 h-4 accent-[rgb(var(--primary))]" />
            Let guests control playback
          </label>
        )}
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <section aria-labelledby="jam-queue" className="space-y-2">
          <h2 id="jam-queue" className="font-headline font-bold text-lg">Now playing</h2>
          {current ? (
            <ul><SocialTrackRow track={current} active sub={addedBy[current.id] ? `added by ${addedBy[current.id]}` : undefined} /></ul>
          ) : <p className="text-sm text-on-surface-variant">{isHost ? 'Play something to get the Jam going.' : 'Waiting for the host to play something…'}</p>}
          <h3 className="font-bold text-sm text-on-surface-variant pt-3">Up next</h3>
          {upcoming.length ? (
            <ul>{upcoming.map((t, i) => (
              <SocialTrackRow key={`${t.id}-${i}`} track={t} sub={addedBy[t.id] ? `added by ${addedBy[t.id]}` : undefined} />
            ))}</ul>
          ) : <p className="text-sm text-on-surface-variant">Queue is empty — add a song.</p>}
        </section>
        <AddSongs />
      </div>
    </div>
  );
}

export default function JamPage({ code }: { code?: string }) {
  const active = useJamStore((s) => s.code);
  const tried = useRef(false);
  const wanted = code ? normalizeCode(code) : '';
  const status = useSocialStatus();
  useEffect(() => {
    // Opening a #jam:<code> link auto-joins (once) when not already in a Jam.
    if (wanted && !active && !tried.current && status === 'ready') { tried.current = true; joinJam(wanted); }
  }, [wanted, active, status]);

  return (
    <div className="space-y-6 pb-8">
      {!active && <PageHeader icon="groups" eyebrow="Listen together" title="Jam" description="A shared, real-time listening session with friends." />}
      <SocialGate what="Jam">
        {active ? <LiveJam /> : <Lobby initialCode={wanted} />}
      </SocialGate>
    </div>
  );
}
