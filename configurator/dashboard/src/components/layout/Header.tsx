// SPDX-License-Identifier: MIT
import { useCallback } from 'react';
import clsx from 'clsx';
import { useProjectStore } from '../../stores/project.store';
import { useUIStore } from '../../stores/ui.store';
import { UpdateNotification } from '../common/UpdateNotification';
import { useTutorial } from '../../hooks/useTutorial';
import { API_BASE } from '../../utils/api';

export type PanelType = 'wizard' | 'orchestrator' | 'code-review' | 'codegen' | 'usage' | 'live-performance' | 'token-analytics';

interface TabConfig {
  id: PanelType;
  label: string;
  icon: string;
  position: 'left' | 'center' | 'right';
  showWhen?: 'always' | 'installed' | 'not-installed';
}

const tabs: TabConfig[] = [
  // Center - main tabs (core functionality)
  { id: 'orchestrator', label: 'Orchestrator', icon: 'M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z', position: 'center', showWhen: 'installed' },
  { id: 'code-review', label: 'Code Review', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4', position: 'center', showWhen: 'installed' },
  { id: 'codegen', label: 'Code Generator', icon: 'M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4', position: 'center', showWhen: 'installed' },
  { id: 'usage', label: 'Usage', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z', position: 'center', showWhen: 'installed' },
  { id: 'live-performance', label: 'Live Performance', icon: 'M13 10V3L4 14h7v7l9-11h-7z', position: 'center', showWhen: 'installed' },
  { id: 'token-analytics', label: 'Token Analytics', icon: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', position: 'center', showWhen: 'installed' },
  // Right side - setup (only when not installed)
  { id: 'wizard', label: 'Setup Wizard', icon: 'M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4', position: 'right', showWhen: 'not-installed' },
];

export function Header() {
  // Get state from stores
  const projectPath = useProjectStore((s) => s.projectPath);
  const setProjectPath = useProjectStore((s) => s.setProjectPath);
  const isInstalled = useProjectStore((s) => s.isInstalled);
  const setIsInstalled = useProjectStore((s) => s.setIsInstalled);
  const currentPanel = useUIStore((s) => s.currentPanel);
  const serverConnected = useUIStore((s) => s.serverConnected);
  const setPanel = useUIStore((s) => s.setPanel);
  const setStep = useUIStore((s) => s.setStep);

  // Tutorial
  const { start: startTutorial } = useTutorial();

  // Handle changing the project folder
  const handleChangeFolder = useCallback(async () => {
    if (!window.electronAPI?.browseFolder) return;

    const selected = await window.electronAPI.browseFolder();
    if (!selected) return;

    setProjectPath(selected);

    // Check if dev-suite is installed in the new path
    try {
      const res = await fetch(
        `${API_BASE}/api/installed-components?path=${encodeURIComponent(selected)}`
      );
      if (res.ok) {
        const data = await res.json();
        setIsInstalled(data.installed);

        if (data.installed) {
          // Go to orchestrator if installed
          setPanel('orchestrator');
        } else {
          // Go to wizard step 1 if not installed
          setPanel('wizard');
          setStep(1);
        }
      }
    } catch {
      // On error, assume not installed and go to wizard
      setIsInstalled(false);
      setPanel('wizard');
      setStep(1);
    }
  }, [setProjectPath, setIsInstalled, setPanel, setStep]);
  return (
    <header className="border-b border-surface-700 bg-surface-800">
      <div className="flex items-center justify-between px-6 py-3">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-br from-primary-500 to-primary-600 rounded-lg flex items-center justify-center shadow-lg">
            <span className="text-white font-bold text-sm">DS</span>
          </div>
          <div>
            <h1 className="text-lg font-semibold text-white">Dev-Suite</h1>
            <p className="text-xs text-surface-400">Dashboard v2</p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex items-center gap-4">
          {/* Center tabs - main functionality */}
          {tabs.filter((tab) => tab.position === 'center').some((tab) => {
            if (tab.showWhen === 'installed') return isInstalled;
            if (tab.showWhen === 'not-installed') return !isInstalled;
            return true;
          }) && (
            <div className="flex items-center gap-1 px-3 py-1 bg-surface-900/50 rounded-lg" data-tutorial="header-tabs">
              {tabs
                .filter((tab) => tab.position === 'center')
                .filter((tab) => {
                  if (tab.showWhen === 'installed') return isInstalled;
                  if (tab.showWhen === 'not-installed') return !isInstalled;
                  return true;
                })
                .map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setPanel(tab.id)}
                    className={clsx(
                      'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                      currentPanel === tab.id
                        ? 'bg-primary-500/20 text-primary-400'
                        : 'text-surface-400 hover:text-white hover:bg-surface-700'
                    )}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={tab.icon} />
                    </svg>
                    {tab.label}
                  </button>
                ))}
            </div>
          )}

          {/* Right tabs - setup wizard (only when not installed) */}
          {tabs
            .filter((tab) => tab.position === 'right')
            .filter((tab) => {
              if (tab.showWhen === 'installed') return isInstalled;
              if (tab.showWhen === 'not-installed') return !isInstalled;
              return true;
            })
            .map((tab) => (
              <button
                key={tab.id}
                onClick={() => setPanel(tab.id)}
                className={clsx(
                  'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all',
                  currentPanel === tab.id
                    ? 'bg-amber-500/20 text-amber-400'
                    : 'text-surface-500 hover:text-surface-300 hover:bg-surface-700/50'
                )}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={tab.icon} />
                </svg>
                {tab.label}
              </button>
            ))}
        </nav>

        {/* Status Indicators */}
        <div className="flex items-center gap-4">
          {/* Tutorial Help Button */}
          {isInstalled && (
            <button
              onClick={startTutorial}
              className="flex items-center justify-center w-7 h-7 rounded-full
                bg-surface-700 hover:bg-surface-600 text-surface-300 hover:text-white
                transition-colors duration-150 text-sm font-medium"
              title="Start tutorial tour"
              data-tutorial="help-btn"
            >
              ?
            </button>
          )}

          {/* Auto-Update Notification */}
          <UpdateNotification />

          {/* Project Path */}
          {projectPath && (
            <button
              onClick={handleChangeFolder}
              className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg hover:bg-surface-700 transition-colors group"
              title={`${projectPath}\n\nClick to change project folder`}
            >
              <svg
                className="w-4 h-4 text-surface-400 group-hover:text-surface-300"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                />
              </svg>
              <span className="text-surface-300 max-w-[200px] truncate group-hover:text-white">
                {projectPath.split(/[/\\]/).pop()}
              </span>
              <svg
                className="w-3 h-3 text-surface-500 group-hover:text-surface-300"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </button>
          )}

          {/* Installation Status */}
          {isInstalled && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-green-500/10 border border-green-500/30 rounded-full">
              <svg
                className="w-4 h-4 text-green-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              <span className="text-xs text-green-400 font-medium">Installed</span>
            </div>
          )}

          {/* Server Status */}
          <div className="flex items-center gap-2">
            <span
              className={clsx(
                'w-2 h-2 rounded-full',
                serverConnected ? 'bg-green-500' : 'bg-red-500 animate-pulse'
              )}
            />
            <span className="text-xs text-surface-400">
              {serverConnected ? 'Connected' : 'Offline'}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
