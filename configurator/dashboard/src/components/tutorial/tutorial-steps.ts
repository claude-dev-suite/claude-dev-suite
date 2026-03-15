// SPDX-License-Identifier: MIT

import type { TutorialStep } from '@/types/tutorial';

interface TutorialActions {
  setPanel: (panel: 'orchestrator' | 'code-review') => void;
  openModal: (id: string) => void;
  closeModal: (id: string) => void;
  openToolWindow: (id: 'git' | 'manage' | 'analytics') => void;
  closeToolWindow: (id: 'git' | 'manage' | 'analytics') => void;
  closeAllToolWindows: () => void;
}

const MANAGE_MODAL_ID = 'manage-fullscreen';

export function createTutorialSteps(actions: TutorialActions): TutorialStep[] {
  return [
    // 1. Welcome
    {
      id: 'welcome',
      type: 'welcome',
      group: 'welcome',
      title: 'Welcome to Dev-Suite!',
      content:
        'Dev-Suite supercharges your development workflow with AI agents, code review, Git integration, and more. This quick tour will show you the key features (~2 minutes).',
    },

    // 2. Header Tabs
    {
      id: 'header-tabs',
      type: 'spotlight',
      group: 'layout',
      title: 'Main Navigation',
      content:
        'These tabs switch between the main panels: Orchestrator for AI-powered tasks and Code Review for automated reviews.',
      target: 'header-tabs',
      tooltipPosition: 'bottom',
      spotlightPadding: 8,
    },

    // 3. Tool Window Bar
    {
      id: 'tool-window-bar',
      type: 'spotlight',
      group: 'layout',
      title: 'Tool Sidebar',
      content:
        'The right sidebar gives quick access to Git, Manage (settings & components), and Analytics.',
      target: 'tool-window-bar',
      tooltipPosition: 'left',
      spotlightPadding: 4,
    },

    // 4. Orchestrator Intro
    {
      id: 'orchestrator-intro',
      type: 'info-card',
      group: 'orchestrator',
      title: 'The Orchestrator',
      content:
        'The Orchestrator coordinates multiple AI agents to work on your project. You can submit jobs with specific tasks, chat with agents, and watch them work in real-time.',
      preAction: () => actions.setPanel('orchestrator'),
    },

    // 5. Console Area
    {
      id: 'console-area',
      type: 'spotlight',
      group: 'orchestrator',
      title: 'Live Console',
      content:
        'This is the real-time output console. Watch agent progress, see tool usage, and review results as they happen.',
      target: 'console-area',
      tooltipPosition: 'top',
      spotlightPadding: 4,
    },

    // 6. Chat Input
    {
      id: 'chat-input',
      type: 'spotlight',
      group: 'orchestrator',
      title: 'Chat & Commands',
      content:
        'Type messages to chat with agents. Use @mentions to target specific agents (e.g. @react-expert) and / for slash commands.',
      target: 'chat-input',
      tooltipPosition: 'top',
      spotlightPadding: 4,
    },

    // 7. Job Submission
    {
      id: 'job-submission',
      type: 'spotlight',
      group: 'orchestrator',
      title: 'Job Submission',
      content:
        'Create multi-agent jobs here. Add tasks for different agents, set dependencies between them, and execute the job.',
      target: 'job-submission',
      tooltipPosition: 'bottom',
      spotlightPadding: 8,
    },

    // 8. Code Review Panel
    {
      id: 'code-review-panel',
      type: 'spotlight',
      group: 'code-review',
      title: 'AI Code Review',
      content:
        'Run automated code reviews with specialized AI agents. Select which review agents to use (security, performance, QA, etc.).',
      target: 'code-review-panel',
      tooltipPosition: 'bottom',
      spotlightPadding: 8,
      preAction: () => actions.setPanel('code-review'),
    },

    // 9. Code Review Scope
    {
      id: 'code-review-scope',
      type: 'spotlight',
      group: 'code-review',
      title: 'Review Scope',
      content:
        'Choose what to review: only uncommitted changes for quick feedback, or select specific files for a full project review.',
      target: 'code-review-scope',
      tooltipPosition: 'bottom',
      spotlightPadding: 8,
    },

    // 10. Git Tool Button
    {
      id: 'git-tool-btn',
      type: 'spotlight',
      group: 'git',
      title: 'Git Integration',
      content: 'Click here to open the Git panel for repository management.',
      target: 'git-tool-btn',
      tooltipPosition: 'left',
      spotlightPadding: 6,
      preAction: () => {
        actions.setPanel('orchestrator');
        actions.closeAllToolWindows();
      },
    },

    // 11. Git Panel
    {
      id: 'git-panel',
      type: 'spotlight',
      group: 'git',
      title: 'Git Panel',
      content:
        'Full Git integration: stage/unstage files, commit changes, switch branches, and push/pull from remotes.',
      target: 'git-panel',
      tooltipPosition: 'left',
      spotlightPadding: 4,
      preAction: () => actions.openToolWindow('git'),
    },

    // 12. Manage Button
    {
      id: 'manage-btn',
      type: 'spotlight',
      group: 'manage',
      title: 'Manage Components',
      content:
        'Open the Manage panel to configure agents, MCP servers, hooks, automations, and more.',
      target: 'manage-btn',
      tooltipPosition: 'left',
      spotlightPadding: 6,
      preAction: () => actions.closeToolWindow('git'),
    },

    // 13. Manage Tabs
    {
      id: 'manage-tabs',
      type: 'spotlight',
      group: 'manage',
      title: 'Manage Tabs',
      content:
        'Navigate between sections: Agents, Custom Agents, Skills, MCP Servers, Automations, Hooks, and Updates.',
      target: 'manage-tabs',
      tooltipPosition: 'bottom',
      spotlightPadding: 4,
      preAction: () => actions.openModal(MANAGE_MODAL_ID),
    },

    // 14. Custom Agents Tab
    {
      id: 'custom-agents-tab',
      type: 'spotlight',
      group: 'manage',
      title: 'Custom Agents & Skills',
      content:
        'Create your own custom agents and skills with AI assistance. Define specialized behaviors tailored to your project.',
      target: 'custom-agents-tab',
      tooltipPosition: 'bottom',
      spotlightPadding: 4,
    },

    // 15. Analytics Button
    {
      id: 'analytics-tool-btn',
      type: 'spotlight',
      group: 'manage',
      title: 'Analytics',
      content:
        'Track Knowledge Base usage metrics and see how agents are performing across your project.',
      target: 'analytics-tool-btn',
      tooltipPosition: 'left',
      spotlightPadding: 6,
      preAction: () => actions.closeModal(MANAGE_MODAL_ID),
    },

    // 16. Completion
    {
      id: 'completion',
      type: 'welcome',
      group: 'completion',
      title: 'You\'re All Set!',
      content:
        'You now know the essentials of Dev-Suite. Start by chatting with agents in the Orchestrator or run a Code Review. You can restart this tour anytime from the "?" button in the header.',
      preAction: () => actions.closeAllToolWindows(),
    },
  ];
}
