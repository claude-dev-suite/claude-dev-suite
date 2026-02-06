// SPDX-License-Identifier: MIT
/**
 * Handler for export_report tool
 */

import { ExportReportSchema, jsonResponse, type Handler, type HandlerResult } from "./types.js";
import { exportReport } from "../analyzers/report.js";

export const handleExportReport: Handler = async (args): Promise<HandlerResult> => {
  const input = ExportReportSchema.parse(args);
  const result = await exportReport(input);
  return jsonResponse(result);
};
