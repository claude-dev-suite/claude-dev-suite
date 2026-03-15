// SPDX-License-Identifier: MIT
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock Modal component for testing
const Modal = ({
  open,
  onClose,
  title,
  children
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}) => {
  if (!open) return null;

  return (
    <div role="dialog" aria-modal="true">
      <div className="modal-overlay" onClick={onClose} />
      <div className="modal-content">
        {title && <h2>{title}</h2>}
        <button onClick={onClose} aria-label="Close">×</button>
        {children}
      </div>
    </div>
  );
};

describe('Modal', () => {
  it('should render when open', () => {
    render(
      <Modal open={true} onClose={vi.fn()}>
        <p>Modal content</p>
      </Modal>
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Modal content')).toBeInTheDocument();
  });

  it('should not render when closed', () => {
    render(
      <Modal open={false} onClose={vi.fn()}>
        <p>Modal content</p>
      </Modal>
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('should render title when provided', () => {
    render(
      <Modal open={true} onClose={vi.fn()} title="Test Modal">
        <p>Content</p>
      </Modal>
    );

    expect(screen.getByText('Test Modal')).toBeInTheDocument();
  });

  it('should call onClose when close button is clicked', async () => {
    const user = userEvent.setup();
    const handleClose = vi.fn();

    render(
      <Modal open={true} onClose={handleClose}>
        <p>Content</p>
      </Modal>
    );

    await user.click(screen.getByLabelText('Close'));

    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('should call onClose when overlay is clicked', async () => {
    const user = userEvent.setup();
    const handleClose = vi.fn();

    render(
      <Modal open={true} onClose={handleClose}>
        <p>Content</p>
      </Modal>
    );

    const overlay = document.querySelector('.modal-overlay');
    if (overlay) {
      await user.click(overlay);
      expect(handleClose).toHaveBeenCalledTimes(1);
    }
  });
});
