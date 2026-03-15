// SPDX-License-Identifier: MIT
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { JobProgress } from '../JobProgress';
import type { Job } from '@/types';

describe('JobProgress', () => {
  const baseJob: Job = {
    id: 'job-1',
    title: 'Test Job',
    prompt: 'Test prompt',
    status: 'pending',
    createdAt: new Date('2024-01-01T10:00:00Z').toISOString(),
    projectPath: '/test/path',
  };

  describe('Rendering', () => {
    it('should render job title', () => {
      render(<JobProgress job={baseJob} />);
      expect(screen.getByText('Test Job')).toBeInTheDocument();
    });

    it('should render job status badge', () => {
      render(<JobProgress job={{ ...baseJob, status: 'running' }} />);
      expect(screen.getByText('running')).toBeInTheDocument();
    });

    it('should render progress bar', () => {
      const { container } = render(<JobProgress job={baseJob} />);
      const progressBar = container.querySelector('.h-2');
      expect(progressBar).toBeInTheDocument();
    });
  });

  describe('Status Badge Variants', () => {
    it('should show default badge for pending status', () => {
      render(<JobProgress job={{ ...baseJob, status: 'pending' }} />);
      expect(screen.getByText('pending')).toBeInTheDocument();
    });

    it('should show primary badge for running status', () => {
      render(<JobProgress job={{ ...baseJob, status: 'running' }} />);
      expect(screen.getByText('running')).toBeInTheDocument();
    });

    it('should show success badge for completed status', () => {
      render(<JobProgress job={{ ...baseJob, status: 'completed' }} />);
      expect(screen.getByText('completed')).toBeInTheDocument();
    });

    it('should show danger badge for failed status', () => {
      render(<JobProgress job={{ ...baseJob, status: 'failed' }} />);
      expect(screen.getByText('failed')).toBeInTheDocument();
    });

    it('should show warning badge for cancelled status', () => {
      render(<JobProgress job={{ ...baseJob, status: 'cancelled' }} />);
      expect(screen.getByText('cancelled')).toBeInTheDocument();
    });
  });

  describe('Progress Bar', () => {
    it('should show 0% progress for pending jobs', () => {
      const { container } = render(
        <JobProgress job={{ ...baseJob, status: 'pending' }} />
      );

      const progressFill = container.querySelector('.h-full');
      expect(progressFill).toHaveStyle({ width: '0%' });
    });

    it('should show 50% progress for running jobs without subtasks', () => {
      const { container } = render(
        <JobProgress job={{ ...baseJob, status: 'running' }} />
      );

      const progressFill = container.querySelector('.h-full');
      expect(progressFill).toHaveStyle({ width: '50%' });
    });

    it('should show 100% progress for completed jobs', () => {
      const { container } = render(
        <JobProgress job={{ ...baseJob, status: 'completed' }} />
      );

      const progressFill = container.querySelector('.h-full');
      expect(progressFill).toHaveStyle({ width: '100%' });
    });

    it('should show 100% progress for failed jobs', () => {
      const { container } = render(
        <JobProgress job={{ ...baseJob, status: 'failed' }} />
      );

      const progressFill = container.querySelector('.h-full');
      expect(progressFill).toHaveStyle({ width: '100%' });
    });

    it('should apply correct color for running status', () => {
      const { container } = render(
        <JobProgress job={{ ...baseJob, status: 'running' }} />
      );

      const progressFill = container.querySelector('.bg-primary-500');
      expect(progressFill).toBeInTheDocument();
    });

    it('should apply correct color for completed status', () => {
      const { container } = render(
        <JobProgress job={{ ...baseJob, status: 'completed' }} />
      );

      const progressFill = container.querySelector('.bg-green-500');
      expect(progressFill).toBeInTheDocument();
    });

    it('should apply correct color for failed status', () => {
      const { container } = render(
        <JobProgress job={{ ...baseJob, status: 'failed' }} />
      );

      const progressFill = container.querySelector('.bg-red-500');
      expect(progressFill).toBeInTheDocument();
    });

    it('should apply correct color for cancelled status', () => {
      const { container } = render(
        <JobProgress job={{ ...baseJob, status: 'cancelled' }} />
      );

      const progressFill = container.querySelector('.bg-yellow-500');
      expect(progressFill).toBeInTheDocument();
    });
  });

  describe('Sub-tasks Display', () => {
    it('should display sub-tasks when present', () => {
      const jobWithSubTasks: Job = {
        ...baseJob,
        subTasks: [
          { agentId: 'react-expert', task: 'Setup React components' },
          { agentId: 'vitest-expert', task: 'Write unit tests' },
        ],
      };

      render(<JobProgress job={jobWithSubTasks} />);

      expect(screen.getByText('react-expert')).toBeInTheDocument();
      expect(screen.getByText('Setup React components')).toBeInTheDocument();
      expect(screen.getByText('vitest-expert')).toBeInTheDocument();
      expect(screen.getByText('Write unit tests')).toBeInTheDocument();
    });

    it('should number sub-tasks sequentially', () => {
      const jobWithSubTasks: Job = {
        ...baseJob,
        subTasks: [
          { agentId: 'agent1', task: 'Task 1' },
          { agentId: 'agent2', task: 'Task 2' },
          { agentId: 'agent3', task: 'Task 3' },
        ],
      };

      const { container } = render(<JobProgress job={jobWithSubTasks} />);

      const numbers = container.querySelectorAll('.w-5.h-5');
      expect(numbers).toHaveLength(3);
      expect(numbers[0]).toHaveTextContent('1');
      expect(numbers[1]).toHaveTextContent('2');
      expect(numbers[2]).toHaveTextContent('3');
    });

    it('should not display sub-tasks section when no sub-tasks', () => {
      render(<JobProgress job={baseJob} />);

      const subTasksContainer = screen.queryByText(/react-expert/i);
      expect(subTasksContainer).not.toBeInTheDocument();
    });

    it('should truncate long task descriptions', () => {
      const longTask = 'A'.repeat(200);
      const jobWithLongTask: Job = {
        ...baseJob,
        subTasks: [{ agentId: 'agent1', task: longTask }],
      };

      const { container } = render(<JobProgress job={jobWithLongTask} />);
      const taskElement = container.querySelector('.truncate');
      expect(taskElement).toBeInTheDocument();
    });
  });

  describe('Cancel Button', () => {
    it('should show cancel button for running jobs', () => {
      render(
        <JobProgress
          job={{ ...baseJob, status: 'running' }}
          onCancel={vi.fn()}
        />
      );

      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    });

    it('should not show cancel button for pending jobs', () => {
      render(
        <JobProgress
          job={{ ...baseJob, status: 'pending' }}
          onCancel={vi.fn()}
        />
      );

      expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument();
    });

    it('should not show cancel button for completed jobs', () => {
      render(
        <JobProgress
          job={{ ...baseJob, status: 'completed' }}
          onCancel={vi.fn()}
        />
      );

      expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument();
    });

    it('should not show cancel button when onCancel is not provided', () => {
      render(<JobProgress job={{ ...baseJob, status: 'running' }} />);

      expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument();
    });

    it('should call onCancel when cancel button is clicked', async () => {
      const user = userEvent.setup();
      const handleCancel = vi.fn();

      render(
        <JobProgress
          job={{ ...baseJob, status: 'running' }}
          onCancel={handleCancel}
        />
      );

      await user.click(screen.getByRole('button', { name: /cancel/i }));

      expect(handleCancel).toHaveBeenCalledTimes(1);
    });
  });

  describe('Cost and Time Display', () => {
    it('should display cost for completed jobs', () => {
      const jobWithCost: Job = {
        ...baseJob,
        status: 'completed',
        cost: 0.1234,
      };

      render(<JobProgress job={jobWithCost} />);

      expect(screen.getByText('Cost: $0.1234')).toBeInTheDocument();
    });

    it('should display creation time for completed jobs', () => {
      const jobWithCost: Job = {
        ...baseJob,
        status: 'completed',
        cost: 0.1234,
      };

      render(<JobProgress job={jobWithCost} />);

      // Should contain the time (format depends on locale)
      expect(screen.getByText(/Created:/)).toBeInTheDocument();
    });

    it('should not display cost/time for running jobs', () => {
      const jobWithCost: Job = {
        ...baseJob,
        status: 'running',
        cost: 0.1234,
      };

      render(<JobProgress job={jobWithCost} />);

      expect(screen.queryByText(/Cost:/)).not.toBeInTheDocument();
    });

    it('should not display cost section when cost is undefined', () => {
      const completedJob: Job = {
        ...baseJob,
        status: 'completed',
      };

      render(<JobProgress job={completedJob} />);

      expect(screen.queryByText(/Cost:/)).not.toBeInTheDocument();
    });

    it('should format cost to 4 decimal places', () => {
      const jobWithCost: Job = {
        ...baseJob,
        status: 'completed',
        cost: 0.123456789,
      };

      render(<JobProgress job={jobWithCost} />);

      expect(screen.getByText('Cost: $0.1235')).toBeInTheDocument();
    });
  });

  describe('Error Display', () => {
    it('should display error message for failed jobs', () => {
      const failedJob: Job = {
        ...baseJob,
        status: 'failed',
        error: 'Something went wrong',
      };

      render(<JobProgress job={failedJob} />);

      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });

    it('should not display error section for non-failed jobs', () => {
      const runningJob: Job = {
        ...baseJob,
        status: 'running',
        error: 'This should not show',
      };

      render(<JobProgress job={runningJob} />);

      expect(screen.queryByText('This should not show')).not.toBeInTheDocument();
    });

    it('should not display error section when no error message', () => {
      const failedJob: Job = {
        ...baseJob,
        status: 'failed',
      };

      render(<JobProgress job={failedJob} />);

      // Container should not have error section
      const errorContainer = screen.queryByText(/error/i);
      expect(errorContainer).not.toBeInTheDocument();
    });

    it('should style error message with red background', () => {
      const failedJob: Job = {
        ...baseJob,
        status: 'failed',
        error: 'Test error',
      };

      const { container } = render(<JobProgress job={failedJob} />);

      const errorBox = container.querySelector('.bg-red-500\\/10');
      expect(errorBox).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should handle jobs with empty sub-tasks array', () => {
      const jobWithEmptySubTasks: Job = {
        ...baseJob,
        subTasks: [],
      };

      render(<JobProgress job={jobWithEmptySubTasks} />);

      expect(screen.getByText('Test Job')).toBeInTheDocument();
    });

    it('should handle very long job titles', () => {
      const longTitle = 'A'.repeat(200);
      const jobWithLongTitle: Job = {
        ...baseJob,
        title: longTitle,
      };

      render(<JobProgress job={jobWithLongTitle} />);

      expect(screen.getByText(longTitle)).toBeInTheDocument();
    });

    it('should handle zero cost', () => {
      const freeJob: Job = {
        ...baseJob,
        status: 'completed',
        cost: 0,
      };

      render(<JobProgress job={freeJob} />);

      expect(screen.getByText('Cost: $0.0000')).toBeInTheDocument();
    });

    it('should handle very high cost', () => {
      const expensiveJob: Job = {
        ...baseJob,
        status: 'completed',
        cost: 999.9999,
      };

      render(<JobProgress job={expensiveJob} />);

      expect(screen.getByText('Cost: $999.9999')).toBeInTheDocument();
    });

    it('should handle invalid date in createdAt', () => {
      const jobWithInvalidDate: Job = {
        ...baseJob,
        status: 'completed',
        cost: 0.1,
        createdAt: 'invalid-date',
      };

      // Should not throw error
      render(<JobProgress job={jobWithInvalidDate} />);

      expect(screen.getByText('Test Job')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA attributes for cancel button', () => {
      render(
        <JobProgress
          job={{ ...baseJob, status: 'running' }}
          onCancel={vi.fn()}
        />
      );

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      expect(cancelButton).toBeInTheDocument();
    });

    it('should be keyboard accessible', async () => {
      const user = userEvent.setup();
      const handleCancel = vi.fn();

      render(
        <JobProgress
          job={{ ...baseJob, status: 'running' }}
          onCancel={handleCancel}
        />
      );

      const cancelButton = screen.getByRole('button', { name: /cancel/i });

      // Focus the button
      cancelButton.focus();
      expect(cancelButton).toHaveFocus();

      // Activate with keyboard
      await user.keyboard('{Enter}');
      expect(handleCancel).toHaveBeenCalled();
    });
  });

  describe('Animation Classes', () => {
    it('should apply pulse animation for running status', () => {
      const { container } = render(
        <JobProgress job={{ ...baseJob, status: 'running' }} />
      );

      const progressFill = container.querySelector('.animate-pulse');
      expect(progressFill).toBeInTheDocument();
    });

    it('should apply transition class to progress bar', () => {
      const { container } = render(
        <JobProgress job={baseJob} />
      );

      const progressFill = container.querySelector('.transition-all');
      expect(progressFill).toBeInTheDocument();
    });
  });
});
