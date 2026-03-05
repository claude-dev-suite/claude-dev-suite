---
name: error-tracking
description: |
  Error tracking and monitoring integration. Sentry, Datadog RUM, Bugsnag.
  Source maps, breadcrumbs, release tracking, performance monitoring,
  and alerting configuration.

  USE WHEN: user mentions "Sentry", "error tracking", "Bugsnag", "Datadog RUM",
  "crash reporting", "source maps", "release tracking", "error monitoring"

  DO NOT USE FOR: application logging - use logging skills;
  APM/tracing - use `opentelemetry`; structured error responses - use `error-handling`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Error Tracking

## Sentry (Node.js / Express)

```typescript
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  release: process.env.APP_VERSION,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  integrations: [Sentry.expressIntegration()],
});

// Must be first middleware
app.use(Sentry.expressErrorHandler());

// Add context
app.use((req, res, next) => {
  Sentry.setUser({ id: req.user?.id, email: req.user?.email });
  Sentry.setTag('tenant', req.tenantId);
  next();
});

// Manual capture
try {
  await riskyOperation();
} catch (error) {
  Sentry.captureException(error, {
    extra: { orderId, userId },
    tags: { component: 'payment' },
  });
}
```

## Sentry (React)

```tsx
import * as Sentry from '@sentry/react';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  integrations: [Sentry.browserTracingIntegration(), Sentry.replayIntegration()],
  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
});

// Error boundary
const SentryErrorBoundary = Sentry.withErrorBoundary(App, {
  fallback: <ErrorPage />,
  showDialog: true,
});

// Component-level
const ProfilePage = Sentry.withProfiler(Profile);
```

## Sentry (Python)

```python
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration

sentry_sdk.init(
    dsn=os.environ["SENTRY_DSN"],
    environment=os.environ.get("ENV", "development"),
    traces_sample_rate=0.1,
    integrations=[FastApiIntegration()],
)
```

## Sentry (Spring Boot)

```xml
<dependency>
  <groupId>io.sentry</groupId>
  <artifactId>sentry-spring-boot-starter-jakarta</artifactId>
</dependency>
```
```yaml
sentry:
  dsn: ${SENTRY_DSN}
  environment: ${SPRING_PROFILES_ACTIVE}
  traces-sample-rate: 0.1
```

## Source Maps Upload (CI/CD)

```yaml
# GitHub Actions
- name: Upload source maps to Sentry
  run: |
    npx @sentry/cli sourcemaps upload \
      --release=${{ github.sha }} \
      --org=my-org --project=my-app \
      ./dist
  env:
    SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}
```

## Breadcrumbs

```typescript
Sentry.addBreadcrumb({
  category: 'payment',
  message: `Processing payment for order ${orderId}`,
  level: 'info',
  data: { orderId, amount },
});
```

## Anti-Patterns

| Anti-Pattern | Fix |
|--------------|-----|
| 100% trace sample rate in production | Use 0.1-0.2 for production |
| No source maps uploaded | Upload in CI/CD for readable stack traces |
| No release tracking | Set `release` to git SHA or version |
| Capturing expected errors | Only capture unexpected errors |
| No user context | Set user ID/email for debugging |
| PII in error data | Scrub sensitive fields in `beforeSend` |

## Production Checklist

- [ ] DSN configured per environment
- [ ] Source maps uploaded in CI/CD
- [ ] Release version set to git SHA
- [ ] Sample rate tuned (0.1-0.2 for production)
- [ ] User context attached
- [ ] Alert rules configured for error spikes
- [ ] PII scrubbing enabled
