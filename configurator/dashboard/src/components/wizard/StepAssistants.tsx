// SPDX-License-Identifier: MIT
import { useState, useEffect } from 'react';
import { Card, Badge, Checkbox } from '../common';
import { PanelSection } from '../layout';
import { API_BASE } from '@/utils/api';

/** One assistant's detection result (mirrors the server's DetectedAssistant). */
interface DetectedAssistant {
  target: string;
  displayName: string;
  present: boolean;
  markers: string[];
  devSuiteInstalled: boolean;
  implemented: boolean;
  recommended: boolean;
}

export interface StepAssistantsProps {
  projectPath: string;
  selectedAssistants: string[];
  onToggleAssistant: (target: string) => void;
  onInitAssistants: (recommendedTargets: string[]) => void;
}

export function StepAssistants({
  projectPath,
  selectedAssistants,
  onToggleAssistant,
  onInitAssistants,
}: StepAssistantsProps) {
  const [assistants, setAssistants] = useState<DetectedAssistant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [initialised, setInitialised] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/api/detect-assistants?path=${encodeURIComponent(projectPath)}`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data.assistants)) {
          const list: DetectedAssistant[] = data.assistants;
          setAssistants(list);
          // Pre-select the recommended targets only on first load.
          if (!initialised && selectedAssistants.length === 0) {
            onInitAssistants(list.filter(a => a.recommended).map(a => a.target));
            setInitialised(true);
          }
        } else {
          setError(data.error ?? 'Failed to detect assistants');
        }
      })
      .catch(() => setError('Could not connect to server'))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <PanelSection title="Target Assistants">
        <div className="flex items-center justify-center py-12">
          <svg className="w-5 h-5 animate-spin text-surface-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      </PanelSection>
    );
  }

  if (error) {
    return (
      <PanelSection title="Target Assistants">
        <p className="text-red-400 text-sm">{error}</p>
      </PanelSection>
    );
  }

  const supported = assistants.filter(a => a.implemented);
  // Assistants we can see in the project but can't configure yet (Tier 2/3).
  const detectedUnsupported = assistants.filter(a => !a.implemented && a.present);

  return (
    <PanelSection
      title="Target Assistants"
      description="Choose which AI coding assistants to generate configuration for. Assistants detected in your project are pre-selected. Agents and skills are shared, so several can coexist in one project."
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {supported.map(assistant => {
          const isSelected = selectedAssistants.includes(assistant.target);
          return (
            <Card
              key={assistant.target}
              selectable
              selected={isSelected}
              onClick={() => onToggleAssistant(assistant.target)}
              padding="sm"
            >
              <div className="flex items-start gap-3">
                {/* pointer-events-none: Card.onClick is the single toggle handler */}
                <Checkbox checked={isSelected} onChange={() => {}} className="pointer-events-none mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-white text-sm">{assistant.displayName}</span>
                    {assistant.devSuiteInstalled && (
                      <Badge variant="info" size="sm">Installed</Badge>
                    )}
                    {!assistant.devSuiteInstalled && assistant.present && (
                      <Badge variant="success" size="sm">Detected</Badge>
                    )}
                  </div>
                  {assistant.markers.length > 0 && (
                    <p className="text-xs text-surface-400 mt-1">
                      Found: {assistant.markers.slice(0, 3).join(', ')}
                    </p>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {selectedAssistants.length === 0 && (
        <p className="text-amber-400 text-xs mt-4">
          Select at least one assistant to continue.
        </p>
      )}

      {detectedUnsupported.length > 0 && (
        <p className="text-surface-500 text-xs mt-4">
          Also detected, but not configurable yet:{' '}
          {detectedUnsupported.map(a => a.displayName).join(', ')}.
        </p>
      )}
    </PanelSection>
  );
}
