// SPDX-License-Identifier: MIT
import { test, expect } from '../fixtures/electron-app.fixture';

test.describe('API Endpoints', () => {
  test('GET /api/detect returns project stack', async ({ mainPage, testProjectDir }) => {
    const result = await mainPage.evaluate(async (dir) => {
      const res = await fetch(`http://localhost:3456/api/detect?path=${encodeURIComponent(dir)}`);
      const json = await res.json();
      return { status: res.status, hasProjectType: !!json.project_type || !!json.projectType };
    }, testProjectDir);

    expect(result.status).toBe(200);
    expect(result.hasProjectType).toBe(true);
  });

  test('GET /api/agents returns agent list', async ({ mainPage }) => {
    const result = await mainPage.evaluate(async () => {
      const res = await fetch('http://localhost:3456/api/agents');
      const json = await res.json();
      return { status: res.status, isArray: Array.isArray(json.agents) };
    });

    expect(result.status).toBe(200);
    expect(result.isArray).toBe(true);
  });

  test('GET /api/mcp-servers returns MCP list', async ({ mainPage }) => {
    const result = await mainPage.evaluate(async () => {
      const res = await fetch('http://localhost:3456/api/mcp-servers');
      const json = await res.json();
      return { status: res.status, isArray: Array.isArray(json.servers) };
    });

    expect(result.status).toBe(200);
    expect(result.isArray).toBe(true);
  });

  test('GET /api/automation-recipes returns recipes', async ({ mainPage }) => {
    const result = await mainPage.evaluate(async () => {
      const res = await fetch('http://localhost:3456/api/automation-recipes');
      const json = await res.json();
      return { status: res.status, success: json.success };
    });

    expect(result.status).toBe(200);
    expect(result.success).toBe(true);
  });

  test('GET /api/git/repos returns repository info', async ({ mainPage, testProjectDir }) => {
    const result = await mainPage.evaluate(async (dir) => {
      const res = await fetch(`http://localhost:3456/api/git/repos?path=${encodeURIComponent(dir)}`);
      const json = await res.json();
      return { status: res.status, success: json.success, hasData: !!json.data };
    }, testProjectDir);

    expect(result.status).toBe(200);
    expect(result.success).toBe(true);
  });

  test('GET /api/hooks/status returns hooks info', async ({ mainPage, testProjectDir }) => {
    const result = await mainPage.evaluate(async (dir) => {
      const res = await fetch(`http://localhost:3456/api/hooks/status?path=${encodeURIComponent(dir)}`);
      return { status: res.status };
    }, testProjectDir);

    // Should succeed (200) or return valid response
    expect(result.status).toBeLessThan(500);
  });

  test('GET /api/tokens returns new token each call', async ({ mainPage }) => {
    const result = await mainPage.evaluate(async () => {
      const res1 = await fetch('http://localhost:3456/api/tokens');
      const json1 = await res1.json();
      const res2 = await fetch('http://localhost:3456/api/tokens');
      const json2 = await res2.json();
      return {
        token1: json1.data.wsToken,
        token2: json2.data.wsToken,
        areDifferent: json1.data.wsToken !== json2.data.wsToken,
      };
    });

    expect(result.areDifferent).toBe(true);
  });
});
