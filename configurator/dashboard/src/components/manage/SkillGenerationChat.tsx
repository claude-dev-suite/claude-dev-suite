// SPDX-License-Identifier: MIT
/**
 * Skill Generation Chat
 *
 * Embedded chat with Claude for AI-driven custom skill creation.
 * Uses the orchestrator WebSocket for streaming multi-turn conversation.
 * Includes auto-validation feedback loop: validates generated content and
 * automatically sends fix requests to Claude if warnings are found (max 2 retries).
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { Console } from '../orchestrator/Console';
import { Button } from '../common';
import { useOrchestratorWebSocket } from '../orchestrator/hooks/useOrchestratorWebSocket';
import { buildSkillGenerationContext, extractSkillContent, type RefDoc } from './skill-generation-prompt';
import type { CustomSkillValidationResult } from '@/types/custom-agents';

const MAX_AUTO_FIX = 2;

export interface SkillGenerationChatProps {
  projectPath: string;
  existingSkills: string[];
  onSkillGenerated: (content: string) => void;
  /** Validate generated content; if warnings found, auto-sends fix requests to Claude */
  onValidate?: (content: string) => Promise<CustomSkillValidationResult | null>;
  /** Reference documents uploaded by the user — injected as context on first message */
  referenceDocs?: RefDoc[];
}

export function SkillGenerationChat({
  projectPath,
  existingSkills,
  onSkillGenerated,
  onValidate,
  referenceDocs,
}: SkillGenerationChatProps) {
  const [output, setOutput] = useState<string[]>([
    '\x1b[36m--- AI Skill Generation Chat ---\x1b[0m',
    '',
    'Describe the skill you want to create and I will guide you through the process.',
    'For example: "I need a skill for React testing patterns with Testing Library"',
    '',
  ]);
  const [inputValue, setInputValue] = useState('');
  const [chatActive, setChatActive] = useState(false);
  const [generatedContent, setGeneratedContent] = useState<string | null>(null);
  const [chatSessionId, setChatSessionId] = useState<string | null>(null);
  const [progressStatus, setProgressStatus] = useState<string>('');
  const isFirstMessageRef = useRef(true);
  const fullOutputRef = useRef('');
  const consoleRef = useRef<HTMLDivElement>(null);
  const pendingScrollRef = useRef(false);

  // Auto-validation feedback loop refs (stable closures via refs)
  const onValidateRef = useRef(onValidate);
  useEffect(() => { onValidateRef.current = onValidate; }, [onValidate]);
  const pendingContentRef = useRef<string | null>(null);
  const autoFixCountRef = useRef(0);
  const autoFixSendRef = useRef<((msg: string) => void) | null>(null);

  // Force scroll to bottom after React commits the user message to the DOM.
  useEffect(() => {
    if (pendingScrollRef.current && consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
      pendingScrollRef.current = false;
    }
  }, [output]);

  // Accumulate output and detect generated skill content
  const handleOutput = useCallback((text: string) => {
    fullOutputRef.current += text;
    setOutput((prev) => {
      const lines = text.split('\n');
      if (lines.length === 1) {
        const updated = [...prev];
        updated[updated.length - 1] = (updated[updated.length - 1] || '') + lines[0];
        return updated;
      }
      const updated = [...prev];
      updated[updated.length - 1] = (updated[updated.length - 1] || '') + lines[0];
      return [...updated, ...lines.slice(1)];
    });

    // Detect content and save to pending ref (banner shown after validation in handleJobComplete)
    const extracted = extractSkillContent(fullOutputRef.current);
    if (extracted) {
      pendingContentRef.current = extracted;
    }
  }, []);

  const handleJobComplete = useCallback(() => {
    const pending = pendingContentRef.current;

    if (pending && onValidateRef.current) {
      onValidateRef.current(pending).then((result) => {
        const issues = result?.bestPracticeWarnings || [];

        if (issues.length > 0 && autoFixCountRef.current < MAX_AUTO_FIX) {
          // Auto-send fix message to Claude
          autoFixCountRef.current++;
          const issuesList = issues.map((w) => `- [${w.severity}] ${w.message}`).join('\n');
          const fixMessage = `The generated skill has the following validation issues:\n${issuesList}\n\nPlease fix these issues and regenerate the complete SKILL.md file in a \`\`\`markdown code block.`;

          setOutput((prev) => [
            ...prev, '',
            `\x1b[33m\u26A1 Auto-fixing ${issues.length} issue(s) (attempt ${autoFixCountRef.current}/${MAX_AUTO_FIX})...\x1b[0m`,
            '',
          ]);
          setProgressStatus(`Auto-fixing issues (${autoFixCountRef.current}/${MAX_AUTO_FIX})...`);

          // Reset for new extraction
          fullOutputRef.current = '';
          pendingContentRef.current = null;

          autoFixSendRef.current?.(fixMessage);
          return; // Stay in chatActive state
        }

        // Validation passed or max retries reached — show the banner
        setGeneratedContent(pending);
        setChatActive(false);
        setProgressStatus('');
      }).catch(() => {
        // Validation call failed — show content without blocking
        setGeneratedContent(pending);
        setChatActive(false);
        setProgressStatus('');
      });
    } else if (pending) {
      // No validator provided — show content directly
      setGeneratedContent(pending);
      setChatActive(false);
      setProgressStatus('');
    } else {
      // No content detected
      setChatActive(false);
      setProgressStatus('');
    }
  }, []);

  const handleJobError = useCallback((error: string) => {
    setChatActive(false);
    setProgressStatus('');
    setOutput((prev) => [...prev, '', `\x1b[31mError: ${error}\x1b[0m`]);
  }, []);

  const handleJobCancelled = useCallback(() => {
    setChatActive(false);
    setProgressStatus('');
    setOutput((prev) => [...prev, '', '\x1b[33mChat cancelled.\x1b[0m']);
  }, []);

  const {
    connected,
    sendChatMessage,
    cancelChat,
    newChat,
  } = useOrchestratorWebSocket({
    projectPath,
    onOutput: handleOutput,
    onJobComplete: handleJobComplete,
    onJobError: handleJobError,
    onJobCancelled: handleJobCancelled,
    onChatSession: (sessionId) => {
      setChatSessionId(sessionId);
    },
    onProgress: (_percent, status) => {
      if (status) setProgressStatus(status);
    },
  });

  // Keep auto-fix send ref current (reads latest sendChatMessage + chatSessionId)
  useEffect(() => {
    autoFixSendRef.current = (msg: string) => {
      const readOnlyTools = ['Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch'];
      if (chatSessionId) {
        sendChatMessage(msg, chatSessionId, true, undefined, readOnlyTools);
      } else {
        sendChatMessage(msg, undefined, undefined, undefined, readOnlyTools);
      }
    };
  }, [chatSessionId, sendChatMessage]);

  // Start a fresh chat session on mount
  const hasInitializedRef = useRef(false);
  useEffect(() => {
    if (connected && !hasInitializedRef.current) {
      hasInitializedRef.current = true;
      newChat();
    }
  }, [connected, newChat]);

  const handleSend = useCallback(() => {
    const trimmed = inputValue.trim();
    if (!trimmed || !connected) return;

    // Show user message in console
    setOutput((prev) => [...prev, '', `\x1b[32m> ${trimmed}\x1b[0m`, '']);

    pendingScrollRef.current = true;

    let message = trimmed;

    // Prepend context prompt on first message
    if (isFirstMessageRef.current) {
      const context = buildSkillGenerationContext(existingSkills, referenceDocs);
      message = context + trimmed;
      isFirstMessageRef.current = false;
    }

    setChatActive(true);
    setProgressStatus('Processing...');
    fullOutputRef.current = '';
    setGeneratedContent(null);
    pendingContentRef.current = null;
    autoFixCountRef.current = 0;

    // Generation chats use read-only tools — Claude must output content as text, not create files
    const readOnlyTools = ['Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch'];

    if (chatSessionId) {
      sendChatMessage(message, chatSessionId, true, undefined, readOnlyTools);
    } else {
      sendChatMessage(message, undefined, undefined, undefined, readOnlyTools);
    }
    setInputValue('');
  }, [inputValue, connected, existingSkills, sendChatMessage, chatSessionId, referenceDocs]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const handleCancel = useCallback(() => {
    cancelChat();
    setChatActive(false);
  }, [cancelChat]);

  const handleUseSkill = useCallback(() => {
    if (generatedContent) {
      onSkillGenerated(generatedContent);
    }
  }, [generatedContent, onSkillGenerated]);

  return (
    <div className="flex flex-col h-full space-y-3">
      {/* Console output */}
      <div className="flex-1 min-h-0 bg-surface-900 border border-surface-700 rounded-lg overflow-hidden">
        <Console output={output} size="full" minimal containerRef={consoleRef} className="h-full" />
      </div>

      {/* Loading indicator */}
      {chatActive && (
        <div className="flex items-center gap-2 px-2 py-1.5 text-sm text-surface-400">
          <div className="w-3.5 h-3.5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          <span>{progressStatus || 'Claude is thinking...'}</span>
        </div>
      )}

      {/* Skill detected banner */}
      {generatedContent && (
        <div className="flex items-center justify-between p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-green-300 font-medium">
              Skill generated!
            </span>
          </div>
          <Button size="sm" onClick={handleUseSkill}>
            Use This Skill
          </Button>
        </div>
      )}

      {/* Connection status */}
      {!connected && (
        <div className="text-xs text-yellow-400 px-1">
          Connecting to orchestrator...
        </div>
      )}

      {/* Input area */}
      <div className="flex gap-2">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={!connected || chatActive}
          placeholder={
            !connected
              ? 'Waiting for connection...'
              : chatActive
                ? 'Claude is responding...'
                : 'Describe the skill you want to create...'
          }
          className="flex-1 px-3 py-2 bg-surface-800 border border-surface-600 rounded-lg text-white text-sm placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:opacity-50"
        />
        {chatActive ? (
          <Button variant="ghost" size="sm" onClick={handleCancel}>
            Cancel
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={handleSend}
            disabled={!connected || !inputValue.trim()}
          >
            Send
          </Button>
        )}
      </div>
    </div>
  );
}
