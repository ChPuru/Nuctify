import { useAuthStore } from '../store/auth';
import { socialStatus } from './common';
import { startCollabSync } from './collab';
import { publishTasteProfile } from './blend';

export * from './common';
export { useJamStore, startJam, joinJam, leaveJam, requestAdd, setGuestControl } from './jam';
export type { JamMember } from './jam';

let inited = false;
/** Idempotent: starts collaborative-playlist sync and publishes the daily taste profile when signed in. */
export function initSocial() {
  if (inited || typeof window === 'undefined') return;
  inited = true;
  startCollabSync();
  const publish = () => { if (socialStatus() === 'ready') publishTasteProfile().catch(() => {}); };
  publish();
  useAuthStore.subscribe((s, p) => { if (s.user?.id !== p.user?.id) publish(); });
}
