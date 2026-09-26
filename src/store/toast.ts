import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  action?: ToastAction;
  duration?: number;
}

export interface ToastMessage {
  id: string;
  message: string;
  type: ToastType;
  action?: ToastAction;
}

interface ToastState {
  toasts: ToastMessage[];
  addToast: (message: string, type?: ToastType, opts?: ToastOptions) => void;
  removeToast: (id: string) => void;
}

let seq = 0;
const timers = new Map<string, ReturnType<typeof setTimeout>>();

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],

  addToast: (message, type = 'info', opts) => {
    const existing = get().toasts.find((t) => t.message === message);
    if (existing) get().removeToast(existing.id);
    const id = `${Date.now()}-${++seq}`;
    set((state) => {
      const next = [...state.toasts, { id, message, type, action: opts?.action }];
      for (const t of next.slice(0, -3)) { clearTimeout(timers.get(t.id)); timers.delete(t.id); }
      return { toasts: next.slice(-3) };
    });
    const ms = opts?.duration ?? (opts?.action ? 6000 : type === 'error' ? 4500 : 3000);
    timers.set(id, setTimeout(() => get().removeToast(id), ms));
  },

  removeToast: (id) => {
    clearTimeout(timers.get(id));
    timers.delete(id);
    set((state) => (state.toasts.some((t) => t.id === id) ? { toasts: state.toasts.filter((t) => t.id !== id) } : state));
  },
}));
