import { create } from 'zustand';

interface NavState {
  currentPage: string;
  navigate: (page: string) => void;
}

export const useNavStore = create<NavState>((set) => ({
  currentPage: 'home',
  navigate: (page: string) => set({ currentPage: page }),
}));
