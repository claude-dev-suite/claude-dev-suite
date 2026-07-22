// SPDX-License-Identifier: MIT
/**
 * Mode Selection Component
 *
 * Allows the user to choose between:
 * - Configuring an existing project with dev-suite
 * - Creating a new project from a template
 */

import { memo } from 'react';
import type { WizardMode } from '@/types';
import { PanelSection } from '../layout';

interface ModeCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  features: string[];
  onClick: () => void;
}

const ModeCard = memo(function ModeCard({
  title,
  description,
  icon,
  features,
  onClick,
}: ModeCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-start p-6 bg-surface-800 border border-surface-700 rounded-lg hover:border-primary-500/50 hover:bg-surface-700/50 transition-all duration-200 text-left group focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-surface-900"
    >
      <div className="flex items-center gap-4 mb-4 w-full">
        <div className="p-3 bg-surface-700 rounded-lg group-hover:bg-primary-500/20 transition-colors">
          {icon}
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white group-hover:text-primary-400 transition-colors">
            {title}
          </h3>
          <p className="text-sm text-gray-400">{description}</p>
        </div>
      </div>

      <ul className="space-y-2 w-full">
        {features.map((feature, index) => (
          <li key={index} className="flex items-center gap-2 text-sm text-gray-300">
            <svg
              className="w-4 h-4 text-green-500 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
            {feature}
          </li>
        ))}
      </ul>

      <div className="mt-6 w-full flex justify-end">
        <span className="text-sm text-primary-400 group-hover:translate-x-1 transition-transform flex items-center gap-1">
          Get Started
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </span>
      </div>
    </button>
  );
});

export interface ModeSelectionProps {
  onModeSelect: (mode: WizardMode) => void;
}

export const ModeSelection = memo(function ModeSelection({
  onModeSelect,
}: ModeSelectionProps) {
  return (
    <PanelSection
      title="Welcome to Dev-Suite"
      description="Choose how you want to get started"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
        {/* Configure Existing Project */}
        <ModeCard
          title="Configure Existing Project"
          description="Add dev-suite to an existing codebase"
          icon={
            <svg
              className="w-6 h-6 text-blue-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          }
          features={[
            'Auto-detect your tech stack',
            'Get recommended agents and MCP servers',
            'Configure environment variables',
            'Generate agent routing (AGENTS.md, shared across assistants)',
          ]}
          onClick={() => onModeSelect('configure')}
        />

        {/* Create New Project */}
        <ModeCard
          title="Create New Project"
          description="Scaffold a new project from template"
          icon={
            <svg
              className="w-6 h-6 text-green-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 6v6m0 0v6m0-6h6m-6 0H6"
              />
            </svg>
          }
          features={[
            'Choose from 10+ project templates',
            'Frontend, Backend, or Full Stack',
            'Pre-configured with best practices',
            'Automatic dev-suite integration',
          ]}
          onClick={() => onModeSelect('create')}
        />
      </div>

      {/* Footer hint */}
      <div className="mt-8 text-center text-sm text-gray-500">
        <p>
          Not sure which to choose? If you have an existing codebase, select{' '}
          <span className="text-blue-400">Configure Existing Project</span>.
          <br />
          For starting fresh, select{' '}
          <span className="text-green-400">Create New Project</span>.
        </p>
      </div>
    </PanelSection>
  );
});
