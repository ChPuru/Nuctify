import { useEffect, useState } from 'react';
import { useNavStore } from '../store/nav';
import { joinCollab, previewCollab } from '../social/collab';
import { useSocialStatus } from '../social/common';
import { Button, EmptyState, PageHeader, SkeletonList } from '../components/ui';
import { SocialGate } from './Jam';

type Preview = { name: string; owner_name: string; track_count: number } | null;

export default function CollabJoinPage({ code }: { code: string }) {
  const status = useSocialStatus();
  const [preview, setPreview] = useState<Preview | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status !== 'ready' || !code) return;
    let alive = true;
    previewCollab(code).then((p) => { if (alive) setPreview(p); }, () => { if (alive) setPreview(null); });
    return () => { alive = false; };
  }, [code, status]);

  const join = async () => {
    setBusy(true);
    const id = await joinCollab(code).finally(() => setBusy(false));
    if (id) useNavStore.getState().navigate(`playlist:${id}`);
  };

  return (
    <div className="space-y-6 pb-8">
      <SocialGate what="Joining a collaborative playlist">
        {preview === undefined ? <SkeletonList /> : preview === null ? (
          <EmptyState icon="link_off" title="Invite not found" description="This collaborative playlist link is invalid or the playlist was deleted." />
        ) : (
          <PageHeader
            icon="queue_music"
            eyebrow="Collaborative playlist invite"
            title={preview.name}
            meta={<span>{preview.owner_name ? `by ${preview.owner_name} · ` : ''}{preview.track_count} songs</span>}
            description="Join to add songs together. It'll appear in your library and stay in sync."
            actions={<Button variant="primary" icon="group_add" loading={busy} onClick={join}>Join playlist</Button>}
          />
        )}
      </SocialGate>
    </div>
  );
}
