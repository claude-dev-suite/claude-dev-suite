// SPDX-License-Identifier: MIT
/**
 * Custom Agents Hook
 *
 * Provides CRUD operations for project-specific custom agents.
 * Uses fetchApi utility for consistent API calls.
 */

import { useState, useCallback, useEffect } from 'react';
import { fetchApi } from '@/utils/fetchApi';
import { getLogger } from '@/utils/logger';
import type {
  CustomAgentListItem,
  CustomAgent,
  CustomAgentsListResponse,
  CustomAgentDetailResponse,
  CustomAgentOperationResponse,
  CustomAgentValidationResult,
  CustomAgentValidationResponse,
  CustomSkill,
  CustomSkillDetail,
  CustomSkillsListResponse,
  CustomSkillDetailResponse,
  CustomSkillOperationResponse,
  CustomSkillValidationResult,
  CustomSkillValidationResponse,
} from '@/types/custom-agents';

const logger = getLogger('useCustomAgents');

export interface UseCustomAgentsResult {
  // Custom agents
  agents: CustomAgentListItem[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  getAgent: (agentId: string) => Promise<CustomAgent | null>;
  createAgent: (content: string, bypassWarnings?: boolean) => Promise<CustomAgentOperationResponse>;
  updateAgent: (agentId: string, content: string, bypassWarnings?: boolean) => Promise<CustomAgentOperationResponse>;
  deleteAgent: (agentId: string) => Promise<{ success: boolean; error?: string }>;
  validateContent: (content: string) => Promise<CustomAgentValidationResult | null>;
  uploadAgent: (file: File, bypassWarnings?: boolean) => Promise<CustomAgentOperationResponse>;

  // Custom skills
  skills: CustomSkill[];
  skillsLoading: boolean;
  skillsError: string | null;
  refetchSkills: () => Promise<void>;
  getSkill: (skillId: string) => Promise<CustomSkillDetail | null>;
  createSkill: (name: string, content: string, bypassWarnings?: boolean) => Promise<CustomSkillOperationResponse>;
  updateSkill: (skillId: string, name: string, content: string, bypassWarnings?: boolean) => Promise<CustomSkillOperationResponse>;
  uploadSkill: (file: File, name: string, bypassWarnings?: boolean) => Promise<CustomSkillOperationResponse>;
  validateSkillContent: (content: string) => Promise<CustomSkillValidationResult | null>;
  deleteSkill: (skillId: string) => Promise<{ success: boolean; error?: string }>;
}

/**
 * Hook for managing custom agents and skills
 */
export function useCustomAgents(projectPath: string): UseCustomAgentsResult {
  // Agents state
  const [agents, setAgents] = useState<CustomAgentListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Skills state
  const [skills, setSkills] = useState<CustomSkill[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [skillsError, setSkillsError] = useState<string | null>(null);

  /**
   * Fetch all custom agents
   */
  const refetch = useCallback(async () => {
    if (!projectPath) return;

    setLoading(true);
    setError(null);

    const result = await fetchApi<CustomAgentsListResponse>('/api/custom-agents', {
      params: { path: projectPath },
    });

    if (result.success && result.data) {
      setAgents(result.data.agents);
    } else {
      setError(result.error || 'Failed to fetch agents');
      logger.error('Failed to fetch custom agents', result.error);
    }

    setLoading(false);
  }, [projectPath]);

  /**
   * Get a single agent with full content
   */
  const getAgent = useCallback(async (agentId: string): Promise<CustomAgent | null> => {
    if (!projectPath) return null;

    const result = await fetchApi<CustomAgentDetailResponse>(
      `/api/custom-agents/${encodeURIComponent(agentId)}`,
      { params: { path: projectPath } }
    );

    if (result.success && result.data) {
      return result.data.agent;
    }

    logger.error('Failed to get custom agent', result.error);
    return null;
  }, [projectPath]);

  /**
   * Create a new custom agent
   */
  const createAgent = useCallback(async (
    content: string,
    bypassWarnings = false
  ): Promise<CustomAgentOperationResponse> => {
    const result = await fetchApi<{ agent?: CustomAgent; validation?: CustomAgentValidationResult }>(
      '/api/custom-agents',
      {
        method: 'POST',
        body: { projectPath, content, bypassWarnings },
      }
    );

    if (result.success && result.data) {
      await refetch();
      return { success: true, agent: result.data.agent, validation: result.data.validation };
    }

    logger.error('Failed to create custom agent', result.error);
    return { success: false, error: result.error };
  }, [projectPath, refetch]);

  /**
   * Upload an agent file (uses FormData, not fetchApi)
   */
  const uploadAgent = useCallback(async (
    file: File,
    bypassWarnings = false
  ): Promise<CustomAgentOperationResponse> => {
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('projectPath', projectPath);
      formData.append('bypassWarnings', String(bypassWarnings));

      const res = await fetch(`${import.meta.env.VITE_API_BASE || 'http://localhost:3457'}/api/custom-agents/upload`, {
        method: 'POST',
        body: formData,
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        return {
          success: false,
          error: json.error || 'Failed to upload agent',
          validation: json.validation || json.data?.validation,
        };
      }

      await refetch();
      return { success: true, agent: json.data?.agent, validation: json.data?.validation };
    } catch (err) {
      logger.error('Failed to upload custom agent', err);
      return { success: false, error: 'Upload failed' };
    }
  }, [projectPath, refetch]);

  /**
   * Update an existing custom agent
   */
  const updateAgent = useCallback(async (
    agentId: string,
    content: string,
    bypassWarnings = false
  ): Promise<CustomAgentOperationResponse> => {
    const result = await fetchApi<{ agent?: CustomAgent; validation?: CustomAgentValidationResult }>(
      `/api/custom-agents/${encodeURIComponent(agentId)}`,
      {
        method: 'PUT',
        body: { projectPath, content, bypassWarnings },
      }
    );

    if (result.success && result.data) {
      await refetch();
      return { success: true, agent: result.data.agent, validation: result.data.validation };
    }

    logger.error('Failed to update custom agent', result.error);
    return { success: false, error: result.error };
  }, [projectPath, refetch]);

  /**
   * Delete a custom agent
   */
  const deleteAgent = useCallback(async (agentId: string): Promise<{ success: boolean; error?: string }> => {
    const result = await fetchApi<void>(
      `/api/custom-agents/${encodeURIComponent(agentId)}`,
      {
        method: 'DELETE',
        params: { projectPath },
      }
    );

    if (result.success) {
      await refetch();
      return { success: true };
    }

    // If agent was already removed from disk, treat as successful and refresh the list
    if (result.error && result.error.toLowerCase().includes('not found')) {
      await refetch();
      return { success: true };
    }

    logger.error('Failed to delete custom agent', result.error);
    return { success: false, error: result.error };
  }, [projectPath, refetch]);

  /**
   * Validate agent content without saving
   */
  const validateContent = useCallback(async (content: string): Promise<CustomAgentValidationResult | null> => {
    const result = await fetchApi<CustomAgentValidationResponse>('/api/custom-agents/validate', {
      method: 'POST',
      body: { content },
    });

    if (result.success && result.data) {
      return result.data.validation;
    }

    logger.error('Failed to validate content', result.error);
    return null;
  }, []);

  // ========== Skills ==========

  /**
   * Fetch all custom skills
   */
  const refetchSkills = useCallback(async () => {
    if (!projectPath) return;

    setSkillsLoading(true);
    setSkillsError(null);

    const result = await fetchApi<CustomSkillsListResponse>('/api/custom-skills', {
      params: { path: projectPath },
    });

    if (result.success && result.data) {
      setSkills(result.data.skills);
    } else {
      setSkillsError(result.error || 'Failed to fetch skills');
      logger.error('Failed to fetch custom skills', result.error);
    }

    setSkillsLoading(false);
  }, [projectPath]);

  /**
   * Get a single skill with full content
   */
  const getSkill = useCallback(async (skillId: string): Promise<CustomSkillDetail | null> => {
    if (!projectPath) return null;

    const result = await fetchApi<CustomSkillDetailResponse>(
      `/api/custom-skills/${encodeURIComponent(skillId)}`,
      { params: { path: projectPath } }
    );

    if (result.success && result.data) {
      return result.data.skill;
    }

    logger.error('Failed to get custom skill', result.error);
    return null;
  }, [projectPath]);

  /**
   * Create a new custom skill
   */
  const createSkill = useCallback(async (
    name: string,
    content: string,
    bypassWarnings = false
  ): Promise<CustomSkillOperationResponse> => {
    const result = await fetchApi<{ skill?: CustomSkill; validation?: CustomSkillValidationResult }>('/api/custom-skills', {
      method: 'POST',
      body: { projectPath, name, content, bypassWarnings },
    });

    if (result.success && result.data) {
      await refetchSkills();
      return { success: true, skill: result.data.skill, validation: result.data.validation };
    }

    logger.error('Failed to create custom skill', result.error);
    return { success: false, error: result.error };
  }, [projectPath, refetchSkills]);

  /**
   * Update an existing custom skill
   */
  const updateSkill = useCallback(async (
    skillId: string,
    name: string,
    content: string,
    bypassWarnings = false
  ): Promise<CustomSkillOperationResponse> => {
    const result = await fetchApi<{ skill?: CustomSkill; validation?: CustomSkillValidationResult }>(
      `/api/custom-skills/${encodeURIComponent(skillId)}`,
      {
        method: 'PUT',
        body: { projectPath, name, content, bypassWarnings },
      }
    );

    if (result.success && result.data) {
      await refetchSkills();
      return { success: true, skill: result.data.skill, validation: result.data.validation };
    }

    logger.error('Failed to update custom skill', result.error);
    return { success: false, error: result.error };
  }, [projectPath, refetchSkills]);

  /**
   * Upload a skill file (uses FormData, not fetchApi)
   */
  const uploadSkill = useCallback(async (
    file: File,
    name: string,
    bypassWarnings = false
  ): Promise<CustomSkillOperationResponse> => {
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('projectPath', projectPath);
      formData.append('name', name);
      formData.append('bypassWarnings', String(bypassWarnings));

      const res = await fetch(`${import.meta.env.VITE_API_BASE || 'http://localhost:3457'}/api/custom-skills/upload`, {
        method: 'POST',
        body: formData,
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        return {
          success: false,
          error: json.error || 'Failed to upload skill',
          validation: json.validation || json.data?.validation,
        };
      }

      await refetchSkills();
      return { success: true, skill: json.data?.skill, validation: json.data?.validation };
    } catch (err) {
      logger.error('Failed to upload custom skill', err);
      return { success: false, error: 'Upload failed' };
    }
  }, [projectPath, refetchSkills]);

  /**
   * Validate skill content without saving
   */
  const validateSkillContent = useCallback(async (content: string): Promise<CustomSkillValidationResult | null> => {
    const result = await fetchApi<CustomSkillValidationResponse>('/api/custom-skills/validate', {
      method: 'POST',
      body: { content },
    });

    if (result.success && result.data) {
      return result.data.validation;
    }

    logger.error('Failed to validate skill content', result.error);
    return null;
  }, []);

  /**
   * Delete a custom skill
   */
  const deleteSkill = useCallback(async (skillId: string): Promise<{ success: boolean; error?: string }> => {
    const result = await fetchApi<void>(
      `/api/custom-skills/${encodeURIComponent(skillId)}`,
      {
        method: 'DELETE',
        params: { projectPath },
      }
    );

    if (result.success) {
      await refetchSkills();
      return { success: true };
    }

    // If skill was already removed from disk, treat as successful and refresh the list
    if (result.error && result.error.toLowerCase().includes('not found')) {
      await refetchSkills();
      return { success: true };
    }

    logger.error('Failed to delete custom skill', result.error);
    return { success: false, error: result.error };
  }, [projectPath, refetchSkills]);

  // Initial fetch
  useEffect(() => {
    if (projectPath) {
      refetch();
      refetchSkills();
    }
  }, [projectPath, refetch, refetchSkills]);

  return {
    // Agents
    agents,
    loading,
    error,
    refetch,
    getAgent,
    createAgent,
    updateAgent,
    deleteAgent,
    validateContent,
    uploadAgent,

    // Skills
    skills,
    skillsLoading,
    skillsError,
    refetchSkills,
    getSkill,
    createSkill,
    updateSkill,
    uploadSkill,
    validateSkillContent,
    deleteSkill,
  };
}
