// SPDX-License-Identifier: MIT
import { useState, useCallback } from 'react';
import type { Job } from '@/types';
import type { SubTask } from '../OrchestratorPanel';

export interface RecapData {
  success: boolean;
  summary?: string;
  recap?: {
    agentResults?: Array<{
      agentId: string;
      status: 'completed' | 'failed' | 'skipped';
      summary?: string;
      duration?: string;
    }>;
    files?: {
      created?: string[];
      modified?: string[];
      deleted?: string[];
    };
    tests?: {
      ran: boolean;
      summary?: {
        passed?: number;
        failed?: number;
        skipped?: number;
        coverage?: string;
      };
    };
    notes?: string[];
  };
}

export interface InputRequest {
  prompt: string;
  jobId: string;
}

export interface PermissionRequest {
  type: string;
  target: string;
  jobId: string;
}

export interface UseOrchestratorStateReturn {
  // Form state
  jobTitle: string;
  setJobTitle: (title: string) => void;
  jobContext: string;
  setJobContext: (context: string) => void;
  selectedWorkflow: string;
  setSelectedWorkflow: (workflow: string) => void;

  // Agent tasks
  agentTasks: SubTask[];
  setAgentTasks: React.Dispatch<React.SetStateAction<SubTask[]>>;
  addAgentTask: (task: SubTask) => void;
  updateAgentTask: (index: number, task: SubTask) => void;
  removeAgentTask: (index: number) => void;
  clearAgentTasks: () => void;

  // Execution state
  output: string[];
  addOutput: (line: string) => void;
  clearOutput: () => void;
  setOutput: (output: string[]) => void;
  currentJob: Job | null;
  setCurrentJob: (job: Job | null) => void;
  isProcessing: boolean;
  setIsProcessing: (processing: boolean) => void;
  progressStatus: string;
  setProgressStatus: (status: string) => void;
  currentAgent: string;
  setCurrentAgent: (agent: string) => void;

  // Console state
  consoleSize: 'sm' | 'md' | 'lg';
  setConsoleSize: (size: 'sm' | 'md' | 'lg') => void;
  isFullscreen: boolean;
  setIsFullscreen: (fullscreen: boolean) => void;

  // Prompts
  inputRequest: InputRequest | null;
  setInputRequest: (request: InputRequest | null) => void;
  permissionRequest: PermissionRequest | null;
  setPermissionRequest: (request: PermissionRequest | null) => void;
  userInput: string;
  setUserInput: (input: string) => void;

  // Recap
  showRecap: boolean;
  setShowRecap: (show: boolean) => void;
  recapData: RecapData | null;
  setRecapData: (data: RecapData | null) => void;

  // Agent statuses
  agentStatuses: Record<string, 'pending' | 'running' | 'completed' | 'failed'>;
  setAgentStatuses: React.Dispatch<React.SetStateAction<Record<string, 'pending' | 'running' | 'completed' | 'failed'>>>;
  updateAgentStatus: (agentId: string, status: 'pending' | 'running' | 'completed' | 'failed') => void;

  // Chat session
  chatSessionId: string | null;
  setChatSessionId: (id: string | null) => void;

  // MCP suggestions
  mcpSuggestions: string[];
  setMcpSuggestions: (suggestions: string[]) => void;

  // Reset all
  resetAll: () => void;
}

/**
 * Custom hook for managing orchestrator state
 */
export function useOrchestratorState(): UseOrchestratorStateReturn {
  // Form state
  const [jobTitle, setJobTitle] = useState('');
  const [jobContext, setJobContext] = useState('');
  const [selectedWorkflow, setSelectedWorkflow] = useState('');

  // Agent tasks
  const [agentTasks, setAgentTasks] = useState<SubTask[]>([]);

  // Execution state
  const [output, setOutput] = useState<string[]>([]);
  const [currentJob, setCurrentJob] = useState<Job | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressStatus, setProgressStatus] = useState('Ready - Configure agents and click Execute Job');
  const [currentAgent, setCurrentAgent] = useState<string>('');

  // Console state
  const [consoleSize, setConsoleSize] = useState<'sm' | 'md' | 'lg'>('md');
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Prompts
  const [inputRequest, setInputRequest] = useState<InputRequest | null>(null);
  const [permissionRequest, setPermissionRequest] = useState<PermissionRequest | null>(null);
  const [userInput, setUserInput] = useState('');

  // Recap
  const [showRecap, setShowRecap] = useState(false);
  const [recapData, setRecapData] = useState<RecapData | null>(null);

  // Agent statuses
  const [agentStatuses, setAgentStatuses] = useState<Record<string, 'pending' | 'running' | 'completed' | 'failed'>>({});

  // Chat session
  const [chatSessionId, setChatSessionId] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('orchestrator_session_id');
    }
    return null;
  });

  // MCP suggestions
  const [mcpSuggestions, setMcpSuggestions] = useState<string[]>([]);

  // Agent task operations
  const addAgentTask = useCallback((task: SubTask) => {
    setAgentTasks(prev => [...prev, task]);
  }, []);

  const updateAgentTask = useCallback((index: number, task: SubTask) => {
    setAgentTasks(prev => prev.map((t, i) => i === index ? task : t));
  }, []);

  const removeAgentTask = useCallback((index: number) => {
    setAgentTasks(prev => prev.filter((_, i) => i !== index));
  }, []);

  const clearAgentTasks = useCallback(() => {
    setAgentTasks([]);
  }, []);

  // Output operations
  const addOutput = useCallback((line: string) => {
    setOutput(prev => [...prev, line]);
  }, []);

  const clearOutput = useCallback(() => {
    setOutput([]);
  }, []);

  // Agent status operations
  const updateAgentStatus = useCallback((
    agentId: string,
    status: 'pending' | 'running' | 'completed' | 'failed'
  ) => {
    setAgentStatuses(prev => ({ ...prev, [agentId]: status }));
  }, []);

  // Reset all state
  const resetAll = useCallback(() => {
    setJobTitle('');
    setJobContext('');
    setAgentTasks([]);
    setSelectedWorkflow('');
    setMcpSuggestions([]);
    setOutput([]);
    setCurrentJob(null);
    setProgressStatus('Ready - Configure agents and click Execute Job');
    setCurrentAgent('');
    setInputRequest(null);
    setPermissionRequest(null);
    setShowRecap(false);
    setRecapData(null);
    setAgentStatuses({});
  }, []);

  return {
    // Form state
    jobTitle,
    setJobTitle,
    jobContext,
    setJobContext,
    selectedWorkflow,
    setSelectedWorkflow,

    // Agent tasks
    agentTasks,
    setAgentTasks,
    addAgentTask,
    updateAgentTask,
    removeAgentTask,
    clearAgentTasks,

    // Execution state
    output,
    addOutput,
    clearOutput,
    setOutput,
    currentJob,
    setCurrentJob,
    isProcessing,
    setIsProcessing,
    progressStatus,
    setProgressStatus,
    currentAgent,
    setCurrentAgent,

    // Console state
    consoleSize,
    setConsoleSize,
    isFullscreen,
    setIsFullscreen,

    // Prompts
    inputRequest,
    setInputRequest,
    permissionRequest,
    setPermissionRequest,
    userInput,
    setUserInput,

    // Recap
    showRecap,
    setShowRecap,
    recapData,
    setRecapData,

    // Agent statuses
    agentStatuses,
    setAgentStatuses,
    updateAgentStatus,

    // Chat session
    chatSessionId,
    setChatSessionId,

    // MCP suggestions
    mcpSuggestions,
    setMcpSuggestions,

    // Reset all
    resetAll,
  };
}
