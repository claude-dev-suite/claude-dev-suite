// SPDX-License-Identifier: MIT
/**
 * Agent Generation Chat
 *
 * Embedded chat with Claude for AI-driven custom agent creation.
 * Uses the orchestrator WebSocket for streaming multi-turn conversation.
 * Includes auto-validation feedback loop: validates generated content and
 * automatically sends fix requests to Claude if errors/warnings are found (max 2 retries).
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { Console } from '../orchestrator/Console';
import { Button } from '../common';
import { useOrchestratorWebSocket } from '../orchestrator/hooks/useOrchestratorWebSocket';
import { buildAgentGenerationContext } from './agent-generation-prompt';
import type { CustomSkill, GeneratedSkill, CustomAgentValidationResult } from '@/types/custom-agents';

const MAX_AUTO_FIX = 2;

export interface AgentGenerationChatProps {
  projectPath: string;
  availableSkills: CustomSkill[];
  availableMcpServers: string[];
  onAgentGenerated: (content: string, skills: GeneratedSkill[]) => void;
  /** Validate generated content; if errors/warnings found, auto-sends fix requests to Claude */
  onValidate?: (content: string) => Promise<CustomAgentValidationResult | null>;
}

/**
 * Extract a markdown agent definition from Claude's output.
 * Uses fence-level counting to correctly handle nested code blocks
 * (e.g. ```typescript inside ```markdown).
 */
function extractAgentContent(fullOutput: string): string | null {
  // Find opening ```markdown or ``` followed by ---
  const openMatch = fullOutput.match(/```(?:markdown|md)?\s*\n/);
  if (!openMatch || openMatch.index === undefined) return null;

  const startIndex = openMatch.index + openMatch[0].length;
  const remaining = fullOutput.substring(startIndex);
  const lines = remaining.split('\n');

  // Count fence levels: ``` with language tag = open, standalone ``` = close
  let level = 1;
  let endLineIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i]!.trim();
    if (/^```\w/.test(trimmed)) {
      level++;
    } else if (trimmed === '```') {
      level--;
      if (level === 0) {
        endLineIndex = i;
        break;
      }
    }
  }

  if (endLineIndex === -1) return null;

  const content = lines.slice(0, endLineIndex).join('\n').trim();

  // Must be an agent (starts with --- frontmatter)
  if (!content.startsWith('---')) return null;
  return content;
}

/**
 * Extract skill definitions from ```skill:name code blocks.
 * Uses fence-level counting for nested code blocks.
 */
function extractSkillsContent(fullOutput: string): GeneratedSkill[] {
  const skills: GeneratedSkill[] = [];
  const openPattern = /```skill:([a-z0-9][a-z0-9-]*)\s*\n/g;
  let openMatch: RegExpExecArray | null;

  while ((openMatch = openPattern.exec(fullOutput)) !== null) {
    const name = openMatch[1];
    if (!name) continue;

    const startIndex = openMatch.index + openMatch[0].length;
    const remaining = fullOutput.substring(startIndex);
    const lines = remaining.split('\n');

    let level = 1;
    let endLineIndex = -1;

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i]!.trim();
      if (/^```\w/.test(trimmed)) {
        level++;
      } else if (trimmed === '```') {
        level--;
        if (level === 0) {
          endLineIndex = i;
          break;
        }
      }
    }

    if (endLineIndex !== -1) {
      const content = lines.slice(0, endLineIndex).join('\n').trim();
      if (content) {
        skills.push({ name: name.trim(), content });
      }
      // Advance regex past this block
      openPattern.lastIndex = startIndex + lines.slice(0, endLineIndex + 1).join('\n').length;
    }
  }

  return skills;
}

export function AgentGenerationChat({
  projectPath,
  availableSkills,
  availableMcpServers,
  onAgentGenerated,
  onValidate,
}: AgentGenerationChatProps) {
  const [output, setOutput] = useState<string[]>([
    '\x1b[36m--- AI Agent Generation Chat ---\x1b[0m',
    '',
    'Describe the agent you want to create and I will guide you through the process.',
    'For example: "I need an agent expert in Spring Boot for my Java backend project"',
    '',
  ]);
  const [inputValue, setInputValue] = useState('');
  const [chatActive, setChatActive] = useState(false);
  const [generatedContent, setGeneratedContent] = useState<string | null>(null);
  const [generatedSkills, setGeneratedSkills] = useState<GeneratedSkill[]>([]);
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
  const pendingSkillsRef = useRef<GeneratedSkill[]>([]);
  const autoFixCountRef = useRef(0);
  const autoFixSendRef = useRef<((msg: string) => void) | null>(null);

  // Force scroll to bottom after React commits the user message to the DOM.
  // This fires AFTER Console's own useEffect (child effects run first),
  // so it overrides the autoScrollRef guard when the user explicitly sends.
  useEffect(() => {
    if (pendingScrollRef.current && consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
      pendingScrollRef.current = false;
    }
  }, [output]);

  // Accumulate output and detect generated agent content
  const handleOutput = useCallback((text: string) => {
    fullOutputRef.current += text;
    setOutput((prev) => {
      // Append text to existing output, splitting by newlines
      const lines = text.split('\n');
      if (lines.length === 1) {
        // Append to last line
        const updated = [...prev];
        updated[updated.length - 1] = (updated[updated.length - 1] || '') + lines[0];
        return updated;
      }
      // First part appends to last line, rest are new lines
      const updated = [...prev];
      updated[updated.length - 1] = (updated[updated.length - 1] || '') + lines[0];
      return [...updated, ...lines.slice(1)];
    });

    // Detect content and save to pending refs (banner shown after validation in handleJobComplete)
    const extracted = extractAgentContent(fullOutputRef.current);
    if (extracted) {
      pendingContentRef.current = extracted;
    }

    const extractedSkills = extractSkillsContent(fullOutputRef.current);
    if (extractedSkills.length > 0) {
      pendingSkillsRef.current = extractedSkills;
    }
  }, []);

  const handleJobComplete = useCallback(() => {
    const pending = pendingContentRef.current;
    const pendingSkills = pendingSkillsRef.current;

    if (pending && onValidateRef.current) {
      onValidateRef.current(pending).then((result) => {
        const schemaErrors = (!result?.valid && result?.schemaErrors) ? result.schemaErrors : [];
        const bpIssues = result?.bestPracticeWarnings || [];
        const hasIssues = schemaErrors.length > 0 || bpIssues.length > 0;

        if (hasIssues && autoFixCountRef.current < MAX_AUTO_FIX) {
          // Auto-send fix message to Claude
          autoFixCountRef.current++;
          const parts: string[] = [];
          if (schemaErrors.length > 0) {
            parts.push('SCHEMA ERRORS (must fix):\n' + schemaErrors.map((e) => `- ${e}`).join('\n'));
          }
          if (bpIssues.length > 0) {
            parts.push('BEST PRACTICE ISSUES (must fix):\n' + bpIssues.map((w) => `- [${w.severity}] ${w.message}`).join('\n'));
          }

          const issueCount = schemaErrors.length + bpIssues.length;
          const fixMessage = `The generated agent has the following issues:\n\n${parts.join('\n\n')}\n\nPlease fix these issues and regenerate the complete agent .md file in a \`\`\`markdown code block.${pendingSkills.length > 0 ? ' Also regenerate any skill blocks.' : ''}`;

          setOutput((prev) => [
            ...prev, '',
            `\x1b[33m\u26A1 Auto-fixing ${issueCount} issue(s) (attempt ${autoFixCountRef.current}/${MAX_AUTO_FIX})...\x1b[0m`,
            '',
          ]);
          setProgressStatus(`Auto-fixing issues (${autoFixCountRef.current}/${MAX_AUTO_FIX})...`);

          // Reset for new extraction
          fullOutputRef.current = '';
          pendingContentRef.current = null;
          pendingSkillsRef.current = [];

          autoFixSendRef.current?.(fixMessage);
          return; // Stay in chatActive state
        }

        // Validation passed or max retries reached — show the banner
        setGeneratedContent(pending);
        setGeneratedSkills(pendingSkills);
        setChatActive(false);
        setProgressStatus('');
      }).catch(() => {
        // Validation call failed — show content without blocking
        setGeneratedContent(pending);
        setGeneratedSkills(pendingSkills);
        setChatActive(false);
        setProgressStatus('');
      });
    } else if (pending) {
      // No validator provided — show content directly
      setGeneratedContent(pending);
      setGeneratedSkills(pendingSkills);
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

    // Flag scroll — the useEffect on `output` will fire after React commits
    // the new lines to the DOM, ensuring scrollHeight includes them.
    pendingScrollRef.current = true;

    let message = trimmed;

    // Prepend context prompt on first message
    if (isFirstMessageRef.current) {
      const context = buildAgentGenerationContext(
        availableSkills.map((s) => s.id),
        availableMcpServers,
      );
      message = context + trimmed;
      isFirstMessageRef.current = false;
    }

    setChatActive(true);
    setProgressStatus('Processing...');
    // Reset accumulated output for detection of new agent content
    fullOutputRef.current = '';
    setGeneratedContent(null);
    setGeneratedSkills([]);
    pendingContentRef.current = null;
    pendingSkillsRef.current = [];
    autoFixCountRef.current = 0;

    // Generation chats use read-only tools — Claude must output content as text, not create files
    const readOnlyTools = ['Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch'];

    if (chatSessionId) {
      sendChatMessage(message, chatSessionId, true, undefined, readOnlyTools);
    } else {
      sendChatMessage(message, undefined, undefined, undefined, readOnlyTools);
    }
    setInputValue('');
  }, [inputValue, connected, availableSkills, availableMcpServers, sendChatMessage, chatSessionId]);

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

  const handleUseAgent = useCallback(() => {
    if (generatedContent) {
      onAgentGenerated(generatedContent, generatedSkills);
    }
  }, [generatedContent, generatedSkills, onAgentGenerated]);

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

      {/* Agent detected banner */}
      {generatedContent && (
        <div className="flex items-center justify-between p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-green-300 font-medium">
              Agent generated!
              {generatedSkills.length > 0 && (
                <span className="text-green-400/80 font-normal ml-1">
                  ({generatedSkills.length} skill{generatedSkills.length !== 1 ? 's' : ''} included)
                </span>
              )}
            </span>
          </div>
          <Button size="sm" onClick={handleUseAgent}>
            Use This Agent
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
                : 'Describe the agent you want to create...'
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
