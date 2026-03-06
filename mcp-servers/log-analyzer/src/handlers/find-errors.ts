// SPDX-License-Identifier: MIT
/**
 * Handler for find_errors tool
 */

import { FindErrorsSchema, jsonResponse, type Handler, type HandlerResult } from "./types.js";
import { findErrors } from "../analyzers/errors.js";
import { validateLogPath } from "../utils.js";

export const handleFindErrors: Handler = async (args): Promise<HandlerResult> => {
  const input = FindErrorsSchema.parse(args);
  validateLogPath(input.filePath);
  const result = await findErrors(input);
  return jsonResponse(result);
};
