import { memo } from 'react';
import { useNavStore } from '../store/nav';
import { cn } from './ui';

const MIXES = /^(made-for-you$|mix:|jam|blend)/;
const LIBRARY = /^(library|liked|recent|queue|stats|profile|settings)$|^playlist:/;

const Item = memo(function Item({ id, icon, label, active, current, onNavigate }: { id: string; icon: string; label: string; active: boolean; current: boolean; onNavigate: (page: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => (current ? window.scrollTo({ top: 0, behavior: 'smooth' }) : onNavigate(id))}
      aria-current={active ? 'page' : undefined}
      className={cn('flex-1 h-full flex flex-col items-center justify-center gap-0.5 transition-colors duration-150 active:scale-95', active ? 'text-on-surface' : 'text-on-surface-variant')}
    >
      <span aria-hidden className={cn('material-symbols-outlined text-[26px] transition-transform duration-200', active && 'filled scale-105')}>{icon}</span>
      <span className="text-[11px] font-semibold tracking-wide">{label}</span>
    </button>
  );
});

export default memo(function MobileNav() {
  const currentPage = useNavStore((s) => s.currentPage);
  const navigate = useNavStore((s) => s.navigate);
  return (
    <nav aria-label="Primary" className="fixed bottom-0 inset-x-0 z-50 lg:hidden pb-[env(safe-area-inset-bottom)] bg-background/[0.97] border-t border-on-surface/[0.06]">
      <div className="h-[var(--mobile-nav-h)] flex items-stretch pl-safe pr-safe">
        <Item id="home" icon="home" label="Home" active={currentPage === 'home'} current={currentPage === 'home'} onNavigate={navigate} />
        <Item id="search" icon="search" label="Search" active={currentPage === 'search'} current={currentPage === 'search'} onNavigate={navigate} />
        <Item id="made-for-you" icon="auto_awesome" label="For you" active={MIXES.test(currentPage)} current={currentPage === 'made-for-you'} onNavigate={navigate} />
        <Item id="library" icon="library_music" label="Library" active={LIBRARY.test(currentPage)} current={currentPage === 'library'} onNavigate={navigate} />
      </div>
    </nav>
  );
});
