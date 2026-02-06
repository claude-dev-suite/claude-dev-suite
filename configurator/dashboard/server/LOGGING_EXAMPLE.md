# Request/Response Logging - Example Output

This document shows real examples of the logging middleware in action.

## Example 1: Successful Request

### Request
```bash
curl -X GET http://localhost:3456/api/health
```

### Console Output
```
2026-01-10 12:34:56 [http] [API] [a1b2c3d4]: → GET /api/health
  {
    "method": "GET",
    "url": "/api/health",
    "headers": {
      "user-agent": "curl/7.81.0",
      "accept": "*/*"
    },
    "ip": "127.0.0.1"
  }
2026-01-10 12:34:56 [http] [API] [a1b2c3d4]: ← 200 GET /api/health (12ms)
  {
    "method": "GET",
    "url": "/api/health",
    "statusCode": 200,
    "responseTime": 12,
    "contentLength": "45"
  }
```

### File Output (combined-2026-01-10.log)
```json
{
  "timestamp": "2026-01-10T12:34:56.123Z",
  "level": "http",
  "component": "API",
  "correlationId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "message": "→ GET /api/health",
  "data": {
    "method": "GET",
    "url": "/api/health",
    "headers": {
      "user-agent": "curl/7.81.0",
      "accept": "*/*"
    },
    "ip": "127.0.0.1"
  }
}
{
  "timestamp": "2026-01-10T12:34:56.135Z",
  "level": "http",
  "component": "API",
  "correlationId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "message": "← 200 GET /api/health",
  "data": {
    "method": "GET",
    "url": "/api/health",
    "statusCode": 200,
    "responseTime": 12,
    "contentLength": "45"
  },
  "duration": 12
}
```

## Example 2: POST Request with Sensitive Data

### Request
```bash
curl -X POST http://localhost:3456/api/install \
  -H "Content-Type: application/json" \
  -d '{
    "projectPath": "/home/user/project",
    "agents": ["react-expert", "typescript-expert"],
    "password": "super-secret-123",
    "apiKey": "sk_live_abc123xyz"
  }'
```

### Console Output (Notice password and apiKey are redacted)
```
2026-01-10 12:35:00 [http] [API] [b2c3d4e5]: → POST /api/install
  {
    "method": "POST",
    "url": "/api/install",
    "body": {
      "projectPath": "/home/user/project",
      "agents": ["react-expert", "typescript-expert"],
      "password": "[REDACTED]",
      "apiKey": "[REDACTED]"
    },
    "headers": {
      "content-type": "application/json",
      "content-length": "156"
    },
    "ip": "127.0.0.1"
  }
2026-01-10 12:35:01 [http] [API] [b2c3d4e5]: ← 200 POST /api/install (843ms)
  {
    "method": "POST",
    "url": "/api/install",
    "statusCode": 200,
    "responseTime": 843,
    "contentLength": "234"
  }
```

## Example 3: Slow Request (> 1000ms)

### Console Output
```
2026-01-10 12:36:00 [http] [API] [c3d4e5f6]: → POST /api/detection
  {
    "method": "POST",
    "url": "/api/detection",
    "body": {
      "projectPath": "/very/large/project"
    },
    "ip": "127.0.0.1"
  }
2026-01-10 12:36:02 [warn] [API] [c3d4e5f6]: ← 200 POST /api/detection (1543ms) [SLOW]
  {
    "method": "POST",
    "url": "/api/detection",
    "statusCode": 200,
    "responseTime": 1543,
    "contentLength": "5678"
  }
```

Note: Log level changes from `http` to `warn` for slow requests.

## Example 4: Client Error (4xx)

### Request
```bash
curl -X GET http://localhost:3456/api/unknown-endpoint
```

### Console Output
```
2026-01-10 12:37:00 [http] [API] [d4e5f6g7]: → GET /api/unknown-endpoint
  {
    "method": "GET",
    "url": "/api/unknown-endpoint",
    "ip": "127.0.0.1"
  }
2026-01-10 12:37:00 [warn] [API] [d4e5f6g7]: ← 404 GET /api/unknown-endpoint (3ms)
  {
    "method": "GET",
    "url": "/api/unknown-endpoint",
    "statusCode": 404,
    "responseTime": 3
  }
```

## Example 5: Server Error (5xx)

### Console Output
```
2026-01-10 12:38:00 [http] [API] [e5f6g7h8]: → POST /api/detection
  {
    "method": "POST",
    "url": "/api/detection",
    "body": {
      "projectPath": "/invalid/path"
    },
    "ip": "127.0.0.1"
  }
2026-01-10 12:38:00 [error] [API] [e5f6g7h8]: ✖ 500 POST /api/detection - ENOENT: no such file or directory
  {
    "correlationId": "e5f6g7h8-i9j0-k1l2-m3n4-o5p6q7r8s9t0",
    "data": {
      "method": "POST",
      "url": "/api/detection",
      "statusCode": 500,
      "errorName": "Error",
      "errorMessage": "ENOENT: no such file or directory",
      "body": {
        "projectPath": "/invalid/path"
      }
    },
    "error": {
      "name": "Error",
      "message": "ENOENT: no such file or directory",
      "stack": "Error: ENOENT: no such file or directory\n    at Object.openSync (fs.js:476:3)\n    at ..."
    }
  }
```

### Error File Output (error-2026-01-10.log)
```json
{
  "timestamp": "2026-01-10T12:38:00.456Z",
  "level": "error",
  "component": "API",
  "correlationId": "e5f6g7h8-i9j0-k1l2-m3n4-o5p6q7r8s9t0",
  "message": "✖ 500 POST /api/detection - ENOENT: no such file or directory",
  "data": {
    "method": "POST",
    "url": "/api/detection",
    "statusCode": 500,
    "errorName": "Error",
    "errorMessage": "ENOENT: no such file or directory",
    "body": {
      "projectPath": "/invalid/path"
    }
  },
  "error": {
    "name": "Error",
    "message": "ENOENT: no such file or directory",
    "stack": "Error: ENOENT: no such file or directory\n    at Object.openSync (fs.js:476:3)\n    at ..."
  }
}
```

## Example 6: Request with Authorization Header

### Request
```bash
curl -X POST http://localhost:3456/api/install \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "X-API-Key: sk_live_abc123" \
  -d '{"projectPath": "/path"}'
```

### Console Output (Headers are redacted)
```
2026-01-10 12:39:00 [http] [API] [f6g7h8i9]: → POST /api/install
  {
    "method": "POST",
    "url": "/api/install",
    "body": {
      "projectPath": "/path"
    },
    "headers": {
      "content-type": "application/json",
      "authorization": "[REDACTED]",
      "x-api-key": "[REDACTED]"
    },
    "ip": "127.0.0.1"
  }
```

## Example 7: Correlation ID Tracking Across Services

### Client Request with Correlation ID
```bash
curl -X GET http://localhost:3456/api/detection \
  -H "X-Correlation-ID: my-custom-correlation-id"
```

### Console Output (Uses provided correlation ID)
```
2026-01-10 12:40:00 [http] [API] [my-custom]: → GET /api/detection
2026-01-10 12:40:00 [http] [API] [my-custom]: ← 200 GET /api/detection (145ms)
```

The correlation ID is preserved and can be used to trace requests across distributed systems.

## Example 8: Query Parameters

### Request
```bash
curl -X GET "http://localhost:3456/api/agents?category=frontend&installed=true"
```

### Console Output
```
2026-01-10 12:41:00 [http] [API] [g7h8i9j0]: → GET /api/agents
  {
    "method": "GET",
    "url": "/api/agents",
    "query": {
      "category": "frontend",
      "installed": "true"
    },
    "ip": "127.0.0.1"
  }
```

## Log File Locations

### Windows
```
C:\Users\username\AppData\Roaming\@dev-suite\dashboard\logs\
├── combined-2026-01-10.log
├── error-2026-01-10.log
├── exceptions-2026-01-10.log
└── rejections-2026-01-10.log
```

### Unix (Linux/macOS)
```
~/.dev-suite/dashboard/logs/
├── combined-2026-01-10.log
├── error-2026-01-10.log
├── exceptions-2026-01-10.log
└── rejections-2026-01-10.log
```

## Viewing Logs in Real-Time

### Tail Combined Log
```bash
# Windows (PowerShell)
Get-Content "$env:APPDATA\@dev-suite\dashboard\logs\combined-2026-01-10.log" -Wait -Tail 50

# Unix
tail -f ~/.dev-suite/dashboard/logs/combined-2026-01-10.log
```

### Filter Errors Only
```bash
# Unix
grep '"level":"error"' ~/.dev-suite/dashboard/logs/combined-2026-01-10.log | jq .

# Windows (PowerShell with jq)
Get-Content "$env:APPDATA\@dev-suite\dashboard\logs\combined-2026-01-10.log" | Select-String '"level":"error"' | ConvertFrom-Json
```

### Search by Correlation ID
```bash
# Unix
grep 'a1b2c3d4' ~/.dev-suite/dashboard/logs/combined-2026-01-10.log | jq .

# Windows (PowerShell)
Get-Content "$env:APPDATA\@dev-suite\dashboard\logs\combined-2026-01-10.log" | Select-String 'a1b2c3d4' | ConvertFrom-Json
```

## Integration with Monitoring Tools

The JSON log format is compatible with:
- **Elasticsearch/Kibana** - Index logs for visualization
- **Grafana Loki** - Query and aggregate logs
- **CloudWatch** - Ship logs to AWS
- **Datadog** - Monitor application performance
- **Splunk** - Enterprise log aggregation

Example log shipping with Filebeat:
```yaml
filebeat.inputs:
- type: log
  enabled: true
  paths:
    - ~/.dev-suite/dashboard/logs/combined-*.log
  json.keys_under_root: true
  json.add_error_key: true
```
