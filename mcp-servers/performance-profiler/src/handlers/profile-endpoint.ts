// SPDX-License-Identifier: MIT
/**
 * Handler for profile_endpoint tool
 */

import { ProfileEndpointSchema, jsonResponse, type Handler, type HandlerResult } from "./types.js";
import { profileEndpoint } from "../live/endpoint.js";

export const handleProfileEndpoint: Handler = async (args): Promise<HandlerResult> => {
  const input = ProfileEndpointSchema.parse(args);
  const result = await profileEndpoint(input);

  return jsonResponse(result);
};
