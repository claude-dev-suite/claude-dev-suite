// SPDX-License-Identifier: MIT
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useUIStore } from '@/stores/ui.store';

// Mock WizardContainer component for testing
const WizardContainer = () => {
  const { currentStep, nextStep, prevStep } = useUIStore();

  return (
    <div>
      <h1>Step {currentStep} of 5</h1>
      <div>
        {currentStep === 1 && <div>Project Detection</div>}
        {currentStep === 2 && <div>Select Agents</div>}
        {currentStep === 3 && <div>Select MCP Servers</div>}
        {currentStep === 4 && <div>Environment Variables</div>}
        {currentStep === 5 && <div>Installation</div>}
      </div>
      <div>
        <button onClick={prevStep} disabled={currentStep === 1}>
          Previous
        </button>
        <button onClick={nextStep} disabled={currentStep === 5}>
          Next
        </button>
      </div>
    </div>
  );
};

describe('WizardContainer', () => {
  beforeEach(() => {
    useUIStore.getState().reset();
  });

  it('should render current step', () => {
    render(<WizardContainer />);

    expect(screen.getByText('Step 1 of 5')).toBeInTheDocument();
    expect(screen.getByText('Project Detection')).toBeInTheDocument();
  });

  it('should navigate to next step', async () => {
    const user = userEvent.setup();

    render(<WizardContainer />);

    await user.click(screen.getByText('Next'));

    expect(screen.getByText('Step 2 of 5')).toBeInTheDocument();
    expect(screen.getByText('Select Agents')).toBeInTheDocument();
  });

  it('should navigate to previous step', async () => {
    const user = userEvent.setup();

    // Start at step 2
    useUIStore.getState().setStep(2);

    render(<WizardContainer />);

    await user.click(screen.getByText('Previous'));

    expect(screen.getByText('Step 1 of 5')).toBeInTheDocument();
  });

  it('should disable Previous button on first step', () => {
    render(<WizardContainer />);

    const prevButton = screen.getByText('Previous');
    expect(prevButton).toBeDisabled();
  });

  it('should disable Next button on last step', () => {
    useUIStore.getState().setStep(5);

    render(<WizardContainer />);

    const nextButton = screen.getByText('Next');
    expect(nextButton).toBeDisabled();
  });

  it('should show correct content for each step', () => {
    const { rerender } = render(<WizardContainer />);

    expect(screen.getByText('Project Detection')).toBeInTheDocument();

    useUIStore.getState().setStep(2);
    rerender(<WizardContainer />);
    expect(screen.getByText('Select Agents')).toBeInTheDocument();

    useUIStore.getState().setStep(3);
    rerender(<WizardContainer />);
    expect(screen.getByText('Select MCP Servers')).toBeInTheDocument();

    useUIStore.getState().setStep(4);
    rerender(<WizardContainer />);
    expect(screen.getByText('Environment Variables')).toBeInTheDocument();

    useUIStore.getState().setStep(5);
    rerender(<WizardContainer />);
    expect(screen.getByText('Installation')).toBeInTheDocument();
  });

  it('should navigate through all steps', async () => {
    const user = userEvent.setup();

    render(<WizardContainer />);

    // Step 1 -> 2
    await user.click(screen.getByText('Next'));
    expect(screen.getByText('Step 2 of 5')).toBeInTheDocument();

    // Step 2 -> 3
    await user.click(screen.getByText('Next'));
    expect(screen.getByText('Step 3 of 5')).toBeInTheDocument();

    // Step 3 -> 2
    await user.click(screen.getByText('Previous'));
    expect(screen.getByText('Step 2 of 5')).toBeInTheDocument();
  });
});
