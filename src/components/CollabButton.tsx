import { useEffect, useMemo, useState } from 'react';
import { useLibraryStore } from '../store';
import { useAuthStore } from '../store/auth';
import { makeCollaborative, leaveCollab, listMembers, startCollabSync, type CollabMember, type LinkedPlaylist } from '../social/collab';
import { shareLink, copyText, requireSocial } from '../social/common';
import { Button, Modal } from './ui';

/** Make a local playlist collaborative / manage its invite link, members and contributions. */
export function CollabButton({ playlistId, className }: { playlistId: string; className?: string }) {
  const playlist = useLibraryStore((s) => s.playlists.find((p) => p.id === playlistId)) as LinkedPlaylist | undefined;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [members, setMembers] = useState<CollabMember[]>([]);
  const collabId = playlist?.collabId;
  const isOwner = useAuthStore((s) => !!s.user && s.user.id === playlist?.authorId);

  useEffect(() => { if (collabId) startCollabSync(); }, [collabId]);
  useEffect(() => {
    if (open && collabId) listMembers(collabId).then(setMembers).catch(() => setMembers([]));
  }, [open, collabId]);

  const contributions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of playlist?.tracks ?? []) {
      const who = playlist?.collabAddedBy?.[t.id];
      if (who) counts.set(who, (counts.get(who) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [playlist]);

  if (!playlist || (playlist.rules && playlist.rules.length)) return null;

  const onClick = async () => {
    if (collabId) { setOpen(true); return; }
    if (!requireSocial()) return;
    setBusy(true);
    const code = await makeCollaborative(playlistId).finally(() => setBusy(false));
    if (code) { setOpen(true); copyText(shareLink('collab', code), 'Invite link'); }
  };
  const link = playlist.collabCode ? shareLink('collab', playlist.collabCode) : '';

  return (
    <>
      <Button variant={collabId ? 'secondary' : 'outline'} icon={collabId ? 'group' : 'group_add'} loading={busy} onClick={onClick} className={className}>
        {collabId ? 'Collaborative' : 'Make collaborative'}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Collaborative playlist" size="sm"
        description="Everyone with the link can add and remove songs. Changes sync live.">
        <div className="space-y-5">
          {link && (
            <div className="flex gap-2">
              <input readOnly value={link} aria-label="Invite link" onFocus={(e) => e.currentTarget.select()}
                className="min-w-0 flex-1 h-10 px-4 rounded-full bg-on-surface/[0.08] text-xs outline-none" />
              <Button variant="primary" icon="link" onClick={() => copyText(link, 'Invite link')}>Copy</Button>
            </div>
          )}
          <section aria-labelledby="collab-members">
            <h3 id="collab-members" className="text-sm font-bold mb-2">Members</h3>
            <ul className="flex flex-wrap gap-2">
              {members.length ? members.map((m) => (
                <li key={m.user_id} className="flex items-center gap-2 rounded-full bg-on-surface/[0.06] pl-1 pr-3 py-1 text-sm">
                  <span className="w-6 h-6 rounded-full overflow-hidden bg-primary/20 text-primary text-xs font-bold inline-flex items-center justify-center">
                    {m.avatar_url ? <img src={m.avatar_url} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : (m.display_name || '?')[0].toUpperCase()}
                  </span>
                  {m.display_name || 'Member'}
                </li>
              )) : <li className="text-sm text-on-surface-variant">Just you so far.</li>}
            </ul>
          </section>
          {contributions.length > 0 && (
            <section aria-labelledby="collab-added">
              <h3 id="collab-added" className="text-sm font-bold mb-2">Added by</h3>
              <ul className="text-sm space-y-1">
                {contributions.map(([who, n]) => <li key={who} className="flex justify-between"><span>{who}</span><span className="text-on-surface-variant tabular-nums">{n} {n === 1 ? 'song' : 'songs'}</span></li>)}
              </ul>
            </section>
          )}
          <Button variant="danger" icon="logout" fullWidth
            onClick={() => { setOpen(false); leaveCollab(playlistId); }}>
            {isOwner ? 'Stop collaborating (for everyone)' : 'Leave (keep a local copy)'}
          </Button>
        </div>
      </Modal>
    </>
  );
}

export default CollabButton;
