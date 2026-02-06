---
name: opentelemetry
description: |
  OpenTelemetry - vendor-neutral observability framework for distributed systems.
  Provides traces, metrics, and logs with standardized instrumentation and exporters.

  USE WHEN: user mentions "opentelemetry", "otel", "distributed tracing", "observability",
  asks about "how to trace microservices", "opentelemetry setup", "jaeger integration", "prometheus metrics"

  DO NOT USE FOR: Application logging only - use logging skills instead, APM vendor-specific - use vendor docs,
  Simple monitoring - Prometheus/Grafana may be sufficient
allowed-tools: Read, Grep, Glob, Write, Edit
---
# OpenTelemetry - Quick Reference

> **Full Reference**: See [advanced.md](advanced.md) for context propagation, detailed metrics API, Collector configuration, Docker Compose stack, sampling strategies, and semantic conventions.

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `opentelemetry` for comprehensive documentation.

## Concepts

```
┌─────────────────────────────────────────────────────────────┐
│                      OpenTelemetry                          │
├─────────────────┬─────────────────┬─────────────────────────┤
│     Traces      │     Metrics     │         Logs            │
│  (Distributed)  │  (Aggregated)   │     (Structured)        │
├─────────────────┴─────────────────┴─────────────────────────┤
│                    OTLP Protocol                            │
├─────────────────────────────────────────────────────────────┤
│                 Collector (optional)                        │
├─────────────────────────────────────────────────────────────┤
│  Jaeger │ Zipkin │ Prometheus │ Grafana │ DataDog │ etc.    │
└─────────────────────────────────────────────────────────────┘
```

## Node.js Setup

```bash
npm install @opentelemetry/sdk-node \
  @opentelemetry/auto-instrumentations-node \
  @opentelemetry/exporter-trace-otlp-http
```

### Basic Configuration

```typescript
// tracing.ts - Load FIRST before any other imports
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { SEMRESATTRS_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

const sdk = new NodeSDK({
  resource: new Resource({
    [SEMRESATTRS_SERVICE_NAME]: 'my-service',
  }),
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces',
  }),
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();

process.on('SIGTERM', () => {
  sdk.shutdown().finally(() => process.exit(0));
});
```

### Application Entry Point

```typescript
// index.ts
import './tracing'; // MUST be first import
import express from 'express';

const app = express();
```

## Manual Traces

```typescript
import { trace, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('my-service', '1.0.0');

async function processOrder(orderId: string) {
  return tracer.startActiveSpan('process-order', async (span) => {
    try {
      span.setAttribute('order.id', orderId);
      await processOrderLogic(orderId);
      span.setStatus({ code: SpanStatusCode.OK });
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      span.recordException(error);
      throw error;
    } finally {
      span.end();
    }
  });
}
```

## Spring Boot Setup

```xml
<dependency>
    <groupId>io.micrometer</groupId>
    <artifactId>micrometer-tracing-bridge-otel</artifactId>
</dependency>
<dependency>
    <groupId>io.opentelemetry</groupId>
    <artifactId>opentelemetry-exporter-otlp</artifactId>
</dependency>
```

```yaml
management:
  tracing:
    sampling:
      probability: 1.0
  otlp:
    tracing:
      endpoint: http://localhost:4318/v1/traces
```

## Environment Variables

```bash
OTEL_SERVICE_NAME=my-service
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
OTEL_TRACES_SAMPLER=parentbased_traceidratio
OTEL_TRACES_SAMPLER_ARG=0.1  # 10% sampling
```

## When NOT to Use This Skill

- **Simple application logging**: Use logging frameworks instead
- **Monolithic applications**: May be overkill
- **Vendor-specific APM**: DataDog, New Relic have their own SDKs
- **Development/debugging only**: Standard logging may suffice
- **Legacy systems**: Migration effort may be high

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Solution |
|--------------|--------------|----------|
| Creating spans for every function | Massive overhead | Span only meaningful operations |
| 100% sampling in production | Performance impact, cost | Use 1-10% sampling |
| Not propagating context | Breaks distributed traces | Inject/extract at service boundaries |
| Logging PII in span attributes | Security/compliance violation | Filter sensitive data |
| Forgetting to end spans | Memory leak | Always end spans in finally block |
| Synchronous exporters | Blocks application | Use batch processors |

## Quick Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| Traces not appearing | Exporter not configured | Check OTEL_EXPORTER_OTLP_ENDPOINT |
| High memory usage | Too many spans | Enable sampling |
| Missing context propagation | Not injecting headers | Use propagation API |
| Performance degradation | High sampling rate | Reduce to 1-10% |
| SDK initialization error | Import order wrong | Initialize SDK before other imports |

## Monitoring Metrics

| Metric | Target |
|--------|--------|
| Trace latency (p99) | < 10ms overhead |
| Span drop rate | < 1% |
| Collector memory | < 1GB |
| Export success rate | > 99% |

## Checklist

- [ ] SDK initialized before other imports
- [ ] Resource attributes configured
- [ ] Context propagation implemented
- [ ] Sampling strategy defined
- [ ] Graceful shutdown configured
- [ ] Collector deployed
- [ ] Dashboards created (Grafana)
- [ ] Alerts configured

## Reference

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `opentelemetry` for comprehensive documentation

- [OpenTelemetry Docs](https://opentelemetry.io/docs/)
