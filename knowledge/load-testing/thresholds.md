# Performance Thresholds and Budgets

## Overview

Performance thresholds define the acceptable boundaries for response time, error rate, and throughput. They translate business SLAs and SLOs into automated pass/fail criteria for load tests. Without thresholds, load tests produce data but no actionable verdict. With thresholds, every test run produces a clear pass or fail that can gate deployments.

## Defining Performance Budgets

A performance budget is the maximum resource allocation for a given metric. Budgets should be derived from user expectations, business requirements, and SLA commitments.

### Common Budget Targets

| Metric | Budget | Rationale |
|--------|--------|-----------|
| p50 response time | < 200ms | Most users get fast responses |
| p95 response time | < 500ms | Tail latency stays reasonable |
| p99 response time | < 1000ms | Even worst-case users have acceptable experience |
| Error rate | < 0.1% | High reliability |
| Throughput | > 1000 RPS | Meets expected peak traffic |
| Time to First Byte | < 400ms | Core web vital |
| Apdex score | > 0.9 | User satisfaction metric |

### Per-Endpoint Budgets

Different endpoints have different performance expectations.

```javascript
// k6 thresholds per endpoint
export const options = {
  thresholds: {
    // Health check: very fast
    'http_req_duration{name:HealthCheck}': ['p(99)<100'],

    // Product listing: moderate
    'http_req_duration{name:ListProducts}': ['p(95)<300', 'p(99)<800'],

    // Product search: moderate with complexity tolerance
    'http_req_duration{name:SearchProducts}': ['p(95)<500', 'p(99)<1200'],

    // Order creation: slower (involves payment)
    'http_req_duration{name:CreateOrder}': ['p(95)<1000', 'p(99)<2000'],

    // Report generation: slow is acceptable
    'http_req_duration{name:GenerateReport}': ['p(95)<5000', 'p(99)<10000'],

    // Overall
    http_req_failed: ['rate<0.001'],  // 0.1% error rate
    http_reqs: ['rate>100'],          // Minimum 100 RPS
  },
};
```

## SLA/SLO Mapping to Test Thresholds

### SLA to SLO to Threshold Chain

```
SLA (Business Contract):
  "99.9% uptime, p95 < 500ms for API responses"

SLO (Internal Target):
  "99.95% uptime, p95 < 400ms" (tighter than SLA for safety margin)

Load Test Threshold:
  "p95 < 350ms, error rate < 0.05%" (even tighter, catches regressions early)
```

### Mapping Example

| SLA Commitment | SLO Target | Load Test Threshold | Margin |
|---------------|------------|---------------------|--------|
| p95 < 500ms | p95 < 400ms | p95 < 350ms | 30% buffer |
| Error rate < 1% | Error rate < 0.5% | Error rate < 0.1% | 10x buffer |
| 99.9% uptime | 99.95% uptime | 0 errors in smoke test | Binary |
| Throughput: 5000 RPM | Throughput: 6000 RPM | Throughput > 7000 RPM | 40% buffer |

### k6 Implementation

```javascript
export const options = {
  scenarios: {
    slo_validation: {
      executor: 'constant-arrival-rate',
      rate: 120,              // Match SLO expected load
      timeUnit: '1s',
      duration: '10m',
      preAllocatedVUs: 100,
      maxVUs: 500,
    },
  },
  thresholds: {
    // SLO: p95 < 400ms → threshold: p95 < 350ms
    http_req_duration: ['p(95)<350', 'p(99)<800'],

    // SLO: error rate < 0.5% → threshold: < 0.1%
    http_req_failed: ['rate<0.001'],

    // SLO: throughput > 6000 RPM → threshold: > 100 RPS
    http_reqs: ['rate>100'],

    // Custom SLO for specific operations
    'http_req_duration{name:Checkout}': ['p(95)<800'],
    'order_success_rate': ['rate>0.995'],
  },
};
```

### Artillery Implementation

```yaml
config:
  target: "https://api.example.com"
  ensure:
    p95: 350            # Fail if p95 > 350ms
    p99: 800            # Fail if p99 > 800ms
    maxErrorRate: 0.1   # Fail if error rate > 0.1%
    max: 3000           # Fail if any request > 3s
  phases:
    - duration: 600
      arrivalRate: 120
```

## Baseline Testing

Establish a performance baseline to detect regressions. Run the same test against a known-good version and record the results.

### Establishing a Baseline

```javascript
// baseline.js - run against the current production version
import http from 'k6/http';
import { check } from 'k6';

export const options = {
  scenarios: {
    baseline: {
      executor: 'constant-arrival-rate',
      rate: 50,
      timeUnit: '1s',
      duration: '5m',
      preAllocatedVUs: 50,
      maxVUs: 200,
    },
  },
};

export default function () {
  const res = http.get('https://api.example.com/products');
  check(res, { 'status 200': (r) => r.status === 200 });
}

export function handleSummary(data) {
  return {
    'baseline.json': JSON.stringify({
      timestamp: new Date().toISOString(),
      version: __ENV.APP_VERSION || 'unknown',
      metrics: {
        p50: data.metrics.http_req_duration.values['p(50)'],
        p95: data.metrics.http_req_duration.values['p(95)'],
        p99: data.metrics.http_req_duration.values['p(99)'],
        avg: data.metrics.http_req_duration.values.avg,
        errorRate: data.metrics.http_req_failed.values.rate,
        throughput: data.metrics.http_reqs.values.rate,
      },
    }, null, 2),
  };
}
```

### Comparing Against Baseline

```javascript
import { readFileSync } from 'fs';

// Load baseline from previous run
const baseline = JSON.parse(readFileSync('baseline.json', 'utf-8'));

export const options = {
  thresholds: {
    // Allow 10% degradation from baseline
    http_req_duration: [
      `p(95)<${Math.round(baseline.metrics.p95 * 1.1)}`,
      `p(99)<${Math.round(baseline.metrics.p99 * 1.1)}`,
    ],
    http_req_failed: [
      `rate<${Math.max(baseline.metrics.errorRate * 2, 0.001)}`,
    ],
  },
};
```

## Trend Analysis

Track performance metrics over time to detect gradual degradation that individual tests might miss.

### Storing Historical Data

```javascript
// k6 handleSummary for historical tracking
export function handleSummary(data) {
  const summary = {
    timestamp: new Date().toISOString(),
    commit: __ENV.GIT_COMMIT || 'unknown',
    version: __ENV.APP_VERSION || 'unknown',
    branch: __ENV.GIT_BRANCH || 'unknown',
    metrics: {
      http_req_duration: {
        avg: data.metrics.http_req_duration.values.avg,
        p50: data.metrics.http_req_duration.values['p(50)'],
        p95: data.metrics.http_req_duration.values['p(95)'],
        p99: data.metrics.http_req_duration.values['p(99)'],
        max: data.metrics.http_req_duration.values.max,
      },
      http_req_failed: {
        rate: data.metrics.http_req_failed.values.rate,
      },
      http_reqs: {
        rate: data.metrics.http_reqs.values.rate,
        count: data.metrics.http_reqs.values.count,
      },
    },
    thresholds_passed: Object.entries(data.metrics)
      .filter(([, m]) => m.thresholds)
      .every(([, m]) => Object.values(m.thresholds).every((t) => t.ok)),
  };

  return {
    [`results/perf-${Date.now()}.json`]: JSON.stringify(summary, null, 2),
    stdout: textSummary(data, { indent: '  ', enableColors: true }),
  };
}
```

### Trend Detection Script

```python
import json
import glob
import statistics

def analyze_trends(results_dir="results/"):
    files = sorted(glob.glob(f"{results_dir}/perf-*.json"))
    if len(files) < 5:
        print("Need at least 5 data points for trend analysis")
        return

    p95_values = []
    for f in files[-20:]:  # Last 20 results
        with open(f) as fh:
            data = json.load(fh)
            p95_values.append(data["metrics"]["http_req_duration"]["p95"])

    recent_avg = statistics.mean(p95_values[-5:])
    historical_avg = statistics.mean(p95_values[:-5])
    degradation = ((recent_avg - historical_avg) / historical_avg) * 100

    print(f"Historical p95 avg: {historical_avg:.1f}ms")
    print(f"Recent p95 avg: {recent_avg:.1f}ms")
    print(f"Change: {degradation:+.1f}%")

    if degradation > 15:
        print("WARNING: Significant performance degradation detected")
        return False
    elif degradation > 5:
        print("NOTICE: Mild performance degradation")

    return True
```

## Regression Detection

### CI Pipeline Gate

```yaml
# GitHub Actions
- name: Run load test
  run: k6 run --out json=results.json tests/load/regression.js
  env:
    APP_VERSION: ${{ github.sha }}

- name: Check thresholds
  run: |
    # k6 exits with code 99 if thresholds fail
    if [ $? -eq 99 ]; then
      echo "Performance regression detected!"
      exit 1
    fi

- name: Compare with baseline
  run: |
    python scripts/compare_performance.py \
      --baseline results/baseline.json \
      --current results.json \
      --max-degradation 10
```

### Automated Baseline Update

```bash
#!/bin/bash
# update-baseline.sh
# Run after a successful release to update the performance baseline

k6 run --out json=results/new-baseline.json tests/load/baseline.js

if [ $? -eq 0 ]; then
  cp results/new-baseline.json results/baseline.json
  echo "Baseline updated successfully"
  git add results/baseline.json
  git commit -m "perf: update load test baseline for $(git describe --tags)"
else
  echo "Baseline test failed, not updating"
  exit 1
fi
```

## Alerting on Threshold Violations

### Slack Notification

```javascript
// k6 handleSummary with Slack alert
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.2/index.js';

export function handleSummary(data) {
  const passed = Object.entries(data.metrics)
    .filter(([, m]) => m.thresholds)
    .every(([, m]) => Object.values(m.thresholds).every((t) => t.ok));

  if (!passed) {
    const failures = [];
    for (const [name, metric] of Object.entries(data.metrics)) {
      if (metric.thresholds) {
        for (const [threshold, result] of Object.entries(metric.thresholds)) {
          if (!result.ok) {
            failures.push(`${name}: ${threshold}`);
          }
        }
      }
    }

    // Send to Slack webhook
    const payload = JSON.stringify({
      text: `Load Test FAILED\nVersion: ${__ENV.APP_VERSION}\nFailures:\n${failures.map(f => `- ${f}`).join('\n')}`,
    });

    // Note: http.post is not available in handleSummary; use external webhook in CI
    return {
      'slack-alert.json': payload,
      stdout: textSummary(data),
    };
  }

  return { stdout: textSummary(data) };
}
```

### Grafana Alert Rules

```yaml
# Grafana alert for k6 metrics stored in InfluxDB
apiVersion: 1
groups:
  - name: load_test_alerts
    rules:
      - alert: LoadTestP95Regression
        expr: k6_http_req_duration_p95 > 500
        for: 2m
        annotations:
          summary: "p95 response time exceeds 500ms"
          description: "p95 is {{ $value }}ms, threshold is 500ms"

      - alert: LoadTestErrorRate
        expr: k6_http_req_failed_rate > 0.01
        for: 1m
        annotations:
          summary: "Error rate exceeds 1%"
```

## Threshold Configuration Patterns

### Conservative (Safety-Critical)

```javascript
export const options = {
  thresholds: {
    http_req_duration: ['p(50)<100', 'p(95)<250', 'p(99)<500', 'max<2000'],
    http_req_failed: ['rate<0.0001'],    // 0.01%
    checks: ['rate==1.0'],               // All checks must pass
  },
};
```

### Standard (Web Application)

```javascript
export const options = {
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1500'],
    http_req_failed: ['rate<0.01'],      // 1%
    checks: ['rate>0.99'],               // 99% checks pass
  },
};
```

### Relaxed (Background Processing)

```javascript
export const options = {
  thresholds: {
    http_req_duration: ['p(95)<5000', 'p(99)<10000'],
    http_req_failed: ['rate<0.05'],      // 5%
    checks: ['rate>0.95'],
  },
};
```

## Anti-Patterns

1. **Setting thresholds after seeing results** - Thresholds should come from SLOs, not from what the current system happens to produce. Define them first.
2. **Only testing average response time** - Averages hide tail latency. Always test p95 and p99.
3. **Same thresholds for all endpoints** - A health check and a report generator have different acceptable latencies.
4. **No baseline for comparison** - Without a baseline, you cannot detect regressions. Establish one before setting thresholds.
5. **Thresholds that are too tight** - Thresholds that fail on normal variance create alert fatigue. Allow reasonable margins.
6. **Never updating baselines** - As features are added, performance characteristics change. Update baselines after intentional architecture changes.
7. **Ignoring throughput** - Low latency at low throughput is meaningless. Always test at expected production load.

## Production Checklist

- [ ] Performance budgets defined per endpoint based on SLOs
- [ ] Thresholds set tighter than SLAs with appropriate margins
- [ ] Baseline established from a known-good version
- [ ] Trend analysis running across test runs to detect gradual degradation
- [ ] CI pipeline gates deployment on threshold violations
- [ ] Alerts configured for threshold failures (Slack, email, PagerDuty)
- [ ] Historical results stored for trend analysis
- [ ] p95 and p99 tested, not just average
- [ ] Error rate thresholds include HTTP errors and business logic failures
- [ ] Throughput thresholds validate the system handles expected peak load
- [ ] Baseline update process documented and scheduled after releases
- [ ] Regression detection runs on every PR (smoke test) and pre-release (full load)
