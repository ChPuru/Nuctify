import { memo, type ReactNode, type MouseEvent } from 'react';
import { Artwork } from './Artwork';
import { cn } from './utils';

export interface MediaCardProps {
  title: string;
  subtitle?: ReactNode;
  image?: string | null;
  shape?: 'square' | 'circle';
  icon?: string;
  onClick?: () => void;
  onPlay?: () => void;
  onContextMenu?: (e: MouseEvent) => void;
  playing?: boolean;
  badge?: ReactNode;
  className?: string;
}

export const MediaCard = memo(function MediaCard({ title, subtitle, image, shape = 'square', icon, onClick, onPlay, onContextMenu, playing, badge, className }: MediaCardProps) {
  const circle = shape === 'circle';
  return (
    <div className={cn('group relative rounded-xl p-2 -m-2 transition-colors duration-200 can-hover:hover:bg-on-surface/[0.05]', className)} onContextMenu={onContextMenu}>
      <button
        type="button"
        onClick={onClick ?? onPlay}
        className={cn('block w-full text-left rounded-lg active:scale-[0.98] transition-transform duration-150', circle && 'text-center')}
      >
        <Artwork src={image} alt="" size="fill" rounded={circle ? 'full' : 'xl'} icon={icon ?? (circle ? 'person' : 'album')} shadow className="mb-2.5" />
        <p className="text-sm font-semibold text-on-surface truncate">{title}</p>
        {subtitle && <div className="text-xs text-on-surface-variant truncate mt-0.5">{subtitle}</div>}
      </button>
      {badge && <div className="absolute top-4 left-4 pointer-events-none">{badge}</div>}
      {onPlay && (
        <div className="absolute inset-x-2 top-2 aspect-square pointer-events-none">
          <button
            type="button"
            aria-label={playing ? `Pause ${title}` : `Play ${title}`}
            onClick={(e) => { e.stopPropagation(); onPlay(); }}
            className={cn(
              'pointer-events-auto absolute right-2 bottom-2 w-11 h-11 rounded-full bg-primary text-on-primary shadow-elevated flex items-center justify-center',
              'transition-[opacity,transform] duration-200 ease-out hover:scale-105 active:scale-95',
              playing ? 'opacity-100 translate-y-0' : 'opacity-100 can-hover:opacity-0 can-hover:translate-y-2 can-hover:group-hover:opacity-100 can-hover:group-hover:translate-y-0 can-hover:group-focus-within:opacity-100 can-hover:group-focus-within:translate-y-0 focus-visible:opacity-100 focus-visible:translate-y-0',
            )}
          >
            <span aria-hidden className="material-symbols-outlined filled text-2xl">{playing ? 'pause' : 'play_arrow'}</span>
          </button>
        </div>
      )}
    </div>
  );
});
