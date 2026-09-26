import { useEffect, useId, useRef, type ReactNode, type RefObject, type PointerEvent as RPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { IconButton } from './Button';
import { cn, focusables, useMediaQuery } from './utils';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'auto' | 'sheet' | 'dialog';
  initialFocus?: RefObject<HTMLElement>;
  ariaLabel?: string;
  hideClose?: boolean;
  className?: string;
  bodyClassName?: string;
}

const stack: symbol[] = [];
let locks = 0;

export function Modal({ open, onClose, title, description, children, footer, size = 'md', variant = 'auto', initialFocus, ariaLabel, hideClose, className, bodyClassName }: ModalProps) {
  const narrow = useMediaQuery('(max-width: 639px)');
  const sheet = variant === 'sheet' || (variant === 'auto' && narrow);
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const titleId = useId();
  const drag = useRef<{ y: number; dy: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const me = Symbol();
    stack.push(me);
    const prev = document.activeElement as HTMLElement | null;
    if (locks++ === 0) document.documentElement.style.overflow = 'hidden';
    const t = requestAnimationFrame(() => {
      const el = panel.current;
      if (!el || el.contains(document.activeElement)) return;
      (initialFocus?.current ?? focusables(el).find((f) => !f.dataset.modalClose) ?? el).focus({ preventScroll: true });
    });
    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== me) return;
      if (e.key === 'Escape') { e.stopPropagation(); closeRef.current(); return; }
      if (e.key !== 'Tab' || !panel.current) return;
      const f = focusables(panel.current);
      if (!f.length) { e.preventDefault(); return; }
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || !panel.current.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      cancelAnimationFrame(t);
      document.removeEventListener('keydown', onKey, true);
      stack.splice(stack.indexOf(me), 1);
      if (--locks === 0) document.documentElement.style.overflow = '';
      if (prev && document.contains(prev)) prev.focus({ preventScroll: true });
    };
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  const onDown = (e: RPointerEvent) => {
    if (!sheet || (e.target as HTMLElement).closest('button,a,input')) return;
    drag.current = { y: e.clientY, dy: 0 };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: RPointerEvent) => {
    if (!drag.current || !panel.current) return;
    drag.current.dy = Math.max(0, e.clientY - drag.current.y);
    panel.current.style.transform = `translateY(${drag.current.dy}px)`;
    panel.current.style.transition = 'none';
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d || !panel.current) return;
    panel.current.style.transition = '';
    panel.current.style.transform = '';
    if (d.dy > 80) onClose();
  };

  const widths = { sm: 'sm:max-w-sm', md: 'sm:max-w-md', lg: 'sm:max-w-2xl' };

  return createPortal(
    <div className={cn('fixed inset-0 z-[200] flex', sheet ? 'items-end' : 'items-center justify-center p-4')}>
      <div aria-hidden className="absolute inset-0 bg-black/60 animate-fade-in" onClick={onClose} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        aria-labelledby={title && !ariaLabel ? titleId : undefined}
        tabIndex={-1}
        className={cn(
          'relative w-full flex flex-col bg-surface-container-high text-on-surface shadow-overlay outline-none transition-transform duration-200',
          sheet
            ? 'rounded-t-3xl max-h-[88dvh] animate-sheet-up pb-[env(safe-area-inset-bottom)]'
            : cn('rounded-2xl max-h-[85dvh] animate-scale-in border border-on-surface/[0.06]', widths[size]),
          className,
        )}
      >
        {sheet && (
          <div className="pt-2.5 pb-1 flex justify-center touch-none cursor-grab" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
            <div className="w-10 h-1 rounded-full bg-on-surface/25" />
          </div>
        )}
        {(title || !hideClose) && (
          <div className={cn('flex items-start gap-3 px-5 sm:px-6', sheet ? 'pt-2 touch-none' : 'pt-5', title ? 'pb-3' : 'pb-0')} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
            <div className="flex-1 min-w-0">
              {title && <h2 id={titleId} className="text-lg sm:text-xl font-bold leading-tight">{title}</h2>}
              {description && <p className="text-sm text-on-surface-variant mt-1">{description}</p>}
            </div>
            {!hideClose && <IconButton icon="close" label="Close" size="sm" data-modal-close="1" onClick={onClose} className="-mr-2 -mt-1" />}
          </div>
        )}
        <div className={cn('flex-1 overflow-y-auto overscroll-contain px-5 sm:px-6 pb-5', bodyClassName)}>{children}</div>
        {footer && <div className="px-5 sm:px-6 py-4 border-t border-on-surface/[0.06] flex justify-end gap-2">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function BottomSheet(props: Omit<ModalProps, 'variant'>) {
  return <Modal {...props} variant="sheet" />;
}
