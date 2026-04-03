// SPDX-License-Identifier: MIT
import { Button, Select } from '../common';

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  compatible?: boolean;
  missingAgents?: string[];
  subTasks?: unknown[];
  mcpServers?: string[];
}

export interface WorkflowSelectorProps {
  workflows: {
    builtin: Workflow[];
    custom: Workflow[];
  };
  selectedWorkflow: string;
  onWorkflowChange: (workflow: string) => void;
  onSaveWorkflow?: () => void;
}

export function WorkflowSelector({
  workflows,
  selectedWorkflow,
  onWorkflowChange,
  onSaveWorkflow,
}: WorkflowSelectorProps) {
  const workflowOptions = [
    { value: '', label: '-- Custom Task --' },
    // Compatible builtin workflows
    ...workflows.builtin
      .filter((w) => w.compatible !== false)
      .map((w) => ({
        value: `builtin:${w.id}`,
        label: w.name,
        description: w.description,
      })),
    // Incompatible builtin workflows (disabled)
    ...workflows.builtin
      .filter((w) => w.compatible === false)
      .map((w) => ({
        value: `builtin:${w.id}`,
        label: `${w.name} (missing: ${w.missingAgents?.join(', ')})`,
        description: w.description,
        disabled: true,
      })),
    // Custom workflows
    ...workflows.custom.map((w) => ({
      value: `custom:${w.id}`,
      label: w.name,
      description: w.description,
    })),
  ];

  return (
    <div className="mb-4">
      <label className="block text-sm text-surface-400 mb-2">Workflow Template</label>
      <div className="flex gap-2">
        <Select
          options={workflowOptions}
          value={selectedWorkflow}
          onChange={(v) => onWorkflowChange(v as string)}
          fullWidth
        />
        {onSaveWorkflow && (
          <Button variant="secondary" size="sm" onClick={onSaveWorkflow}>
            Save
          </Button>
        )}
      </div>
    </div>
  );
}
