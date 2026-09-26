import { Children, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { IconButton } from './Button';
import { cn } from './utils';

export interface ShelfProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
  onSeeAll?: () => void;
  seeAllLabel?: string;
  action?: ReactNode;
  itemClassName?: string;
  gap?: string;
  className?: string;
  children: ReactNode;
}

export function Shelf({ title, subtitle, eyebrow, onSeeAll, seeAllLabel = 'Show all', action, itemClassName = 'w-[40vw] max-w-[11rem] sm:w-44 sm:max-w-none lg:w-48', gap = 'gap-4', className, children }: ShelfProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });
  const frame = useRef(0);

  const update = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      setEdges((p) => {
        const start = el.scrollLeft <= 4, end = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4;
        return p.start === start && p.end === end ? p : { start, end };
      });
    });
  }, []);

  useEffect(() => {
    update();
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => { ro.disconnect(); cancelAnimationFrame(frame.current); };
  }, [update, children]);

  const scroll = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: reduce ? 'auto' : 'smooth' });
  };

  const items = Children.toArray(children);
  if (!items.length) return null;

  return (
    <section className={cn('min-w-0', className)}>
      {(title || action || onSeeAll) && (
        <div className="flex items-end justify-between gap-4 mb-3 sm:mb-4">
          <div className="min-w-0">
            {eyebrow && <p className="text-xs font-semibold text-on-surface-variant mb-0.5">{eyebrow}</p>}
            {title && <h2 className="text-xl sm:text-2xl font-bold text-on-surface truncate">{title}</h2>}
            {subtitle && <p className="text-sm text-on-surface-variant truncate mt-0.5">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {action}
            {onSeeAll && (
              <button type="button" onClick={onSeeAll} className="text-xs sm:text-sm font-bold text-on-surface-variant hover:text-on-surface hover:underline underline-offset-4 px-2 py-1.5 rounded-md transition-colors">
                {seeAllLabel}
              </button>
            )}
            <div className="hidden can-hover:flex items-center gap-1 ml-1">
              <IconButton icon="chevron_left" label="Scroll left" size="sm" variant="tonal" disabled={edges.start} onClick={() => scroll(-1)} />
              <IconButton icon="chevron_right" label="Scroll right" size="sm" variant="tonal" disabled={edges.end} onClick={() => scroll(1)} />
            </div>
          </div>
        </div>
      )}
      <div
        ref={ref}
        onScroll={update}
        className={cn('flex overflow-x-auto no-scrollbar snap-x-shelf -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 scroll-px-4 sm:scroll-px-6 lg:scroll-px-8 pb-2', gap)}
      >
        {items.map((child, i) => (
          <div key={(child as any)?.key ?? i} className={cn('snap-start shrink-0', itemClassName)}>{child}</div>
        ))}
      </div>
    </section>
  );
}
