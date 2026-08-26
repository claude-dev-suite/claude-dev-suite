// SPDX-License-Identifier: MIT
/**
 * Handler for export_report tool
 */

import { ExportReportSchema, jsonResponse, type Handler, type HandlerResult } from "./types.js";
import { exportReport } from "../analyzers/report.js";
import { validateLogPath, validateExportPath } from "../utils.js";

export const handleExportReport: Handler = async (args): Promise<HandlerResult> => {
  const input = ExportReportSchema.parse(args);
  validateLogPath(input.filePath);
  // The *write* side went unchecked while the read side was validated — this is
  // the only tool in the server that creates a file, and `outputPath` came
  // straight off an unconstrained `z.string()`.
  if (input.outputPath !== undefined) {
    validateExportPath(input.outputPath);
  }
  const result = await exportReport(input);
  return jsonResponse(result);
};
