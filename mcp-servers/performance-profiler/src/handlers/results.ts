// SPDX-License-Identifier: MIT
/**
 * Handlers for background jobs.
 */

import { getJob, listJobs, stopJob } from '../jobs/manager.js';
import { GetJobSchema, StopJobSchema, jsonResponse, type Handler } from './types.js';

export const handleGetJob: Handler = async (args) => {
  const a = GetJobSchema.parse(args);
  return jsonResponse(await getJob(a.jobId, a.wait));
};

export const handleStopJob: Handler = async (args) => jsonResponse(await stopJob(StopJobSchema.parse(args).jobId));

export const handleListJobs: Handler = async () => jsonResponse({ jobs: listJobs() });
