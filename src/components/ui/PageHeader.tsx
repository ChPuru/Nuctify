import type { ReactNode } from 'react';
import { Artwork } from './Artwork';
import { useDominantColor } from '../../utils/color';
import { cn } from './utils';

export interface PageHeaderProps {
  title: ReactNode;
  eyebrow?: ReactNode;
  meta?: ReactNode;
  description?: ReactNode;
  image?: string | null;
  artwork?: ReactNode;
  shape?: 'square' | 'circle';
  icon?: string;
  color?: string | null;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function PageHeader({ title, eyebrow, meta, description, image, artwork, shape = 'square', icon, color, actions, children, className }: PageHeaderProps) {
  const extracted = useDominantColor(color === undefined ? image : null);
  const tint = color ?? extracted;
  const hasArt = !!(artwork || image !== undefined || icon);
  return (
    <header className={cn('relative isolate -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 pt-4 sm:pt-8 pb-6', className)}>
      <div
        aria-hidden
        className={cn('absolute inset-x-0 -top-20 bottom-0 -z-10 transition-[background] duration-500', tint ? 'opacity-70' : 'opacity-25')}
        style={{ background: `linear-gradient(to bottom, ${tint ?? 'rgb(var(--primary))'} 0%, transparent 100%)` }}
      />
      <div className={cn('flex flex-col items-center text-center gap-5 sm:flex-row sm:items-end sm:text-left sm:gap-6')}>
        {hasArt && (artwork ?? (
          <Artwork src={image} size="hero" rounded={shape === 'circle' ? 'full' : 'xl'} icon={icon ?? (shape === 'circle' ? 'person' : 'album')} priority className="shadow-overlay" />
        ))}
        <div className="min-w-0 flex-1 w-full">
          {eyebrow && <p className="text-xs font-bold uppercase tracking-wider text-on-surface/80 mb-1.5">{eyebrow}</p>}
          <h1 className="font-headline font-extrabold text-on-surface leading-[1.05] tracking-tight break-words text-3xl sm:text-5xl lg:text-6xl line-clamp-3">{title}</h1>
          {description && <p className="text-sm text-on-surface-variant mt-3 line-clamp-2 max-w-2xl sm:mx-0 mx-auto">{description}</p>}
          {meta && <div className="text-sm text-on-surface/80 mt-2.5 flex flex-wrap items-center justify-center sm:justify-start gap-x-1.5 gap-y-1">{meta}</div>}
        </div>
      </div>
      {actions && <div className="mt-6 flex items-center justify-center sm:justify-start gap-3 flex-wrap">{actions}</div>}
      {children}
    </header>
  );
}
