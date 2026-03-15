// SPDX-License-Identifier: MIT
/**
 * Orchestrator API Routes
 *
 * Endpoints for orchestrator workflows and MCP suggestions.
 *
 * Note: Job-to-chat context continuity is now handled via session resumption
 * (frontend passes job sessionId to chat), not via context injection endpoints.
 */

import { Router, type Request, type Response } from 'express';
import { resolveProjectPath, PathValidationError } from '../utils/utilities.js';
import { WorkflowsService } from '../services/workflows.service.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as readline from 'readline';
import { createReadStream } from 'fs';

export const orchestratorRoutes = Router();
const workflowsService = new WorkflowsService();

// POST /api/orchestrator/mcp-suggestions - Get MCP server suggestions for a prompt
// Also aliased as /api/orchestrator/analyze-mcp for backward compatibility
const mcpSuggestionsHandler = async (req: Request, res: Response) => {
  try {
    const { prompt, selectedAgents } = req.body as { prompt?: string; selectedAgents?: string[] };

    if (!prompt) {
      return res.status(400).json({
        success: false,
        error: 'prompt is required',
      });
    }

    const suggestions = workflowsService.analyzePromptForMcp(prompt, selectedAgents || []);

    return res.json({
      success: true,
      suggestions,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Failed to analyze prompt',
    });
  }
};

orchestratorRoutes.post('/orchestrator/mcp-suggestions', mcpSuggestionsHandler);
orchestratorRoutes.post('/orchestrator/analyze-mcp', mcpSuggestionsHandler);

// GET /api/orchestrator/workflows - Get all workflows (builtin + custom)
orchestratorRoutes.get('/orchestrator/workflows', async (req: Request, res: Response) => {
  try {
    const projectPath = resolveProjectPath(req.query.project_path);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');

    const workflows = await workflowsService.getAllWorkflows(projectPath);

    return res.json(workflows);
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Failed to get workflows',
    });
  }
});

// POST /api/orchestrator/workflows - Create/update custom workflow
orchestratorRoutes.post('/orchestrator/workflows', async (req: Request, res: Response) => {
  try {
    const { projectPath, workflow } = req.body as {
      projectPath?: string;
      workflow?: { id: string; name: string; [key: string]: unknown };
    };

    if (!projectPath) {
      return res.status(400).json({
        success: false,
        error: 'projectPath is required',
      });
    }

    if (!workflow || !workflow.id || !workflow.name) {
      return res.status(400).json({
        success: false,
        error: 'workflow with id and name is required',
      });
    }

    const customWorkflows = await workflowsService.loadCustomWorkflows(projectPath);

    // Update existing or add new
    const existingIdx = customWorkflows.findIndex(w => w.id === workflow.id);
    if (existingIdx >= 0) {
      customWorkflows[existingIdx] = workflow as any;
    } else {
      customWorkflows.push(workflow as any);
    }

    await workflowsService.saveCustomWorkflows(projectPath, customWorkflows);

    return res.json({
      success: true,
      workflow: customWorkflows.find(w => w.id === workflow.id),
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Failed to save workflow',
    });
  }
});

// DELETE /api/orchestrator/workflows/:id - Delete custom workflow
orchestratorRoutes.delete('/orchestrator/workflows/:id', async (req: Request, res: Response) => {
  try {
    const workflowId = req.params.id;
    const { projectPath } = req.body as { projectPath?: string };

    if (!projectPath) {
      return res.status(400).json({
        success: false,
        error: 'projectPath is required',
      });
    }

    const customWorkflows = await workflowsService.loadCustomWorkflows(projectPath);
    const filteredWorkflows = customWorkflows.filter(w => w.id !== workflowId);

    if (filteredWorkflows.length === customWorkflows.length) {
      return res.status(404).json({
        success: false,
        error: 'Workflow not found',
      });
    }

    await workflowsService.saveCustomWorkflows(projectPath, filteredWorkflows);

    return res.json({
      success: true,
      deleted: workflowId,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Failed to delete workflow',
    });
  }
});

// ============================================
// SESSION MANAGEMENT
// ============================================

interface SessionInfo {
  id: string;
  timestamp: Date;
  firstMessage: string | null;
  messageCount: number;
  size: number;
}

/**
 * Encode project path to Claude's folder name format
 */
function encodeProjectPath(projectPath: string): string {
  // Claude uses path with slashes/backslashes replaced by dashes
  return projectPath.replace(/[/\\:]/g, '-').replace(/^-+/, '');
}

/**
 * Read first few lines of a JSONL file to extract session metadata
 */
async function getSessionMetadata(filePath: string): Promise<{ firstMessage: string | null; messageCount: number }> {
  return new Promise((resolve) => {
    let firstUserMessage: string | null = null;
    let lineCount = 0;
    const maxLines = 100; // Only scan first 100 lines for performance

    const rl = readline.createInterface({
      input: createReadStream(filePath, { encoding: 'utf-8' }),
      crlfDelay: Infinity,
    });

    rl.on('line', (line) => {
      lineCount++;
      if (lineCount > maxLines) {
        rl.close();
        return;
      }

      try {
        const parsed = JSON.parse(line);
        // Look for user message to get first prompt
        if (!firstUserMessage && parsed.type === 'user' && parsed.message?.content) {
          const content = parsed.message.content;
          if (Array.isArray(content) && content[0]?.text) {
            firstUserMessage = content[0].text.substring(0, 100);
          } else if (typeof content === 'string') {
            firstUserMessage = content.substring(0, 100);
          }
        }
      } catch {
        // Skip malformed lines
      }
    });

    rl.on('close', () => {
      resolve({ firstMessage: firstUserMessage, messageCount: lineCount });
    });

    rl.on('error', () => {
      resolve({ firstMessage: null, messageCount: 0 });
    });
  });
}

// GET /api/orchestrator/sessions/:id/history - Get session conversation history
orchestratorRoutes.get('/orchestrator/sessions/:id/history', async (req: Request, res: Response) => {
  try {
    const sessionId = req.params.id as string | undefined;
    // SECURITY: Validate sessionId is a safe UUID-like identifier — no path separators, dots, or
    // other characters that could be used for path traversal when used in file paths.
    const SESSION_ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;
    if (!sessionId || !SESSION_ID_PATTERN.test(sessionId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid session ID format',
      });
    }
    const rawProjectPath = req.query.project_path;
    const projectPath = resolveProjectPath(rawProjectPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');

    // Find Claude's project sessions folder
    let claudeDir = path.join(os.homedir(), '.claude', 'projects');
    if (claudeDir.includes('..')) throw new Error('Path traversal not allowed');
    claudeDir = resolveProjectPath(claudeDir);
    if (!path.isAbsolute(claudeDir)) throw new PathValidationError('Path must be rooted');
    const encodedPath = encodeProjectPath(projectPath);
    const sessionFile = path.join(claudeDir, encodedPath, `${sessionId}.jsonl`);

    // Check if file exists
    try {
      await fs.access(sessionFile);
    } catch {
      return res.status(404).json({
        success: false,
        error: 'Session not found',
      });
    }

    // Read and parse the session file
    const content = await fs.readFile(sessionFile, 'utf-8');
    const lines = content.trim().split('\n').filter(l => l.trim());

    interface ConversationMessage {
      role: 'user' | 'assistant' | 'system';
      content: string;
      timestamp?: string;
    }

    const messages: ConversationMessage[] = [];

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);

        // User messages
        if (parsed.type === 'user' && parsed.message?.content) {
          const content = parsed.message.content;
          let text = '';
          if (Array.isArray(content)) {
            text = content.map((c: any) => c.text || '').join('');
          } else if (typeof content === 'string') {
            text = content;
          }
          if (text.trim()) {
            messages.push({
              role: 'user',
              content: text,
              timestamp: parsed.timestamp,
            });
          }
        }

        // Assistant messages
        if (parsed.type === 'assistant' && parsed.message?.content) {
          const content = parsed.message.content;
          let text = '';
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === 'text' && block.text) {
                text += block.text;
              } else if (block.type === 'tool_use') {
                text += `\n[Tool: ${block.name}]\n`;
              }
            }
          }
          if (text.trim()) {
            messages.push({
              role: 'assistant',
              content: text,
              timestamp: parsed.timestamp,
            });
          }
        }
      } catch {
        // Skip malformed lines
      }
    }

    return res.json({
      success: true,
      sessionId,
      messages,
      messageCount: messages.length,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Failed to read session history',
    });
  }
});

// GET /api/orchestrator/sessions - List available sessions for a project
orchestratorRoutes.get('/orchestrator/sessions', async (req: Request, res: Response) => {
  try {
    const projectPath = resolveProjectPath(req.query.project_path);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');

    // Find Claude's project sessions folder
    let claudeDir = path.join(os.homedir(), '.claude', 'projects');
    claudeDir = resolveProjectPath(claudeDir);
    if (!path.isAbsolute(claudeDir)) throw new PathValidationError('Path must be rooted');
    const encodedPath = encodeProjectPath(projectPath);
    const projectSessionsDir = path.join(claudeDir, encodedPath);

    // Check if directory exists
    try {
      await fs.access(projectSessionsDir);
    } catch {
      return res.json({
        success: true,
        sessions: [],
        message: 'No sessions found for this project',
      });
    }

    // List all .jsonl files (excluding agent-* files which are subagent sessions)
    const files = await fs.readdir(projectSessionsDir);
    const sessionFiles = files.filter(f =>
      f.endsWith('.jsonl') &&
      !f.startsWith('agent-') &&
      f.length > 10 // Filter out very short names
    );

    // Get metadata for each session
    const sessions: SessionInfo[] = [];
    for (const file of sessionFiles) {
      const filePath = path.join(projectSessionsDir, file);
      const stats = await fs.stat(filePath);

      // Skip empty files
      if (stats.size === 0) continue;

      const sessionId = file.replace('.jsonl', '');
      const metadata = await getSessionMetadata(filePath);

      sessions.push({
        id: sessionId,
        timestamp: stats.mtime,
        firstMessage: metadata.firstMessage,
        messageCount: metadata.messageCount,
        size: stats.size,
      });
    }

    // Sort by timestamp descending (most recent first)
    sessions.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    // Limit to 20 most recent
    const recentSessions = sessions.slice(0, 20);

    return res.json({
      success: true,
      sessions: recentSessions,
      projectPath,
      sessionsDir: projectSessionsDir,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Failed to list sessions',
    });
  }
});

