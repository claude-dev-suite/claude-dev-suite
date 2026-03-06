// SPDX-License-Identifier: MIT
/**
 * Handler for export_report tool
 */

import { ExportReportSchema, jsonResponse, type Handler, type HandlerResult } from "./types.js";
import { exportReport } from "../analyzers/report.js";
import { validateLogPath } from "../utils.js";

export const handleExportReport: Handler = async (args): Promise<HandlerResult> => {
  const input = ExportReportSchema.parse(args);
  validateLogPath(input.filePath);
  const result = await exportReport(input);
  return jsonResponse(result);
};
