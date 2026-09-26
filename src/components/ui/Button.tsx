import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from './utils';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: string;
  iconRight?: string;
  loading?: boolean;
  fullWidth?: boolean;
  children?: ReactNode;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-on-primary hover:brightness-110 shadow-card',
  secondary: 'bg-on-surface/10 text-on-surface hover:bg-on-surface/[0.15]',
  ghost: 'text-on-surface-variant hover:text-on-surface hover:bg-on-surface/[0.06]',
  outline: 'border border-on-surface/20 text-on-surface hover:border-on-surface/50',
  danger: 'bg-error/15 text-error hover:bg-error/25',
};
const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3.5 text-xs gap-1.5',
  md: 'h-10 px-5 text-sm gap-2',
  lg: 'h-12 px-7 text-base gap-2.5',
};
const ICON: Record<ButtonSize, string> = { sm: 'text-base', md: 'text-lg', lg: 'text-xl' };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, iconRight, loading, fullWidth, className, children, disabled, type = 'button', ...rest }, ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center rounded-full font-bold whitespace-nowrap transition-[background-color,color,filter,transform,border-color] duration-150 active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none',
        VARIANTS[variant], SIZES[size], fullWidth && 'w-full', className,
      )}
      {...rest}
    >
      {loading ? (
        <span aria-hidden className={cn('material-symbols-outlined animate-spin', ICON[size])}>progress_activity</span>
      ) : icon ? (
        <span aria-hidden className={cn('material-symbols-outlined', ICON[size])}>{icon}</span>
      ) : null}
      {children}
      {iconRight && <span aria-hidden className={cn('material-symbols-outlined', ICON[size])}>{iconRight}</span>}
    </button>
  );
});

export type IconButtonVariant = 'ghost' | 'filled' | 'primary' | 'tonal';
export type IconButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: string;
  label: string;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  active?: boolean;
  filled?: boolean;
  showTooltip?: boolean;
}

const IB_SIZE: Record<IconButtonSize, string> = { xs: 'w-8 h-8 text-lg', sm: 'w-9 h-9 text-xl', md: 'w-10 h-10 text-[22px]', lg: 'w-12 h-12 text-2xl', xl: 'w-14 h-14 text-3xl' };
const IB_VARIANT: Record<IconButtonVariant, string> = {
  ghost: 'text-on-surface-variant hover:text-on-surface hover:bg-on-surface/[0.08]',
  filled: 'bg-on-surface text-background hover:scale-[1.04]',
  primary: 'bg-primary text-on-primary shadow-card hover:scale-[1.04] hover:brightness-110',
  tonal: 'bg-on-surface/10 text-on-surface hover:bg-on-surface/[0.16]',
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, variant = 'ghost', size = 'md', active, filled, showTooltip = true, className, type = 'button', ...rest }, ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={showTooltip ? label : undefined}
      className={cn(
        'inline-flex items-center justify-center shrink-0 rounded-full transition-[background-color,color,transform,filter] duration-150 active:scale-90 disabled:opacity-40 disabled:pointer-events-none',
        IB_SIZE[size], IB_VARIANT[variant], active && variant === 'ghost' && '!text-primary', className,
      )}
      {...rest}
    >
      <span aria-hidden className={cn('material-symbols-outlined', (filled || (active && filled !== false)) && 'filled')} style={{ fontSize: 'inherit' }}>{icon}</span>
    </button>
  );
});
