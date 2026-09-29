import { join, resolve } from "path";
import { fileURLToPath } from "url";
import { handlers } from "../src/handlers/handlers.js";
import { initSourcesFromEnv } from "../src/sources.js";
import { clearDocumentCache } from "../src/loader.js";
import type { ToolName } from "../src/handlers/schemas.js";

export const FIXTURES = resolve(fileURLToPath(new URL("./fixtures", import.meta.url)));
export const SPECS = join(FIXTURES, "specs");

export function useFixtureRoot(root = FIXTURES): void {
  process.env.API_EXPLORER_PROJECT_ROOT = root;
  clearDocumentCache();
}

export function register(sources: Array<Record<string, unknown>>): void {
  initSourcesFromEnv(JSON.stringify(sources));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function call(name: ToolName, args: Record<string, unknown> = {}): Promise<any> {
  const { formatError } = await import("../src/handlers/handlers.js");
  let res;
  try {
    res = await handlers[name](args);
  } catch (e) {
    res = formatError(e);
  }
  const body = JSON.parse(res.content[0].text);
  return res.isError ? { __error: true, ...body } : body;
}
