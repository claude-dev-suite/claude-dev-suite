// SPDX-License-Identifier: MIT
/**
 * Playwright Global Setup
 *
 * E2E tests use a random ephemeral port per test (see electron-app.fixture.ts)
 * to avoid conflicting with dev instances on port 3456 and with each other.
 */
export default async function globalSetup() {
  // No-op: port isolation is handled per-test via getFreePort() in the fixture.
}
