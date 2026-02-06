// SPDX-License-Identifier: MIT
/**
 * Docker Manager tool handlers
 */

import {
  DockerPsSchema,
  ContainerActionSchema,
  ComposeActionSchema,
  ImageActionSchema,
  DockerStatsSchema,
  CleanupUnusedSchema,
  runDockerCommand,
  jsonResponse,
  errorResponse,
  type Handler,
  type HandlerResult,
} from "./types.js";

export const handleDockerPs: Handler = async (args): Promise<HandlerResult> => {
  const { all } = DockerPsSchema.parse(args);
  const command = all
    ? 'docker ps -a --format "{{json .}}"'
    : 'docker ps --format "{{json .}}"';

  const { stdout } = await runDockerCommand(command);
  const containers = stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  return jsonResponse({
    containers,
    count: containers.length,
  });
};

export const handleDockerContainer: Handler = async (args): Promise<HandlerResult> => {
  const { container, action, tail } = ContainerActionSchema.parse(args);

  let command: string;
  switch (action) {
    case "start":
      command = `docker start ${container}`;
      break;
    case "stop":
      command = `docker stop ${container}`;
      break;
    case "restart":
      command = `docker restart ${container}`;
      break;
    case "logs":
      command = `docker logs --tail ${tail} ${container}`;
      break;
    case "inspect":
      command = `docker inspect ${container}`;
      break;
  }

  const { stdout, stderr } = await runDockerCommand(command);

  return jsonResponse({
    action,
    container,
    output: action === "inspect" ? JSON.parse(stdout) : stdout,
    stderr: stderr || undefined,
  });
};

export const handleDockerCompose: Handler = async (args): Promise<HandlerResult> => {
  const { action, service, detach, build } = ComposeActionSchema.parse(args);

  let command = "docker compose";
  switch (action) {
    case "up":
      command += detach ? " up -d" : " up";
      if (build) command += " --build";
      break;
    case "down":
      command += " down";
      break;
    case "ps":
      command += " ps --format json";
      break;
    case "logs":
      command += " logs --tail 100";
      break;
    case "build":
      command += " build";
      break;
    case "restart":
      command += " restart";
      break;
  }

  if (service) {
    command += ` ${service}`;
  }

  const { stdout, stderr } = await runDockerCommand(command);

  return jsonResponse({
    action,
    service: service || "all",
    output: stdout,
    stderr: stderr || undefined,
  });
};

export const handleDockerImages: Handler = async (args): Promise<HandlerResult> => {
  const { action, image } = ImageActionSchema.parse(args);

  let command: string;
  switch (action) {
    case "list":
      command = 'docker images --format "{{json .}}"';
      break;
    case "pull":
      if (!image) throw new Error("Image name required for pull");
      command = `docker pull ${image}`;
      break;
    case "remove":
      if (!image) throw new Error("Image name required for remove");
      command = `docker rmi ${image}`;
      break;
    case "inspect":
      if (!image) throw new Error("Image name required for inspect");
      command = `docker image inspect ${image}`;
      break;
  }

  const { stdout, stderr } = await runDockerCommand(command);

  let output: unknown = stdout;
  if (action === "list") {
    output = stdout
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } else if (action === "inspect") {
    output = JSON.parse(stdout);
  }

  return jsonResponse({
    action,
    image: image || "all",
    output,
    stderr: stderr || undefined,
  });
};

export const handleDockerStats: Handler = async (args): Promise<HandlerResult> => {
  const { container } = DockerStatsSchema.parse(args);
  const command = container
    ? `docker stats ${container} --no-stream --format "{{json .}}"`
    : 'docker stats --no-stream --format "{{json .}}"';

  const { stdout } = await runDockerCommand(command);
  const stats = stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  return jsonResponse({ stats });
};

export const handleDockerNetworks: Handler = async (): Promise<HandlerResult> => {
  const { stdout } = await runDockerCommand(
    'docker network ls --format "{{json .}}"'
  );
  const networks = stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  return jsonResponse({
    networks,
    count: networks.length,
  });
};

export const handleDockerVolumes: Handler = async (): Promise<HandlerResult> => {
  const { stdout } = await runDockerCommand(
    'docker volume ls --format "{{json .}}"'
  );
  const volumes = stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  return jsonResponse({
    volumes,
    count: volumes.length,
  });
};

export const handleCleanupUnused: Handler = async (args): Promise<HandlerResult> => {
  const { target, dryRun } = CleanupUnusedSchema.parse(args);

  const results: Record<string, unknown> = {};

  if (dryRun) {
    // For dry run, just list what would be removed
    if (target === "all" || target === "images") {
      const { stdout } = await runDockerCommand('docker images -f "dangling=true" --format "{{.Repository}}:{{.Tag}} ({{.Size}})"');
      results.danglingImages = stdout.trim().split('\n').filter(Boolean);
    }
    if (target === "all" || target === "containers") {
      const { stdout } = await runDockerCommand('docker ps -a -f "status=exited" --format "{{.Names}} ({{.Status}})"');
      results.stoppedContainers = stdout.trim().split('\n').filter(Boolean);
    }
    if (target === "all" || target === "volumes") {
      const { stdout } = await runDockerCommand('docker volume ls -f "dangling=true" --format "{{.Name}}"');
      results.unusedVolumes = stdout.trim().split('\n').filter(Boolean);
    }
    if (target === "all" || target === "networks") {
      const { stdout } = await runDockerCommand('docker network ls --format "{{.Name}}"');
      const networks = stdout.trim().split('\n').filter(n => !['bridge', 'host', 'none'].includes(n));
      results.customNetworks = networks;
    }

    return jsonResponse({
      dryRun: true,
      wouldRemove: results,
    });
  }

  // Actual cleanup
  try {
    if (target === "all") {
      const { stdout } = await runDockerCommand('docker system prune -a -f --volumes');
      results.systemPrune = stdout;
    } else {
      if (target === "images") {
        const { stdout } = await runDockerCommand('docker image prune -a -f');
        results.imagesPruned = stdout;
      }
      if (target === "containers") {
        const { stdout } = await runDockerCommand('docker container prune -f');
        results.containersPruned = stdout;
      }
      if (target === "volumes") {
        const { stdout } = await runDockerCommand('docker volume prune -f');
        results.volumesPruned = stdout;
      }
      if (target === "networks") {
        const { stdout } = await runDockerCommand('docker network prune -f');
        results.networksPruned = stdout;
      }
    }

    return jsonResponse({
      success: true,
      target,
      results,
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : String(error));
  }
};

