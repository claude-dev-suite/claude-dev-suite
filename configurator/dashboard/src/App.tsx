// SPDX-License-Identifier: MIT
import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { Layout } from './components/layout';
import { WizardContainer } from './components/wizard';
import { ToastContainer, ErrorBoundary, ErrorFallback, LoadingPanel } from './components/common';
import { ManageModal } from './components/manage/ManageModal';
import { TutorialProvider } from './components/tutorial';
import { createTutorialSteps } from './components/tutorial/tutorial-steps';
import { useToast } from './hooks';
import { API_BASE } from './utils/api';
import { useProjectStore } from './stores/project.store';
import { useUIStore } from './stores/ui.store';
import { useTutorialStore } from './stores/tutorial.store';
import { getLogger } from './utils/logger';

// Lazy load heavy panels
const OrchestratorPanel = lazy(() =>
  import('./components/orchestrator/OrchestratorPanel').then(module => ({ default: module.OrchestratorPanel }))
);
const CodeReviewPanel = lazy(() =>
  import('./components/manage/CodeReviewPanel').then(module => ({ default: module.CodeReviewPanel }))
);
const CodeGenPanel = lazy(() =>
  import('./components/codegen/CodeGenPanel').then(module => ({ default: module.CodeGenPanel }))
);
const UsagePanel = lazy(() =>
  import('./components/usage/UsagePanel').then(module => ({ default: module.UsagePanel }))
);
const LivePerformancePanel = lazy(() =>
  import('./components/live-performance/LivePerformancePanel').then(module => ({ default: module.LivePerformancePanel }))
);
const TokenAnalyticsPanel = lazy(() =>
  import('./components/analytics/TokenAnalyticsPanel').then(module => ({ default: module.TokenAnalyticsPanel }))
);

export function App() {
  const logger = getLogger('App');

  // Pending job for orchestrator (from code review)
  const [pendingJob, setPendingJob] = useState<unknown>(null);

  // Toast notifications (uses global Zustand store)
  const { success } = useToast();

  // Project store state
  const projectPath = useProjectStore((s) => s.projectPath);
  const setProjectPath = useProjectStore((s) => s.setProjectPath);
  const isInstalled = useProjectStore((s) => s.isInstalled);
  const setIsInstalled = useProjectStore((s) => s.setIsInstalled);

  // UI store state
  const currentPanel = useUIStore((s) => s.currentPanel);
  const setCurrentPanel = useUIStore((s) => s.setPanel);
  const wizardStep = useUIStore((s) => s.currentStep);
  const setWizardStep = useUIStore((s) => s.setStep);
  const setServerConnected = useUIStore((s) => s.setServerConnected);

  // Check server health on mount
  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await fetch(`${API_BASE}/health`);
        if (res.ok) {
          setServerConnected(true);
        } else {
          setServerConnected(false);
        }
      } catch {
        setServerConnected(false);
      }
    };

    checkHealth();

    // Periodic health check
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, [setServerConnected]);

  // Get project path from URL or electron
  useEffect(() => {
    // Check URL params
    const params = new URLSearchParams(window.location.search);
    const pathParam = params.get('path');
    if (pathParam) {
      setProjectPath(pathParam);
    }

    // Check if we're in Electron
    if (window.electronAPI?.getProjectPath) {
      void window.electronAPI.getProjectPath().then((path: string) => {
        if (path) setProjectPath(path);
      });
    }
  }, [setProjectPath]);

  // One-shot latch: the "installed → leave the wizard" redirect must fire once
  // per session, never again after the user navigates back to the wizard.
  const hasLeftWizard = useRef(false);

  // Check if dev-suite is installed
  useEffect(() => {
    const checkInstalled = async () => {
      if (!projectPath) return;

      try {
        const res = await fetch(
          `${API_BASE}/api/installed-components?path=${encodeURIComponent(projectPath)}`
        );
        if (res.ok) {
          const data = await res.json();
          setIsInstalled(data.installed);
          // If installed, leave the wizard for the orchestrator — but only the
          // first time we learn this for a given project. `currentPanel` used to
          // be an effect dependency, so re-running after the user *chose* the
          // wizard from the header bounced them straight back: an installed
          // project could never reach the wizard again, and adding a second
          // assistant target became impossible.
          if (data.installed && !hasLeftWizard.current && currentPanel === 'wizard') {
            hasLeftWizard.current = true;
            setCurrentPanel('orchestrator');
          }
        }
      } catch {
        // Ignore errors
      }
    };

    checkInstalled();
    // `currentPanel` is deliberately read but not depended on — see above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectPath, setIsInstalled, setCurrentPanel]);

  // Redirect to wizard if not installed and on a panel that requires installation
  useEffect(() => {
    if (!isInstalled && (currentPanel === 'orchestrator' || currentPanel === 'code-review' || currentPanel === 'codegen' || currentPanel === 'usage' || currentPanel === 'live-performance' || currentPanel === 'token-analytics')) {
      setCurrentPanel('wizard');
      setWizardStep(1);
    }
  }, [isInstalled, currentPanel, setCurrentPanel, setWizardStep]);

  // Handle wizard completion
  const handleWizardComplete = useCallback(() => {
    setIsInstalled(true);
    setCurrentPanel('orchestrator');
    success('Dev-Suite installed successfully!');

    // Auto-start tutorial for first-time users
    if (!localStorage.getItem('dev-suite-tutorial-completed')) {
      setTimeout(() => {
        const ui = useUIStore.getState();
        const steps = createTutorialSteps({
          setPanel: ui.setPanel,
          openModal: ui.openModal,
          closeModal: ui.closeModal,
          openToolWindow: ui.openToolWindow,
          closeToolWindow: ui.closeToolWindow,
          closeAllToolWindows: ui.closeAllToolWindows,
        });
        useTutorialStore.getState().startTutorial(steps);
      }, 800);
    }
  }, [setIsInstalled, setCurrentPanel, success]);

  // Handle start review - navigate to orchestrator with job
  const handleStartReview = useCallback((job: unknown) => {
    setPendingJob(job);
    setCurrentPanel('orchestrator');
  }, [setCurrentPanel]);

  // Render current panel content with granular error boundaries
  // OrchestratorPanel is always mounted to preserve console output state
  const renderPanel = () => {
    return (
      <>
        {/* Wizard panel */}
        {currentPanel === 'wizard' && (
          <ErrorBoundary
            fallback={
              <ErrorFallback
                showHomeButton={false}
                resetError={() => setWizardStep(1)}
              />
            }
          >
            <WizardContainer
              initialPath={projectPath}
              onComplete={handleWizardComplete}
              currentStep={wizardStep}
              onStepChange={setWizardStep}
            />
          </ErrorBoundary>
        )}

        {/* Orchestrator panel - only mounted when installed, hidden when not active */}
        {projectPath && isInstalled && (
          <div className={currentPanel === 'orchestrator' ? 'block h-full' : 'hidden'}>
            <ErrorBoundary
              fallback={
                <ErrorFallback
                  showHomeButton={true}
                  onHome={() => setCurrentPanel('wizard')}
                />
              }
            >
              <Suspense fallback={<LoadingPanel message="Loading Orchestrator..." />}>
                <OrchestratorPanel
                  projectPath={projectPath}
                  pendingJob={pendingJob}
                  onJobSent={() => setPendingJob(null)}
                />
              </Suspense>
            </ErrorBoundary>
          </div>
        )}

        {/* Code Review panel - only shown when installed */}
        {currentPanel === 'code-review' && projectPath && isInstalled && (
          <div className="p-6">
            <ErrorBoundary
              fallback={
                <ErrorFallback
                  showHomeButton={true}
                  onHome={() => setCurrentPanel('orchestrator')}
                />
              }
            >
              <Suspense fallback={<LoadingPanel message="Loading Code Review..." />}>
                <CodeReviewPanel projectPath={projectPath} onStartReview={handleStartReview} />
              </Suspense>
            </ErrorBoundary>
          </div>
        )}

        {/* Code Generator panel */}
        {currentPanel === 'codegen' && projectPath && isInstalled && (
          <div className="h-full">
            <ErrorBoundary
              fallback={
                <ErrorFallback
                  showHomeButton={true}
                  onHome={() => setCurrentPanel('orchestrator')}
                />
              }
            >
              <Suspense fallback={<LoadingPanel message="Loading Code Generator..." />}>
                <CodeGenPanel projectPath={projectPath} onStartRefinement={handleStartReview} />
              </Suspense>
            </ErrorBoundary>
          </div>
        )}

        {/* Usage Monitor panel */}
        {currentPanel === 'usage' && projectPath && isInstalled && (
          <div className="h-full">
            <ErrorBoundary
              fallback={
                <ErrorFallback
                  showHomeButton={true}
                  onHome={() => setCurrentPanel('orchestrator')}
                />
              }
            >
              <Suspense fallback={<LoadingPanel message="Loading Usage Monitor..." />}>
                <UsagePanel projectPath={projectPath} />
              </Suspense>
            </ErrorBoundary>
          </div>
        )}

        {/* Live Performance panel */}
        {currentPanel === 'live-performance' && projectPath && isInstalled && (
          <div className="p-6 h-full">
            <ErrorBoundary
              fallback={
                <ErrorFallback
                  showHomeButton={true}
                  onHome={() => setCurrentPanel('orchestrator')}
                />
              }
            >
              <Suspense fallback={<LoadingPanel message="Loading Live Performance..." />}>
                <LivePerformancePanel projectPath={projectPath} />
              </Suspense>
            </ErrorBoundary>
          </div>
        )}

        {/* Token Analytics panel */}
        {currentPanel === 'token-analytics' && projectPath && isInstalled && (
          <div className="h-full">
            <ErrorBoundary
              fallback={
                <ErrorFallback
                  showHomeButton={true}
                  onHome={() => setCurrentPanel('orchestrator')}
                />
              }
            >
              <Suspense fallback={<LoadingPanel message="Loading Token Analytics..." />}>
                <TokenAnalyticsPanel projectPath={projectPath} />
              </Suspense>
            </ErrorBoundary>
          </div>
        )}
      </>
    );
  };

  return (
    <ErrorBoundary
      fallback={<ErrorFallback showHomeButton={false} />}
      onError={(error, errorInfo) => {
        logger.error('Critical error', { error, errorInfo });
      }}
    >
      <TutorialProvider>
        <Layout showSidebar={currentPanel === 'wizard'}>
          {renderPanel()}
        </Layout>

        {/* Manage Modal - full-screen overlay */}
        <ManageModal />
      </TutorialProvider>

      {/* Toast Notifications - reads from global Zustand store */}
      <ToastContainer />
    </ErrorBoundary>
  );
}

// Extend Window interface for Electron API
declare global {
  interface Window {
    electronAPI?: {
      getProjectPath?: () => Promise<string>;
      browseFolder?: () => Promise<string | null>;
      openExternal?: (url: string) => Promise<{ success: boolean; error?: string }>;
    };
  }
}
