// SPDX-License-Identifier: MIT
/**
 * Handler for watch_logs tool
 */

import { WatchLogsSchema, jsonResponse, type Handler, type HandlerResult } from "./types.js";
import { watchLogs, getWatchStatus, stopWatching, listActiveWatchers } from "../analyzers/watch.js";

export const handleWatchLogs: Handler = async (args): Promise<HandlerResult> => {
  const input = WatchLogsSchema.parse(args);
  const { action, filePath } = input;

  switch (action) {
    case "start": {
      if (!filePath) {
        throw new Error("filePath is required for 'start' action");
      }
      const result = await watchLogs({
        filePath,
        format: input.format,
        filter: input.filter,
        levels: input.levels as any[],
        alertPatterns: input.alertPatterns,
        alertLevels: input.alertLevels as any[],
        pollInterval: input.pollInterval,
        maxEntries: input.maxEntries,
      });
      return jsonResponse({
        message: `Started watching ${filePath}`,
        ...result,
      });
    }

    case "status": {
      if (!filePath) {
        throw new Error("filePath is required for 'status' action");
      }
      const status = await getWatchStatus(filePath);
      if (!status) {
        return jsonResponse({
          error: `No active watcher for ${filePath}`,
          activeWatchers: listActiveWatchers(),
        });
      }
      return jsonResponse(status);
    }

    case "stop": {
      if (!filePath) {
        throw new Error("filePath is required for 'stop' action");
      }
      const stopped = await stopWatching(filePath);
      return jsonResponse({
        success: stopped,
        message: stopped
          ? `Stopped watching ${filePath}`
          : `No active watcher for ${filePath}`,
        activeWatchers: listActiveWatchers(),
      });
    }

    case "list": {
      const watchers = listActiveWatchers();
      return jsonResponse({
        activeWatchers: watchers,
        count: watchers.length,
      });
    }

    default:
      throw new Error(`Unknown watch action: ${action}`);
  }
};
