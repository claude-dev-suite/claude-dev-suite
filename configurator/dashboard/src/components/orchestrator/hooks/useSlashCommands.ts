// SPDX-License-Identifier: MIT
/**
 * Hook for handling slash commands in the orchestrator
 */

import { useCallback } from 'react';
import type { AutocompleteItem } from '../ChatInput';

export interface SlashCommandsConfig {
  installedAgents: string[];
  installedMcpServers: string[];
  projectCommands: AutocompleteItem[];
  addOutput: (text: string) => void;
  clearOutput: () => void;
  setCurrentJob: (job: null) => void;
  setProgressStatus: (status: string) => void;
  setCurrentAgent: (agent: string) => void;
  setChatSessionId: (id: string | null) => void;
  wsConnected: boolean;
  wsNewChat: () => void;
  wsClearJobContext: () => void;
  setShowSessionPicker: (show: boolean) => void;
}

export function useSlashCommands(config: SlashCommandsConfig) {
  const {
    installedAgents,
    installedMcpServers,
    projectCommands,
    addOutput,
    clearOutput,
    setCurrentJob,
    setProgressStatus,
    setCurrentAgent,
    setChatSessionId,
    wsConnected,
    wsNewChat,
    wsClearJobContext,
    setShowSessionPicker,
  } = config;

  const handleSlashCommand = useCallback(
    (command: string): boolean => {
      const cmd = command.toLowerCase().trim();

      if (cmd === '/agents') {
        const agentList =
          installedAgents.length > 0
            ? installedAgents.map((a) => `  \x1b[35m@${a}\x1b[0m`).join('\n')
            : '  \x1b[90mNo agents installed\x1b[0m';
        addOutput(
          `\x1b[34m📋 Installed Agents:\x1b[0m\n${agentList}\n\n\x1b[90mUse @agent-name to invoke a specific agent\x1b[0m`
        );
        return true;
      }

      if (cmd === '/mcp') {
        const mcpList =
          installedMcpServers.length > 0
            ? installedMcpServers.map((s) => `  \x1b[33m${s}\x1b[0m`).join('\n')
            : '  \x1b[90mNo MCP servers installed\x1b[0m';
        addOutput(
          `\x1b[34m🔌 Installed MCP Servers:\x1b[0m\n${mcpList}\n\n\x1b[90mMCP tools are available as mcp__{server}__{tool}\x1b[0m`
        );
        return true;
      }

      if (cmd === '/commands') {
        let commandsText = '\x1b[34m⚡ Available Commands:\x1b[0m\n\n';
        commandsText += '\x1b[97mDashboard commands:\x1b[0m\n';
        commandsText += '  \x1b[36m/agents\x1b[0m - List installed agents\n';
        commandsText += '  \x1b[36m/mcp\x1b[0m - List installed MCP servers\n';
        commandsText += '  \x1b[36m/commands\x1b[0m - Show this list\n';
        commandsText += '  \x1b[36m/clear\x1b[0m - Clear output\n';
        commandsText += '  \x1b[36m/new\x1b[0m - Start new chat session\n';
        commandsText += '  \x1b[36m/resume\x1b[0m - Resume a previous session\n';
        commandsText += '  \x1b[36m/help\x1b[0m - Show help\n';

        if (projectCommands.length > 0) {
          commandsText += '\n\x1b[97mProject commands (sent to Claude):\x1b[0m\n';
          projectCommands.forEach((c) => {
            commandsText += `  \x1b[36m${c.name}\x1b[0m - \x1b[90m${c.description.substring(0, 50)}${c.description.length > 50 ? '...' : ''}\x1b[0m\n`;
          });
        }
        addOutput(commandsText);
        return true;
      }

      if (cmd === '/help') {
        const helpText = `\x1b[34m📖 Quick Help:\x1b[0m
  \x1b[36m/commands\x1b[0m - Show all available commands
  \x1b[36m/agents\x1b[0m - List installed agents
  \x1b[36m/mcp\x1b[0m - List installed MCP servers
  \x1b[36m/clear\x1b[0m - Clear output
  \x1b[36m/new\x1b[0m - Start new chat session
  \x1b[36m/resume\x1b[0m - Resume a previous session

\x1b[34m💡 Tips:\x1b[0m
  • Use \x1b[35m@agent-name\x1b[0m to invoke a specific agent (e.g., @react-expert)
  • Agents are auto-detected from keywords in your message
  • Project commands (like /docs, /generate) are sent to Claude`;
        addOutput(helpText);
        return true;
      }

      if (cmd === '/clear') {
        clearOutput();
        return true;
      }

      if (cmd === '/new') {
        if (wsConnected) {
          clearOutput();
          setCurrentJob(null);
          setProgressStatus('Ready - Configure agents and click Execute Job');
          setCurrentAgent('');
          setChatSessionId(null);
          localStorage.removeItem('orchestrator_session_id');
          wsNewChat();
          wsClearJobContext();
        }
        return true;
      }

      if (cmd === '/resume') {
        setShowSessionPicker(true);
        return true;
      }

      return false;
    },
    [
      installedAgents,
      installedMcpServers,
      projectCommands,
      addOutput,
      clearOutput,
      setCurrentJob,
      setProgressStatus,
      setCurrentAgent,
      setChatSessionId,
      wsConnected,
      wsNewChat,
      wsClearJobContext,
      setShowSessionPicker,
    ]
  );

  return { handleSlashCommand };
}
