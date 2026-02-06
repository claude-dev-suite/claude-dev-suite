# Performance Timing Implementation Guide

## Overview

This document provides instructions for adding performance timing logs to all critical operations in the dashboard application.

## Utility Created

Created `server/src/utils/performance.ts` with:
- `timeOperation()` - Helper function for timing operations with slow threshold warnings
- `TIMING_THRESHOLDS` - Predefined thresholds for different operation types
- `formatBytes()`, `formatCount()` - Helper functions for logging context

## Implementation Pattern

### 1. Import the utility

```typescript
import { timeOperation, TIMING_THRESHOLDS } from '../utils/performance.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger('ServiceName');
```

### 2. Wrap critical operations

```typescript
async detectProject(projectPath: string): Promise<DetectionResult> {
  const endTimer = timeOperation(
    logger,
    'detectProject',
    TIMING_THRESHOLDS.DETECTION_FULL,
    { data: { projectPath } }
  );

  try {
    // ... existing implementation
    const result = await someOperation();
    return result;
  } finally {
    endTimer();
  }
}
```

## Files to Instrument

### 1. detection.service.ts

Add logging import:
```typescript
import { timeOperation, TIMING_THRESHOLDS, formatCount } from '../utils/performance.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger('DetectionService');
```

Methods to instrument:
- `detectProject()` - Use `TIMING_THRESHOLDS.DETECTION_FULL` (5000ms)
  - Log context: `{ data: { projectPath, dirsToCheck: count } }`
- `buildDirectoryList()` - Use `TIMING_THRESHOLDS.DIRECTORY_SCAN` (1000ms)
  - Log context: `{ data: { projectPath, foundDirs: count } }`
- `detectEnvironments()` - Use `TIMING_THRESHOLDS.DETECTION_ENV` (1000ms)
  - Log context: `{ data: { projectPath, envFilesFound: count } }`
- `detectGitRepos()` - Use `TIMING_THRESHOLDS.DETECTION_GIT` (1000ms)
  - Log context: `{ data: { projectPath, reposFound: count } }`

### 2. installation.service.ts

Add logging import:
```typescript
import { timeOperation, TIMING_THRESHOLDS, formatCount } from '../utils/performance.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger('InstallationService');
```

Methods to instrument:
- `install()` - Use `TIMING_THRESHOLDS.INSTALLATION_FULL` (10000ms)
  - Log context: `{ data: { projectPath, agentCount: agents.length, mcpCount: mcpServers.length } }`
- `prepareServers()` - Use `TIMING_THRESHOLDS.INSTALLATION_MCP` (5000ms)
  - Log context: `{ data: { serverCount: servers.length, servers: servers.join(', ') } }`
- `installAgent()` - Use `TIMING_THRESHOLDS.INSTALLATION_AGENT` (2000ms)
  - Log context: `{ data: { agentId, projectPath } }`
- `installMcpServer()` - Use `TIMING_THRESHOLDS.INSTALLATION_MCP` (5000ms)
  - Log context: `{ data: { serverName, projectPath } }`
- `copyDirSync()` - Use `TIMING_THRESHOLDS.FILE_COPY` (1000ms)
  - Log context: `{ data: { src, dest } }`

### 3. orchestrator.service.ts

Methods already have some logging, enhance with timing:
- `handleChatMessage()` - Use `TIMING_THRESHOLDS.CHAT_MESSAGE` (30000ms)
  - Log context: `{ data: { messageLength: text.length, projectPath, sessionId } }`
- `executeJob()` - Use `TIMING_THRESHOLDS.JOB_EXECUTION` (60000ms)
  - Log context: `{ data: { jobId, title, hasSubTasks: !!job.subTasks?.length, subTaskCount } }`
- `executeSubTask()` - Use `TIMING_THRESHOLDS.SUBTASK_EXECUTION` (20000ms)
  - Log context: `{ data: { jobId, subTaskIndex, agentId } }`

### 4. agents.service.ts

Add logging import:
```typescript
import { timeOperation, TIMING_THRESHOLDS, formatCount } from '../utils/performance.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger('AgentsService');
```

Methods to instrument:
- `getAgents()` - Use `TIMING_THRESHOLDS.LOAD_AGENTS` (2000ms)
  - Log context: `{ data: { forceRefresh, cached: !forceRefresh && isCacheValid } }`
  - Add result count: `{ data: { agentsLoaded: agents.length } }`
- `getMcpServers()` - Use `TIMING_THRESHOLDS.LOAD_MCP_SERVERS` (2000ms)
  - Log context: `{ data: { forceRefresh, cached: !forceRefresh && isCacheValid } }`
  - Add result count: `{ data: { serversLoaded: servers.length } }`
- `getRequiredEnvVars()` - Use `TIMING_THRESHOLDS.LOAD_ENV_VARS` (1000ms)
  - Log context: `{ data: { serverCount: serverNames.length, servers: serverNames.join(', ') } }`
  - Add result: `{ data: { envVarsFound: envVars.length } }`

### 5. git.service.ts

The service is a static object, so use inline timing:
- `getRepoStatus()` - Use `TIMING_THRESHOLDS.GIT_STATUS` (2000ms)
  - Log context: `{ data: { repoPath, projectPath } }`
- `getFileDiff()` - Use `TIMING_THRESHOLDS.GIT_DIFF` (3000ms)
  - Log context: `{ data: { repoPath, filePath, staged } }`
- `commit()` - Use `TIMING_THRESHOLDS.GIT_COMMIT` (2000ms)
  - Log context: `{ data: { repoPath, messageLength: message.length, amend } }`
- `push()` - Use `TIMING_THRESHOLDS.GIT_PUSH` (10000ms)
  - Log context: `{ data: { repoPath, remote, branch, setUpstream, force } }`
- `pull()` - Use `TIMING_THRESHOLDS.GIT_PULL` (10000ms)
  - Log context: `{ data: { repoPath, remote, branch, rebase } }`

Example for git.service.ts (static service):
```typescript
import { getLogger } from '../utils/logger.js';
import { timeOperation, TIMING_THRESHOLDS } from '../utils/performance.js';

const logger = getLogger('GitService');

export const GitService = {
  getRepoStatus(repoPath: string, projectPath: string): GitRepoStatus {
    const endTimer = timeOperation(
      logger,
      'getRepoStatus',
      TIMING_THRESHOLDS.GIT_STATUS,
      { data: { repoPath, projectPath } }
    );

    try {
      // ... existing implementation
      return result;
    } finally {
      endTimer();
    }
  },
  // ... other methods
};
```

## Timing Thresholds Summary

| Operation Type | Threshold | Warning When |
|---|---|---|
| API calls | 2000ms | > 2s |
| File operations | 500-1000ms | > 0.5-1s |
| Detection (full) | 5000ms | > 5s |
| Installation (full) | 10000ms | > 10s |
| Job execution | 60000ms | > 1min |
| Chat message | 30000ms | > 30s |
| Git operations | 2000-10000ms | > 2-10s |

## Log Output Examples

### Normal operation:
```
2026-01-11 12:00:00 [debug] [DetectionService]: Starting: detectProject
2026-01-11 12:00:02 [debug] [DetectionService]: Completed: detectProject (2100ms)
```

### Slow operation:
```
2026-01-11 12:00:00 [debug] [DetectionService]: Starting: detectProject
2026-01-11 12:00:08 [warn] [DetectionService]: Completed (SLOW): detectProject (8200ms)
  {
    "duration": 8200,
    "threshold": 5000,
    "slowBy": 3200,
    "projectPath": "/path/to/project",
    "dirsToCheck": 25
  }
```

## Implementation Steps

1. ✅ Create `server/src/utils/performance.ts` with timing utilities
2. Add timing to `detection.service.ts`
3. Add timing to `installation.service.ts`
4. Add timing to `orchestrator.service.ts`
5. Add timing to `agents.service.ts`
6. Add timing to `git.service.ts`
7. Test with slow operations to verify warnings appear
8. Run tests to ensure no regressions

## Testing

Test slow operations by:
- Running detection on a large monorepo (should trigger warnings)
- Installing many agents/MCP servers (should see timing breakdown)
- Executing complex jobs (should see per-subtask timing)
- Git operations on large repositories (should see timing for diff/log)

## Notes

- All timing is automatic - no need to manually calculate durations
- Slow warnings only appear when threshold is exceeded
- Context data is automatically included in logs
- File paths, counts, and sizes should be included in context for debugging
