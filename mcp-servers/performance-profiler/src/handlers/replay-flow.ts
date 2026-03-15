// SPDX-License-Identifier: MIT
/**
 * Handler for replay_flow tool
 */

import { ReplayFlowSchema, jsonResponse, type Handler, type HandlerResult } from "./types.js";
import { replayFlow } from "../flows/replayer.js";

export const handleReplayFlow: Handler = async (args): Promise<HandlerResult> => {
  const input = ReplayFlowSchema.parse(args);
  const result = await replayFlow(input);

  return jsonResponse(result);
};
