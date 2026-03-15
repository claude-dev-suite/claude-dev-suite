// SPDX-License-Identifier: MIT
export interface LoadingPanelProps {
  message?: string;
}

export function LoadingPanel({ message = 'Loading...' }: LoadingPanelProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[400px] space-y-4">
      <div className="relative">
        <div className="w-16 h-16 border-4 border-primary-500/20 rounded-full" />
        <div className="absolute top-0 left-0 w-16 h-16 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
      <p className="text-surface-400 text-sm">{message}</p>
    </div>
  );
}
