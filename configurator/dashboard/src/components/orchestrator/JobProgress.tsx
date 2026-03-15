// SPDX-License-Identifier: MIT
import type { Job, JobStatus } from '@/types';
import { Button, Badge } from '../common';
import clsx from 'clsx';

export interface JobProgressProps {
  job: Job;
  onCancel?: () => void;
}

const statusBadgeVariant: Record<JobStatus, 'default' | 'primary' | 'success' | 'danger' | 'warning'> = {
  pending: 'default',
  running: 'primary',
  completed: 'success',
  failed: 'danger',
  cancelled: 'warning',
};

export function JobProgress({ job, onCancel }: JobProgressProps) {
  const isRunning = job.status === 'running';
  const isComplete = job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled';

  // Calculate progress based on sub-tasks
  const progress = job.subTasks
    ? Math.round((job.subTasks.filter(() => false).length / job.subTasks.length) * 100) // TODO: Track sub-task completion
    : isComplete
    ? 100
    : isRunning
    ? 50
    : 0;

  return (
    <div className="p-4 bg-surface-800 border border-surface-700 rounded-lg">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <h4 className="font-medium text-white">{job.title}</h4>
          <Badge variant={statusBadgeVariant[job.status]}>
            {job.status}
          </Badge>
        </div>
        {isRunning && onCancel && (
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>

      {/* Progress Bar */}
      <div className="h-2 bg-surface-700 rounded-full overflow-hidden mb-3">
        <div
          className={clsx(
            'h-full transition-all duration-500',
            job.status === 'completed' && 'bg-green-500',
            job.status === 'running' && 'bg-primary-500 animate-pulse',
            job.status === 'failed' && 'bg-red-500',
            job.status === 'cancelled' && 'bg-yellow-500',
            job.status === 'pending' && 'bg-surface-600'
          )}
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Sub-tasks */}
      {job.subTasks && job.subTasks.length > 0 && (
        <div className="space-y-2">
          {job.subTasks.map((task, index) => (
            <div
              key={`${task.agentId}-${index}`}
              className="flex items-center gap-2 text-sm"
            >
              <div
                className={clsx(
                  'w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0',
                  'bg-surface-700 text-surface-400 text-xs'
                )}
              >
                {index + 1}
              </div>
              <span className="text-surface-300">{task.agentId}</span>
              <span className="text-surface-500">-</span>
              <span className="text-surface-400 truncate flex-1">{task.task}</span>
            </div>
          ))}
        </div>
      )}

      {/* Cost and Time */}
      {isComplete && job.cost !== undefined && (
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-surface-700 text-xs text-surface-400">
          <span>Cost: ${job.cost.toFixed(4)}</span>
          <span>Created: {new Date(job.createdAt).toLocaleTimeString()}</span>
        </div>
      )}

      {/* Error */}
      {job.status === 'failed' && job.error && (
        <div className="mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
          <p className="text-sm text-red-400">{job.error}</p>
        </div>
      )}
    </div>
  );
}
