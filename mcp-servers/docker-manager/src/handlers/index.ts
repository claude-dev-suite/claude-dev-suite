// SPDX-License-Identifier: MIT
/**
 * Docker Manager handlers registry
 */

export { type Handler, type HandlerResult, jsonResponse, errorResponse } from "./types.js";

import {
  handleDockerPs,
  handleDockerContainer,
  handleDockerRun,
  handleDockerExec,
  handleDockerCp,
  handleDockerStats,
} from "./containers.js";
import { handleDockerCompose } from "./compose.js";
import { handleDockerImages, handleDockerBuild, handleDockerRegistry } from "./images.js";
import { handleDockerNetworks, handleDockerVolumes, handleDockerSystem } from "./resources.js";
import { handleCleanupUnused } from "./cleanup.js";
import type { Handler } from "./types.js";

export const handlers: Record<string, Handler> = {
  docker_ps: handleDockerPs,
  docker_container: handleDockerContainer,
  docker_run: handleDockerRun,
  docker_exec: handleDockerExec,
  docker_cp: handleDockerCp,
  docker_compose: handleDockerCompose,
  docker_images: handleDockerImages,
  docker_build: handleDockerBuild,
  docker_registry: handleDockerRegistry,
  docker_stats: handleDockerStats,
  docker_networks: handleDockerNetworks,
  docker_volumes: handleDockerVolumes,
  docker_system: handleDockerSystem,
  cleanup_unused: handleCleanupUnused,
};
