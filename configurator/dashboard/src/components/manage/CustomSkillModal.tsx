// SPDX-License-Identifier: MIT
/**
 * Custom Skill Modal
 *
 * Modal for creating custom skills via upload, manual writing, or AI generation.
 * AI Chat mode supports inline review with "Back to Chat" to iterate on generated content.
 */

import { useState, useRef, useCallback, type ChangeEvent, type DragEvent } from 'react';
import { Modal, ModalFooter, Button, Badge } from '../common';
import clsx from 'clsx';
import { SkillGenerationChat } from './SkillGenerationChat';
import type {
  CustomSkillCreationMode,
  CustomSkillValidationResult,
  CustomSkillOperationResponse,
  RefDoc,
} from '@/types/custom-agents';
import { API_BASE } from '../../utils/api';

export interface CustomSkillModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectPath: string;
  existingSkills: string[];
  onCreateSkill: (name: string, content: string, bypassWarnings?: boolean) => Promise<CustomSkillOperationResponse>;
  onUploadSkill: (file: File, name: string, bypassWarnings?: boolean) => Promise<CustomSkillOperationResponse>;
  onValidate: (content: string) => Promise<CustomSkillValidationResult | null>;
  onSkillGenerated?: (content: string) => void;
}

const SKILL_TEMPLATE = `# My Custom Skill

## When to Use This Skill
USE WHEN:
- [Describe situations where this skill applies]

DO NOT USE FOR:
- [Describe situations where this skill should NOT be used]

## Key Patterns

### Pattern 1
[Essential patterns, code snippets, best practices]

### Pattern 2
[Additional patterns]

## Anti-Patterns
- Never [thing to avoid]
- Do not [another thing to avoid]

## Checklist
- [ ] [Key item to verify]
- [ ] [Another item to verify]
`;

export function CustomSkillModal({
  isOpen,
  onClose,
  projectPath,
  existingSkills,
  onCreateSkill,
  onUploadSkill,
  onValidate,
}: CustomSkillModalProps) {
  const [mode, setMode] = useState<CustomSkillCreationMode>('upload');
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validation, setValidation] = useState<CustomSkillValidationResult | null>(null);
  const [showWarningsDialog, setShowWarningsDialog] = useState(false);

  // Reference docs for AI Chat mode
  const [referenceDocs, setReferenceDocs] = useState<RefDoc[]>([]);
  const [docsUploading, setDocsUploading] = useState(false);
  const docsInputRef = useRef<HTMLInputElement>(null);

  // AI Chat inline review state
  const [aiReviewContent, setAiReviewContent] = useState<string | null>(null);

  const isInAiReview = mode === 'ai-chat' && aiReviewContent !== null;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const validateTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Upload reference docs for AI Chat mode
  const handleDocsUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const remaining = 5 - referenceDocs.length;
    if (remaining <= 0) return;
    setDocsUploading(true);
    try {
      const formData = new FormData();
      Array.from(files).slice(0, remaining).forEach((f) => formData.append('files', f));
      const res = await fetch(`${API_BASE}/api/custom-agents/upload-docs`, { method: 'POST', body: formData });
      const data = await res.json() as { success: boolean; files?: RefDoc[]; error?: string };
      if (data.success && data.files) {
        setReferenceDocs((prev) => [...prev, ...data.files!].slice(0, 5));
      }
    } catch {
      // silently ignore upload errors — user can retry
    } finally {
      setDocsUploading(false);
      if (docsInputRef.current) docsInputRef.current.value = '';
    }
  };

  const handleClose = () => {
    setContent('');
    setName('');
    setFile(null);
    setError(null);
    setValidation(null);
    setShowWarningsDialog(false);
    setAiReviewContent(null);
    setReferenceDocs([]);
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

    // Auto-derive name from filename if name field is empty
    if (!name.trim()) {
      const derivedName = selectedFile.name
        .replace(/\.md$/i, '')
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
      if (derivedName) setName(derivedName);
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      const fileContent = e.target?.result as string;
      setContent(fileContent);
      const result = await onValidate(fileContent);
      setValidation(result);
    };
    reader.readAsText(selectedFile);
  };

  // Debounced validation for manual mode
  const handleContentChange = useCallback((newContent: string) => {
    setContent(newContent);
    if (validateTimerRef.current) clearTimeout(validateTimerRef.current);
    validateTimerRef.current = setTimeout(() => {
      if (newContent.trim()) {
        onValidate(newContent).then(setValidation);
      }
    }, 500);
  }, [onValidate]);

  // Handle AI-generated skill content — show inline review instead of closing modal
  const handleAiSkillGenerated = useCallback((skillContent: string) => {
    setAiReviewContent(skillContent);
    setContent(skillContent);
    setError(null);
    onValidate(skillContent).then(setValidation);
  }, [onValidate]);

  // Return from AI review to chat (preserves WebSocket session)
  const handleBackToChat = () => {
    setAiReviewContent(null);
    setError(null);
  };

  // Handle content change in AI review mode (with debounced validation)
  const handleAiReviewContentChange = useCallback((newContent: string) => {
    setContent(newContent);
    setAiReviewContent(newContent);
    if (validateTimerRef.current) clearTimeout(validateTimerRef.current);
    validateTimerRef.current = setTimeout(() => {
      if (newContent.trim()) {
        onValidate(newContent).then(setValidation);
      }
    }, 500);
  }, [onValidate]);

  // Validate name
  const isNameValid = /^[a-z0-9][a-z0-9-]*$/.test(name.trim());

  // Handle submit
  const handleSubmit = async (bypassWarnings = false) => {
    const trimmedName = name.trim();

    if (!trimmedName) {
      setError('Skill name is required');
      return;
    }
    if (!isNameValid) {
      setError('Name must be kebab-case (lowercase letters, numbers, hyphens)');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let result: CustomSkillOperationResponse;

      if (mode === 'upload' && file && !isInAiReview) {
        result = await onUploadSkill(file, trimmedName, bypassWarnings);
      } else if (content) {
        result = await onCreateSkill(trimmedName, content, bypassWarnings);
      } else {
        setError('No content provided');
        setLoading(false);
        return;
      }

      if (result.success) {
        handleClose();
      } else {
        if (
          result.validation?.bestPracticeWarnings?.some((w) => w.severity === 'warning') &&
          !bypassWarnings
        ) {
          setValidation(result.validation);
          setShowWarningsDialog(true);
        } else {
          setError(result.error || 'Failed to create skill');
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
        {validation.bestPracticeWarnings.length === 0 ? (
          <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
            <div className="flex items-center gap-2 text-green-400 font-medium">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Validation Passed
            </div>
          </div>
        ) : (
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

  const canSubmit = name.trim() && isNameValid && content.trim() && !loading;

  return (
    <>
      <Modal
        isOpen={isOpen && !showWarningsDialog}
        onClose={handleClose}
        title="Create Custom Skill"
        size={mode === 'ai-chat' && !isInAiReview ? 'full' : 'lg'}
        closeOnOverlayClick={false}
        footer={
          (mode !== 'ai-chat' || isInAiReview) ? (
            <ModalFooter
              onCancel={isInAiReview ? handleBackToChat : handleClose}
              cancelText={isInAiReview ? 'Back to Chat' : undefined}
              onConfirm={() => handleSubmit()}
              confirmText="Create Skill"
              loading={loading}
              disabled={!canSubmit}
            />
          ) : undefined
        }
      >
        <div className={clsx('space-y-6', mode === 'ai-chat' && !isInAiReview && 'h-[560px] flex flex-col')}>
          {/* Mode Selector — hidden during AI review */}
          {!isInAiReview && (
            <div className="flex gap-2 p-1 bg-surface-800 rounded-lg shrink-0">
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
              <button
                onClick={() => setMode('ai-chat')}
                className={clsx(
                  'flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors',
                  mode === 'ai-chat'
                    ? 'bg-primary-600 text-white'
                    : 'text-surface-400 hover:text-white'
                )}
              >
                AI Chat
              </button>
            </div>
          )}

          {/* Name field (Upload + Manual + AI Review modes) */}
          {(mode !== 'ai-chat' || isInAiReview) && (
            <div>
              <label className="block text-sm font-medium text-surface-300 mb-1">
                Skill Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => { setName(e.target.value); setError(null); }}
                placeholder="my-skill-name"
                className="w-full px-3 py-2 bg-surface-800 border border-surface-600 rounded-lg text-white text-sm placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
              <p className="text-xs text-surface-500 mt-1">
                Kebab-case. Will be referenced as <code className="text-primary-400">custom/{name || 'skill-name'}</code> in agent frontmatter.
              </p>
            </div>
          )}

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
                    <svg className="w-12 h-12 mx-auto text-green-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-white font-medium">{file.name}</p>
                    <p className="text-sm text-surface-400 mt-1">Click or drop to change file</p>
                  </div>
                ) : (
                  <div>
                    <svg className="w-12 h-12 mx-auto text-surface-500 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <p className="text-surface-300">
                      Drop a <code className="text-primary-400">.md</code> file here
                    </p>
                    <p className="text-sm text-surface-400 mt-1">or click to browse</p>
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
                  Content (SKILL.md)
                </label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    handleContentChange(SKILL_TEMPLATE);
                  }}
                >
                  Use Template
                </Button>
              </div>
              <textarea
                value={content}
                onChange={(e) => handleContentChange(e.target.value)}
                className="w-full h-64 px-3 py-2 bg-surface-800 border border-surface-600 rounded-lg text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
                placeholder="# My Skill&#10;&#10;## When to Use This Skill&#10;USE WHEN:&#10;- ..."
                spellCheck={false}
              />
              {renderValidation()}
            </div>
          )}

          {/* AI Chat Mode */}
          {mode === 'ai-chat' && (
            <>
              {/* Reference docs upload — shown only before review */}
              {!isInAiReview && (
                <div className="shrink-0">
                  <input
                    ref={docsInputRef}
                    type="file"
                    multiple
                    accept=".md,.txt,.html,.htm,.pdf"
                    className="hidden"
                    onChange={(e) => handleDocsUpload(e.target.files)}
                  />
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium text-surface-400">
                      Reference docs{referenceDocs.length > 0 ? ` (${referenceDocs.length}/5)` : ''} — optional
                    </span>
                    {referenceDocs.length < 5 && (
                      <button
                        type="button"
                        onClick={() => docsInputRef.current?.click()}
                        disabled={docsUploading}
                        className="text-xs px-2.5 py-1 rounded bg-surface-700 text-surface-300 hover:bg-surface-600 hover:text-white transition-colors disabled:opacity-50"
                      >
                        {docsUploading ? 'Uploading…' : '+ Upload PDF / MD / TXT'}
                      </button>
                    )}
                  </div>
                  {referenceDocs.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {referenceDocs.map((doc, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-700 text-surface-300 text-xs"
                        >
                          <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          {doc.name}
                          <button
                            type="button"
                            onClick={() => setReferenceDocs((prev) => prev.filter((_, j) => j !== i))}
                            className="ml-0.5 text-surface-500 hover:text-white transition-colors"
                            aria-label={`Remove ${doc.name}`}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Chat — hidden during review to preserve WebSocket session */}
              <div className={clsx('flex-1 min-h-0', isInAiReview && 'hidden')}>
                <SkillGenerationChat
                  projectPath={projectPath}
                  existingSkills={existingSkills}
                  onSkillGenerated={handleAiSkillGenerated}
                  onValidate={onValidate}
                  referenceDocs={referenceDocs}
                />
              </div>

              {/* AI Review editor */}
              {isInAiReview && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-surface-300">
                      Generated Skill Content
                    </label>
                    <Button variant="ghost" size="sm" onClick={handleBackToChat}>
                      Back to Chat
                    </Button>
                  </div>
                  <textarea
                    value={content}
                    onChange={(e) => handleAiReviewContentChange(e.target.value)}
                    className="w-full h-64 px-3 py-2 bg-surface-800 border border-surface-600 rounded-lg text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
                    spellCheck={false}
                  />
                  {renderValidation()}
                </div>
              )}
            </>
          )}

          {/* Error */}
          {error && (mode !== 'ai-chat' || isInAiReview) && (
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
