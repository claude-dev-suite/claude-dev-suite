// SPDX-License-Identifier: MIT
/**
 * Handler for import_har tool
 */

import { ImportHarSchema, jsonResponse, type Handler, type HandlerResult } from "./types.js";
import { importHar } from "../flows/har-import.js";

export const handleImportHar: Handler = async (args): Promise<HandlerResult> => {
  const input = ImportHarSchema.parse(args);
  const result = await importHar(input);

  return jsonResponse(result);
};
