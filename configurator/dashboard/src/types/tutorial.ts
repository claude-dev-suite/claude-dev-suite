// SPDX-License-Identifier: MIT

export type TutorialStepType = 'welcome' | 'spotlight' | 'info-card';

export type TooltipPosition = 'top' | 'bottom' | 'left' | 'right' | 'auto';

export type TutorialGroup =
  | 'welcome'
  | 'layout'
  | 'orchestrator'
  | 'code-review'
  | 'git'
  | 'manage'
  | 'completion';

export interface TutorialStep {
  id: string;
  type: TutorialStepType;
  group: TutorialGroup;
  title: string;
  content: string;
  target?: string;
  tooltipPosition?: TooltipPosition;
  spotlightPadding?: number;
  spotlightBorderRadius?: number;
  preAction?: () => void | Promise<void>;
  postAction?: () => void | Promise<void>;
}
