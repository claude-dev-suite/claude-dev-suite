// SPDX-License-Identifier: MIT
import { join } from 'path';
import { handlers } from '../src/handlers/index.js';
import type { PipelineDeps } from '../src/pipeline/index.js';
import { scan } from '../src/pipeline/index.js';
import type { LogEntry, LogFormat } from '../src/types.js';
import { writeFixtures } from './fixtures.js';

/** Call a tool handler and parse its JSON; throws on isError. */
export async function call(tool: string, args: unknown, deps?: PipelineDeps): Promise<any> {
  const r = await handlers[tool](args, deps);
  const body = JSON.parse(r.content[0].text);
  if (r.isError) throw new Error(body.error);
  return body;
}

/** Parse text as a log file and return every entry. */
export async function entriesOf(text: string, format: LogFormat = 'auto', name = 'test.log'): Promise<{ entries: LogEntry[]; summary: Awaited<ReturnType<typeof scan>> }> {
  const dir = writeFixtures({ [name]: text });
  const entries: LogEntry[] = [];
  const summary = await scan({ paths: [join(dir, name)], format }, {}, (e) => { entries.push(e); });
  return { entries, summary };
}
