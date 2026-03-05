---
name: health-checks
description: |
  Health check and graceful shutdown patterns. Liveness and readiness probes,
  dependency health checks, Kubernetes probes, Spring Actuator health,
  and zero-downtime shutdown.

  USE WHEN: user mentions "health check", "liveness", "readiness", "probe",
  "graceful shutdown", "SIGTERM", "health endpoint", "/healthz"

  DO NOT USE FOR: monitoring dashboards - use `error-tracking` or `opentelemetry`;
  deployment strategies - use `deployment-strategies`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Health Checks & Graceful Shutdown

## Health Check Endpoint (Express)

```typescript
app.get('/health/live', (req, res) => {
  res.json({ status: 'ok' }); // App process is running
});

app.get('/health/ready', async (req, res) => {
  const checks = await Promise.allSettled([
    checkDatabase(),
    checkRedis(),
    checkExternalApi(),
  ]);

  const results = checks.map((c, i) => ({
    name: ['database', 'redis', 'external-api'][i],
    status: c.status === 'fulfilled' ? 'up' : 'down',
    ...(c.status === 'rejected' && { error: c.reason.message }),
  }));

  const allHealthy = results.every((r) => r.status === 'up');
  res.status(allHealthy ? 200 : 503).json({ status: allHealthy ? 'ready' : 'degraded', checks: results });
});

async function checkDatabase() {
  await db.$queryRaw`SELECT 1`;
}
async function checkRedis() {
  await redis.ping();
}
```

## Graceful Shutdown (Node.js)

```typescript
const server = app.listen(3000);

async function shutdown(signal: string) {
  console.log(`${signal} received, starting graceful shutdown`);

  // 1. Stop accepting new connections
  server.close();

  // 2. Wait for in-flight requests (with timeout)
  const timeout = setTimeout(() => process.exit(1), 30000);

  try {
    // 3. Close dependencies
    await db.$disconnect();
    await redis.quit();
    await queue.close();
    clearTimeout(timeout);
    process.exit(0);
  } catch {
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
```

## Kubernetes Probes

```yaml
containers:
  - name: app
    livenessProbe:
      httpGet: { path: /health/live, port: 3000 }
      initialDelaySeconds: 10
      periodSeconds: 15
      failureThreshold: 3
    readinessProbe:
      httpGet: { path: /health/ready, port: 3000 }
      initialDelaySeconds: 5
      periodSeconds: 10
      failureThreshold: 2
    startupProbe:
      httpGet: { path: /health/live, port: 3000 }
      failureThreshold: 30
      periodSeconds: 2
    lifecycle:
      preStop:
        exec:
          command: ["sh", "-c", "sleep 5"]  # Allow LB to drain
```

## Spring Boot Actuator

```yaml
management:
  endpoints:
    web:
      exposure:
        include: health,info
  endpoint:
    health:
      show-details: when_authorized
      group:
        readiness:
          include: db,redis,diskSpace
        liveness:
          include: ping
  health:
    redis:
      enabled: true
```

## Probe Types

| Probe | Purpose | Failure Action |
|-------|---------|---------------|
| **Liveness** | Is the process alive? | Restart container |
| **Readiness** | Can it serve traffic? | Remove from load balancer |
| **Startup** | Has it finished initializing? | Don't check liveness yet |

## Anti-Patterns

| Anti-Pattern | Fix |
|--------------|-----|
| Liveness check hits database | Liveness = process alive only; readiness = dependencies |
| No graceful shutdown | Handle SIGTERM, drain connections |
| Immediate process.exit() | Wait for in-flight requests to complete |
| No startup probe | Slow-starting apps killed by liveness before ready |
| Health check returns 200 when degraded | Return 503 when dependencies are down |

## Production Checklist

- [ ] Separate liveness and readiness endpoints
- [ ] Readiness checks all critical dependencies
- [ ] Graceful shutdown handles SIGTERM
- [ ] In-flight requests drained before exit
- [ ] Kubernetes probes configured with proper thresholds
- [ ] Startup probe for slow-initializing apps
