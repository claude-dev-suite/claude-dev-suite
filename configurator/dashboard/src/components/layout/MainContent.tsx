// SPDX-License-Identifier: MIT
import clsx from 'clsx';

export interface MainContentProps {
  children: React.ReactNode;
  className?: string;
  fullWidth?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const paddingStyles = {
  none: '',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
};

export function MainContent({
  children,
  className,
  fullWidth = false,
  padding = 'md',
}: MainContentProps) {
  return (
    <main
      className={clsx(
        'flex-1 overflow-auto bg-surface-900',
        paddingStyles[padding],
        className
      )}
    >
      <div className={clsx(!fullWidth && 'max-w-6xl mx-auto')}>
        {children}
      </div>
    </main>
  );
}

// Panel wrapper with title
export interface PanelSectionProps {
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  actions?: React.ReactNode;
}

export function PanelSection({
  title,
  description,
  children,
  className,
  actions,
}: PanelSectionProps) {
  return (
    <section className={clsx('bg-surface-800 rounded-xl border border-surface-700', className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-700">
          <div>
            {title && <h2 className="text-lg font-semibold text-white">{title}</h2>}
            {description && <p className="text-sm text-surface-400 mt-1">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className="p-6">{children}</div>
    </section>
  );
}
