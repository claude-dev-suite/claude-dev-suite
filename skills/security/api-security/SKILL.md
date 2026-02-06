# API Security Skill

> **USE WHEN:** Designing, implementing, or auditing REST, GraphQL, or gRPC APIs for security vulnerabilities.
> **DO NOT USE FOR:** General API design patterns (use rest-api/graphql skills), authentication setup (use jwt/oauth2 skills).

## OWASP API Security Top 10:2023

| Rank | Vulnerability | Description |
|------|---------------|-------------|
| **API1** | Broken Object Level Authorization (BOLA) | IDOR, accessing other users' resources |
| **API2** | Broken Authentication | Weak auth, token flaws |
| **API3** | Broken Object Property Level Authorization | Mass assignment, excessive data exposure |
| **API4** | Unrestricted Resource Consumption | No rate limiting, DoS |
| **API5** | Broken Function Level Authorization | Admin functions exposed |
| **API6** | Unrestricted Access to Sensitive Business Flows | Automated abuse |
| **API7** | Server Side Request Forgery (SSRF) | Internal resource access |
| **API8** | Security Misconfiguration | CORS, headers, verbose errors |
| **API9** | Improper Inventory Management | Shadow APIs, outdated versions |
| **API10** | Unsafe Consumption of APIs | Trusting third-party APIs |

## API1: Broken Object Level Authorization (BOLA)

```typescript
// Bad: No ownership check
app.get('/api/orders/:id', async (req, res) => {
  const order = await Order.findById(req.params.id);
  res.json(order);
});

// Good: Verify ownership
app.get('/api/orders/:id', authenticate, async (req, res) => {
  const order = await Order.findOne({
    _id: req.params.id,
    userId: req.user.id  // Filter by current user
  });

  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  res.json(order);
});

// Good: Use UUIDs instead of sequential IDs
// Harder to enumerate, though NOT a substitute for auth
GET /api/orders/550e8400-e29b-41d4-a716-446655440000
```

## API3: Broken Object Property Level Authorization

```typescript
// Bad: Mass assignment
app.put('/api/users/:id', async (req, res) => {
  await User.findByIdAndUpdate(req.params.id, req.body);  // Can set isAdmin!
});

// Good: Explicit field whitelist
const updateSchema = z.object({
  name: z.string().optional(),
  email: z.string().email().optional(),
  // isAdmin NOT allowed
});

app.put('/api/users/:id', async (req, res) => {
  const data = updateSchema.parse(req.body);
  await User.findByIdAndUpdate(req.params.id, data);
});

// Bad: Excessive data exposure
app.get('/api/users/:id', async (req, res) => {
  const user = await User.findById(req.params.id);
  res.json(user);  // Includes password hash, internal fields
});

// Good: DTOs with explicit fields
app.get('/api/users/:id', async (req, res) => {
  const user = await User.findById(req.params.id);
  res.json({
    id: user.id,
    name: user.name,
    email: user.email
    // Exclude: passwordHash, internalNotes, etc.
  });
});
```

## API4: Unrestricted Resource Consumption

```typescript
// Good: Rate limiting
import rateLimit from 'express-rate-limit';

// Global rate limit
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 min
  max: 100,
  standardHeaders: true
});

// Stricter for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true
});

app.use('/api/', globalLimiter);
app.use('/api/auth/', authLimiter);

// Good: Pagination limits
const listSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

app.get('/api/items', async (req, res) => {
  const { page, limit } = listSchema.parse(req.query);
  const items = await Item.find()
    .skip((page - 1) * limit)
    .limit(limit);
  res.json({ items, page, limit });
});

// Good: Request size limits
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ limit: '100kb', extended: true }));
```

## API7: Server Side Request Forgery (SSRF)

```typescript
// Bad: Unvalidated URL fetch
app.post('/api/fetch', async (req, res) => {
  const response = await fetch(req.body.url);  // Can access internal services!
  res.json(await response.json());
});

// Good: URL validation and allowlist
const ALLOWED_HOSTS = ['api.example.com', 'cdn.example.com'];

function validateUrl(urlString: string): URL {
  const url = new URL(urlString);

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Invalid protocol');
  }

  if (!ALLOWED_HOSTS.includes(url.hostname)) {
    throw new Error('Host not allowed');
  }

  // Block private IPs
  const privateRanges = [
    /^127\./,
    /^10\./,
    /^172\.(1[6-9]|2[0-9]|3[01])\./,
    /^192\.168\./,
    /^169\.254\./,
    /^localhost$/i
  ];

  if (privateRanges.some(r => r.test(url.hostname))) {
    throw new Error('Private addresses not allowed');
  }

  return url;
}
```

## API8: Security Misconfiguration

```typescript
// Good: CORS configuration
import cors from 'cors';

const corsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = ['https://myapp.com', 'https://admin.myapp.com'];
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400  // 24 hours
};

app.use(cors(corsOptions));

// Good: Error handling without leaking info
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', err);  // Log full error internally

  if (process.env.NODE_ENV === 'production') {
    res.status(500).json({ error: 'Internal server error' });
  } else {
    res.status(500).json({
      error: err.message,
      stack: err.stack
    });
  }
});

// Good: Remove fingerprinting headers
app.disable('x-powered-by');
```

## GraphQL Security

### Query Depth & Complexity Limiting

```typescript
import { createComplexityLimitRule } from 'graphql-validation-complexity';
import depthLimit from 'graphql-depth-limit';

const server = new ApolloServer({
  schema,
  validationRules: [
    depthLimit(5),  // Max query depth
    createComplexityLimitRule(1000, {  // Max complexity
      onCost: (cost) => console.log('Query cost:', cost),
      createError: (max, actual) =>
        new GraphQLError(`Query too complex: ${actual}. Max: ${max}`)
    })
  ]
});
```

### Disable Introspection in Production

```typescript
import { ApolloServer } from '@apollo/server';
import { ApolloServerPluginLandingPageDisabled } from '@apollo/server/plugin/disabled';

const server = new ApolloServer({
  schema,
  introspection: process.env.NODE_ENV !== 'production',
  plugins: process.env.NODE_ENV === 'production'
    ? [ApolloServerPluginLandingPageDisabled()]
    : []
});
```

### Batching Attack Prevention

```typescript
// Limit batch size
const server = new ApolloServer({
  schema,
  allowBatchedHttpRequests: true,  // Or false to disable
});

// Custom batching limit
app.use('/graphql', (req, res, next) => {
  if (Array.isArray(req.body) && req.body.length > 10) {
    return res.status(400).json({ error: 'Batch size exceeds limit' });
  }
  next();
});
```

### Query Allowlisting (Persisted Queries)

```typescript
import { ApolloServer } from '@apollo/server';
import { ApolloServerPluginUsageReporting } from '@apollo/server/plugin/usageReporting';

// In production, only allow pre-registered queries
const server = new ApolloServer({
  schema,
  persistedQueries: {
    cache: new KeyValueCache(),  // Redis recommended
  },
  plugins: [
    {
      async requestDidStart() {
        return {
          async didResolveOperation({ request }) {
            if (process.env.NODE_ENV === 'production' && !request.extensions?.persistedQuery) {
              throw new GraphQLError('Only persisted queries allowed');
            }
          }
        };
      }
    }
  ]
});
```

## JWT Security Best Practices

```typescript
import jwt from 'jsonwebtoken';

// Good: Strong signing configuration
const jwtOptions: jwt.SignOptions = {
  algorithm: 'RS256',  // Asymmetric preferred
  expiresIn: '15m',    // Short-lived access tokens
  issuer: 'my-api',
  audience: 'my-app-users'
};

// Good: Verify with all checks
function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, publicKey, {
    algorithms: ['RS256'],  // Explicit algorithm
    issuer: 'my-api',
    audience: 'my-app-users',
    clockTolerance: 30  // 30 seconds tolerance
  }) as JwtPayload;
}

// Good: Refresh token rotation
async function refreshToken(refreshToken: string): Promise<Tokens> {
  const payload = verifyRefreshToken(refreshToken);

  // Invalidate old refresh token
  await RefreshToken.delete(refreshToken);

  // Issue new tokens
  const accessToken = jwt.sign({ sub: payload.sub }, privateKey, jwtOptions);
  const newRefreshToken = await RefreshToken.create(payload.sub);

  return { accessToken, refreshToken: newRefreshToken };
}
```

## API Versioning Security

```typescript
// Good: Version in path with sunset dates
app.use('/api/v1', v1Router);  // Deprecated, remove by 2025-01-01
app.use('/api/v2', v2Router);  // Current

// Add deprecation headers
app.use('/api/v1', (req, res, next) => {
  res.set('Deprecation', 'true');
  res.set('Sunset', 'Sat, 01 Jan 2025 00:00:00 GMT');
  res.set('Link', '</api/v2>; rel="successor-version"');
  next();
});

// Monitor deprecated endpoint usage
app.use('/api/v1', (req, res, next) => {
  metrics.increment('api.v1.requests', {
    path: req.path,
    userAgent: req.headers['user-agent']
  });
  next();
});
```

## Security Testing

```bash
# OWASP ZAP API scan
docker run -t owasp/zap2docker-stable zap-api-scan.py \
  -t https://api.example.com/openapi.json \
  -f openapi

# Nuclei for API vulnerabilities
nuclei -u https://api.example.com -t api/

# API fuzzing with RESTler
restler compile --api_spec openapi.json
restler fuzz --grammar_file grammar.py
```

## CI/CD Integration

```yaml
name: API Security
on: [push, pull_request]

jobs:
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Start API
        run: docker-compose up -d

      - name: Wait for API
        run: npx wait-on http://localhost:3000/health

      - name: OWASP ZAP Scan
        uses: zaproxy/action-api-scan@v0.5.0
        with:
          target: http://localhost:3000/openapi.json
          format: openapi

      - name: Upload report
        uses: actions/upload-artifact@v4
        with:
          name: zap-report
          path: report_html.html
```
