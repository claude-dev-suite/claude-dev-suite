# OpenTelemetry Advanced Patterns

## Context Propagation

```typescript
import { context, propagation, trace } from '@opentelemetry/api';

// Extract context from incoming request
function extractContext(headers: Record<string, string>) {
  return propagation.extract(context.active(), headers);
}

// Inject context into outgoing request
function injectContext(headers: Record<string, string>) {
  propagation.inject(context.active(), headers);
  return headers;
}

// Express middleware
app.use((req, res, next) => {
  const ctx = extractContext(req.headers);
  context.with(ctx, () => next());
});

// Outgoing HTTP
async function callService(url: string, data: any) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  injectContext(headers);

  return fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  });
}
```

---

## Metrics API

```typescript
import { metrics } from '@opentelemetry/api';

const meter = metrics.getMeter('my-service', '1.0.0');

// Counter
const requestCounter = meter.createCounter('http_requests_total', {
  description: 'Total HTTP requests',
});

// Histogram
const requestDuration = meter.createHistogram('http_request_duration_ms', {
  description: 'HTTP request duration in milliseconds',
  unit: 'ms',
});

// UpDownCounter
const activeConnections = meter.createUpDownCounter('active_connections', {
  description: 'Number of active connections',
});

// Gauge (via observable)
const memoryUsage = meter.createObservableGauge('memory_usage_bytes', {
  description: 'Memory usage in bytes',
});

memoryUsage.addCallback((result) => {
  result.observe(process.memoryUsage().heapUsed);
});

// Usage in middleware
app.use((req, res, next) => {
  const start = Date.now();
  activeConnections.add(1);

  res.on('finish', () => {
    const duration = Date.now() - start;

    requestCounter.add(1, {
      method: req.method,
      route: req.route?.path || 'unknown',
      status: res.statusCode,
    });

    requestDuration.record(duration, {
      method: req.method,
      route: req.route?.path || 'unknown',
    });

    activeConnections.add(-1);
  });

  next();
});
```

---

## Collector Configuration

```yaml
# otel-collector-config.yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318

processors:
  batch:
    timeout: 1s
    send_batch_size: 1024

  memory_limiter:
    check_interval: 1s
    limit_mib: 1000

  resource:
    attributes:
      - key: environment
        value: production
        action: upsert

exporters:
  otlp:
    endpoint: tempo:4317
    tls:
      insecure: true

  prometheus:
    endpoint: 0.0.0.0:8889

  loki:
    endpoint: http://loki:3100/loki/api/v1/push

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [otlp]

    metrics:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [prometheus]

    logs:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [loki]
```

---

## Docker Compose Stack

```yaml
# docker-compose.yml
services:
  otel-collector:
    image: otel/opentelemetry-collector-contrib:latest
    command: ["--config=/etc/otel-collector-config.yaml"]
    volumes:
      - ./otel-collector-config.yaml:/etc/otel-collector-config.yaml
    ports:
      - "4317:4317"   # OTLP gRPC
      - "4318:4318"   # OTLP HTTP
      - "8889:8889"   # Prometheus metrics

  jaeger:
    image: jaegertracing/all-in-one:latest
    ports:
      - "16686:16686"  # UI
      - "14250:14250"  # gRPC

  prometheus:
    image: prom/prometheus:latest
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
    ports:
      - "9090:9090"

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3000:3000"
    environment:
      - GF_AUTH_ANONYMOUS_ENABLED=true
```

---

## Sampling Strategies

```typescript
import { TraceIdRatioBasedSampler, ParentBasedSampler } from '@opentelemetry/sdk-trace-base';

// Always sample (development)
const alwaysSample = { ratio: 1.0 };

// Sample 10% (production)
const ratioSampler = new TraceIdRatioBasedSampler(0.1);

// Parent-based (respect incoming trace decision)
const parentBasedSampler = new ParentBasedSampler({
  root: new TraceIdRatioBasedSampler(0.1),
});
```

---

## Semantic Conventions

```typescript
import {
  SEMATTRS_HTTP_METHOD,
  SEMATTRS_HTTP_URL,
  SEMATTRS_HTTP_STATUS_CODE,
  SEMATTRS_DB_SYSTEM,
  SEMATTRS_DB_STATEMENT,
  SEMATTRS_MESSAGING_SYSTEM,
  SEMATTRS_MESSAGING_DESTINATION,
} from '@opentelemetry/semantic-conventions';

// HTTP
span.setAttributes({
  [SEMATTRS_HTTP_METHOD]: 'GET',
  [SEMATTRS_HTTP_URL]: 'https://api.example.com/users',
  [SEMATTRS_HTTP_STATUS_CODE]: 200,
});

// Database
span.setAttributes({
  [SEMATTRS_DB_SYSTEM]: 'postgresql',
  [SEMATTRS_DB_STATEMENT]: 'SELECT * FROM users WHERE id = $1',
});

// Messaging
span.setAttributes({
  [SEMATTRS_MESSAGING_SYSTEM]: 'kafka',
  [SEMATTRS_MESSAGING_DESTINATION]: 'orders-topic',
});
```

---

## Spring Boot Integration

```java
// Manual span
@Service
public class OrderService {
    private final Tracer tracer;

    public OrderService(Tracer tracer) {
        this.tracer = tracer;
    }

    public Order processOrder(String orderId) {
        Span span = tracer.nextSpan().name("process-order").start();
        try (Tracer.SpanInScope ws = tracer.withSpan(span)) {
            span.tag("order.id", orderId);
            // ... process order
            return order;
        } catch (Exception e) {
            span.error(e);
            throw e;
        } finally {
            span.end();
        }
    }
}
```
