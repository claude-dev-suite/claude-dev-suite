// SPDX-License-Identifier: MIT
/**
 * Custom Agent Editor Modal
 *
 * Modal for editing existing custom agents with live preview.
 */

import { useState, useEffect, useCallback } from 'react';
import { Modal, ModalFooter, Badge } from '../common';
import type {
  CustomAgent,
  CustomAgentValidationResult,
  CustomAgentOperationResponse,
} from '@/types/custom-agents';

export interface CustomAgentEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  agent: CustomAgent;
  onSave: (content: string, bypassWarnings: boolean) => Promise<CustomAgentOperationResponse>;
  onValidate: (content: string) => Promise<CustomAgentValidationResult | null>;
}

export function CustomAgentEditorModal({
  isOpen,
  onClose,
  agent,
  onSave,
  onValidate,
}: CustomAgentEditorModalProps) {
  const [content, setContent] = useState(agent.content);
  const [validation, setValidation] = useState<CustomAgentValidationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showWarningsDialog, setShowWarningsDialog] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Initialize content when agent changes
  useEffect(() => {
    setContent(agent.content);
    setHasChanges(false);
    setError(null);
    setValidation(null);
  }, [agent]);

  // Validate content when it changes
  const validateContent = useCallback(async (newContent: string) => {
    const result = await onValidate(newContent);
    setValidation(result);
  }, [onValidate]);

  // Debounced validation
  useEffect(() => {
    const timer = setTimeout(() => {
      if (content) {
        validateContent(content);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [content, validateContent]);

  // Handle content change
  const handleContentChange = (newContent: string) => {
    setContent(newContent);
    setHasChanges(newContent !== agent.content);
    setError(null);
  };

  // Handle save
  const handleSave = async (bypassWarnings = false) => {
    setLoading(true);
    setError(null);

    try {
      const result = await onSave(content, bypassWarnings);

      if (result.success) {
        onClose();
      } else {
        // Check if we need to show warnings dialog
        if (
          result.validation?.bestPracticeWarnings?.some((w) => w.severity === 'warning') &&
          !bypassWarnings
        ) {
          setValidation(result.validation);
          setShowWarningsDialog(true);
        } else {
          setError(result.error || 'Failed to save agent');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  // Handle close with unsaved changes warning
  const handleClose = () => {
    if (hasChanges) {
      if (!confirm('You have unsaved changes. Are you sure you want to close?')) {
        return;
      }
    }
    onClose();
  };

  // Parse preview info from validation
  const previewInfo = validation?.parsedFrontmatter || {
    name: agent.name,
    description: agent.description,
    model: agent.model,
    skills: agent.skills,
    mcp_servers: agent.mcpServers,
  };

  return (
    <>
      <Modal
        isOpen={isOpen && !showWarningsDialog}
        onClose={handleClose}
        title={`Edit Agent: ${agent.name}`}
        size="xl"
        footer={
          <ModalFooter
            onCancel={handleClose}
            onConfirm={() => handleSave()}
            confirmText="Save Changes"
            loading={loading}
            disabled={!validation?.valid || loading || !hasChanges}
          />
        }
      >
        <div className="grid grid-cols-2 gap-6">
          {/* Editor */}
          <div>
            <label className="block text-sm font-medium text-surface-300 mb-2">
              Content
            </label>
            <textarea
              value={content}
              onChange={(e) => handleContentChange(e.target.value)}
              className="w-full h-[500px] px-3 py-2 bg-surface-800 border border-surface-600 rounded-lg text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
              spellCheck={false}
            />
          </div>

          {/* Preview */}
          <div>
            <label className="block text-sm font-medium text-surface-300 mb-2">
              Preview
            </label>
            <div className="h-[500px] overflow-y-auto bg-surface-800 border border-surface-600 rounded-lg p-4">
              {/* Validation Status */}
              {validation && (
                <div className="mb-4">
                  {!validation.valid ? (
                    <div className="p-2 bg-red-500/10 border border-red-500/30 rounded text-sm">
                      <div className="flex items-center gap-2 text-red-400 font-medium">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        Invalid
                      </div>
                      {validation.schemaErrors?.map((err, i) => (
                        <p key={i} className="text-red-300 mt-1">{err}</p>
                      ))}
                    </div>
                  ) : validation.bestPracticeWarnings.length === 0 ? (
                    <div className="p-2 bg-green-500/10 border border-green-500/30 rounded text-sm">
                      <div className="flex items-center gap-2 text-green-400 font-medium">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Valid
                      </div>
                    </div>
                  ) : (
                    <div className="p-2 bg-yellow-500/10 border border-yellow-500/30 rounded text-sm">
                      <div className="flex items-center gap-2 text-yellow-400 font-medium">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01" />
                        </svg>
                        {validation.bestPracticeWarnings.length} warning(s)
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Parsed Info */}
              {validation?.valid && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-white font-medium mb-1">
                      {previewInfo.name}
                    </h3>
                    <p className="text-sm text-surface-400">
                      {previewInfo.description}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge variant="warning" size="sm">Custom</Badge>
                    <Badge variant="default" size="sm">{previewInfo.model || 'sonnet'}</Badge>
                  </div>

                  {previewInfo.skills && previewInfo.skills.length > 0 && (
                    <div>
                      <h4 className="text-xs font-medium text-surface-500 uppercase mb-1">
                        Skills
                      </h4>
                      <div className="flex flex-wrap gap-1">
                        {previewInfo.skills.map((skill: string, i: number) => (
                          <span
                            key={i}
                            className="text-xs px-2 py-0.5 bg-surface-700 rounded text-surface-300"
                          >
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {previewInfo.mcp_servers && previewInfo.mcp_servers.length > 0 && (
                    <div>
                      <h4 className="text-xs font-medium text-surface-500 uppercase mb-1">
                        MCP Servers
                      </h4>
                      <div className="flex flex-wrap gap-1">
                        {previewInfo.mcp_servers.map((server: string, i: number) => (
                          <span
                            key={i}
                            className="text-xs px-2 py-0.5 bg-surface-700 rounded text-surface-300"
                          >
                            {server}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Warnings list */}
                  {validation.bestPracticeWarnings.length > 0 && (
                    <div>
                      <h4 className="text-xs font-medium text-surface-500 uppercase mb-2">
                        Warnings
                      </h4>
                      <ul className="space-y-2">
                        {validation.bestPracticeWarnings.map((warning, i) => (
                          <li
                            key={i}
                            className="text-xs p-2 bg-surface-700 rounded"
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <Badge
                                variant={warning.severity === 'warning' ? 'warning' : 'default'}
                                size="sm"
                              >
                                {warning.rule}
                              </Badge>
                            </div>
                            <p className="text-surface-400">{warning.message}</p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Change indicator */}
        {hasChanges && (
          <div className="mt-4 text-sm text-yellow-400">
            You have unsaved changes
          </div>
        )}
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
            onConfirm={() => handleSave(true)}
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
