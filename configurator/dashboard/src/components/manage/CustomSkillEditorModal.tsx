// SPDX-License-Identifier: MIT
/**
 * Custom Skill Editor Modal
 *
 * Modal for editing existing custom skills with live preview and validation.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Modal, ModalFooter, Badge } from '../common';
import type {
  CustomSkillDetail,
  CustomSkillValidationResult,
  CustomSkillOperationResponse,
} from '@/types/custom-agents';

/** Parse skill content into sections for preview */
function parseSkillContent(content: string): { heading: string; level: number; lines: string[] }[] {
  if (!content.trim()) return [];
  const sections: { heading: string; level: number; lines: string[] }[] = [];
  let current: { heading: string; level: number; lines: string[] } | null = null;

  for (const line of content.split('\n')) {
    const headingMatch = line.match(/^(#{1,4})\s+(.+)/);
    if (headingMatch) {
      if (current) sections.push(current);
      current = { heading: headingMatch[2] ?? '', level: (headingMatch[1] ?? '').length, lines: [] };
    } else if (current) {
      current.lines.push(line);
    } else {
      current = { heading: '', level: 0, lines: [line] };
    }
  }
  if (current) sections.push(current);
  return sections;
}

export interface CustomSkillEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  skill: CustomSkillDetail;
  onSave: (skillId: string, name: string, content: string, bypassWarnings: boolean) => Promise<CustomSkillOperationResponse>;
  onCreate?: (name: string, content: string, bypassWarnings: boolean) => Promise<CustomSkillOperationResponse>;
  onValidate: (content: string) => Promise<CustomSkillValidationResult | null>;
}

export function CustomSkillEditorModal({
  isOpen,
  onClose,
  skill,
  onSave,
  onCreate,
  onValidate,
}: CustomSkillEditorModalProps) {
  const [name, setName] = useState(skill.name);
  const [content, setContent] = useState(skill.content);
  const [validation, setValidation] = useState<CustomSkillValidationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showWarningsDialog, setShowWarningsDialog] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [warningsExpanded, setWarningsExpanded] = useState(false);

  const isGenerated = skill.id === '__generated__';

  // Initialize content when skill changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional re-init when the skill prop changes
    setName(skill.name);
    setContent(skill.content);
    setHasChanges(isGenerated);
    setError(null);
    setValidation(null);
    setWarningsExpanded(false);
  }, [skill, isGenerated]);

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
    setHasChanges(newContent !== skill.content || name !== skill.name);
    setError(null);
  };

  // Handle name change
  const handleNameChange = (newName: string) => {
    setName(newName);
    setHasChanges(newName !== skill.name || content !== skill.content);
    setError(null);
  };

  // Validate name
  const isNameValid = /^[a-z0-9][a-z0-9-]*$/.test(name.trim());

  // Handle save
  const handleSave = async (bypassWarnings = false) => {
    const trimmedName = name.trim();
    if (!trimmedName || !isNameValid) {
      setError('Name must be kebab-case (lowercase letters, numbers, hyphens)');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let result: CustomSkillOperationResponse;

      if (isGenerated && onCreate) {
        result = await onCreate(trimmedName, content, bypassWarnings);
      } else {
        result = await onSave(skill.id, trimmedName, content, bypassWarnings);
      }

      if (result.success) {
        onClose();
      } else {
        if (
          result.validation?.bestPracticeWarnings?.some((w) => w.severity === 'warning') &&
          !bypassWarnings
        ) {
          setValidation(result.validation);
          setShowWarningsDialog(true);
        } else {
          setError(result.error || 'Failed to save skill');
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

  // Parse content sections for preview
  const sections = useMemo(() => parseSkillContent(content), [content]);

  return (
    <>
      <Modal
        isOpen={isOpen && !showWarningsDialog}
        onClose={handleClose}
        title={isGenerated ? 'Review Generated Skill' : `Edit Skill: ${skill.name}`}
        size="wide"
        footer={
          <ModalFooter
            onCancel={handleClose}
            onConfirm={() => handleSave()}
            confirmText={isGenerated ? 'Create Skill' : 'Save Changes'}
            loading={loading}
            disabled={!name.trim() || !isNameValid || !content.trim() || loading || !hasChanges}
          />
        }
      >
        {/* Name field */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-surface-300 mb-1">
            Skill Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="my-skill-name"
            className="w-full px-3 py-2 bg-surface-800 border border-surface-600 rounded-lg text-white text-sm placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
          <p className="text-xs text-surface-500 mt-1">
            Kebab-case. Referenced as <code className="text-primary-400">custom/{name || 'skill-name'}</code> in agent frontmatter.
            {!isGenerated && name !== skill.name && name.trim() && (
              <span className="text-yellow-400 ml-1">(will rename directory)</span>
            )}
          </p>
        </div>

        {/* Editor + Preview split */}
        <div className="grid grid-cols-2 gap-6">
          {/* Editor */}
          <div>
            <label className="block text-sm font-medium text-surface-300 mb-2">
              Content
            </label>
            <textarea
              value={content}
              onChange={(e) => handleContentChange(e.target.value)}
              className="w-full h-[520px] px-3 py-2 bg-surface-800 border border-surface-600 rounded-lg text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
              spellCheck={false}
            />
          </div>

          {/* Preview */}
          <div>
            <label className="block text-sm font-medium text-surface-300 mb-2">
              Preview
            </label>
            <div className="h-[520px] overflow-y-auto bg-surface-800 border border-surface-600 rounded-lg p-4">
              {/* Validation Status */}
              {validation && (
                <div className="mb-4">
                  {validation.bestPracticeWarnings.length === 0 ? (
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
                      <button
                        type="button"
                        onClick={() => setWarningsExpanded((prev) => !prev)}
                        className="flex items-center gap-2 text-yellow-400 font-medium w-full"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01" />
                        </svg>
                        {validation.bestPracticeWarnings.length} warning{validation.bestPracticeWarnings.length !== 1 ? 's' : ''}
                        <svg
                          className={`w-3.5 h-3.5 ml-auto transition-transform ${warningsExpanded ? 'rotate-180' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      {warningsExpanded && (
                        <ul className="mt-2 space-y-1.5 border-t border-yellow-500/20 pt-2">
                          {validation.bestPracticeWarnings.map((warning, i) => (
                            <li key={i} className="flex items-start gap-2">
                              <Badge
                                variant={warning.severity === 'warning' ? 'warning' : 'default'}
                                size="sm"
                              >
                                {warning.rule}
                              </Badge>
                              <span className="text-xs text-surface-400">{warning.message}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Rendered skill preview */}
              <div className="space-y-3">
                {/* Skill meta info */}
                <div className="flex items-center gap-2 mb-3">
                  <Badge variant="default" size="sm">SKILL.md</Badge>
                  <span className="text-sm text-surface-300 font-medium">custom/{name || '...'}</span>
                </div>

                {sections.map((section, i) => (
                  <div key={i}>
                    {section.heading && (
                      <h4 className={
                        section.level <= 1
                          ? 'text-base font-semibold text-white mb-1'
                          : section.level === 2
                            ? 'text-sm font-semibold text-surface-200 mb-1'
                            : 'text-xs font-medium text-surface-300 mb-1'
                      }>
                        {section.heading}
                      </h4>
                    )}
                    {section.lines.filter((l) => l.trim()).length > 0 && (
                      <div className="text-xs text-surface-400 space-y-0.5">
                        {section.lines.map((line, j) => {
                          const trimmed = line.trim();
                          if (!trimmed) return null;
                          if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
                            return (
                              <div key={j} className="flex gap-1.5 pl-2">
                                <span className="text-surface-500 shrink-0">&#8226;</span>
                                <span>{trimmed.slice(2)}</span>
                              </div>
                            );
                          }
                          if (trimmed.startsWith('- [ ]') || trimmed.startsWith('- [x]')) {
                            const checked = trimmed.startsWith('- [x]');
                            return (
                              <div key={j} className="flex gap-1.5 pl-2">
                                <span className="text-surface-500 shrink-0">{checked ? '\u2611' : '\u2610'}</span>
                                <span>{trimmed.slice(6)}</span>
                              </div>
                            );
                          }
                          if (trimmed.startsWith('```')) return null;
                          return <p key={j}>{trimmed}</p>;
                        })}
                      </div>
                    )}
                  </div>
                ))}
                {sections.length === 0 && (
                  <p className="text-surface-500 text-sm italic">No content to preview</p>
                )}
              </div>
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
            The skill has the following best practice warnings. You can still save it,
            but consider addressing these issues for better skill quality:
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
