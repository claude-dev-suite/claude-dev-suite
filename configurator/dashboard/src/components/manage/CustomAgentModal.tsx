// SPDX-License-Identifier: MIT
/**
 * Custom Agent Modal
 *
 * Modal for creating custom agents via upload or AI generation.
 */

import { useState, useRef, type ChangeEvent, type DragEvent } from 'react';
import { Modal, ModalFooter, Button, Badge } from '../common';
import clsx from 'clsx';
import type {
  CustomAgentCreationMode,
  CustomAgentValidationResult,
  CustomAgentOperationResponse,
  CustomSkill,
} from '@/types/custom-agents';

export interface CustomAgentModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectPath: string;
  onCreateAgent: (content: string, bypassWarnings?: boolean) => Promise<CustomAgentOperationResponse>;
  onUploadAgent: (file: File, bypassWarnings?: boolean) => Promise<CustomAgentOperationResponse>;
  onValidate: (content: string) => Promise<CustomAgentValidationResult | null>;
  availableSkills: CustomSkill[];
}

export function CustomAgentModal({
  isOpen,
  onClose,
  projectPath: _projectPath,
  onCreateAgent,
  onUploadAgent,
  onValidate,
  availableSkills: _availableSkills,
}: CustomAgentModalProps) {
  const [mode, setMode] = useState<CustomAgentCreationMode>('upload');
  const [content, setContent] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validation, setValidation] = useState<CustomAgentValidationResult | null>(null);
  const [showWarningsDialog, setShowWarningsDialog] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset state when modal closes
  const handleClose = () => {
    setContent('');
    setFile(null);
    setError(null);
    setValidation(null);
    setShowWarningsDialog(false);
    onClose();
  };

  // Handle file selection
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      processFile(selectedFile);
    }
  };

  // Handle drag and drop
  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.name.endsWith('.md')) {
      processFile(droppedFile);
    } else {
      setError('Please drop a .md file');
    }
  };

  // Process uploaded file
  const processFile = async (selectedFile: File) => {
    setFile(selectedFile);
    setError(null);
    setValidation(null);

    // Read and validate content
    const reader = new FileReader();
    reader.onload = async (e) => {
      const fileContent = e.target?.result as string;
      setContent(fileContent);

      // Validate
      const result = await onValidate(fileContent);
      setValidation(result);
    };
    reader.readAsText(selectedFile);
  };

  // Handle submit
  const handleSubmit = async (bypassWarnings = false) => {
    setLoading(true);
    setError(null);

    try {
      let result: CustomAgentOperationResponse;

      if (mode === 'upload' && file) {
        result = await onUploadAgent(file, bypassWarnings);
      } else if (content) {
        result = await onCreateAgent(content, bypassWarnings);
      } else {
        setError('No content provided');
        setLoading(false);
        return;
      }

      if (result.success) {
        handleClose();
      } else {
        // Check if we need to show warnings dialog
        if (
          result.validation?.bestPracticeWarnings?.some((w) => w.severity === 'warning') &&
          !bypassWarnings
        ) {
          setValidation(result.validation);
          setShowWarningsDialog(true);
        } else {
          setError(result.error || 'Failed to create agent');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  // Render validation result
  const renderValidation = () => {
    if (!validation) return null;

    return (
      <div className="mt-4 space-y-3">
        {!validation.valid && validation.schemaErrors && (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
            <div className="flex items-center gap-2 text-red-400 font-medium mb-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Schema Errors
            </div>
            <ul className="text-sm text-red-300 space-y-1">
              {validation.schemaErrors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        {validation.valid && validation.bestPracticeWarnings.length === 0 && (
          <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
            <div className="flex items-center gap-2 text-green-400 font-medium">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Validation Passed
            </div>
          </div>
        )}

        {validation.bestPracticeWarnings.length > 0 && (
          <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
            <div className="flex items-center gap-2 text-yellow-400 font-medium mb-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              Best Practice Warnings
            </div>
            <ul className="text-sm space-y-2">
              {validation.bestPracticeWarnings.map((warning, i) => (
                <li key={i} className="flex items-start gap-2">
                  <Badge
                    variant={warning.severity === 'warning' ? 'warning' : 'default'}
                    size="sm"
                  >
                    {warning.severity}
                  </Badge>
                  <span className="text-surface-300">{warning.message}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  };

  // Get agent template
  const getTemplate = () => {
    return `---
name: my-custom-agent
description: |
  A custom agent specialized in [your domain].
  Handles [specific tasks and responsibilities].
model: sonnet
allowed-tools: Read, Write, Edit, Grep, Glob, Bash
skills:
  - custom/my-skill
mcp_servers:
  - documentation
---

# My Custom Agent

## Role

[Describe the agent's role and expertise]

## Behavior

- Execute modifications directly unless explicitly asked for analysis only
- Always read relevant files before making changes
- Follow project conventions and patterns

## Guidelines

- [Specific behavior guidelines]
- [When to use this agent]
- [What this agent should avoid]

## Anti-patterns

- Never [thing to avoid]
- Do not [another thing to avoid]
`;
  };

  return (
    <>
      <Modal
        isOpen={isOpen && !showWarningsDialog}
        onClose={handleClose}
        title="Create Custom Agent"
        size="lg"
        footer={
          <ModalFooter
            onCancel={handleClose}
            onConfirm={() => handleSubmit()}
            confirmText="Create Agent"
            loading={loading}
            disabled={!validation?.valid || loading}
          />
        }
      >
        <div className="space-y-6">
          {/* Mode Selector */}
          <div className="flex gap-2 p-1 bg-surface-800 rounded-lg">
            <button
              onClick={() => setMode('upload')}
              className={clsx(
                'flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors',
                mode === 'upload'
                  ? 'bg-primary-600 text-white'
                  : 'text-surface-400 hover:text-white'
              )}
            >
              Upload File
            </button>
            <button
              onClick={() => setMode('generate')}
              className={clsx(
                'flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors',
                mode === 'generate'
                  ? 'bg-primary-600 text-white'
                  : 'text-surface-400 hover:text-white'
              )}
            >
              Write Manually
            </button>
          </div>

          {/* Upload Mode */}
          {mode === 'upload' && (
            <div>
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={clsx(
                  'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
                  isDragging
                    ? 'border-primary-500 bg-primary-500/10'
                    : 'border-surface-600 hover:border-surface-500'
                )}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".md"
                  onChange={handleFileChange}
                  className="hidden"
                />

                {file ? (
                  <div>
                    <svg
                      className="w-12 h-12 mx-auto text-green-400 mb-3"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <p className="text-white font-medium">{file.name}</p>
                    <p className="text-sm text-surface-400 mt-1">
                      Click or drop to change file
                    </p>
                  </div>
                ) : (
                  <div>
                    <svg
                      className="w-12 h-12 mx-auto text-surface-500 mb-3"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                      />
                    </svg>
                    <p className="text-surface-300">
                      Drop a <code className="text-primary-400">.md</code> file here
                    </p>
                    <p className="text-sm text-surface-400 mt-1">
                      or click to browse
                    </p>
                  </div>
                )}
              </div>

              {renderValidation()}
            </div>
          )}

          {/* Manual Mode */}
          {mode === 'generate' && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-surface-300">
                  Agent Content (Markdown with YAML frontmatter)
                </label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setContent(getTemplate());
                    onValidate(getTemplate()).then(setValidation);
                  }}
                >
                  Use Template
                </Button>
              </div>
              <textarea
                value={content}
                onChange={(e) => {
                  setContent(e.target.value);
                  // Debounced validation
                  setTimeout(() => {
                    if (e.target.value) {
                      onValidate(e.target.value).then(setValidation);
                    }
                  }, 500);
                }}
                className="w-full h-64 px-3 py-2 bg-surface-800 border border-surface-600 rounded-lg text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
                placeholder="---&#10;name: my-agent&#10;description: |&#10;  Agent description here&#10;model: sonnet&#10;---&#10;&#10;# My Agent&#10;&#10;..."
              />

              {renderValidation()}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}
        </div>
      </Modal>

      {/* Warnings Bypass Dialog */}
      <Modal
        isOpen={showWarningsDialog}
        onClose={() => setShowWarningsDialog(false)}
        title="Best Practice Warnings"
        size="md"
        footer={
          <ModalFooter
            onCancel={() => setShowWarningsDialog(false)}
            onConfirm={() => handleSubmit(true)}
            confirmText="Save Anyway"
            cancelText="Go Back"
            loading={loading}
          />
        }
      >
        <div className="space-y-4">
          <p className="text-surface-300">
            The agent has the following best practice warnings. You can still save it,
            but consider addressing these issues for better Claude Code compatibility:
          </p>

          <ul className="space-y-2">
            {validation?.bestPracticeWarnings
              .filter((w) => w.severity === 'warning')
              .map((warning, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 p-2 bg-yellow-500/10 border border-yellow-500/20 rounded"
                >
                  <svg
                    className="w-4 h-4 text-yellow-400 mt-0.5 shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                  <span className="text-sm text-surface-300">{warning.message}</span>
                </li>
              ))}
          </ul>
        </div>
      </Modal>
    </>
  );
}
