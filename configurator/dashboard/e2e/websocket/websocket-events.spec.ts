// SPDX-License-Identifier: MIT
import { createInstalledTest, expect } from '../fixtures/installed-project';

const test = createInstalledTest({ tmpPrefix: 'devsuite-e2e-ws-' });

test.describe('WebSocket Events', () => {
  test('token endpoint returns valid token and port', async ({ mainPage }) => {
    const result = await mainPage.evaluate(async () => {
      const res = await fetch('http://localhost:3456/api/tokens');
      const json = await res.json();
      return json;
    });

    expect(result.success).toBe(true);
    expect(typeof result.data.wsToken).toBe('string');
    expect(result.data.wsToken.length).toBeGreaterThan(0);
    expect(result.data.wsPort).toBe(3457);
  });

  test('WebSocket connects with valid token', async ({ mainPage }) => {
    const connected = await mainPage.evaluate(async () => {
      const res = await fetch('http://localhost:3456/api/tokens');
      const json = await res.json();
      const token = json.data.wsToken;
      const port = json.data.wsPort;

      return new Promise<boolean>((resolve) => {
        const ws = new WebSocket(`ws://localhost:${port}?token=${token}`);
        ws.onopen = () => {
          ws.close();
          resolve(true);
        };
        ws.onerror = () => resolve(false);
        setTimeout(() => resolve(false), 10_000);
      });
    });

    expect(connected).toBe(true);
  });

  test('WebSocket rejects invalid token', async ({ mainPage }) => {
    const closeCode = await mainPage.evaluate(async () => {
      return new Promise<number>((resolve) => {
        const ws = new WebSocket('ws://localhost:3457?token=invalid-bad-token');
        ws.onclose = (e) => resolve(e.code);
        ws.onerror = () => {}; // suppress console noise
        setTimeout(() => resolve(-1), 10_000);
      });
    });

    expect(closeCode).toBe(4001);
  });

  test('WebSocket rejects missing token', async ({ mainPage }) => {
    const closeCode = await mainPage.evaluate(async () => {
      return new Promise<number>((resolve) => {
        const ws = new WebSocket('ws://localhost:3457');
        ws.onclose = (e) => resolve(e.code);
        ws.onerror = () => {};
        setTimeout(() => resolve(-1), 10_000);
      });
    });

    expect(closeCode).toBe(4001);
  });

  test('get_status returns status message', async ({ mainPage }) => {
    const responseType = await mainPage.evaluate(async () => {
      const res = await fetch('http://localhost:3456/api/tokens');
      const json = await res.json();
      const token = json.data.wsToken;
      const port = json.data.wsPort;

      return new Promise<string>((resolve) => {
        const ws = new WebSocket(`ws://localhost:${port}?token=${token}`);
        ws.onmessage = (e) => {
          try {
            const msg = JSON.parse(e.data);
            ws.close();
            resolve(msg.type);
          } catch {
            resolve('parse_error');
          }
        };
        ws.onopen = () => {
          ws.send(JSON.stringify({ type: 'get_status' }));
        };
        ws.onerror = () => resolve('error');
        setTimeout(() => resolve('timeout'), 10_000);
      });
    });

    expect(responseType).toBe('status');
  });
});
