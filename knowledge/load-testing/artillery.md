# Artillery Load Testing

## Overview

Artillery is a Node.js-based load testing toolkit designed for testing HTTP APIs, WebSocket servers, and Socket.IO applications. Test scenarios are defined in YAML with optional custom JavaScript functions for complex logic. Artillery emphasizes ease of use, declarative configuration, and integration with modern observability stacks.

## Setup

```bash
# Install globally
npm install -g artillery

# Install as project dependency (recommended for CI)
npm install --save-dev artillery

# Verify installation
npx artillery version

# Quick test (10 VUs, 10 requests each)
npx artillery quick --count 10 -n 10 https://api.example.com/health
```

## Test Scenario Structure

```yaml
# load-test.yml
config:
  target: "https://api.example.com"
  phases:
    - duration: 60        # 1 minute
      arrivalRate: 5      # 5 new users per second
      name: "Warm up"
    - duration: 120       # 2 minutes
      arrivalRate: 20     # 20 new users per second
      name: "Sustained load"
    - duration: 60        # 1 minute
      arrivalRate: 50     # 50 new users per second
      name: "Peak load"
  defaults:
    headers:
      Content-Type: "application/json"
      Accept: "application/json"
  variables:
    baseProductId: "prod-001"

scenarios:
  - name: "Browse and purchase"
    weight: 70            # 70% of traffic
    flow:
      - get:
          url: "/products"
          capture:
            - json: "$.products[0].id"
              as: "productId"
      - think: 2
      - get:
          url: "/products/{{ productId }}"
      - think: 1
      - post:
          url: "/cart"
          json:
            productId: "{{ productId }}"
            quantity: 1

  - name: "Search only"
    weight: 30            # 30% of traffic
    flow:
      - get:
          url: "/search?q=widget"
      - think: 3
      - get:
          url: "/search?q=gadget"
```

## Phases

### Constant Arrival Rate

```yaml
config:
  phases:
    - duration: 300       # 5 minutes
      arrivalRate: 25     # 25 new virtual users per second
```

### Ramp Up

```yaml
config:
  phases:
    - duration: 120
      arrivalRate: 1
      rampTo: 50          # Ramp from 1 to 50 users/sec over 2 minutes
      name: "Ramp up"
    - duration: 300
      arrivalRate: 50     # Hold at 50
      name: "Sustained"
```

### Pause Between Phases

```yaml
config:
  phases:
    - duration: 120
      arrivalRate: 20
      name: "Load phase 1"
    - duration: 30
      arrivalRate: 0      # Pause
      name: "Cool down"
    - duration: 120
      arrivalRate: 40
      name: "Load phase 2"
```

### Fixed Number of Users

```yaml
config:
  phases:
    - duration: 60
      arrivalCount: 100   # Exactly 100 users over 60 seconds
```

## HTTP Engine

### Request Types

```yaml
scenarios:
  - flow:
      # GET with query parameters
      - get:
          url: "/products"
          qs:
            category: "electronics"
            page: 1
            limit: 20

      # POST with JSON body
      - post:
          url: "/orders"
          json:
            productId: "{{ productId }}"
            quantity: 2
            shippingAddress:
              street: "123 Main St"
              city: "Springfield"

      # PUT
      - put:
          url: "/products/{{ productId }}"
          json:
            price: 29.99

      # DELETE
      - delete:
          url: "/products/{{ productId }}"

      # With custom headers
      - get:
          url: "/admin/dashboard"
          headers:
            Authorization: "Bearer {{ authToken }}"
            X-Request-ID: "{{ $uuid }}"
```

### Capturing Response Data

```yaml
scenarios:
  - flow:
      - post:
          url: "/auth/login"
          json:
            username: "testuser"
            password: "password123"
          capture:
            - json: "$.token"
              as: "authToken"
            - json: "$.user.id"
              as: "userId"
            - header: "x-request-id"
              as: "requestId"

      - get:
          url: "/users/{{ userId }}/profile"
          headers:
            Authorization: "Bearer {{ authToken }}"
```

### Cookies and Sessions

```yaml
config:
  http:
    cookieJar: true       # Automatically manage cookies across requests

scenarios:
  - flow:
      - post:
          url: "/auth/login"
          json:
            username: "user"
            password: "pass"
      # Session cookie is automatically sent in subsequent requests
      - get:
          url: "/dashboard"
```

## Socket.IO Engine

```yaml
config:
  target: "https://realtime.example.com"
  engines:
    socketio-v3: {}       # Use Socket.IO v3+ engine
  phases:
    - duration: 120
      arrivalRate: 10

scenarios:
  - engine: socketio-v3
    flow:
      - emit:
          channel: "join"
          data:
            room: "lobby"
      - think: 2
      - emit:
          channel: "message"
          data:
            text: "Hello from load test"
      - think: 1
      - emit:
          channel: "message"
          data:
            text: "Another message"
      - think: 5
```

## Custom Functions

Create a JavaScript processor file for complex logic.

```javascript
// functions.js
module.exports = {
  generateRandomProduct,
  logResponse,
  authenticateUser,
  validateResponse,
};

function generateRandomProduct(userContext, events, done) {
  const categories = ['electronics', 'clothing', 'books', 'home'];
  userContext.vars.category = categories[Math.floor(Math.random() * categories.length)];
  userContext.vars.quantity = Math.floor(Math.random() * 5) + 1;
  userContext.vars.requestId = `req-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  return done();
}

function logResponse(requestParams, response, context, ee, done) {
  if (response.statusCode >= 400) {
    console.error(`Error ${response.statusCode}: ${response.body}`);
  }
  return done();
}

function authenticateUser(userContext, events, done) {
  const fetch = require('node-fetch');
  fetch('https://api.example.com/auth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.CLIENT_ID,
      client_secret: process.env.CLIENT_SECRET,
    }),
  })
    .then((res) => res.json())
    .then((data) => {
      userContext.vars.authToken = data.access_token;
      return done();
    })
    .catch(done);
}

function validateResponse(requestParams, response, context, ee, done) {
  const body = JSON.parse(response.body);
  if (!body.id || !body.status) {
    ee.emit('counter', 'validation_errors', 1);
  }
  return done();
}
```

```yaml
config:
  target: "https://api.example.com"
  processor: "./functions.js"
  phases:
    - duration: 120
      arrivalRate: 10

scenarios:
  - flow:
      - function: "authenticateUser"
      - function: "generateRandomProduct"
      - post:
          url: "/products"
          headers:
            Authorization: "Bearer {{ authToken }}"
            X-Request-ID: "{{ requestId }}"
          json:
            category: "{{ category }}"
            quantity: "{{ quantity }}"
          afterResponse: "validateResponse"
```

## Expectations and Assertions

```yaml
config:
  target: "https://api.example.com"
  ensure:
    p95: 500              # p95 response time < 500ms
    maxErrorRate: 1       # Max 1% error rate
  phases:
    - duration: 120
      arrivalRate: 20

scenarios:
  - flow:
      - get:
          url: "/products"
          expect:
            - statusCode: 200
            - contentType: json
            - hasProperty: products
            - hasHeader: x-request-id
      - post:
          url: "/orders"
          json:
            productId: "123"
          expect:
            - statusCode:
                - 200
                - 201
            - hasProperty: orderId
```

## Reporting

### Console Report (Default)

```bash
npx artillery run load-test.yml
```

### JSON Report

```bash
npx artillery run --output report.json load-test.yml

# Generate HTML from JSON
npx artillery report report.json --output report.html
```

### Environment Variables

```bash
# Pass config values via environment
TARGET_URL=https://staging.example.com \
AUTH_TOKEN=abc123 \
npx artillery run load-test.yml
```

```yaml
config:
  target: "{{ $processEnvironment.TARGET_URL }}"
  defaults:
    headers:
      Authorization: "Bearer {{ $processEnvironment.AUTH_TOKEN }}"
```

## Data-Driven Testing

### CSV Payload File

```csv
username,password,userId
alice,password1,user-001
bob,password2,user-002
charlie,password3,user-003
```

```yaml
config:
  target: "https://api.example.com"
  payload:
    path: "./test-users.csv"
    fields:
      - "username"
      - "password"
      - "userId"
    order: random           # random, sequence
    skipHeader: true
  phases:
    - duration: 120
      arrivalRate: 10

scenarios:
  - flow:
      - post:
          url: "/auth/login"
          json:
            username: "{{ username }}"
            password: "{{ password }}"
      - get:
          url: "/users/{{ userId }}/profile"
```

## Running in CI

### GitHub Actions

```yaml
name: Load Test
on:
  workflow_dispatch:
  schedule:
    - cron: '0 6 * * 1'  # Every Monday at 6 AM

jobs:
  load-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install Artillery
        run: npm install -g artillery

      - name: Run smoke test
        env:
          TARGET_URL: ${{ secrets.STAGING_URL }}
        run: npx artillery run tests/load/smoke.yml --output report.json

      - name: Generate report
        if: always()
        run: npx artillery report report.json --output report.html

      - name: Upload report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: artillery-report
          path: |
            report.json
            report.html
```

## Plugins

### Metrics Collection (Datadog)

```yaml
config:
  plugins:
    statsd:
      host: "localhost"
      port: 8125
      prefix: "artillery."
```

### Expect Plugin

```bash
npm install artillery-plugin-expect
```

```yaml
config:
  plugins:
    expect: {}

scenarios:
  - flow:
      - get:
          url: "/health"
          expect:
            - statusCode: 200
            - contentType: json
            - hasProperty: status
            - equals:
                - json: "$.status"
                - "healthy"
```

## Anti-Patterns

1. **No warm-up phase** - Jumping straight to peak load does not test realistic scaling behavior. Always include a ramp-up phase.
2. **Ignoring `ensure` thresholds** - Without `ensure`, the test always passes regardless of latency or errors.
3. **No think time** - Omitting `think` between requests creates unrealistic burst patterns.
4. **Testing production without coordination** - Load tests can impact real users. Test against staging or coordinate with operations.
5. **Not capturing dynamic data** - Using hardcoded IDs means the test does not reflect real request diversity.
6. **Single scenario for all traffic** - Real applications have multiple user journeys with different frequencies. Use weighted scenarios.

## Production Checklist

- [ ] Scenario YAML reviewed and version controlled
- [ ] Phases model realistic ramp-up and sustained load
- [ ] Think time included between requests
- [ ] Dynamic data captured and reused across requests
- [ ] `ensure` thresholds set for p95 latency and error rate
- [ ] Custom functions tested independently before load test
- [ ] Reports generated and archived for trend analysis
- [ ] CI pipeline runs smoke tests on staging for every release
- [ ] Environment variables used for secrets and target URLs
- [ ] Multiple weighted scenarios reflect real traffic distribution
- [ ] Socket.IO/WebSocket tests included if the application uses them
