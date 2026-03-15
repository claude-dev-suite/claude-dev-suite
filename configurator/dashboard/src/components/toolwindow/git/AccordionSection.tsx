// SPDX-License-Identifier: MIT
/**
 * Accordion section component for GitPanel
 */

interface AccordionSectionProps {
  title: string;
  badge?: string;
  expanded: boolean;
  onToggle: () => void;
  loading?: boolean;
  children: React.ReactNode;
}

export function AccordionSection({
  title,
  badge,
  expanded,
  onToggle,
  loading,
  children,
}: AccordionSectionProps) {
  return (
    <div className="border-b border-surface-700">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-surface-700/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg
            className={`w-3 h-3 text-surface-400 transition-transform ${expanded ? 'rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-sm font-medium text-surface-200">{title}</span>
          {badge && (
            <span className="px-1.5 py-0.5 text-xs bg-surface-600 text-surface-300 rounded">
              {badge}
            </span>
          )}
        </div>
        {loading && (
          <svg className="w-3 h-3 text-surface-400 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
      </button>
      {expanded && <div>{children}</div>}
    </div>
  );
}
