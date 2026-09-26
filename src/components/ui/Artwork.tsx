import { memo, useState } from 'react';
import { cn } from './utils';

export type ArtworkSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'hero' | 'fill';
export type ArtworkRounded = 'md' | 'lg' | 'xl' | '2xl' | 'full';

export interface ArtworkProps {
  src?: string | null;
  alt?: string;
  size?: ArtworkSize;
  rounded?: ArtworkRounded;
  icon?: string;
  shadow?: boolean;
  priority?: boolean;
  className?: string;
  imgClassName?: string;
}

const SIZES: Record<ArtworkSize, string> = {
  xs: 'w-10 h-10',
  sm: 'w-12 h-12',
  md: 'w-14 h-14',
  lg: 'w-24 h-24',
  xl: 'w-40 h-40 sm:w-48 sm:h-48',
  hero: 'w-48 h-48 sm:w-56 sm:h-56 lg:w-60 lg:h-60',
  fill: 'w-full aspect-square',
};
const ICON: Record<ArtworkSize, string> = { xs: 'text-lg', sm: 'text-xl', md: 'text-2xl', lg: 'text-4xl', xl: 'text-6xl', hero: 'text-7xl', fill: 'text-5xl' };
const ROUND: Record<ArtworkRounded, string> = { md: 'rounded-md', lg: 'rounded-lg', xl: 'rounded-xl', '2xl': 'rounded-2xl', full: 'rounded-full' };

export const Artwork = memo(function Artwork({ src, alt = '', size = 'md', rounded = 'lg', icon = 'music_note', shadow, priority, className, imgClassName }: ArtworkProps) {
  const [failed, setFailed] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<string | null>(null);
  const ok = !!src && failed !== src;
  return (
    <div className={cn('relative shrink-0 overflow-hidden bg-surface-container-high', SIZES[size], ROUND[rounded], shadow && 'shadow-card', className)}>
      {ok ? (
        <img
          src={src!}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          draggable={false}
          referrerPolicy="no-referrer"
          onLoad={() => setLoaded(src!)}
          onError={() => setFailed(src!)}
          className={cn('absolute inset-0 w-full h-full object-cover transition-opacity duration-200', loaded === src ? 'opacity-100' : 'opacity-0', imgClassName)}
        />
      ) : null}
      {(!ok || loaded !== src) && (
        <div aria-hidden className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-surface-container-highest to-surface-container text-on-surface-variant/60">
          <span className={cn('material-symbols-outlined', ICON[size])}>{icon}</span>
        </div>
      )}
    </div>
  );
});
