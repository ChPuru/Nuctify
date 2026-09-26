import { useEffect } from 'react';
import { useJamStore } from '../social/jam';
import { initSocial } from '../social';
import { useNavStore } from '../store/nav';
import { cn } from './ui';

/** Small pill showing the active Jam (mount near the player bar). Also boots social sync once. */
export function JamIndicator({ className }: { className?: string }) {
  useEffect(() => { initSocial(); }, []);
  const code = useJamStore((s) => s.code);
  const count = useJamStore((s) => s.members.length);
  const live = useJamStore((s) => s.status === 'live');
  const isHost = useJamStore((s) => s.isHost);
  if (!code) return null;
  return (
    <button
      type="button"
      onClick={() => useNavStore.getState().navigate(`jam:${code}`)}
      title={isHost ? `You're hosting Jam ${code}` : `In Jam ${code}`}
      aria-label={`Jam ${code}, ${count} ${count === 1 ? 'person' : 'people'} listening. Open Jam`}
      className={cn('inline-flex items-center gap-1.5 h-7 px-3 rounded-full text-xs font-bold bg-primary/15 text-primary hover:bg-primary/25 transition-colors', className)}
    >
      <span aria-hidden className={cn('w-1.5 h-1.5 rounded-full', live ? 'bg-primary animate-pulse' : 'bg-on-surface-variant')} />
      <span aria-hidden className="material-symbols-outlined text-base">groups</span>
      <span>Jam</span>
      <span className="tabular-nums opacity-80">{count || 1}</span>
    </button>
  );
}

export default JamIndicator;
