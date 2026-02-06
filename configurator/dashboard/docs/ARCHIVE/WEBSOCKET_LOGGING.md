# WebSocket Event Logging Implementation

Comprehensive logging has been added to both frontend and backend WebSocket components.

## Backend Logging (`server/src/websocket.ts`)

### Connection Events
- **Client connected**: Logs client ID, IP address, and correlation ID
- **Client disconnected**: Logs disconnect code, reason, and client ID
- **Connection rejected**: Logs invalid token attempts with client details
- **Connection error**: Logs error details with correlation ID

### Message Events
- **Message received**: Logs message type, size, and correlation ID
- **Message sent**: Tracked via orchestrator service broadcasts
- **Invalid message format**: Logs parse errors with details

### Performance Monitoring
- **Message processing duration**: Uses `wsLogger.time()` for timing
- **Slow operations**: Warns when message handling exceeds 1000ms
- **Correlation tracking**: Each message has a unique correlation ID

### Server Events
- **Server started**: Logs port and host on startup
- **Port in use**: Logs EADDRINUSE errors
- **Server errors**: Logs all server-level errors

## Backend Logging (`server/src/services/orchestrator.service.ts`)

### Session Events
- **Session created**: Logs when new session ID is assigned
- **Session resumed**: Logs when client provides existing session ID
- **Session completed**: Logs success, cost, turns, duration, and tokens
- **Session cancelled**: Logs cancellation with session ID
- **Session error**: Logs errors with full error details

### Chat Message Validation
- **Message received**: Logs message length, project path, session ID
- **Message rejected**: Logs validation failures (length, path, etc.)

### Job Events
- **Job submitted**: Logs job ID, title, subtask count
- **Job queued**: Logs queue position and length
- **Job started**: Logs job details and subtask information
- **Job completed**: Logs status, cost, and duration
- **Job failed**: Logs error details with correlation ID
- **Job cancelled**: Logs cancellation reason

### Performance Metrics
- **Session duration**: Tracks chat session from start to completion
- **Job duration**: Tracks total job execution time
- **Correlation IDs**: Each operation has unique tracking ID

## Frontend Logging (`src/hooks/useWebSocket.ts`)

### Connection Lifecycle
- **Connecting**: Logs URL being connected to
- **Connected**: Logs successful connection with latency measurement
- **Disconnected**: Logs code, reason, and whether disconnect was clean
- **Reconnecting**: Logs attempt number, max attempts, and delay
- **Reconnect failed**: Logs when max attempts reached
- **Manual disconnect**: Logs intentional disconnections

### Message Events
- **Message sent**: Logs type and size
- **Message received**: Logs type and size
- **Parse error**: Logs JSON parsing failures

### State Changes
- **Ready state**: Tracked via connection status
- **Token refresh**: Logged when reconnecting without token

## Log Format

All logs include:
- **Timestamp**: ISO format with milliseconds
- **Level**: error, warn, info, debug
- **Component**: WebSocket, Service, etc.
- **Correlation ID**: Unique ID for tracking related events
- **Metadata**: Relevant contextual data

### Example Log Entry (Backend)

```json
{
  "timestamp": "2026-01-11T23:15:42.123Z",
  "level": "info",
  "component": "WebSocket",
  "correlationId": "abc12345",
  "message": "Client connected",
  "data": {
    "clientId": "xyz789",
    "ip": "127.0.0.1"
  }
}
```

### Example Log Entry (Frontend)

```
[23:15:42.123] [INFO] [WebSocket]: Connected to WebSocket
{
  "latency": 45,
  "url": "ws://localhost:3457"
}
```

## Log Storage

### Backend Logs
- Location (Windows): `%APPDATA%/@dev-suite/dashboard/logs/`
- Location (Unix): `~/.dev-suite/dashboard/logs/`
- Files:
  - `combined-YYYY-MM-DD.log` - All events
  - `error-YYYY-MM-DD.log` - Errors only
  - Rotation: Daily, max 14 days, max 20MB per file

### Frontend Logs
- Sent to backend via `/api/log/batch` endpoint
- Batched every 500ms or on queue full (50 entries)
- Also logged to browser console for development

## Performance Considerations

### Backend
- Async logging to avoid blocking WebSocket operations
- File rotation to prevent disk space issues
- Sensitive data redaction (tokens, passwords, etc.)

### Frontend
- Batched log transmission to reduce network overhead
- `sendBeacon` API for reliable page unload logging
- Conditional debug logging based on environment

## Usage Examples

### Backend - Timing Operations
```typescript
const endTimer = wsLogger.time('Message processing', { correlationId });
// ... perform operation ...
endTimer(); // Logs duration automatically
```

### Backend - Context Logging
```typescript
wsLogger.info('Job started', {
  correlationId,
  data: {
    jobId: job.id,
    title: job.title,
    hasSubTasks: !!job.subTasks?.length,
  },
});
```

### Frontend - Error Logging
```typescript
logger.error('WebSocket error', {
  type: event.type,
  code: event.code,
});
```

### Frontend - Performance Tracking
```typescript
const connectStartTime = Date.now();
// ... connect ...
const latency = Date.now() - connectStartTime;
logger.info('Connected', { latency });
```

## Benefits

1. **Debugging**: Full trace of WebSocket lifecycle and message flow
2. **Performance Monitoring**: Identify slow operations and bottlenecks
3. **Error Tracking**: Detailed error context for troubleshooting
4. **Audit Trail**: Complete history of connections and operations
5. **Correlation**: Track related events across frontend/backend
6. **Security**: Log authentication failures and suspicious activity

## Future Enhancements

- [ ] Add metrics aggregation (connection count, message rate, etc.)
- [ ] Implement structured query interface for logs
- [ ] Add real-time log streaming to dashboard
- [ ] Create alerting for error patterns
- [ ] Add log retention policies
- [ ] Implement log compression for long-term storage
