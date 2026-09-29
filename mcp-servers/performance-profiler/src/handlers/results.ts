// SPDX-License-Identifier: MIT
/**
 * Handlers for jobs, baselines/regression and web vitals.
 */

import { getJob, listJobs, stopJob } from '../jobs/manager.js';
import { compareResults, listBaselines, saveBaseline } from '../results/store.js';
import { auditWebVitals, preflightVitals } from '../web/vitals.js';
import { runMaybeInBackground } from './background.js';
import {
  AuditWebVitalsSchema,
  CompareResultsSchema,
  GetJobSchema,
  SaveBaselineSchema,
  StopJobSchema,
  jsonResponse,
  type Handler,
} from './types.js';

export const handleGetJob: Handler = async (args) => {
  const a = GetJobSchema.parse(args);
  return jsonResponse(await getJob(a.jobId, a.wait));
};

export const handleStopJob: Handler = async (args) => jsonResponse(await stopJob(StopJobSchema.parse(args).jobId));

export const handleListJobs: Handler = async () => jsonResponse({ jobs: listJobs() });

export const handleSaveBaseline: Handler = async (args) => {
  const a = SaveBaselineSchema.parse(args);
  return jsonResponse(await saveBaseline(a.name, a.runId, a.overwrite));
};

export const handleListBaselines: Handler = async () => jsonResponse(await listBaselines());

export const handleCompareResults: Handler = async (args) => {
  const a = CompareResultsSchema.parse(args);
  return jsonResponse(await compareResults(a.baseline, a.current, a.tolerancePct));
};

export const handleAuditWebVitals: Handler = async (args) => {
  const a = AuditWebVitalsSchema.parse(args);
  await preflightVitals(a);
  const result = await runMaybeInBackground('audit_web_vitals', a.url, a.background, a.runs * 25, (signal) =>
    auditWebVitals({ url: a.url, formFactor: a.formFactor, runs: a.runs, engine: a.engine, signal })
  );
  return jsonResponse(result);
};
