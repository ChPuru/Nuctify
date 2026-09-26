import type { KeyboardEvent, ReactNode } from 'react';
import { cn } from './utils';

export interface ChipProps {
  label: ReactNode;
  selected?: boolean;
  icon?: string;
  onClick?: () => void;
  onRemove?: () => void;
  className?: string;
}

export function Chip({ label, selected, icon, onClick, onRemove, className }: ChipProps) {
  return (
    <span className={cn('inline-flex items-center shrink-0 rounded-full text-sm font-semibold transition-colors duration-150', selected ? 'bg-on-surface text-background' : 'bg-on-surface/[0.08] text-on-surface hover:bg-on-surface/[0.14]', className)}>
      <button type="button" aria-pressed={selected} onClick={onClick} className={cn('inline-flex items-center gap-1.5 h-8 rounded-full active:scale-95 transition-transform', onRemove ? 'pl-3.5 pr-1' : 'px-3.5')}>
        {icon && <span aria-hidden className="material-symbols-outlined text-base">{icon}</span>}
        {label}
      </button>
      {onRemove && (
        <button type="button" aria-label="Remove" onClick={onRemove} className="w-7 h-7 mr-0.5 rounded-full inline-flex items-center justify-center opacity-70 hover:opacity-100">
          <span aria-hidden className="material-symbols-outlined text-base">close</span>
        </button>
      )}
    </span>
  );
}

export interface TabOption<T extends string> { value: T; label: ReactNode; icon?: string; count?: number }

export interface TabsProps<T extends string> {
  options: TabOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
  variant?: 'chips' | 'underline';
  className?: string;
}

export function Tabs<T extends string>({ options, value, onChange, ariaLabel, variant = 'chips', className }: TabsProps<T>) {
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const i = options.findIndex((o) => o.value === value);
    const next = options[(i + (e.key === 'ArrowRight' ? 1 : -1) + options.length) % options.length];
    if (!next) return;
    e.preventDefault();
    const list = e.currentTarget;
    onChange(next.value);
    requestAnimationFrame(() => list.querySelector<HTMLElement>('[aria-selected="true"]')?.focus());
  };
  const chips = variant === 'chips';
  return (
    <div role="tablist" aria-label={ariaLabel} onKeyDown={onKey} className={cn('flex overflow-x-auto no-scrollbar', chips ? 'gap-2' : 'gap-6 border-b border-on-surface/10', className)}>
      {options.map((o) => {
        const sel = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={sel}
            tabIndex={sel ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={cn(
              'inline-flex items-center gap-1.5 shrink-0 text-sm font-semibold whitespace-nowrap transition-colors duration-150',
              chips
                ? cn('h-8 px-3.5 rounded-full active:scale-95 transition-transform', sel ? 'bg-on-surface text-background' : 'bg-on-surface/[0.08] text-on-surface hover:bg-on-surface/[0.14]')
                : cn('h-10 -mb-px border-b-2', sel ? 'border-primary text-on-surface' : 'border-transparent text-on-surface-variant hover:text-on-surface'),
            )}
          >
            {o.icon && <span aria-hidden className="material-symbols-outlined text-base">{o.icon}</span>}
            {o.label}
            {o.count !== undefined && <span className={cn('text-xs tabular-nums', sel && chips ? 'opacity-70' : 'text-on-surface-variant')}>{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
