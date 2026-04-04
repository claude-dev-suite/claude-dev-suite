/**
 * Workflows Service Tests
 *
 * Tests for workflow recommendations and MCP keyword analysis
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WorkflowsService } from '../src/services/workflows.service.js';
import { ManagementService } from '../src/services/management.service.js';
import { createTempDir, cleanupTempDir } from './test-utils.js';
import * as fs from 'fs';
import * as path from 'path';

// Mock ManagementService as a proper class
const mockGetInstalledComponentsFn = vi.fn();
vi.mock('../src/services/management.service.js', () => ({
  ManagementService: class MockManagementService {
    getInstalledComponents = mockGetInstalledComponentsFn;
  },
}));

describe('WorkflowsService', () => {
  let workflowsService: WorkflowsService;
  let projectDir: string;
  let mockGetInstalledComponents: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    projectDir = createTempDir('workflows-test-');
    workflowsService = new WorkflowsService();

    // Get the mocked method
    const managementService = (workflowsService as any).managementService;
    mockGetInstalledComponents = managementService.getInstalledComponents;

    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanupTempDir(projectDir);
  });

  describe('analyzePromptForMcp', () => {
    it('should suggest MCP servers based on keywords', () => {
      const prompt = 'I need to test the API endpoints and make HTTP requests';

      const suggestions = workflowsService.analyzePromptForMcp(prompt);

      const apiTesterSuggestion = suggestions.find(s => s.serverName === 'api-tester');
      expect(apiTesterSuggestion).toBeDefined();
      expect(apiTesterSuggestion?.score).toBeGreaterThan(0);
      expect(apiTesterSuggestion?.reason).toContain('api');
    });

    it('should score multiple keyword matches higher', () => {
      const prompt = 'Review the database schema, run SQL queries and check migrations';

      const suggestions = workflowsService.analyzePromptForMcp(prompt);

      const dbSuggestion = suggestions.find(s => s.serverName === 'database-query');
      expect(dbSuggestion).toBeDefined();
      expect(dbSuggestion?.score).toBeGreaterThanOrEqual(30); // Multiple keyword matches
    });

    it('should boost score for matching agents', () => {
      const prompt = 'Need help with API testing';
      const selectedAgents = ['nestjs-expert', 'spring-boot-expert'];

      const suggestions = workflowsService.analyzePromptForMcp(prompt, selectedAgents);

      const apiTesterSuggestion = suggestions.find(s => s.serverName === 'api-tester');
      expect(apiTesterSuggestion).toBeDefined();
      expect(apiTesterSuggestion?.score).toBeGreaterThanOrEqual(15); // Keywords + agent boost
    });

    it('should suggest documentation for any agents', () => {
      const prompt = 'How do I use React hooks?';
      const selectedAgents = ['react-expert'];

      const suggestions = workflowsService.analyzePromptForMcp(prompt, selectedAgents);

      const docsSuggestion = suggestions.find(s => s.serverName === 'documentation');
      expect(docsSuggestion).toBeDefined();
    });

    it('should return top 5 suggestions sorted by score', () => {
      const prompt = 'I need documentation, to test APIs, check database, review security, and manage docker';

      const suggestions = workflowsService.analyzePromptForMcp(prompt);

      expect(suggestions.length).toBeLessThanOrEqual(5);
      // Verify sorted by score descending
      for (let i = 0; i < suggestions.length - 1; i++) {
        expect(suggestions[i]!.score).toBeGreaterThanOrEqual(suggestions[i + 1]!.score);
      }
    });

    it('should suggest wildcard servers even with empty prompt', () => {
      const suggestions = workflowsService.analyzePromptForMcp('', []);

      // Wildcard servers (documentation) get agent boost even with no agents
      expect(suggestions.length).toBeGreaterThan(0);
      const serverNames = suggestions.map(s => s.serverName);
      expect(serverNames).toContain('documentation');
    });

    it('should give higher score when keywords match', () => {
      const emptyPromptSuggestions = workflowsService.analyzePromptForMcp('', []);
      const keywordPromptSuggestions = workflowsService.analyzePromptForMcp('documentation', []);

      const emptyScore = emptyPromptSuggestions.find(s => s.serverName === 'documentation')?.score || 0;
      const keywordScore = keywordPromptSuggestions.find(s => s.serverName === 'documentation')?.score || 0;

      expect(keywordScore).toBeGreaterThan(emptyScore);
    });

    it('should be case-insensitive', () => {
      const promptLower = 'test api endpoints';
      const promptUpper = 'TEST API ENDPOINTS';

      const suggestionsLower = workflowsService.analyzePromptForMcp(promptLower);
      const suggestionsUpper = workflowsService.analyzePromptForMcp(promptUpper);

      expect(suggestionsLower.length).toBeGreaterThan(0);
      expect(suggestionsUpper.length).toBe(suggestionsLower.length);
    });

    it('should suggest docker-manager for container keywords', () => {
      const prompt = 'Deploy the application using Docker Compose';

      const suggestions = workflowsService.analyzePromptForMcp(prompt);

      const dockerSuggestion = suggestions.find(s => s.serverName === 'docker-manager');
      expect(dockerSuggestion).toBeDefined();
      expect(dockerSuggestion?.reason).toContain('docker');
    });

    it('should suggest security-scanner for security keywords', () => {
      const prompt = 'Audit the code for security vulnerabilities and OWASP issues';

      const suggestions = workflowsService.analyzePromptForMcp(prompt);

      const securitySuggestion = suggestions.find(s => s.serverName === 'security-scanner');
      expect(securitySuggestion).toBeDefined();
      expect(securitySuggestion?.score).toBeGreaterThan(0);
    });

    it('should suggest log-analyzer for error keywords', () => {
      const prompt = 'Check the logs for errors and exceptions';

      const suggestions = workflowsService.analyzePromptForMcp(prompt);

      const logSuggestion = suggestions.find(s => s.serverName === 'log-analyzer');
      expect(logSuggestion).toBeDefined();
    });

    it('should suggest performance-profiler for performance keywords', () => {
      const prompt = 'The application is slow, need to optimize performance';

      const suggestions = workflowsService.analyzePromptForMcp(prompt);

      const perfSuggestion = suggestions.find(s => s.serverName === 'performance-profiler');
      expect(perfSuggestion).toBeDefined();
    });

    it('should suggest code-quality for refactoring keywords', () => {
      const prompt = 'Refactor the code and improve quality';

      const suggestions = workflowsService.analyzePromptForMcp(prompt);

      const qualitySuggestion = suggestions.find(s => s.serverName === 'code-quality');
      expect(qualitySuggestion).toBeDefined();
    });

    it('should mark all suggestions as autoSuggested', () => {
      const prompt = 'Test the API';

      const suggestions = workflowsService.analyzePromptForMcp(prompt);

      expect(suggestions.every(s => s.autoSuggested === true)).toBe(true);
    });
  });

  describe('loadCustomWorkflows', () => {
    it('should load custom workflows from file', async () => {
      const customWorkflows = [
        {
          id: 'custom-1',
          name: 'Custom Workflow',
          description: 'A custom workflow',
          category: 'custom',
          subTasks: [
            { agentId: 'architect', taskTemplate: 'Design {feature}', dependencies: [] }
          ],
          mcpServers: ['documentation']
        }
      ];

      fs.writeFileSync(
        path.join(projectDir, '.dev-suite-workflows.json'),
        JSON.stringify({ customWorkflows })
      );

      const loaded = await workflowsService.loadCustomWorkflows(projectDir);

      expect(loaded).toHaveLength(1);
      expect(loaded[0]).toMatchObject({
        id: 'custom-1',
        name: 'Custom Workflow',
      });
    });

    it('should return empty array if file does not exist', async () => {
      const loaded = await workflowsService.loadCustomWorkflows(projectDir);

      expect(loaded).toEqual([]);
    });

    it('should return empty array if file is malformed', async () => {
      fs.writeFileSync(
        path.join(projectDir, '.dev-suite-workflows.json'),
        'invalid json'
      );

      const loaded = await workflowsService.loadCustomWorkflows(projectDir);

      expect(loaded).toEqual([]);
    });

    it('should handle file without customWorkflows property', async () => {
      fs.writeFileSync(
        path.join(projectDir, '.dev-suite-workflows.json'),
        JSON.stringify({ version: '1.0.0' })
      );

      const loaded = await workflowsService.loadCustomWorkflows(projectDir);

      expect(loaded).toEqual([]);
    });
  });

  describe('saveCustomWorkflows', () => {
    it('should save custom workflows to file', async () => {
      const customWorkflows = [
        {
          id: 'custom-1',
          name: 'Custom Workflow',
          description: 'Test workflow',
          category: 'custom',
          subTasks: [],
          mcpServers: []
        }
      ];

      await workflowsService.saveCustomWorkflows(projectDir, customWorkflows);

      const filePath = path.join(projectDir, '.dev-suite-workflows.json');
      expect(fs.existsSync(filePath)).toBe(true);

      const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      expect(content.version).toBe('1.0.0');
      expect(content.customWorkflows).toHaveLength(1);
    });

    it('should format JSON with proper indentation', async () => {
      await workflowsService.saveCustomWorkflows(projectDir, []);

      const filePath = path.join(projectDir, '.dev-suite-workflows.json');
      const content = fs.readFileSync(filePath, 'utf-8');

      expect(content).toContain('\n');
      expect(content).toContain('  ');
    });
  });

  describe('getAllWorkflows', () => {
    beforeEach(() => {
      // Setup default mock for installed components
      mockGetInstalledComponents.mockResolvedValue({
        agents: ['react-expert', 'nestjs-expert', 'vitest-expert', 'architect', 'code-reviewer', 'qa-expert'],
        mcpServers: ['documentation', 'api-tester']
      });
    });

    it('should return builtin and custom workflows', async () => {
      const result = await workflowsService.getAllWorkflows(projectDir);

      expect(result.builtin).toBeDefined();
      expect(result.custom).toBeDefined();
      expect(result.builtin.length).toBeGreaterThan(0);
    });

    it('should mark compatible workflows based on installed agents', async () => {
      const result = await workflowsService.getAllWorkflows(projectDir);

      const frontendFeature = result.builtin.find(w => w.id === 'frontend-feature');
      expect(frontendFeature?.compatible).toBe(true);
      expect(frontendFeature?.missingAgents).toEqual([]);
    });

    it('should mark incompatible workflows when required agents are missing', async () => {
      mockGetInstalledComponents.mockResolvedValue({
        agents: ['architect'],
        mcpServers: []
      });

      const result = await workflowsService.getAllWorkflows(projectDir);

      // frontend-feature requires {frontend} (not optional) — still incompatible without it
      const frontendFeature = result.builtin.find(w => w.id === 'frontend-feature');
      expect(frontendFeature?.compatible).toBe(false);
      expect(frontendFeature?.missingAgents.length).toBeGreaterThan(0);
    });

    it('should be compatible with only the primary agent (optional testing skipped)', async () => {
      mockGetInstalledComponents.mockResolvedValue({
        agents: ['react-expert'],
        mcpServers: []
      });

      const result = await workflowsService.getAllWorkflows(projectDir);

      const frontendFeature = result.builtin.find(w => w.id === 'frontend-feature');
      expect(frontendFeature?.compatible).toBe(true);
      expect(frontendFeature?.missingAgents).toEqual([]);
      expect(frontendFeature?.skippedAgents?.length).toBeGreaterThan(0);
      // Only the frontend subtask should be present (testing was skipped)
      expect(frontendFeature?.subTasks).toHaveLength(1);
      expect(frontendFeature?.subTasks[0]?.agentId).toBe('react-expert');
    });

    it('code-review is compatible without qa-expert (qa step optional)', async () => {
      mockGetInstalledComponents.mockResolvedValue({
        agents: ['code-reviewer'],
        mcpServers: ['code-quality', 'documentation']
      });

      const result = await workflowsService.getAllWorkflows(projectDir);

      const codeReview = result.builtin.find(w => w.id === 'code-review');
      expect(codeReview?.compatible).toBe(true);
      expect(codeReview?.missingAgents).toEqual([]);
      expect(codeReview?.skippedAgents?.length).toBeGreaterThan(0);
    });

    it('testing-suite remains incompatible without testing agents', async () => {
      mockGetInstalledComponents.mockResolvedValue({
        agents: ['react-expert'],
        mcpServers: []
      });

      const result = await workflowsService.getAllWorkflows(projectDir);

      const testingSuite = result.builtin.find(w => w.id === 'testing-suite');
      expect(testingSuite?.compatible).toBe(false);
    });

    it('should resolve role placeholders to installed agents', async () => {
      mockGetInstalledComponents.mockResolvedValue({
        agents: ['react-expert', 'vitest-expert'],
        mcpServers: ['documentation']
      });

      const result = await workflowsService.getAllWorkflows(projectDir);

      const frontendFeature = result.builtin.find(w => w.id === 'frontend-feature');
      expect(frontendFeature?.subTasks[0]?.agentId).toBe('react-expert');
      expect(frontendFeature?.subTasks[1]?.agentId).toBe('vitest-expert');
    });

    it('should use backend-specific testing agent when available', async () => {
      mockGetInstalledComponents.mockResolvedValue({
        agents: ['spring-boot-expert', 'spring-boot-integration-test-expert', 'architect'],
        mcpServers: ['documentation', 'api-tester']
      });

      const result = await workflowsService.getAllWorkflows(projectDir);

      const backendFeature = result.builtin.find(w => w.id === 'backend-feature');
      const testingTask = backendFeature?.subTasks.find(t => t.taskTemplate.includes('integration tests'));
      expect(testingTask?.agentId).toBe('spring-boot-integration-test-expert');
    });

    it('should fallback to generic testing agent if backend-specific not available', async () => {
      mockGetInstalledComponents.mockResolvedValue({
        agents: ['nestjs-expert', 'vitest-expert', 'architect'],
        mcpServers: ['documentation', 'api-tester']
      });

      const result = await workflowsService.getAllWorkflows(projectDir);

      const backendFeature = result.builtin.find(w => w.id === 'backend-feature');
      const testingTask = backendFeature?.subTasks.find(t => t.taskTemplate.includes('integration tests'));
      expect(testingTask?.agentId).toBe('vitest-expert');
    });

    it('should identify missing MCP servers', async () => {
      mockGetInstalledComponents.mockResolvedValue({
        agents: ['react-expert', 'vitest-expert'],
        mcpServers: [] // No MCP servers
      });

      const result = await workflowsService.getAllWorkflows(projectDir);

      const frontendFeature = result.builtin.find(w => w.id === 'frontend-feature');
      expect(frontendFeature?.missingMcp).toContain('documentation');
    });

    it('should sort workflows with compatible first', async () => {
      mockGetInstalledComponents.mockResolvedValue({
        agents: ['code-reviewer', 'qa-expert'],
        mcpServers: ['code-quality', 'documentation']
      });

      const result = await workflowsService.getAllWorkflows(projectDir);

      // Code review workflow should be compatible and come first
      const codeReview = result.builtin.find(w => w.id === 'code-review');
      expect(codeReview?.compatible).toBe(true);

      // Find first incompatible workflow
      const firstIncompatibleIndex = result.builtin.findIndex(w => !w.compatible);
      if (firstIncompatibleIndex > 0) {
        const lastCompatibleIndex = firstIncompatibleIndex - 1;
        expect(result.builtin[lastCompatibleIndex]?.compatible).toBe(true);
      }
    });

    it('should include custom workflows from file', async () => {
      const customWorkflows = [
        {
          id: 'custom-1',
          name: 'Custom Workflow',
          description: 'Test',
          category: 'custom',
          subTasks: [],
          mcpServers: []
        }
      ];

      fs.writeFileSync(
        path.join(projectDir, '.dev-suite-workflows.json'),
        JSON.stringify({ customWorkflows })
      );

      const result = await workflowsService.getAllWorkflows(projectDir);

      expect(result.custom).toHaveLength(1);
      expect(result.custom[0]?.id).toBe('custom-1');
    });

    it('should handle direct agent IDs (not roles)', async () => {
      mockGetInstalledComponents.mockResolvedValue({
        agents: ['architect', 'code-reviewer', 'qa-expert'],
        mcpServers: ['code-quality', 'documentation']
      });

      const result = await workflowsService.getAllWorkflows(projectDir);

      const codeReview = result.builtin.find(w => w.id === 'code-review');
      expect(codeReview?.compatible).toBe(true);
      expect(codeReview?.subTasks[0]?.agentId).toBe('code-reviewer');
    });

    it('should resolve dependencies with context', async () => {
      mockGetInstalledComponents.mockResolvedValue({
        agents: ['architect', 'nestjs-expert', 'react-expert', 'vitest-expert'],
        mcpServers: ['documentation', 'api-tester']
      });

      const result = await workflowsService.getAllWorkflows(projectDir);

      const fullstackFeature = result.builtin.find(w => w.id === 'fullstack-feature');
      expect(fullstackFeature?.compatible).toBe(true);

      // Check that testing task depends on resolved agents
      const testingTask = fullstackFeature?.subTasks.find(t => t.taskTemplate.includes('unit tests'));
      expect(testingTask?.dependencies).toContain('nestjs-expert');
      expect(testingTask?.dependencies).toContain('react-expert');
    });

    it('should handle workflow with all required agents missing', async () => {
      mockGetInstalledComponents.mockResolvedValue({
        agents: [],
        mcpServers: []
      });

      const result = await workflowsService.getAllWorkflows(projectDir);

      // All workflows should be incompatible
      expect(result.builtin.every(w => !w.compatible)).toBe(true);
    });

    it('should preserve original subtasks when workflow is incompatible', async () => {
      mockGetInstalledComponents.mockResolvedValue({
        agents: ['architect'], // Only architect, missing frontend/testing
        mcpServers: []
      });

      const result = await workflowsService.getAllWorkflows(projectDir);

      const frontendFeature = result.builtin.find(w => w.id === 'frontend-feature');
      expect(frontendFeature?.compatible).toBe(false);
      // Original placeholders should be preserved
      expect(frontendFeature?.subTasks.length).toBeGreaterThan(0);
    });
  });

  describe('edge cases', () => {
    it('should handle workflows with no MCP servers', async () => {
      mockGetInstalledComponents.mockResolvedValue({
        agents: ['code-reviewer'],
        mcpServers: []
      });

      const result = await workflowsService.getAllWorkflows(projectDir);

      expect(result.builtin).toBeDefined();
    });

    it('should handle empty agent list', async () => {
      mockGetInstalledComponents.mockResolvedValue({
        agents: [],
        mcpServers: ['documentation']
      });

      const result = await workflowsService.getAllWorkflows(projectDir);

      expect(result.builtin.every(w => !w.compatible)).toBe(true);
    });

    it('should handle prompt with special characters', () => {
      const prompt = 'Test API with @mentions, #tags, and "quotes"';

      const suggestions = workflowsService.analyzePromptForMcp(prompt);

      expect(suggestions.length).toBeGreaterThan(0);
    });

    it('should handle very long prompts', () => {
      const longPrompt = 'test api '.repeat(1000);

      const suggestions = workflowsService.analyzePromptForMcp(longPrompt);

      expect(suggestions.length).toBeGreaterThan(0);
    });

    it('should handle workflows with circular dependencies', async () => {
      const customWorkflows = [
        {
          id: 'circular',
          name: 'Circular',
          description: 'Has circular deps',
          category: 'custom',
          subTasks: [
            { agentId: 'agent1', taskTemplate: 'Task 1', dependencies: ['agent2'] },
            { agentId: 'agent2', taskTemplate: 'Task 2', dependencies: ['agent1'] }
          ],
          mcpServers: []
        }
      ];

      fs.writeFileSync(
        path.join(projectDir, '.dev-suite-workflows.json'),
        JSON.stringify({ customWorkflows })
      );

      mockGetInstalledComponents.mockResolvedValue({
        agents: ['agent1', 'agent2'],
        mcpServers: []
      });

      // Should not hang or crash
      const result = await workflowsService.getAllWorkflows(projectDir);

      expect(result.custom).toHaveLength(1);
    });
  });

  describe('builtin workflow validation', () => {
    beforeEach(() => {
      mockGetInstalledComponents.mockResolvedValue({
        agents: [
          'architect', 'code-reviewer', 'qa-expert', 'security-expert',
          'react-expert', 'nestjs-expert', 'vitest-expert', 'playwright-expert'
        ],
        mcpServers: ['documentation', 'api-tester', 'code-quality', 'security-scanner']
      });
    });

    it('should have frontend-feature workflow', async () => {
      const result = await workflowsService.getAllWorkflows(projectDir);

      const workflow = result.builtin.find(w => w.id === 'frontend-feature');
      expect(workflow).toBeDefined();
      expect(workflow?.name).toBe('Frontend Feature');
    });

    it('should have backend-feature workflow', async () => {
      const result = await workflowsService.getAllWorkflows(projectDir);

      const workflow = result.builtin.find(w => w.id === 'backend-feature');
      expect(workflow).toBeDefined();
      expect(workflow?.name).toBe('Backend Feature');
    });

    it('should have fullstack-feature workflow', async () => {
      const result = await workflowsService.getAllWorkflows(projectDir);

      const workflow = result.builtin.find(w => w.id === 'fullstack-feature');
      expect(workflow).toBeDefined();
      expect(workflow?.name).toBe('Full Stack Feature');
    });

    it('should have testing-suite workflow', async () => {
      const result = await workflowsService.getAllWorkflows(projectDir);

      const workflow = result.builtin.find(w => w.id === 'testing-suite');
      expect(workflow).toBeDefined();
    });

    it('should have code-review workflow', async () => {
      const result = await workflowsService.getAllWorkflows(projectDir);

      const workflow = result.builtin.find(w => w.id === 'code-review');
      expect(workflow).toBeDefined();
    });

    it('should have bug-fix workflow', async () => {
      const result = await workflowsService.getAllWorkflows(projectDir);

      const workflow = result.builtin.find(w => w.id === 'bug-fix');
      expect(workflow).toBeDefined();
    });

    it('should have security-audit workflow', async () => {
      const result = await workflowsService.getAllWorkflows(projectDir);

      const workflow = result.builtin.find(w => w.id === 'security-audit');
      expect(workflow).toBeDefined();
    });

    it('should have all workflows marked as builtin category', async () => {
      const result = await workflowsService.getAllWorkflows(projectDir);

      expect(result.builtin.every(w => w.category === 'builtin')).toBe(true);
    });
  });
});
