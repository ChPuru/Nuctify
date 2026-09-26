import type { ReactNode } from 'react';
import { cn } from './utils';

export interface EmptyStateProps {
  icon?: string;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
  className?: string;
}

export function EmptyState({ icon = 'library_music', title, description, action, compact, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center mx-auto max-w-sm', compact ? 'py-8 gap-2' : 'py-16 sm:py-24 gap-3', className)}>
      <div className={cn('rounded-full bg-on-surface/[0.06] flex items-center justify-center text-on-surface-variant mb-2', compact ? 'w-14 h-14' : 'w-20 h-20')}>
        <span aria-hidden className={cn('material-symbols-outlined', compact ? 'text-3xl' : 'text-4xl')}>{icon}</span>
      </div>
      <h3 className={cn('font-bold text-on-surface', compact ? 'text-base' : 'text-xl')}>{title}</h3>
      {description && <p className="text-sm text-on-surface-variant leading-relaxed">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
