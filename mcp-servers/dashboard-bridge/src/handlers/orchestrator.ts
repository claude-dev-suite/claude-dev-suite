// SPDX-License-Identifier: MIT
/**
 * Orchestrator tool handlers
 */

import {
  GetOrchestratorTaskSchema,
  ReportStatusSchema,
  jobQueue,
  jsonResponse,
  textResponse,
  errorResponse,
  broadcastToClients,
  generateOrchestratorPrompt,
  type Handler,
  type HandlerResult,
  type JobRecap,
} from "./types.js";

export const handleGetOrchestratorTask: Handler = async (args): Promise<HandlerResult> => {
  const { claim } = GetOrchestratorTaskSchema.parse(args);

  const pendingJob = jobQueue.find(j => j.status === "pending");

  if (!pendingJob) {
    return jsonResponse({ found: false, message: "No pending tasks in queue" });
  }

  if (claim) {
    pendingJob.status = "claimed";
    pendingJob.claimedAt = new Date().toISOString();

    // Notify dashboard
    broadcastToClients({
      type: "job_claimed",
      payload: { jobId: pendingJob.id }
    });
  }

  const prompt = generateOrchestratorPrompt(pendingJob);

  return jsonResponse({
    found: true,
    task: {
      jobId: pendingJob.id,
      title: pendingJob.title,
      prompt,
    }
  });
};

export const handleReportOrchestratorStatus: Handler = async (args): Promise<HandlerResult> => {
  const { jobId, status, currentAgent, message, summary, recap } = ReportStatusSchema.parse(args);

  const job = jobQueue.find(j => j.id === jobId);
  if (!job) {
    return errorResponse(`Job ${jobId} not found`);
  }

  if (status === "progress") {
    job.status = "running";
    broadcastToClients({
      type: "job_progress",
      payload: { jobId, agent: currentAgent, status: "working", message }
    });
  } else if (status === "completed") {
    job.status = "completed";
    job.completedAt = new Date().toISOString();
    job.summary = summary;
    job.recap = recap as JobRecap;
    broadcastToClients({
      type: "job_complete",
      payload: { jobId, success: true, summary, recap }
    });
  } else if (status === "failed") {
    job.status = "failed";
    job.completedAt = new Date().toISOString();
    job.summary = summary;
    job.recap = recap as JobRecap;
    broadcastToClients({
      type: "job_complete",
      payload: { jobId, success: false, summary, recap }
    });
  }

  return jsonResponse({ success: true, jobId, status });
};

export const handleListPendingJobs: Handler = async (): Promise<HandlerResult> => {
  const jobs = jobQueue.map(j => ({
    jobId: j.id,
    title: j.title,
    status: j.status,
    createdAt: j.createdAt,
    subTaskCount: j.subTasks.length,
  }));

  return jsonResponse({ jobs, total: jobs.length });
};
