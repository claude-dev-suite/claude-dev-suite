// SPDX-License-Identifier: MIT
/**
 * Docker Manager handlers registry
 */

export { type Handler, type HandlerResult, jsonResponse, errorResponse } from "./types.js";

import {
  handleDockerPs,
  handleDockerContainer,
  handleDockerCompose,
  handleDockerImages,
  handleDockerStats,
  handleDockerNetworks,
  handleDockerVolumes,
  handleCleanupUnused,
} from "./docker-handlers.js";
import type { Handler } from "./types.js";

export const handlers: Record<string, Handler> = {
  docker_ps: handleDockerPs,
  docker_container: handleDockerContainer,
  docker_compose: handleDockerCompose,
  docker_images: handleDockerImages,
  docker_stats: handleDockerStats,
  docker_networks: handleDockerNetworks,
  docker_volumes: handleDockerVolumes,
  cleanup_unused: handleCleanupUnused,
};
