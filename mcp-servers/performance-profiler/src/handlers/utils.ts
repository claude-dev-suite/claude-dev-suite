// SPDX-License-Identifier: MIT
/**
 * Shared utilities for performance-profiler handlers
 */

import * as nodejsProfiler from "../profilers/nodejs.js";
import * as pythonProfiler from "../profilers/python.js";
import * as javaProfiler from "../profilers/java.js";
import { detectRuntime, checkRuntimeAvailable } from "../utils/process.js";
import type { Runtime } from "./types.js";

export function getProfiler(runtime: Runtime) {
  switch (runtime) {
    case "nodejs":
      return nodejsProfiler;
    case "python":
      return pythonProfiler;
    case "java":
      return javaProfiler;
    default:
      throw new Error(`Unsupported runtime: ${runtime}`);
  }
}

export async function resolveRuntime(
  specifiedRuntime: Runtime | undefined,
  scriptPath: string
): Promise<Runtime> {
  const runtime = specifiedRuntime || detectRuntime(scriptPath);

  // Verify runtime is available
  const available = await checkRuntimeAvailable(runtime);
  if (!available) {
    throw new Error(
      `Runtime '${runtime}' is not available on this system. Please install it first.`
    );
  }

  return runtime;
}
