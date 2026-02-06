# Performance Timing - Quick Reference

## Add Timing to Any Method in 3 Steps

### Step 1: Add timer at method start
```typescript
const endTimer = timeOperation(
  logger,
  'methodName',
  TIMING_THRESHOLDS.CATEGORY,
  { data: { contextInfo } }
);
```

### Step 2: Do your work
```typescript
const result = await yourOperation();
```

### Step 3: Call endTimer before return
```typescript
endTimer();
return result;
```

## Complete Example

```typescript
async detectProject(projectPath: string): Promise<DetectionResult> {
  const endTimer = timeOperation(
    logger,
    'detectProject',
    TIMING_THRESHOLDS.DETECTION_FULL,
    { data: { projectPath } }
  );

  const result = await scanProject(projectPath);

  endTimer();
  return result;
}
```

## Common Thresholds

| Operation | Threshold Constant | Value |
|-----------|-------------------|-------|
| Project detection | `TIMING_THRESHOLDS.DETECTION_FULL` | 5000ms |
| Environment detection | `TIMING_THRESHOLDS.DETECTION_ENV` | 1000ms |
| Git detection | `TIMING_THRESHOLDS.DETECTION_GIT` | 1000ms |
| Full installation | `TIMING_THRESHOLDS.INSTALLATION_FULL` | 10000ms |
| Agent install | `TIMING_THRESHOLDS.INSTALLATION_AGENT` | 2000ms |
| MCP install | `TIMING_THRESHOLDS.INSTALLATION_MCP` | 5000ms |
| Load agents | `TIMING_THRESHOLDS.LOAD_AGENTS` | 2000ms |
| Load MCP servers | `TIMING_THRESHOLDS.LOAD_MCP_SERVERS` | 2000ms |
| Git status | `TIMING_THRESHOLDS.GIT_STATUS` | 2000ms |
| Git diff | `TIMING_THRESHOLDS.GIT_DIFF` | 3000ms |
| Git commit | `TIMING_THRESHOLDS.GIT_COMMIT` | 2000ms |
| Git push/pull | `TIMING_THRESHOLDS.GIT_PUSH/PULL` | 10000ms |
| Job execution | `TIMING_THRESHOLDS.JOB_EXECUTION` | 60000ms |
| Chat message | `TIMING_THRESHOLDS.CHAT_MESSAGE` | 30000ms |

## Multiple Returns

```typescript
async method() {
  const endTimer = timeOperation(...);

  if (earlyCondition) {
    endTimer();
    return earlyResult;
  }

  const result = await work();
  endTimer();
  return result;
}
```

## Try/Finally Pattern

```typescript
async method() {
  const endTimer = timeOperation(...);

  try {
    return await dangerousWork();
  } finally {
    endTimer();  // Always called, even on error
  }
}
```

## Cache Handling

```typescript
async getData(useCache = true) {
  if (useCache && this.isCacheValid()) {
    const endTimer = timeOperation(
      logger,
      'getData',
      TIMING_THRESHOLDS.OPERATION,
      { data: { fromCache: true } }
    );
    endTimer();
    return this.cache;
  }

  const endTimer = timeOperation(
    logger,
    'getData',
    TIMING_THRESHOLDS.OPERATION,
    { data: { fromCache: false } }
  );

  const data = await loadData();
  this.cache = data;

  endTimer();
  return data;
}
```

## Rich Context Examples

```typescript
// Simple context
{ data: { projectPath } }

// Multiple values
{ data: { projectPath, agentCount: 15, mcpCount: 6 } }

// With counts and lists
{ data: { serverCount: servers.length, servers: servers.join(', ') } }

// Cache status
{ data: { forceRefresh, fromCache: !forceRefresh } }

// Git operations
{ data: { repoPath, filePath, staged: true } }
```

## What Gets Logged

### Normal Operation
```
[debug] Starting: methodName
[debug] Completed: methodName (duration: 1200ms)
```

### Slow Operation
```
[debug] Starting: methodName
[warn] Completed (SLOW): methodName (duration: 8200ms, threshold: 5000ms, slowBy: 3200ms)
```

## Files to Import From

```typescript
import { timeOperation, TIMING_THRESHOLDS } from '../utils/performance.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger('ServiceName');
```

## All Available Thresholds

See `server/src/utils/performance.ts` for the complete list:

- `API_CALL`
- `FILE_READ`, `FILE_WRITE`, `FILE_COPY`, `DIRECTORY_SCAN`
- `DETECTION_FULL`, `DETECTION_FRAMEWORK`, `DETECTION_DATABASE`, `DETECTION_GIT`, `DETECTION_ENV`
- `INSTALLATION_FULL`, `INSTALLATION_AGENT`, `INSTALLATION_MCP`, `INSTALLATION_NPM`
- `JOB_EXECUTION`, `CHAT_MESSAGE`, `SUBTASK_EXECUTION`
- `LOAD_AGENTS`, `LOAD_MCP_SERVERS`, `LOAD_ENV_VARS`
- `GIT_STATUS`, `GIT_DIFF`, `GIT_COMMIT`, `GIT_PUSH`, `GIT_PULL`

## Common Mistakes

❌ **DON'T** call endTimer multiple times
```typescript
endTimer();
// ... more code ...
endTimer();  // ERROR: Already called!
```

❌ **DON'T** forget to call endTimer
```typescript
const endTimer = timeOperation(...);
return result;  // ERROR: endTimer never called!
```

❌ **DON'T** use wrong threshold
```typescript
timeOperation(logger, 'gitPush', TIMING_THRESHOLDS.FILE_READ, ...);
// ERROR: FILE_READ threshold too low for git push
```

✅ **DO** call endTimer exactly once before each return
```typescript
const endTimer = timeOperation(...);
// ... work ...
endTimer();
return result;  // CORRECT
```

✅ **DO** use try/finally for error-prone code
```typescript
const endTimer = timeOperation(...);
try {
  return await riskyOperation();
} finally {
  endTimer();  // CORRECT: Always called
}
```

✅ **DO** include relevant context
```typescript
timeOperation(logger, 'install', TIMING_THRESHOLDS.INSTALLATION_FULL, {
  data: { projectPath, agentCount, mcpCount }  // CORRECT: Rich context
});
```

## Testing Your Timing

1. **Add timing to method**
2. **Run the operation**
3. **Check logs** for:
   - "Starting: operationName" (debug)
   - "Completed: operationName (XXXms)" (debug or warn)
4. **Verify context data** appears in log output
5. **Test slow operation** to verify warning appears

## Need Help?

- Full docs: `PERFORMANCE_TIMING_COMPLETE.md`
- Implementation guide: `ADD_TIMING_INSTRUCTIONS.md`
- Detailed spec: `PERFORMANCE_TIMING_SUMMARY.md`
- Utility code: `server/src/utils/performance.ts`
