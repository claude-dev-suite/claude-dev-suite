// SPDX-License-Identifier: MIT
/**
 * Project Store - Manages wizard state and project configuration
 *
 * This store handles the state for the initialization wizard:
 * - Project path and detection results
 * - Selected agents and MCP servers
 * - Environment variables configuration
 *
 * @example
 * ```tsx
 * const { projectPath, setProjectPath, selectedAgents, toggleAgent } = useProjectStore();
 * ```
 */

import { create, type StateCreator } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { DetectionResponse, EnvVarWithDetection } from '@/types';

interface ProjectState {
  // ============================================
  // STATE
  // ============================================

  /** Project path being configured */
  projectPath: string;

  /** Whether dev-suite is already installed in the project */
  isInstalled: boolean;

  /** Detection result from backend */
  detection: DetectionResponse | null;

  /** List of selected agent IDs */
  selectedAgents: string[];

  /** List of selected MCP server names */
  selectedMcp: string[];

  /** Environment variables with values */
  envVars: Record<string, string>;

  /** Raw env var config with detection info */
  envVarConfigs: EnvVarWithDetection[];

  /** Version counter for installed components - incremented when agents/MCP change */
  componentsVersion: number;

  // ============================================
  // ACTIONS
  // ============================================

  /** Set the project path */
  setProjectPath: (path: string) => void;

  /** Set installation status */
  setIsInstalled: (installed: boolean) => void;

  /** Set detection result */
  setDetection: (detection: DetectionResponse) => void;

  /** Set selected agents (replaces entire array) */
  setSelectedAgents: (agents: string[]) => void;

  /** Toggle a single agent selection */
  toggleAgent: (agentId: string) => void;

  /** Add an agent to selection */
  addAgent: (agentId: string) => void;

  /** Remove an agent from selection */
  removeAgent: (agentId: string) => void;

  /** Set selected MCP servers (replaces entire array) */
  setSelectedMcp: (servers: string[]) => void;

  /** Toggle a single MCP server selection */
  toggleMcp: (serverName: string) => void;

  /** Add an MCP server to selection */
  addMcp: (serverName: string) => void;

  /** Remove an MCP server from selection */
  removeMcp: (serverName: string) => void;

  /** Set a single environment variable value */
  setEnvVar: (name: string, value: string) => void;

  /** Set multiple environment variables */
  setEnvVars: (vars: Record<string, string>) => void;

  /** Set env var configs with detection info */
  setEnvVarConfigs: (configs: EnvVarWithDetection[]) => void;

  /** Reset entire store to initial state */
  reset: () => void;

  /** Reset only selections (keep path and detection) */
  resetSelections: () => void;

  /** Notify that installed components have changed (triggers re-fetch in listeners) */
  invalidateComponents: () => void;
}

const initialState = {
  projectPath: '',
  isInstalled: false,
  detection: null,
  selectedAgents: [],
  selectedMcp: [],
  envVars: {},
  envVarConfigs: [],
  componentsVersion: 0,
};

/**
 * Project configuration store
 */
const storeCreator: StateCreator<ProjectState, [['zustand/devtools', never]], []> = (set) => ({
  ...initialState,

      // ============================================
      // PROJECT PATH
      // ============================================

      setProjectPath: (path: string) =>
        set({ projectPath: path }, false, 'setProjectPath'),

      setIsInstalled: (installed: boolean) =>
        set({ isInstalled: installed }, false, 'setIsInstalled'),

      // ============================================
      // DETECTION
      // ============================================

      setDetection: (detection: DetectionResponse) =>
        set({ detection }, false, 'setDetection'),

      // ============================================
      // AGENTS
      // ============================================

      setSelectedAgents: (agents: string[]) =>
        set({ selectedAgents: agents }, false, 'setSelectedAgents'),

      toggleAgent: (agentId: string) =>
        set(
          (state) => ({
            selectedAgents: state.selectedAgents.includes(agentId)
              ? state.selectedAgents.filter((id) => id !== agentId)
              : [...state.selectedAgents, agentId],
          }),
          false,
          'toggleAgent'
        ),

      addAgent: (agentId: string) =>
        set(
          (state) => ({
            selectedAgents: state.selectedAgents.includes(agentId)
              ? state.selectedAgents
              : [...state.selectedAgents, agentId],
          }),
          false,
          'addAgent'
        ),

      removeAgent: (agentId: string) =>
        set(
          (state) => ({
            selectedAgents: state.selectedAgents.filter((id) => id !== agentId),
          }),
          false,
          'removeAgent'
        ),

      // ============================================
      // MCP SERVERS
      // ============================================

      setSelectedMcp: (servers: string[]) =>
        set({ selectedMcp: servers }, false, 'setSelectedMcp'),

      toggleMcp: (serverName: string) =>
        set(
          (state) => ({
            selectedMcp: state.selectedMcp.includes(serverName)
              ? state.selectedMcp.filter((name) => name !== serverName)
              : [...state.selectedMcp, serverName],
          }),
          false,
          'toggleMcp'
        ),

      addMcp: (serverName: string) =>
        set(
          (state) => ({
            selectedMcp: state.selectedMcp.includes(serverName)
              ? state.selectedMcp
              : [...state.selectedMcp, serverName],
          }),
          false,
          'addMcp'
        ),

      removeMcp: (serverName: string) =>
        set(
          (state) => ({
            selectedMcp: state.selectedMcp.filter((name) => name !== serverName),
          }),
          false,
          'removeMcp'
        ),

      // ============================================
      // ENVIRONMENT VARIABLES
      // ============================================

      setEnvVar: (name: string, value: string) =>
        set(
          (state) => ({
            envVars: {
              ...state.envVars,
              [name]: value,
            },
          }),
          false,
          'setEnvVar'
        ),

      setEnvVars: (vars: Record<string, string>) =>
        set({ envVars: vars }, false, 'setEnvVars'),

      setEnvVarConfigs: (configs: EnvVarWithDetection[]) =>
        set({ envVarConfigs: configs }, false, 'setEnvVarConfigs'),

      // ============================================
      // RESET
      // ============================================

      reset: () =>
        set(initialState, false, 'reset'),

      resetSelections: () =>
        set(
          {
            selectedAgents: [],
            selectedMcp: [],
            envVars: {},
            envVarConfigs: [],
          },
          false,
          'resetSelections'
        ),

      invalidateComponents: () =>
        set(
          (state) => ({
            componentsVersion: state.componentsVersion + 1,
          }),
          false,
          'invalidateComponents'
        ),
});

export const useProjectStore = create<ProjectState>()(
  devtools(storeCreator, { name: 'ProjectStore' })
);
