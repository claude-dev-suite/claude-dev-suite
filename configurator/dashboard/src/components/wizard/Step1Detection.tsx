// SPDX-License-Identifier: MIT
import { useCallback, useEffect, useRef } from 'react';
import type { DetectionResponse } from '@/types';
import { Button, Input, Card, Badge } from '../common';
import { PanelSection } from '../layout';
import { API_BASE } from '@/utils/api';

export interface Step1DetectionProps {
  projectPath: string;
  detection: DetectionResponse | null;
  onPathChange: (path: string) => void;
  onDetection: (
    detection: DetectionResponse,
    recommendations?: { agents: string[]; mcpServers: string[] }
  ) => void;
  loading: boolean;
  setLoading: (loading: boolean) => void;
  error: string | null;
  setError: (error: string | null) => void;
}

interface DetectionCardProps {
  label: string;
  value: string | null;
  icon?: React.ReactNode;
  badge?: string;
}

function DetectionCard({ label, value, icon, badge }: DetectionCardProps) {
  return (
    <Card padding="md" className="flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs uppercase tracking-wide text-surface-400">{label}</span>
        {icon && <span className="text-surface-500">{icon}</span>}
      </div>
      <div className="flex items-center gap-2">
        {value ? (
          <>
            <span className="text-lg font-medium text-white capitalize">{value}</span>
            {badge && <Badge variant="primary">{badge}</Badge>}
          </>
        ) : (
          <span className="text-surface-400 italic">Not detected</span>
        )}
      </div>
    </Card>
  );
}

export function Step1Detection({
  projectPath,
  detection,
  onPathChange,
  onDetection,
  loading,
  setLoading,
  error,
  setError,
}: Step1DetectionProps) {
  // Track if we've already auto-detected for this path
  const autoDetectedRef = useRef<string | null>(null);

  const handleDetect = useCallback(async () => {
    if (!projectPath.trim()) {
      setError('Please enter a project path');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Detect project
      const detectRes = await fetch(`${API_BASE}/api/detect?path=${encodeURIComponent(projectPath)}`);
      if (!detectRes.ok) {
        throw new Error('Failed to detect project');
      }
      const detectionData: DetectionResponse = await detectRes.json();

      // Get recommendations
      const recsRes = await fetch(`${API_BASE}/api/recommendations?path=${encodeURIComponent(projectPath)}`);
      let recommendations = { agents: [] as string[], mcpServers: [] as string[] };
      if (recsRes.ok) {
        const recsData = await recsRes.json();
        recommendations = {
          agents: recsData.agents?.map((a: { agentId: string }) => a.agentId) || [],
          mcpServers: recsData.mcpServers?.map((m: { serverName: string }) => m.serverName) || [],
        };
      }

      onDetection(detectionData, recommendations);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Detection failed');
    } finally {
      setLoading(false);
    }
  }, [projectPath, onDetection, setLoading, setError]);

  // Auto-detect when projectPath is set (e.g., from Electron splash)
  useEffect(() => {
    if (projectPath && projectPath !== autoDetectedRef.current && !detection && !loading) {
      autoDetectedRef.current = projectPath;
      handleDetect();
    }
  }, [projectPath, detection, loading, handleDetect]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleDetect();
      }
    },
    [handleDetect]
  );

  return (
    <div className="space-y-6">
      <PanelSection
        title="Project Detection"
        description="Enter your project path to detect the technology stack"
      >
        {/* Path Input */}
        <div className="flex gap-3">
          <div className="flex-1">
            <Input
              value={projectPath}
              onChange={(e) => onPathChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter project path (e.g., /home/user/my-project)"
              error={error || undefined}
              fullWidth
              leftIcon={
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                  />
                </svg>
              }
            />
          </div>
          {window.electronAPI?.browseFolder && (
            <Button
              variant="secondary"
              onClick={async () => {
                const selected = await window.electronAPI?.browseFolder?.();
                if (selected) {
                  onPathChange(selected);
                  // Reset auto-detect ref to trigger new detection
                  autoDetectedRef.current = null;
                }
              }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z"
                />
              </svg>
            </Button>
          )}
          <Button onClick={handleDetect} loading={loading} disabled={!projectPath.trim()}>
            Detect
          </Button>
        </div>
      </PanelSection>

      {/* Detection Results */}
      {detection && (
        <PanelSection title="Detection Results">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <DetectionCard
              label="Project Type"
              value={detection.project_type}
              badge={detection.is_monorepo ? 'Monorepo' : undefined}
            />
            <DetectionCard
              label="Frontend"
              value={detection.frontend?.framework || null}
              badge={detection.frontend?.meta_framework || undefined}
            />
            <DetectionCard
              label="Backend"
              value={detection.backend?.framework || null}
              badge={detection.backend?.runtime || undefined}
            />
            <DetectionCard
              label="Database"
              value={detection.database?.db_type || null}
              badge={detection.database?.orm || undefined}
            />
          </div>

          {/* Confidence Indicator */}
          <div className="mt-6 flex items-center gap-4">
            <span className="text-sm text-surface-400">Detection Confidence:</span>
            <div className="flex-1 h-2 bg-surface-700 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${
                  detection.confidence >= 80
                    ? 'bg-green-500'
                    : detection.confidence >= 50
                    ? 'bg-yellow-500'
                    : 'bg-red-500'
                }`}
                style={{ width: `${detection.confidence}%` }}
              />
            </div>
            <span className="text-sm font-medium text-white">{detection.confidence}%</span>
          </div>

          {/* Testing Info - only show if at least one testing framework detected */}
          {(detection.testing?.unit || detection.testing?.e2e) && (
            <div className="mt-4 p-4 bg-surface-700/30 rounded-lg">
              <h4 className="text-sm font-medium text-surface-300 mb-2">Testing Frameworks</h4>
              <div className="flex gap-2">
                {detection.testing.unit && (
                  <Badge variant="info">{detection.testing.unit}</Badge>
                )}
                {detection.testing.e2e && (
                  <Badge variant="info">{detection.testing.e2e}</Badge>
                )}
              </div>
            </div>
          )}
        </PanelSection>
      )}

      {/* Empty State */}
      {!detection && !loading && (
        <div className="text-center py-12">
          <svg
            className="w-16 h-16 mx-auto text-surface-600 mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <h3 className="text-lg font-medium text-surface-300 mb-2">
            Ready to Detect Your Project
          </h3>
          <p className="text-sm text-surface-400 max-w-md mx-auto">
            Enter the path to your project and click "Detect" to analyze the technology stack.
            We'll automatically recommend agents and MCP servers based on your setup.
          </p>
        </div>
      )}
    </div>
  );
}
