// SPDX-License-Identifier: MIT
/**
 * Handlers for HTTP load, flows and process listing.
 */

import { Recorder } from '../load/engine.js';
import { endpointLoadOptions, prepareEndpoint, profileEndpoint } from '../live/endpoint.js';
import { listJavaProcesses } from '../live/process-finder.js';
import { importHar } from '../flows/har-import.js';
import { getFlowsDirectory, listFlows } from '../flows/storage.js';
import { replayFlow } from '../flows/replayer.js';
import { prepareStressTest, stressTestFlow } from '../flows/stress-test.js';
import { runMaybeInBackground } from './background.js';
import {
  ImportHarSchema,
  ProfileEndpointSchema,
  ReplayFlowSchema,
  StressTestSchema,
  jsonResponse,
  type Handler,
} from './types.js';

export const handleProfileEndpoint: Handler = async (args) => {
  const a = ProfileEndpointSchema.parse(args);
  const input = { ...a };
  const opts = endpointLoadOptions(input);
  // Estimate: time-bounded runs take `duration`; count-bounded ones are assumed fast.
  const estimated = opts.durationS ?? 0;
  const prepared = await prepareEndpoint(input); // validation + SSRF check fail fast, before any job starts
  const rec = new Recorder();
  const result = await runMaybeInBackground(
    'profile_endpoint',
    `${a.method} ${a.url}`,
    a.background,
    estimated,
    (signal) => profileEndpoint({ ...input, signal }, { ...prepared, opts: { ...prepared.opts, signal } }, rec),
    () => rec.progress()
  );
  return jsonResponse(result);
};

export const handleStressTestFlow: Handler = async (args) => {
  const a = StressTestSchema.parse(args);
  const prepared = await prepareStressTest(a);
  const rec = new Recorder();
  const result = await runMaybeInBackground(
    'stress_test_flow',
    `flow ${a.flowName}`,
    a.background,
    a.duration,
    (signal) => stressTestFlow({ ...a, signal }, { ...prepared, opts: { ...prepared.opts, signal } }, rec),
    () => rec.progress()
  );
  return jsonResponse(result);
};

export const handleImportHar: Handler = async (args) => jsonResponse(await importHar(ImportHarSchema.parse(args)));

export const handleListFlows: Handler = async () => jsonResponse({ flowsDirectory: getFlowsDirectory(), flows: await listFlows() });

export const handleReplayFlow: Handler = async (args) => jsonResponse(await replayFlow(ReplayFlowSchema.parse(args)));

export const handleListJavaProcesses: Handler = async () => jsonResponse({ processes: await listJavaProcesses() });
