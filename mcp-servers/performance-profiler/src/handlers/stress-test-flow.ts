// SPDX-License-Identifier: MIT
/**
 * Handler for stress_test_flow tool
 */

import { StressTestSchema, jsonResponse, type Handler, type HandlerResult } from "./types.js";
import { stressTestFlow } from "../flows/stress-test.js";

export const handleStressTestFlow: Handler = async (args): Promise<HandlerResult> => {
  const input = StressTestSchema.parse(args);
  const result = await stressTestFlow(input);

  return jsonResponse(result);
};
