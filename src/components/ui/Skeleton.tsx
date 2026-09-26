import { cn } from './utils';

export function Skeleton({ className, rounded = 'rounded-md' }: { className?: string; rounded?: string }) {
  return <div aria-hidden className={cn('skeleton', rounded, className)} />;
}

export function SkeletonRow({ className, showIndex }: { className?: string; showIndex?: boolean }) {
  return (
    <div aria-hidden className={cn('flex items-center gap-3 px-2 py-2', className)}>
      {showIndex && <Skeleton className="w-4 h-4 hidden md:block" />}
      <Skeleton className="w-12 h-12 shrink-0" rounded="rounded-lg" />
      <div className="flex-1 min-w-0 space-y-2">
        <Skeleton className="h-3.5 w-2/5" />
        <Skeleton className="h-3 w-1/4" />
      </div>
      <Skeleton className="h-3 w-10 hidden sm:block" />
    </div>
  );
}

export function SkeletonCard({ className, circle }: { className?: string; circle?: boolean }) {
  return (
    <div aria-hidden className={cn('space-y-2.5', className)}>
      <Skeleton className="w-full aspect-square" rounded={circle ? 'rounded-full' : 'rounded-xl'} />
      <Skeleton className={cn('h-3.5 w-4/5', circle && 'mx-auto')} />
      <Skeleton className={cn('h-3 w-1/2', circle && 'mx-auto')} />
    </div>
  );
}

export function SkeletonList({ count = 8, className, showIndex }: { count?: number; className?: string; showIndex?: boolean }) {
  return (
    <div role="status" aria-label="Loading" className={cn('space-y-1', className)}>
      {Array.from({ length: count }, (_, i) => <SkeletonRow key={i} showIndex={showIndex} />)}
    </div>
  );
}

export function SkeletonShelf({ count = 6, circle, title = true, className }: { count?: number; circle?: boolean; title?: boolean; className?: string }) {
  return (
    <div role="status" aria-label="Loading" className={cn('space-y-4', className)}>
      {title && <Skeleton className="h-6 w-48" />}
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: count }, (_, i) => <SkeletonCard key={i} circle={circle} className="w-[42vw] sm:w-44 lg:w-48 shrink-0" />)}
      </div>
    </div>
  );
}

export function SkeletonPage() {
  return (
    <div role="status" aria-label="Loading" className="space-y-10 pt-4">
      <div className="flex flex-col sm:flex-row sm:items-end gap-6">
        <Skeleton className="w-48 h-48 sm:w-56 sm:h-56 mx-auto sm:mx-0" rounded="rounded-xl" />
        <div className="flex-1 space-y-3">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-10 w-3/4 max-w-md" />
          <Skeleton className="h-3.5 w-1/3" />
        </div>
      </div>
      <SkeletonShelf count={6} />
    </div>
  );
}
