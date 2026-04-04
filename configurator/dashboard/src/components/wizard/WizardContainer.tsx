// SPDX-License-Identifier: MIT
import { useState, useCallback, useEffect, useRef } from 'react';
import type { DetectionResponse, WizardMode, ScaffoldResult } from '@/types';
import { ModeSelection } from './ModeSelection';
import { Step0TemplateSelect } from './Step0TemplateSelect';
import { Step0TemplateConfig } from './Step0TemplateConfig';
import { Step1Detection } from './Step1Detection';
import { Step2Agents } from './Step2Agents';
import { Step3McpServers } from './Step3McpServers';
import { Step4Environment } from './Step4Environment';
import { Step5Install } from './Step5Install';
import { StepRules } from './StepRules';
import { Button } from '../common';

export interface WizardState {
  projectPath: string;
  detection: DetectionResponse | null;
  selectedAgents: string[];
  selectedMcpServers: string[];
  selectedRules: string[];
  envVars: Record<string, string>;
  recommendedAgents: string[];
  recommendedMcpServers: string[];
}

export interface WizardContainerProps {
  initialPath?: string;
  onComplete: () => void;
  onStepChange?: (step: number) => void;
  currentStep?: number;
}

/**
 * WizardContainer with support for two modes:
 * - "configure": Configure an existing project (original flow)
 * - "create": Create a new project from template (new flow)
 *
 * Step flow for "configure" mode:
 *   1: Detection -> 2: Agents -> 3: MCP Servers -> 4: Environment -> 5: Install
 *
 * Step flow for "create" mode:
 *   0a: Template Selection -> 0b: Template Config -> [scaffold] -> 1: Detection -> ...
 *
 * If initialPath is provided, skip mode selection and go directly to step 1.
 */
export function WizardContainer({
  initialPath = '',
  onComplete,
  onStepChange,
  currentStep: externalStep,
}: WizardContainerProps) {
  // Mode selection: null means show mode selection, 'configure' or 'create' means mode is selected
  const [wizardMode, setWizardMode] = useState<WizardMode>(initialPath ? 'configure' : null);

  // For "create" mode: track template selection substeps
  // 'select' = choosing template, 'config' = configuring variables
  const [createSubStep, setCreateSubStep] = useState<'select' | 'config'>('select');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [templateVariables, setTemplateVariables] = useState<Record<string, string>>({});

  // Original wizard step (1-5)
  const [internalStep, setInternalStep] = useState(1);
  const currentStep = externalStep ?? internalStep;

  const [state, setState] = useState<WizardState>({
    projectPath: initialPath,
    detection: null,
    selectedAgents: [],
    selectedMcpServers: [],
    selectedRules: [],
    envVars: {},
    recommendedAgents: [],
    recommendedMcpServers: [],
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track previous initialPath to detect external updates (e.g., from Electron API)
  const prevInitialPathRef = useRef(initialPath);

  // Sync projectPath when initialPath changes (e.g., from Electron API)
  useEffect(() => {
    if (initialPath && initialPath !== prevInitialPathRef.current) {
      prevInitialPathRef.current = initialPath;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState((prev) => ({ ...prev, projectPath: initialPath }));
      setWizardMode('configure');
    }
  }, [initialPath]);

  // Step navigation (for steps 1-5)
  const goToStep = useCallback(
    (step: number) => {
      if (externalStep === undefined) {
        setInternalStep(step);
      }
      onStepChange?.(step);
    },
    [externalStep, onStepChange]
  );

  const nextStep = useCallback(() => {
    if (currentStep < 6) {
      goToStep(currentStep + 1);
    }
  }, [currentStep, goToStep]);

  const prevStep = useCallback(() => {
    if (currentStep > 1) {
      goToStep(currentStep - 1);
    } else if (currentStep === 1 && wizardMode === 'create') {
      // Go back to template config
      setCreateSubStep('config');
    } else if (currentStep === 1 && wizardMode === 'configure' && !initialPath) {
      // Go back to mode selection
      setWizardMode(null);
    }
  }, [currentStep, goToStep, wizardMode, initialPath]);

  // State update handlers
  const updateState = useCallback((updates: Partial<WizardState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  }, []);

  const toggleAgent = useCallback((agentId: string) => {
    setState((prev) => ({
      ...prev,
      selectedAgents: prev.selectedAgents.includes(agentId)
        ? prev.selectedAgents.filter((id) => id !== agentId)
        : [...prev.selectedAgents, agentId],
    }));
  }, []);

  const toggleMcpServer = useCallback((serverName: string) => {
    setState((prev) => ({
      ...prev,
      selectedMcpServers: prev.selectedMcpServers.includes(serverName)
        ? prev.selectedMcpServers.filter((name) => name !== serverName)
        : [...prev.selectedMcpServers, serverName],
    }));
  }, []);

  const setEnvVar = useCallback((name: string, value: string) => {
    setState((prev) => ({
      ...prev,
      envVars: { ...prev.envVars, [name]: value },
    }));
  }, []);

  const toggleRule = useCallback((ruleId: string) => {
    setState((prev) => ({
      ...prev,
      selectedRules: prev.selectedRules.includes(ruleId)
        ? prev.selectedRules.filter((id) => id !== ruleId)
        : [...prev.selectedRules, ruleId],
    }));
  }, []);

  const initRules = useCallback((recommendedIds: string[]) => {
    setState((prev) => ({ ...prev, selectedRules: recommendedIds }));
  }, []);

  // Mode selection handler
  const handleModeSelect = useCallback((mode: WizardMode) => {
    setWizardMode(mode);
    if (mode === 'configure') {
      goToStep(1);
    } else if (mode === 'create') {
      setCreateSubStep('select');
    }
  }, [goToStep]);

  // Template selection handlers
  const handleTemplateSelect = useCallback((templateId: string) => {
    setSelectedTemplateId(templateId);
  }, []);

  const handleTemplateVariableChange = useCallback((name: string, value: string) => {
    setTemplateVariables((prev) => ({ ...prev, [name]: value }));
  }, []);

  const handleScaffoldComplete = useCallback((result: ScaffoldResult) => {
    // After scaffolding, set the project path and proceed to detection
    setState((prev) => ({
      ...prev,
      projectPath: result.projectPath,
      detection: null,
      selectedAgents: [],
      selectedMcpServers: [],
    }));
    goToStep(1);
  }, [goToStep]);

  const handleBackFromTemplateConfig = useCallback(() => {
    setCreateSubStep('select');
  }, []);

  const handleBackFromTemplateSelect = useCallback(() => {
    setWizardMode(null);
    setSelectedTemplateId(null);
    setTemplateVariables({});
  }, []);

  // Check if current step is valid for navigation
  const canProceed = useCallback(() => {
    // For create mode pre-steps
    if (wizardMode === 'create' && currentStep === 1 && createSubStep === 'select') {
      return selectedTemplateId !== null;
    }

    switch (currentStep) {
      case 1:
        return state.detection !== null;
      case 2:
        return state.selectedAgents.length > 0;
      case 3:
        return true; // MCP servers are optional
      case 4:
        return true; // Rules are optional
      case 5:
        return true; // Env vars can be skipped
      case 6:
        return true;
      default:
        return false;
    }
  }, [currentStep, state, wizardMode, createSubStep, selectedTemplateId]);

  // Calculate effective step for progress indicator
  // In create mode, we have: mode -> template select -> template config -> steps 1-5
  // Note: This function is available for future use in progress display enhancements
  const _getProgressInfo = useCallback(() => {
    if (wizardMode === null) {
      return { currentIndex: 0, totalSteps: 7, label: 'Mode Selection' };
    }
    if (wizardMode === 'create') {
      if (createSubStep === 'select') {
        return { currentIndex: 1, totalSteps: 7, label: 'Select Template' };
      }
      if (createSubStep === 'config') {
        return { currentIndex: 2, totalSteps: 7, label: 'Configure Project' };
      }
      // After scaffold, we're in regular steps (currentStep + 2)
      return { currentIndex: currentStep + 2, totalSteps: 8, label: `Step ${currentStep}` };
    }
    // Configure mode: steps 1-6
    return { currentIndex: currentStep, totalSteps: 6, label: `Step ${currentStep}` };
  }, [wizardMode, createSubStep, currentStep]);
  void _getProgressInfo; // Suppress unused warning - available for future progress display

  // Render the appropriate content based on mode and step
  const renderContent = () => {
    // Mode selection
    if (wizardMode === null) {
      return <ModeSelection onModeSelect={handleModeSelect} />;
    }

    // Create mode: template selection and configuration
    if (wizardMode === 'create' && currentStep === 1) {
      if (createSubStep === 'select') {
        return (
          <Step0TemplateSelect
            selectedTemplate={selectedTemplateId}
            onTemplateSelect={handleTemplateSelect}
          />
        );
      }
      if (createSubStep === 'config' && selectedTemplateId) {
        return (
          <Step0TemplateConfig
            templateId={selectedTemplateId}
            variables={templateVariables}
            onVariableChange={handleTemplateVariableChange}
            onScaffoldComplete={handleScaffoldComplete}
            onBack={handleBackFromTemplateConfig}
          />
        );
      }
    }

    // Regular wizard steps (1-5)
    switch (currentStep) {
      case 1:
        return (
          <Step1Detection
            projectPath={state.projectPath}
            detection={state.detection}
            onPathChange={(path) => updateState({ projectPath: path })}
            onDetection={(detection, recommendations) => {
              updateState({
                detection,
                recommendedAgents: recommendations?.agents || [],
                recommendedMcpServers: recommendations?.mcpServers || [],
                selectedAgents: recommendations?.agents || [],
                selectedMcpServers: recommendations?.mcpServers || [],
              });
            }}
            loading={loading}
            setLoading={setLoading}
            error={error}
            setError={setError}
          />
        );
      case 2:
        return (
          <Step2Agents
            selectedAgents={state.selectedAgents}
            recommendedAgents={state.recommendedAgents}
            onToggleAgent={toggleAgent}
            onSelectAll={(agents) => updateState({ selectedAgents: agents })}
            onDeselectAll={() => updateState({ selectedAgents: [] })}
          />
        );
      case 3:
        return (
          <Step3McpServers
            selectedMcpServers={state.selectedMcpServers}
            recommendedMcpServers={state.recommendedMcpServers}
            selectedAgents={state.selectedAgents}
            onToggleMcpServer={toggleMcpServer}
          />
        );
      case 4:
        return (
          <StepRules
            selectedRules={state.selectedRules}
            onToggleRule={toggleRule}
            onInitRules={initRules}
          />
        );
      case 5:
        return (
          <Step4Environment
            projectPath={state.projectPath}
            selectedMcpServers={state.selectedMcpServers}
            envVars={state.envVars}
            onEnvVarChange={setEnvVar}
          />
        );
      case 6:
        return (
          <Step5Install
            projectPath={state.projectPath}
            selectedAgents={state.selectedAgents}
            selectedMcpServers={state.selectedMcpServers}
            selectedRules={state.selectedRules}
            envVars={state.envVars}
            detection={state.detection}
            onComplete={onComplete}
          />
        );
      default:
        return null;
    }
  };

  // Navigation button handlers
  const handleBack = useCallback(() => {
    if (wizardMode === null) {
      return; // Can't go back from mode selection
    }

    if (wizardMode === 'create') {
      if (createSubStep === 'select') {
        handleBackFromTemplateSelect();
        return;
      }
      if (createSubStep === 'config') {
        handleBackFromTemplateConfig();
        return;
      }
    }

    prevStep();
  }, [wizardMode, createSubStep, prevStep, handleBackFromTemplateSelect, handleBackFromTemplateConfig]);

  const handleNext = useCallback(() => {
    if (wizardMode === 'create' && currentStep === 1) {
      if (createSubStep === 'select' && selectedTemplateId) {
        setCreateSubStep('config');
        return;
      }
      // Template config handles its own next (scaffold)
      return;
    }

    nextStep();
  }, [wizardMode, currentStep, createSubStep, selectedTemplateId, nextStep]);

  // Should show navigation footer?
  const showNavigation = () => {
    // Hide navigation for mode selection
    if (wizardMode === null) return false;

    // Hide navigation for template config (has its own buttons)
    if (wizardMode === 'create' && createSubStep === 'config') return false;

    // Hide navigation for install step (Step5Install has its own buttons)
    if (currentStep === 6) return false;

    return true;
  };

  // Get step indicators
  const getStepIndicators = () => {
    if (wizardMode === 'configure' || (wizardMode === 'create' && currentStep > 1)) {
      // Show steps 1-6
      return [1, 2, 3, 4, 5, 6];
    }
    if (wizardMode === 'create') {
      // Show template steps + regular steps
      return ['T1', 'T2', 1, 2, 3, 4, 5, 6];
    }
    return [];
  };

  const getCurrentStepIndex = () => {
    if (wizardMode === 'create' && currentStep === 1) {
      return createSubStep === 'select' ? 0 : 1;
    }
    if (wizardMode === 'create') {
      return currentStep + 1; // Offset by template steps
    }
    return currentStep - 1;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Step Content */}
      <div className="flex-1 overflow-auto">{renderContent()}</div>

      {/* Navigation Footer */}
      {showNavigation() && (
        <div className="flex items-center justify-between border-t border-surface-700 bg-surface-800/50 px-6 py-4">
          <Button
            variant="secondary"
            onClick={handleBack}
            disabled={wizardMode === null || (wizardMode === 'configure' && currentStep === 1 && !!initialPath)}
          >
            Back
          </Button>

          <div className="flex items-center gap-2">
            {getStepIndicators().map((_step, index) => (
              <div
                key={index}
                className={`w-2 h-2 rounded-full transition-colors ${
                  index === getCurrentStepIndex()
                    ? 'bg-primary-500'
                    : index < getCurrentStepIndex()
                    ? 'bg-green-500'
                    : 'bg-surface-600'
                }`}
              />
            ))}
          </div>

          {currentStep < 6 ? (
            <Button onClick={handleNext} disabled={!canProceed()}>
              Continue
            </Button>
          ) : (
            <Button onClick={onComplete} variant="primary">
              Finish
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
