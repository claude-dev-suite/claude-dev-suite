// SPDX-License-Identifier: MIT
/**
 * Custom Agent Editor Modal
 *
 * Modal for editing existing custom agents with live preview.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Modal, ModalFooter, Badge } from '../common';
import clsx from 'clsx';
import type {
  CustomAgent,
  CustomAgentValidationResult,
  CustomAgentOperationResponse,
  GeneratedSkill,
} from '@/types/custom-agents';

/** Extract body (after frontmatter closing ---) and render as styled sections */
function parseMarkdownBody(content: string): { heading: string; level: number; lines: string[] }[] {
  // Find body after frontmatter (second ---)
  const fmEnd = content.indexOf('---', content.indexOf('---') + 3);
  if (fmEnd === -1) return [];
  const body = content.slice(fmEnd + 3).trim();
  if (!body) return [];

  const sections: { heading: string; level: number; lines: string[] }[] = [];
  let current: { heading: string; level: number; lines: string[] } | null = null;

  for (const line of body.split('\n')) {
    const headingMatch = line.match(/^(#{1,4})\s+(.+)/);
    if (headingMatch) {
      if (current) sections.push(current);
      current = { heading: headingMatch[2] ?? '', level: (headingMatch[1] ?? '').length, lines: [] };
    } else if (current) {
      current.lines.push(line);
    } else {
      // Text before any heading
      current = { heading: '', level: 0, lines: [line] };
    }
  }
  if (current) sections.push(current);
  return sections;
}

/** Parse skill markdown content into sections (no frontmatter) */
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

export interface CustomAgentEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  agent: CustomAgent;
  generatedSkills?: GeneratedSkill[];
  onSave: (content: string, bypassWarnings: boolean) => Promise<CustomAgentOperationResponse>;
  onSaveSkills?: (skills: GeneratedSkill[]) => Promise<{ success: boolean; errors: string[] }>;
  onValidate: (content: string) => Promise<CustomAgentValidationResult | null>;
}

export function CustomAgentEditorModal({
  isOpen,
  onClose,
  agent,
  generatedSkills,
  onSave,
  onSaveSkills,
  onValidate,
}: CustomAgentEditorModalProps) {
  const [content, setContent] = useState(agent.content);
  const [validation, setValidation] = useState<CustomAgentValidationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showWarningsDialog, setShowWarningsDialog] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [warningsExpanded, setWarningsExpanded] = useState(false);

  // Tab state: 'agent' or skill index
  const [activeTab, setActiveTab] = useState<'agent' | number>('agent');
  // Per-skill editable content
  const [skillContents, setSkillContents] = useState<string[]>([]);
  // Which skills are included for saving
  const [includedSkills, setIncludedSkills] = useState<Set<number>>(new Set());

  const isGenerated = agent.id === '__generated__';
  const hasSkills = isGenerated && generatedSkills && generatedSkills.length > 0;

  // Initialize content when agent changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional re-init when the agent prop changes
    setContent(agent.content);
    setHasChanges(isGenerated);
    setError(null);
    setValidation(null);
    setActiveTab('agent');
    // Initialize skill contents and include all by default
    if (generatedSkills && generatedSkills.length > 0) {
      setSkillContents(generatedSkills.map((s) => s.content));
      setIncludedSkills(new Set(generatedSkills.map((_, i) => i)));
    } else {
      setSkillContents([]);
      setIncludedSkills(new Set());
    }
  }, [agent, isGenerated, generatedSkills]);

  const includedSkillCount = includedSkills.size;

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

  // Build the list of skills to save (only included ones, with edited content)
  const getSkillsToSave = useCallback((): GeneratedSkill[] => {
    if (!generatedSkills) return [];
    return generatedSkills
      .map((skill, i) => ({
        name: skill.name,
        content: skillContents[i] ?? skill.content,
      }))
      .filter((_, i) => includedSkills.has(i));
  }, [generatedSkills, skillContents, includedSkills]);

  // Handle save — create skills first (for generated agents), then the agent
  const handleSave = async (bypassWarnings = false) => {
    setLoading(true);
    setError(null);

    try {
      // Step 1: Create included generated skills (only for AI-generated agents)
      const skillsToSave = getSkillsToSave();
      if (isGenerated && skillsToSave.length > 0 && onSaveSkills) {
        const skillResult = await onSaveSkills(skillsToSave);
        if (!skillResult.success) {
          setError(`Failed to create skills: ${skillResult.errors.join('; ')}`);
          setLoading(false);
          return;
        }
      }

      // Step 2: Create/update the agent
      const effectiveBypass = bypassWarnings || isGenerated;
      const result = await onSave(content, effectiveBypass);

      if (result.success) {
        onClose();
      } else {
        // Check if we need to show warnings dialog
        if (
          result.validation?.bestPracticeWarnings?.some((w) => w.severity === 'warning') &&
          !effectiveBypass
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

  // Toggle skill inclusion
  const toggleSkillIncluded = (index: number) => {
    setIncludedSkills((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
    setHasChanges(true);
  };

  // Update a single skill's content
  const updateSkillContent = (index: number, newContent: string) => {
    setSkillContents((prev) => {
      const next = [...prev];
      next[index] = newContent;
      return next;
    });
    setHasChanges(true);
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

  // Parse markdown body sections for preview
  const bodySections = useMemo(() => parseMarkdownBody(content), [content]);

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
        title={isGenerated ? 'Review Generated Agent' : `Edit Agent: ${agent.name}`}
        size="wide"
        footer={
          <ModalFooter
            onCancel={handleClose}
            onConfirm={() => handleSave()}
            confirmText={isGenerated
              ? includedSkillCount > 0
                ? `Create Agent + ${includedSkillCount} Skill${includedSkillCount !== 1 ? 's' : ''}`
                : 'Create Agent'
              : 'Save Changes'
            }
            loading={loading}
            disabled={!validation?.valid || loading || !hasChanges}
          />
        }
      >
        {/* Tab bar — only shown when skills exist */}
        {hasSkills && (
          <div className="border-b border-surface-700 mb-4 flex items-center gap-1 overflow-x-auto">
            {/* Agent tab */}
            <button
              type="button"
              onClick={() => setActiveTab('agent')}
              className={clsx(
                'px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
                activeTab === 'agent'
                  ? 'border-primary-500 text-primary-400'
                  : 'border-transparent text-surface-400 hover:text-white hover:border-surface-500'
              )}
            >
              Agent
            </button>

            {/* Skill tabs */}
            {generatedSkills!.map((skill, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setActiveTab(i)}
                className={clsx(
                  'px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-2',
                  activeTab === i
                    ? 'border-primary-500 text-primary-400'
                    : 'border-transparent text-surface-400 hover:text-white hover:border-surface-500',
                  !includedSkills.has(i) && 'opacity-50'
                )}
              >
                <span>custom/{skill.name}</span>
                {!includedSkills.has(i) && (
                  <span className="text-[10px] text-surface-500">(excluded)</span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Agent tab content */}
        {activeTab === 'agent' && (
          <div className="grid grid-cols-2 gap-6">
            {/* Editor */}
            <div>
              <label className="block text-sm font-medium text-surface-300 mb-2">
                Content
              </label>
              <textarea
                value={content}
                onChange={(e) => handleContentChange(e.target.value)}
                className={clsx(
                  'w-full px-3 py-2 bg-surface-800 border border-surface-600 rounded-lg text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none',
                  hasSkills ? 'h-[520px]' : 'h-[600px]'
                )}
                spellCheck={false}
              />
            </div>

            {/* Preview */}
            <div>
              <label className="block text-sm font-medium text-surface-300 mb-2">
                Preview
              </label>
              <div className={clsx(
                'overflow-y-auto bg-surface-800 border border-surface-600 rounded-lg p-4',
                hasSkills ? 'h-[520px]' : 'h-[600px]'
              )}>
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

                    {/* Markdown body sections */}
                    {bodySections.length > 0 && (
                      <div className="border-t border-surface-700 pt-4 space-y-3">
                        {bodySections.map((section, i) => (
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
                                  if (trimmed.startsWith('- ')) {
                                    return (
                                      <div key={j} className="flex gap-1.5 pl-2">
                                        <span className="text-surface-500 shrink-0">&#8226;</span>
                                        <span>{trimmed.slice(2)}</span>
                                      </div>
                                    );
                                  }
                                  if (trimmed.startsWith('```')) {
                                    return null; // Skip code fences in preview
                                  }
                                  return <p key={j}>{trimmed}</p>;
                                })}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Skills summary — clickable to navigate */}
                    {hasSkills && (
                      <div className="border-t border-surface-700 pt-4">
                        <h4 className="text-xs font-medium text-surface-500 uppercase mb-2">
                          Generated Skills ({includedSkillCount}/{generatedSkills!.length} included)
                        </h4>
                        <div className="space-y-1">
                          {generatedSkills!.map((skill, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => setActiveTab(i)}
                              className={clsx(
                                'flex items-center justify-between w-full px-2.5 py-1.5 rounded text-left transition-colors text-sm',
                                includedSkills.has(i)
                                  ? 'bg-surface-700 hover:bg-surface-600 text-surface-200'
                                  : 'bg-surface-700/50 hover:bg-surface-600/50 text-surface-500 line-through'
                              )}
                            >
                              <span>custom/{skill.name}</span>
                              <svg className="w-3.5 h-3.5 text-surface-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Skill tab content */}
        {typeof activeTab === 'number' && generatedSkills && generatedSkills[activeTab] && (
          <div className="space-y-4">
            {/* Skill header with include toggle */}
            <div className="flex items-center justify-between bg-surface-800 border border-surface-600 rounded-lg px-4 py-3">
              <div className="flex items-center gap-3">
                <Badge variant="default" size="sm">SKILL.md</Badge>
                <span className="text-white font-medium">
                  custom/{generatedSkills[activeTab].name}
                </span>
              </div>
              <button
                type="button"
                onClick={() => toggleSkillIncluded(activeTab)}
                className={clsx(
                  'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                  includedSkills.has(activeTab)
                    ? 'bg-green-500/10 border border-green-500/30 text-green-400 hover:bg-green-500/20'
                    : 'bg-surface-700 border border-surface-600 text-surface-400 hover:bg-surface-600'
                )}
              >
                {includedSkills.has(activeTab) ? (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Included
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Excluded
                  </>
                )}
              </button>
            </div>

            {/* Skill editor + preview */}
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-surface-300 mb-2">
                  Content
                </label>
                <textarea
                  value={skillContents[activeTab] ?? ''}
                  onChange={(e) => updateSkillContent(activeTab, e.target.value)}
                  className={clsx(
                    'w-full h-[480px] px-3 py-2 bg-surface-800 border border-surface-600 rounded-lg text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none',
                    !includedSkills.has(activeTab) && 'opacity-50'
                  )}
                  spellCheck={false}
                  disabled={!includedSkills.has(activeTab)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-surface-300 mb-2">
                  Preview
                </label>
                <div className={clsx(
                  'h-[480px] overflow-y-auto bg-surface-800 border border-surface-600 rounded-lg p-4',
                  !includedSkills.has(activeTab) && 'opacity-50'
                )}>
                  {(() => {
                    const skillContent = skillContents[activeTab] ?? '';
                    const skillSections = parseSkillContent(skillContent);
                    return (
                      <div className="space-y-3">
                        {skillSections.map((section, i) => (
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
                                  if (trimmed.startsWith('```')) return null;
                                  return <p key={j}>{trimmed}</p>;
                                })}
                              </div>
                            )}
                          </div>
                        ))}
                        {skillSections.length === 0 && (
                          <p className="text-surface-500 text-sm italic">No content to preview</p>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>
        )}

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
