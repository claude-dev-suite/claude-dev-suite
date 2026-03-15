// SPDX-License-Identifier: MIT
import { describe, it, expect, beforeEach } from 'vitest';
import { useProjectStore } from '../project.store';

describe('ProjectStore', () => {
  beforeEach(() => {
    useProjectStore.getState().reset();
  });

  it('should set project path', () => {
    const { setProjectPath } = useProjectStore.getState();
    setProjectPath('/test/path');
    expect(useProjectStore.getState().projectPath).toBe('/test/path');
  });

  it('should set detection result', () => {
    const { setDetection } = useProjectStore.getState();
    const detection = { frameworks: ['react'], databases: [], gitProvider: null };
    setDetection(detection as any);
    expect(useProjectStore.getState().detection).toEqual(detection);
  });

  it('should toggle agent selection', () => {
    const { toggleAgent } = useProjectStore.getState();

    toggleAgent('react-expert');
    expect(useProjectStore.getState().selectedAgents).toContain('react-expert');

    toggleAgent('react-expert');
    expect(useProjectStore.getState().selectedAgents).not.toContain('react-expert');
  });

  it('should add/remove agents', () => {
    const { addAgent, removeAgent } = useProjectStore.getState();

    addAgent('react-expert');
    addAgent('typescript-expert');
    expect(useProjectStore.getState().selectedAgents).toHaveLength(2);

    removeAgent('react-expert');
    expect(useProjectStore.getState().selectedAgents).toEqual(['typescript-expert']);
  });

  it('should not duplicate agents when adding', () => {
    const { addAgent } = useProjectStore.getState();

    addAgent('react-expert');
    addAgent('react-expert');
    expect(useProjectStore.getState().selectedAgents).toHaveLength(1);
  });

  it('should set selected agents', () => {
    const { setSelectedAgents } = useProjectStore.getState();

    setSelectedAgents(['react-expert', 'typescript-expert']);
    expect(useProjectStore.getState().selectedAgents).toEqual(['react-expert', 'typescript-expert']);
  });

  it('should toggle MCP server selection', () => {
    const { toggleMcp } = useProjectStore.getState();

    toggleMcp('documentation');
    expect(useProjectStore.getState().selectedMcp).toContain('documentation');

    toggleMcp('documentation');
    expect(useProjectStore.getState().selectedMcp).not.toContain('documentation');
  });

  it('should add/remove MCP servers', () => {
    const { addMcp, removeMcp } = useProjectStore.getState();

    addMcp('documentation');
    addMcp('api-tester');
    expect(useProjectStore.getState().selectedMcp).toHaveLength(2);

    removeMcp('documentation');
    expect(useProjectStore.getState().selectedMcp).toEqual(['api-tester']);
  });

  it('should set environment variables', () => {
    const { setEnvVar } = useProjectStore.getState();

    setEnvVar('DATABASE_URL', 'postgres://...');
    expect(useProjectStore.getState().envVars['DATABASE_URL']).toBe('postgres://...');

    setEnvVar('API_KEY', 'key123');
    setEnvVar('DEBUG', 'true');

    expect(useProjectStore.getState().envVars).toEqual({
      DATABASE_URL: 'postgres://...',
      API_KEY: 'key123',
      DEBUG: 'true',
    });
  });

  it('should set multiple env vars at once', () => {
    const { setEnvVars } = useProjectStore.getState();

    setEnvVars({ API_KEY: 'key123', DEBUG: 'true' });
    expect(useProjectStore.getState().envVars).toEqual({
      API_KEY: 'key123',
      DEBUG: 'true',
    });
  });

  it('should reset all state', () => {
    const store = useProjectStore.getState();

    store.setProjectPath('/test');
    store.addAgent('react-expert');
    store.addMcp('documentation');

    store.reset();

    const state = useProjectStore.getState();
    expect(state.projectPath).toBe('');
    expect(state.selectedAgents).toEqual([]);
    expect(state.selectedMcp).toEqual([]);
    expect(state.envVars).toEqual({});
  });

  it('should reset only selections', () => {
    const store = useProjectStore.getState();

    store.setProjectPath('/test');
    store.addAgent('react-expert');
    store.setEnvVar('KEY', 'value');

    store.resetSelections();

    const state = useProjectStore.getState();
    expect(state.projectPath).toBe('/test'); // kept
    expect(state.selectedAgents).toEqual([]); // reset
    expect(state.envVars).toEqual({}); // reset
  });
});
