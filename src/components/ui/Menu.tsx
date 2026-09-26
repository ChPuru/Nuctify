import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { BottomSheet } from './Modal';
import { cn, useMediaQuery } from './utils';

export interface MenuItem {
  label?: ReactNode;
  icon?: string;
  onSelect?: () => void;
  danger?: boolean;
  disabled?: boolean;
  checked?: boolean;
  hint?: ReactNode;
  divider?: boolean;
  keepOpen?: boolean;
}

export type MenuAnchor = HTMLElement | { x: number; y: number } | null;

export interface MenuProps {
  open: boolean;
  onClose: () => void;
  anchor: MenuAnchor;
  items?: MenuItem[];
  header?: ReactNode;
  children?: ReactNode;
  align?: 'start' | 'end';
  width?: number;
  sheetOnMobile?: boolean;
  ariaLabel?: string;
}

function Items({ items, onClose, sheet }: { items: MenuItem[]; onClose: () => void; sheet: boolean }) {
  return (
    <>
      {items.map((it, i) => it.divider ? (
        <div key={i} role="separator" className="my-1 h-px bg-on-surface/[0.08] mx-2" />
      ) : (
        <button
          key={i}
          type="button"
          role={it.checked !== undefined ? 'menuitemcheckbox' : 'menuitem'}
          aria-checked={it.checked}
          disabled={it.disabled}
          tabIndex={-1}
          onClick={() => { if (!it.keepOpen) onClose(); it.onSelect?.(); }}
          className={cn(
            'w-full flex items-center gap-3 text-left rounded-lg transition-colors duration-100 disabled:opacity-40 outline-none',
            sheet ? 'px-3 py-3.5 text-[15px]' : 'px-3 py-2 text-sm',
            it.danger ? 'text-error hover:bg-error/10 focus:bg-error/10' : 'text-on-surface hover:bg-on-surface/[0.08] focus:bg-on-surface/[0.08]',
          )}
        >
          {it.icon && <span aria-hidden className={cn('material-symbols-outlined', sheet ? 'text-[22px]' : 'text-xl', !it.danger && 'text-on-surface-variant')}>{it.icon}</span>}
          <span className="flex-1 min-w-0 truncate">{it.label}</span>
          {it.hint && <span className="text-xs text-on-surface-variant">{it.hint}</span>}
          {it.checked && <span aria-hidden className="material-symbols-outlined text-lg text-primary">check</span>}
        </button>
      ))}
    </>
  );
}

export function Menu({ open, onClose, anchor, items, header, children, align = 'start', width = 240, sheetOnMobile = true, ariaLabel }: MenuProps) {
  const mobile = useMediaQuery('(max-width: 639px), (hover: none)');
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const asSheet = sheetOnMobile && mobile;
  const anchorRef = useRef(anchor);
  anchorRef.current = anchor;
  const anchorKey = !anchor ? '' : 'getBoundingClientRect' in anchor ? anchor : `${anchor.x},${anchor.y}`;

  useLayoutEffect(() => {
    if (!open || asSheet) { setPos(null); return; }
    const el = ref.current;
    if (!el) return;
    const vw = window.innerWidth, vh = window.innerHeight, m = 8;
    const { width: w, height: h } = el.getBoundingClientRect();
    let left: number, top: number;
    if (anchor && 'getBoundingClientRect' in anchor) {
      const r = anchor.getBoundingClientRect();
      left = align === 'end' ? r.right - w : r.left;
      top = r.bottom + 4;
      if (top + h > vh - m && r.top - h - 4 > m) top = r.top - h - 4;
    } else {
      left = anchor?.x ?? vw / 2 - w / 2;
      top = anchor?.y ?? vh / 2 - h / 2;
      if (left + w > vw - m) left = left - w;
      if (top + h > vh - m) top = top - h;
    }
    setPos({ left: Math.max(m, Math.min(left, vw - w - m)), top: Math.max(m, Math.min(top, vh - h - m)) });
  }, [open, anchorKey, asSheet, align]);

  useEffect(() => {
    if (!open || asSheet) return;
    const prev = document.activeElement as HTMLElement | null;
    const t = requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>('[role^="menuitem"]:not([disabled])')?.focus({ preventScroll: true }));
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target)) return;
      const a = anchorRef.current;
      if (a && 'contains' in a && a.contains(target)) return;
      closeRef.current();
    };
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); closeRef.current(); } };
    const onScroll = (e: Event) => { if (!ref.current?.contains(e.target as Node)) closeRef.current(); };
    const onResize = () => closeRef.current();
    document.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(t);
      document.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
      const active = document.activeElement;
      if (prev && document.contains(prev) && (!active || active === document.body)) prev.focus({ preventScroll: true });
    };
  }, [open, asSheet]);

  if (!open || typeof document === 'undefined') return null;

  if (asSheet) {
    return (
      <BottomSheet open onClose={onClose} ariaLabel={typeof ariaLabel === 'string' ? ariaLabel : 'Menu'} hideClose bodyClassName="px-2 pb-3">
        {header && <div className="px-3 pb-3 mb-1 border-b border-on-surface/[0.08]">{header}</div>}
        <div role="menu">
          {items && <Items items={items} onClose={onClose} sheet />}
          {children}
        </div>
      </BottomSheet>
    );
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End', 'Tab'].includes(e.key)) return;
    if (e.key === 'Tab') { onClose(); return; }
    e.preventDefault();
    const list = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([disabled])'));
    if (!list.length) return;
    const i = list.indexOf(document.activeElement as HTMLElement);
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? list.length - 1 : (i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length;
    list[next].focus();
  };

  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
      style={{ left: pos?.left ?? 0, top: pos?.top ?? 0, width: Math.min(width, window.innerWidth - 16), visibility: pos ? 'visible' : 'hidden' }}
      className="fixed z-[250] max-h-[min(70vh,32rem)] overflow-y-auto overscroll-contain rounded-xl bg-surface-container-highest border border-on-surface/[0.08] shadow-overlay p-1.5 animate-scale-in origin-top"
    >
      {header && <div className="px-2.5 pt-1.5 pb-2.5 mb-1 border-b border-on-surface/[0.08]">{header}</div>}
      {items && <Items items={items} onClose={onClose} sheet={false} />}
      {children}
    </div>,
    document.body,
  );
}

export function useMenuState() {
  const [anchor, setAnchor] = useState<MenuAnchor>(null);
  const onClose = useCallback(() => setAnchor(null), []);
  const openFrom = useCallback((e: MouseEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget;
    setAnchor((a) => (a === el ? null : e.type === 'contextmenu' ? { x: e.clientX, y: e.clientY } : el));
  }, []);
  return { open: !!anchor, anchor, onClose, openFrom, openAt: setAnchor };
}
