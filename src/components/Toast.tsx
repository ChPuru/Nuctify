import { memo } from 'react';
import { useToastStore, type ToastMessage, type ToastType } from '../store/toast';

const ICONS: Record<ToastType, [string, string]> = {
  success: ['check_circle', 'text-emerald-400'],
  error: ['error', 'text-error'],
  info: ['info', 'text-sky-400'],
  warning: ['warning', 'text-amber-400'],
};

const ToastItem = memo(function ToastItem({ toast }: { toast: ToastMessage }) {
  const remove = useToastStore((s) => s.removeToast);
  const [icon, color] = ICONS[toast.type] ?? ICONS.info;
  return (
    <div
      role={toast.type === 'error' ? 'alert' : 'status'}
      className="pointer-events-auto w-full sm:w-auto sm:min-w-[20rem] max-w-[28rem] flex items-center gap-3 pl-3.5 pr-1.5 py-1.5 min-h-[3rem] rounded-xl bg-surface-container-highest text-on-surface shadow-elevated border border-on-surface/[0.06] animate-toast-in"
    >
      <span aria-hidden className={`material-symbols-outlined filled text-xl ${color}`}>{icon}</span>
      <p className="flex-1 min-w-0 text-sm font-medium leading-snug py-1.5 line-clamp-2">{toast.message}</p>
      {toast.action && (
        <button
          type="button"
          onClick={() => { toast.action!.onClick(); remove(toast.id); }}
          className="shrink-0 h-9 px-3 rounded-lg text-sm font-bold text-primary hover:bg-primary/10 transition-colors"
        >
          {toast.action.label}
        </button>
      )}
      <button type="button" aria-label="Dismiss" onClick={() => remove(toast.id)} className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-on-surface/[0.08] transition-colors">
        <span aria-hidden className="material-symbols-outlined text-lg">close</span>
      </button>
    </div>
  );
});

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  return (
    <div
      aria-live="polite"
      className="fixed z-[300] inset-x-0 flex flex-col items-center gap-2 px-4 pointer-events-none bottom-[calc(var(--mobile-nav-h)+var(--mini-player-h)+1.25rem+env(safe-area-inset-bottom))] lg:bottom-[calc(var(--player-h)+1rem)] lg:pl-[var(--sidebar-w)]"
    >
      {toasts.map((t) => <ToastItem key={t.id} toast={t} />)}
    </div>
  );
}
