// SPDX-License-Identifier: MIT
/**
 * Handler for list_flows tool
 */

import { jsonResponse, type Handler, type HandlerResult } from "./types.js";
import { listFlows, getFlowsDirectory } from "../flows/storage.js";

export const handleListFlows: Handler = async (_args): Promise<HandlerResult> => {
  const flows = await listFlows();

  return jsonResponse({
    flowsDirectory: getFlowsDirectory(),
    flows,
  });
};
