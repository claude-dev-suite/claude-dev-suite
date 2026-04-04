// SPDX-License-Identifier: MIT
import { useState, useCallback } from 'react';
import type { DetectionResponse, InstallationResponse } from '@/types';
import { Button, Badge, Spinner } from '../common';
import { PanelSection } from '../layout';
import { API_BASE } from '@/utils/api';
import clsx from 'clsx';

export interface Step5InstallProps {
  projectPath: string;
  selectedAgents: string[];
  selectedMcpServers: string[];
  selectedRules: string[];
  envVars: Record<string, string>;
  detection: DetectionResponse | null;
  onComplete: () => void;
}

type InstallStep = {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  error?: string;
};

export function Step5Install({
  projectPath,
  selectedAgents,
  selectedMcpServers,
  selectedRules,
  envVars,
  detection,
  onComplete,
}: Step5InstallProps) {
  const [installing, setInstalling] = useState(false);
  const [installComplete, setInstallComplete] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);
  const [steps, setSteps] = useState<InstallStep[]>([
    { id: 'prepare', label: 'Preparing MCP servers', status: 'pending' },
    { id: 'agents', label: 'Installing agents', status: 'pending' },
    { id: 'skills', label: 'Copying skills', status: 'pending' },
    { id: 'mcp', label: 'Configuring MCP servers', status: 'pending' },
    { id: 'config', label: 'Generating configuration', status: 'pending' },
    { id: 'finalize', label: 'Finalizing installation', status: 'pending' },
  ]);
  const [installResult, setInstallResult] = useState<InstallationResponse | null>(null);

  const updateStep = useCallback((stepId: string, status: InstallStep['status'], error?: string) => {
    setSteps((prev) =>
      prev.map((step) =>
        step.id === stepId ? { ...step, status, error } : step
      )
    );
  }, []);

  const handleInstall = useCallback(async () => {
    setInstalling(true);
    setInstallError(null);

    try {
      // Step 1: Prepare MCP servers
      updateStep('prepare', 'running');
      const prepareRes = await fetch(`${API_BASE}/api/prepare-servers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverNames: selectedMcpServers }),
      });
      if (!prepareRes.ok) {
        const errBody = await prepareRes.json().catch(() => ({})) as { error?: string };
        throw new Error(errBody.error || 'Failed to prepare MCP servers');
      }
      updateStep('prepare', 'completed');

      // Step 2-5: Install
      updateStep('agents', 'running');
      const installRes = await fetch(`${API_BASE}/api/install`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectPath,
          agents: selectedAgents,
          mcpServers: selectedMcpServers,
          rules: selectedRules,
          envVars,
          detectedStack: detection ? {
            projectType: detection.project_type,
            frontend: detection.frontend,
            backend: detection.backend,
            database: detection.database,
            testing: detection.testing,
            isMonorepo: detection.is_monorepo,
            confidence: detection.confidence,
          } : undefined,
        }),
      });

      if (!installRes.ok) {
        throw new Error('Installation failed');
      }

      const result: InstallationResponse = await installRes.json();

      // Mark remaining steps as completed
      updateStep('agents', 'completed');
      updateStep('skills', 'completed');
      updateStep('mcp', 'completed');
      updateStep('config', 'completed');
      updateStep('finalize', 'completed');

      if (result.success) {
        setInstallResult(result);
        setInstallComplete(true);
      } else {
        throw new Error(result.error || 'Installation failed');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Installation failed';
      setInstallError(errorMessage);
      // Mark current running step as failed
      setSteps((prev) =>
        prev.map((step) =>
          step.status === 'running' ? { ...step, status: 'failed', error: errorMessage } : step
        )
      );
    } finally {
      setInstalling(false);
    }
  }, [projectPath, selectedAgents, selectedMcpServers, selectedRules, envVars, detection, updateStep]);

  return (
    <div className="space-y-6">
      {/* Summary */}
      <PanelSection title="Installation Summary">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="p-4 bg-surface-700/30 rounded-lg">
            <div className="text-2xl font-bold text-white">{selectedAgents.length}</div>
            <div className="text-sm text-surface-400">Agents</div>
          </div>
          <div className="p-4 bg-surface-700/30 rounded-lg">
            <div className="text-2xl font-bold text-white">{selectedMcpServers.length}</div>
            <div className="text-sm text-surface-400">MCP Servers</div>
          </div>
          <div className="p-4 bg-surface-700/30 rounded-lg">
            <div className="text-2xl font-bold text-white">{selectedRules.length}</div>
            <div className="text-sm text-surface-400">Rules</div>
          </div>
          <div className="p-4 bg-surface-700/30 rounded-lg">
            <div className="text-2xl font-bold text-white">{Object.keys(envVars).length}</div>
            <div className="text-sm text-surface-400">Env Variables</div>
          </div>
        </div>

        {/* Selected Items */}
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h4 className="text-sm font-medium text-surface-300 mb-2">Selected Agents</h4>
            <div className="flex flex-wrap gap-2">
              {selectedAgents.map((agent) => (
                <Badge key={agent} variant="primary">{agent}</Badge>
              ))}
            </div>
          </div>
          <div>
            <h4 className="text-sm font-medium text-surface-300 mb-2">Selected MCP Servers</h4>
            <div className="flex flex-wrap gap-2">
              {selectedMcpServers.map((server) => (
                <Badge key={server} variant="info">{server}</Badge>
              ))}
            </div>
          </div>
        </div>
      </PanelSection>

      {/* Installation Progress */}
      <PanelSection title="Installation Progress">
        <div className="space-y-3">
          {steps.map((step) => (
            <div
              key={step.id}
              className={clsx(
                'flex items-center gap-3 p-3 rounded-lg transition-colors',
                step.status === 'running' && 'bg-primary-500/10 border border-primary-500/30',
                step.status === 'completed' && 'bg-green-500/10',
                step.status === 'failed' && 'bg-red-500/10 border border-red-500/30'
              )}
            >
              {/* Status Icon */}
              <div className="w-6 h-6 flex items-center justify-center">
                {step.status === 'pending' && (
                  <div className="w-2 h-2 rounded-full bg-surface-500" />
                )}
                {step.status === 'running' && <Spinner size="sm" />}
                {step.status === 'completed' && (
                  <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
                {step.status === 'failed' && (
                  <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                )}
              </div>

              {/* Label */}
              <span
                className={clsx(
                  'text-sm',
                  step.status === 'pending' && 'text-surface-400',
                  step.status === 'running' && 'text-primary-400',
                  step.status === 'completed' && 'text-green-400',
                  step.status === 'failed' && 'text-red-400'
                )}
              >
                {step.label}
              </span>

              {/* Error */}
              {step.error && (
                <span className="text-xs text-red-400 ml-auto">{step.error}</span>
              )}
            </div>
          ))}
        </div>

        {/* Error Message */}
        {installError && (
          <div className="mt-4 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
            <div className="flex items-center gap-2 text-red-400">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <span className="font-medium">Installation Failed</span>
            </div>
            <p className="mt-2 text-sm text-red-300">{installError}</p>
          </div>
        )}

        {/* Success Message */}
        {installComplete && installResult && (
          <div className="mt-4 p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
            <div className="flex items-center gap-2 text-green-400">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span className="font-medium">Installation Complete!</span>
            </div>
            {installResult.summary && (
              <p className="mt-2 text-sm text-green-300">{installResult.summary}</p>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="mt-6 flex items-center justify-center gap-4">
          {!installing && !installComplete && (
            <Button onClick={handleInstall} size="lg">
              Start Installation
            </Button>
          )}
          {installComplete && (
            <Button onClick={onComplete} size="lg" variant="primary">
              Go to Management
            </Button>
          )}
          {installError && !installing && (
            <Button onClick={handleInstall} variant="secondary">
              Retry Installation
            </Button>
          )}
        </div>
      </PanelSection>
    </div>
  );
}
