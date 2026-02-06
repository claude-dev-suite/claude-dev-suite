// SPDX-License-Identifier: MIT
import { useCallback } from 'react';
import { Header } from './Header';
import { Sidebar, type WizardStep } from './Sidebar';
import { MainContent } from './MainContent';
import { ToolWindowBar } from './ToolWindowBar';
import { ToolWindowPanel } from './ToolWindowPanel';
import { BottomToolBar } from './BottomToolBar';
import { BottomToolPanel } from './BottomToolPanel';
import { useUIStore } from '../../stores/ui.store';

export interface LayoutProps {
  children: React.ReactNode;
  // Optional wizard configuration
  wizardSteps?: WizardStep[];
  showSidebar?: boolean;
}

export function Layout({
  children,
  wizardSteps,
  showSidebar = true,
}: LayoutProps) {
  // Get state from stores
  const currentPanel = useUIStore((s) => s.currentPanel);
  const wizardStep = useUIStore((s) => s.currentStep);
  const setWizardStep = useUIStore((s) => s.setStep);
  const activeToolWindow = useUIStore((s) => s.activeToolWindow);
  const activeBottomToolWindow = useUIStore((s) => s.activeBottomToolWindow);

  const canNavigateToStep = useCallback(
    (step: number) => {
      // Can navigate to any completed step or current step
      return step <= wizardStep;
    },
    [wizardStep]
  );

  // Prepare wizard steps with status
  const stepsWithStatus: WizardStep[] = (
    wizardSteps || [
      { id: 1, label: 'Detection', description: 'Analyze project' },
      { id: 2, label: 'Agents', description: 'Select agents' },
      { id: 3, label: 'MCP Servers', description: 'Configure tools' },
      { id: 4, label: 'Environment', description: 'Set variables' },
      { id: 5, label: 'Install', description: 'Finalize setup' },
    ]
  ).map((step) => ({
    ...step,
    status:
      step.id < wizardStep
        ? 'completed'
        : step.id === wizardStep
        ? 'active'
        : 'pending',
  })) as WizardStep[];

  return (
    <div className="flex flex-col h-screen bg-surface-900">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        {/* Left side: Sidebar + Bottom bar */}
        <div className="flex flex-col">
          {/* Left Sidebar (Wizard steps) */}
          {showSidebar && currentPanel === 'wizard' && (
            <Sidebar
              mode="wizard"
              steps={stepsWithStatus}
              currentStep={wizardStep}
              onStepClick={setWizardStep}
              canNavigateToStep={canNavigateToStep}
            />
          )}
        </div>

        {/* Center area: Main content + bottom panel */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Main Content Area */}
          <div className="flex-1 flex overflow-hidden">
            <MainContent>{children}</MainContent>
          </div>

          {/* Bottom Tool Panel (if open) */}
          {activeBottomToolWindow && <BottomToolPanel />}

          {/* Bottom Tool Bar */}
          <BottomToolBar />
        </div>

        {/* Right Side: Tool Window Panel + Tool Window Bar */}
        {activeToolWindow && <ToolWindowPanel />}
        <ToolWindowBar />
      </div>
    </div>
  );
}
