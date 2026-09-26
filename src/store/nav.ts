import { create } from 'zustand';

interface NavState {
  currentPage: string;
  navigate: (page: string) => void;
}

const RESERVED = /^(mini-player$|access_token=|error=|code=)/;

const fromHash = (): string => {
  if (typeof window === 'undefined') return 'home';
  let h = window.location.hash.slice(1);
  try { h = decodeURIComponent(h); } catch {}
  return h && !RESERVED.test(h) ? h : 'home';
};

export const useNavStore = create<NavState>((set, get) => ({
  currentPage: fromHash(),
  navigate: (page: string) => {
    if (page === get().currentPage) return;
    try {
      window.history.pushState({ page }, '', '#' + encodeURIComponent(page));
    } catch {}
    set({ currentPage: page });
    window.scrollTo(0, 0);
  },
}));

if (typeof window !== 'undefined' && window.location.hash !== '#mini-player') {
  try {
    window.history.replaceState({ page: useNavStore.getState().currentPage }, '');
  } catch {}
  window.addEventListener('popstate', (e) => {
    const page = typeof e.state?.page === 'string' ? e.state.page : fromHash();
    useNavStore.setState({ currentPage: page });
    window.scrollTo(0, 0);
  });
}
