// SPDX-License-Identifier: MIT
/**
 * A scripted stand-in for the docker CLI: routes match on the joined argument
 * string and return canned stdout/stderr/exit codes, so handlers run their real
 * argument building, parsing and error classification without a daemon.
 */

import { setRawRunner, spawnRunner, type RawRunOptions, type RawRunResult } from "../src/lib/exec.js";

export interface Call {
  bin: string;
  args: string[];
  joined: string;
  opts: RawRunOptions;
}

type Reply = Partial<RawRunResult> | ((call: Call) => Partial<RawRunResult>);
export type Route = [RegExp | string, Reply];

export function fakeDocker(routes: Route[]) {
  const calls: Call[] = [];
  setRawRunner(async (bin, args, opts) => {
    const call: Call = { bin, args, joined: args.join(" "), opts };
    calls.push(call);
    for (const [pattern, reply] of routes) {
      const hit = typeof pattern === "string" ? call.joined.startsWith(pattern) : pattern.test(call.joined);
      if (hit) {
        const r = typeof reply === "function" ? reply(call) : reply;
        return {
          stdout: "", stderr: "", exitCode: 0, timedOut: false,
          stdoutTruncated: false, stderrTruncated: false, ...r,
        };
      }
    }
    return {
      stdout: "", stderr: `fake docker: no route for '${call.joined}'`, exitCode: 1, timedOut: false,
      stdoutTruncated: false, stderrTruncated: false,
    };
  });
  return {
    calls,
    find: (re: RegExp) => calls.filter((c) => re.test(c.joined)),
  };
}

export function restoreRunner() {
  setRawRunner(spawnRunner);
}

/** Parse the JSON text of a handler result. */
export function body(result: { content: Array<{ text: string }>; isError?: boolean }): Record<string, any> {
  return JSON.parse(result.content[0].text);
}

export const jsonl = (rows: object[]) => rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
