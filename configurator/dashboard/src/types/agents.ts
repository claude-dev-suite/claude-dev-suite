// SPDX-License-Identifier: MIT
// KEPT IN SYNC with configurator/dashboard/{src,server/src}/types/agents.ts — verified by scripts/check-type-sync.mjs
/**
 * Agent Types for Dev-Suite Dashboard
 *
 * These types represent agent metadata, categories, and routing information
 * used for agent selection and orchestration.
 */

// ============================================
// AGENT CATEGORY TYPES
// ============================================

/**
 * Agent category classification
 * Matches the directory structure in agents/
 */
export type AgentCategory =
  | 'core'
  | 'frontend'
  | 'backend'
  | 'database'
  | 'testing'
  | 'infrastructure'
  | 'messaging'
  | 'security'
  | 'quality'
  | 'general';

// ============================================
// AGENT TYPES
// ============================================

/**
 * Agent metadata loaded from YAML frontmatter
 */
export interface Agent {
  /** Unique identifier (filename without .md extension) */
  id: string;
  /** Display name from frontmatter */
  name: string;
  /** Description of agent capabilities */
  description: string;
  /** Category classification */
  category: AgentCategory;
  /** List of skill IDs this agent uses */
  skills: string[];
  /** List of MCP server names this agent requires */
  requiredMcp: string[];
}

/**
 * Extended agent info with selection state
 */
export interface AgentWithSelection extends Agent {
  /** Whether the agent is selected */
  selected: boolean;
  /** Whether the agent was auto-recommended */
  recommended: boolean;
  /** Reason for recommendation */
  recommendationReason?: string;
}

// ============================================
// AGENT ROUTING TYPES
// ============================================

/**
 * Agent routing configuration for CLAUDE.md
 */
export interface AgentRouting {
  /** Keywords that trigger this agent */
  keywords: string[];
  /** Domain of expertise */
  domain: string;
  /** File patterns this agent handles */
  filePatterns?: string[];
}

/**
 * Complete agent routing entry for CLAUDE.md generation
 */
export interface AgentRoutingEntry {
  /** Agent ID */
  agentId: string;
  /** Agent display name */
  name: string;
  /** Routing configuration */
  routing: AgentRouting;
}

// ============================================
// AGENT DETECTION TYPES
// ============================================

/**
 * Result of agent detection from user message
 */
export interface AgentDetectionResult {
  /** Detected agent ID or null */
  agent: string | null;
  /** Message with agent mention removed */
  cleanMessage: string;
  /** Whether agent was explicitly mentioned via @agent */
  explicit: boolean;
}

// ============================================
// AGENT RECOMMENDATION TYPES
// ============================================

/**
 * Agent recommendation based on detected stack
 */
export interface AgentRecommendation {
  /** Agent ID */
  agentId: string;
  /** Confidence score (0-100) */
  confidence: number;
  /** Reason for recommendation */
  reason: string;
  /** Technology that triggered recommendation */
  triggeredBy: string;
}

/**
 * Complete recommendations response
 */
export interface AgentRecommendations {
  /** Recommended agents */
  agents: AgentRecommendation[];
  /** Recommended MCP servers */
  mcpServers: McpRecommendation[];
}

/**
 * MCP server recommendation
 */
export interface McpRecommendation {
  /** Server name */
  serverName: string;
  /** Confidence score (0-100) */
  confidence: number;
  /** Reason for recommendation */
  reason: string;
  /** Technology that triggered recommendation */
  triggeredBy: string;
}

// ============================================
// TYPE GUARDS
// ============================================

/**
 * Type guard to check if a value is a valid AgentCategory
 */
export function isAgentCategory(value: unknown): value is AgentCategory {
  return (
    typeof value === 'string' &&
    [
      'core',
      'frontend',
      'backend',
      'database',
      'testing',
      'infrastructure',
      'messaging',
      'security',
      'quality',
      'general',
    ].includes(value)
  );
}

/**
 * Type guard to check if a value is a valid Agent
 */
export function isAgent(value: unknown): value is Agent {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.name === 'string' &&
    typeof obj.description === 'string' &&
    isAgentCategory(obj.category) &&
    Array.isArray(obj.skills) &&
    Array.isArray(obj.requiredMcp)
  );
}
