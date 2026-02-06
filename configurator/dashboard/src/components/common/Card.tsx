// SPDX-License-Identifier: MIT
import { memo } from 'react';
import clsx from 'clsx';

export interface CardProps {
  children: React.ReactNode;
  className?: string;
  selectable?: boolean;
  selected?: boolean;
  onClick?: () => void;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const paddingStyles = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
};

export const Card = memo(function Card({
  children,
  className,
  selectable = false,
  selected = false,
  onClick,
  padding = 'md',
}: CardProps) {
  return (
    <div
      onClick={onClick}
      className={clsx(
        'rounded-lg border bg-surface-800 transition-all',
        paddingStyles[padding],
        selectable && 'cursor-pointer',
        selectable && !selected && 'border-surface-700 hover:border-surface-500',
        selectable && selected && 'border-primary-500 bg-primary-500/5',
        !selectable && 'border-surface-700',
        className
      )}
      role={selectable ? 'button' : undefined}
      tabIndex={selectable ? 0 : undefined}
      onKeyDown={
        selectable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
    >
      {children}
    </div>
  );
});

export interface CardHeaderProps {
  children: React.ReactNode;
  className?: string;
}

export const CardHeader = memo(function CardHeader({ children, className }: CardHeaderProps) {
  return (
    <div className={clsx('flex items-center justify-between mb-3', className)}>
      {children}
    </div>
  );
});

export interface CardTitleProps {
  children: React.ReactNode;
  className?: string;
}

export const CardTitle = memo(function CardTitle({ children, className }: CardTitleProps) {
  return (
    <h3 className={clsx('font-medium text-white', className)}>{children}</h3>
  );
});

export interface CardDescriptionProps {
  children: React.ReactNode;
  className?: string;
}

export const CardDescription = memo(function CardDescription({ children, className }: CardDescriptionProps) {
  return (
    <p className={clsx('text-sm text-surface-400', className)}>{children}</p>
  );
});

export interface CardContentProps {
  children: React.ReactNode;
  className?: string;
}

export const CardContent = memo(function CardContent({ children, className }: CardContentProps) {
  return <div className={className}>{children}</div>;
});

export interface CardFooterProps {
  children: React.ReactNode;
  className?: string;
}

export const CardFooter = memo(function CardFooter({ children, className }: CardFooterProps) {
  return (
    <div className={clsx('flex items-center gap-2 mt-4 pt-4 border-t border-surface-700', className)}>
      {children}
    </div>
  );
});
