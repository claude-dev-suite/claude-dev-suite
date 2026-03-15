// SPDX-License-Identifier: MIT
import type { KBUsageEntry } from '@/types';
import { Button, Badge, Spinner } from '../common';

export interface UsageTableProps {
  entries: KBUsageEntry[];
  loading: boolean;
  error: string | null;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function UsageTable({
  entries,
  loading,
  error,
  page,
  totalPages,
  onPageChange,
}: UsageTableProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8 text-red-400">
        <p>{error}</p>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="text-center py-12">
        <svg
          className="w-12 h-12 mx-auto text-surface-600 mb-3"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
          />
        </svg>
        <p className="text-surface-400">No usage data available</p>
        <p className="text-sm text-surface-400 mt-1">
          Data will appear here when the knowledge base is used
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-surface-700">
              <th className="text-left py-3 px-4 text-xs font-medium text-surface-400 uppercase tracking-wide">
                Timestamp
              </th>
              <th className="text-left py-3 px-4 text-xs font-medium text-surface-400 uppercase tracking-wide">
                Technology
              </th>
              <th className="text-left py-3 px-4 text-xs font-medium text-surface-400 uppercase tracking-wide">
                File
              </th>
              <th className="text-left py-3 px-4 text-xs font-medium text-surface-400 uppercase tracking-wide">
                Tool
              </th>
              <th className="text-left py-3 px-4 text-xs font-medium text-surface-400 uppercase tracking-wide">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, index) => (
              <tr
                key={`${entry.timestamp}-${index}`}
                className="border-b border-surface-700/50 hover:bg-surface-700/30"
              >
                <td className="py-3 px-4">
                  <span className="text-sm text-surface-300">
                    {new Date(entry.timestamp).toLocaleString()}
                  </span>
                </td>
                <td className="py-3 px-4">
                  <Badge variant="primary">{entry.technology}</Badge>
                </td>
                <td className="py-3 px-4">
                  <span className="text-sm text-surface-200 font-mono">
                    {entry.filePath}
                  </span>
                </td>
                <td className="py-3 px-4">
                  <span className="text-sm text-surface-400 font-mono">
                    {entry.tool}
                  </span>
                </td>
                <td className="py-3 px-4">
                  <Badge variant={entry.success ? 'success' : 'danger'}>
                    {entry.success ? 'Success' : 'Failed'}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-surface-700">
          <span className="text-sm text-surface-400">
            Page {page} of {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onPageChange(page - 1)}
              disabled={page === 1}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onPageChange(page + 1)}
              disabled={page === totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
