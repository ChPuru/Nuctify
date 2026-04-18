import { useNavStore } from '../store/nav';

export default function MobileNav() {
  const currentPage = useNavStore((s) => s.currentPage);
  const navigate = useNavStore((s) => s.navigate);

  const NavItem = ({ id, icon, label, isFilled = false }: { id: string; icon: string; label: string; isFilled?: boolean }) => {
    const active = currentPage === id || (id === 'library' && (currentPage === 'liked' || currentPage === 'recent' || currentPage === 'queue' || currentPage.startsWith('playlist:')));
    
    return (
      <button 
        onClick={() => navigate(id === 'library' ? 'library' : id)}
        className={`flex flex-col items-center justify-center gap-1 flex-1 py-3 transition-colors ${
          active ? 'text-primary' : 'text-slate-500'
        }`}
      >
        <span className={`material-symbols-outlined text-2xl ${isFilled && active ? 'filled' : ''}`}>
          {icon}
        </span>
        <span className="text-[10px] font-bold uppercase tracking-widest">{label}</span>
      </button>
    );
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 lg:hidden bg-[#0e0e13]/80 backdrop-blur-3xl border-t border-white/5 pb-safe">
      <div className="flex items-center justify-around px-2">
        <NavItem id="home" icon="home" label="Home" isFilled />
        <NavItem id="search" icon="search" label="Search" />
        <NavItem id="library" icon="library_music" label="Library" isFilled />
        <NavItem id="settings" icon="settings" label="Settings" />
      </div>
    </nav>
  );
}
