# TypeScript Security Skill

> **USE WHEN:** Securing TypeScript/JavaScript applications, reviewing frontend/backend code for vulnerabilities.
> **DO NOT USE FOR:** Code quality issues (use typescript-quality), general TypeScript patterns, styling.

## OWASP Top 10 for TypeScript

### A01: Broken Access Control

```typescript
// Bad: No authorization check
app.get('/api/users/:id', async (req, res) => {
  const user = await User.findById(req.params.id);
  res.json(user);
});

// Good: Ownership verification
app.get('/api/users/:id', authenticate, async (req, res) => {
  const userId = req.params.id;

  if (req.user.id !== userId && !req.user.roles.includes('admin')) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const user = await User.findById(userId);
  res.json(user);
});

// Good: CASL for complex authorization
import { defineAbility } from '@casl/ability';

const ability = defineAbility((can, cannot) => {
  can('read', 'Article');
  can('update', 'Article', { authorId: user.id });
  cannot('delete', 'Article').because('Not allowed');
});

if (ability.cannot('update', article)) {
  throw new ForbiddenError('Cannot update this article');
}
```

### A03: Injection Prevention

```typescript
// Bad: SQL Injection
const query = `SELECT * FROM users WHERE id = ${userId}`;
await db.query(query);

// Good: Parameterized queries (pg)
const { rows } = await pool.query(
  'SELECT * FROM users WHERE id = $1',
  [userId]
);

// Good: Prisma (auto-parameterized)
const user = await prisma.user.findUnique({
  where: { id: userId }
});

// Good: Drizzle (type-safe)
const users = await db.select().from(usersTable).where(eq(usersTable.id, userId));

// Bad: NoSQL Injection (MongoDB)
const user = await User.findOne({ name: req.query.name });  // If name = { $ne: "" }

// Good: Type validation
import { z } from 'zod';

const QuerySchema = z.object({
  name: z.string().min(1).max(100)
});

const { name } = QuerySchema.parse(req.query);
const user = await User.findOne({ name });

// Bad: Template injection
const template = `Hello ${userInput}`;
eval(template);

// Good: Safe templating
import Handlebars from 'handlebars';
const template = Handlebars.compile('Hello {{name}}');
const result = template({ name: sanitizedInput });
```

### A04: Cryptographic Failures

```typescript
// Bad: Weak hashing
import crypto from 'crypto';
const hash = crypto.createHash('md5').update(password).digest('hex');

// Good: Argon2 for passwords
import argon2 from 'argon2';

const hash = await argon2.hash(password, {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4
});

const valid = await argon2.verify(hash, password);

// Good: bcrypt alternative
import bcrypt from 'bcrypt';
const hash = await bcrypt.hash(password, 12);
const valid = await bcrypt.compare(password, hash);

// Good: Secure random generation
import { randomBytes, randomUUID } from 'crypto';

const token = randomBytes(32).toString('hex');
const id = randomUUID();

// Good: AES-GCM encryption
import { createCipheriv, createDecipheriv, randomBytes, scrypt } from 'crypto';

async function encrypt(text: string, password: string): Promise<string> {
  const iv = randomBytes(16);
  const key = await new Promise<Buffer>((resolve, reject) => {
    scrypt(password, 'salt', 32, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });

  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}
```

### A05: XSS Prevention

```typescript
// Bad: Direct innerHTML
element.innerHTML = userInput;

// Good: textContent or sanitize
element.textContent = userInput;

// Good: DOMPurify for rich content
import DOMPurify from 'dompurify';
element.innerHTML = DOMPurify.sanitize(userInput);

// React: JSX auto-escapes by default
return <div>{userInput}</div>;  // Safe

// Bad: dangerouslySetInnerHTML without sanitization
return <div dangerouslySetInnerHTML={{ __html: userInput }} />;

// Good: Sanitize before using dangerouslySetInnerHTML
return <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(userInput) }} />;

// Good: CSP Headers (Express)
import helmet from 'helmet';

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'https://api.example.com'],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"]
    }
  }
}));
```

### A07: Authentication Failures

```typescript
// Good: Secure session configuration (Express)
import session from 'express-session';

app.use(session({
  secret: process.env.SESSION_SECRET!,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 3600000  // 1 hour
  }
}));

// Good: Rate limiting
import rateLimit from 'express-rate-limit';

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 5,
  message: 'Too many login attempts',
  standardHeaders: true,
  legacyHeaders: false
});

app.post('/login', loginLimiter, loginHandler);

// Good: JWT with proper validation
import jwt from 'jsonwebtoken';
import { z } from 'zod';

const JwtPayloadSchema = z.object({
  sub: z.string(),
  email: z.string().email(),
  roles: z.array(z.string()),
  iat: z.number(),
  exp: z.number()
});

function verifyToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, process.env.JWT_SECRET!, {
    algorithms: ['HS256'],
    issuer: 'my-app',
    audience: 'my-app-users'
  });

  return JwtPayloadSchema.parse(decoded);
}
```

### A08: Software Integrity

```typescript
// Good: Subresource Integrity (SRI)
<script
  src="https://cdn.example.com/lib.js"
  integrity="sha384-abc123..."
  crossorigin="anonymous"
/>

// Good: Verify package signatures in CI
// package.json
{
  "scripts": {
    "audit": "npm audit --audit-level=high",
    "preinstall": "npx npm-force-resolutions"
  }
}

// Good: Avoid eval and Function constructor
// Bad:
eval(userInput);
new Function(userInput)();

// Good: Use safe alternatives
const safeOperations: Record<string, (a: number, b: number) => number> = {
  add: (a, b) => a + b,
  subtract: (a, b) => a - b
};

const result = safeOperations[operation]?.(a, b);
```

## TypeScript-Specific Security

### Type Safety for Security

```typescript
// Good: Branded types for sensitive data
declare const PasswordBrand: unique symbol;
type Password = string & { [PasswordBrand]: true };

function hashPassword(password: Password): Promise<string> {
  return argon2.hash(password);
}

// Can't pass arbitrary strings
const plainPassword = 'secret123';
// hashPassword(plainPassword);  // Type error!

const validatedPassword = validatePassword(plainPassword) as Password;
hashPassword(validatedPassword);  // OK

// Good: Zod for runtime validation
import { z } from 'zod';

const UserInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12).regex(/[A-Z]/).regex(/[a-z]/).regex(/[0-9]/),
  age: z.number().int().positive().max(150)
});

type UserInput = z.infer<typeof UserInputSchema>;

function createUser(input: unknown): User {
  const validated = UserInputSchema.parse(input);  // Throws on invalid
  // validated is now properly typed
  return userService.create(validated);
}
```

### Secure API Design

```typescript
// Good: Input validation with error handling
import { z } from 'zod';
import { fromZodError } from 'zod-validation-error';

const CreateOrderSchema = z.object({
  items: z.array(z.object({
    productId: z.string().uuid(),
    quantity: z.number().int().positive().max(100)
  })).min(1).max(50),
  shippingAddress: z.object({
    street: z.string().min(1).max(200),
    city: z.string().min(1).max(100),
    zipCode: z.string().regex(/^\d{5}(-\d{4})?$/)
  })
});

app.post('/orders', async (req, res) => {
  const result = CreateOrderSchema.safeParse(req.body);

  if (!result.success) {
    return res.status(400).json({
      error: 'Validation failed',
      details: fromZodError(result.error).message
    });
  }

  const order = await createOrder(result.data);
  res.status(201).json(order);
});
```

### Secure Environment Handling

```typescript
// Good: Type-safe environment variables
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  API_KEY: z.string().optional()
});

const env = EnvSchema.parse(process.env);

// Never log secrets
console.log('Starting server...', {
  nodeEnv: env.NODE_ENV,
  // Don't log: JWT_SECRET, DATABASE_URL
});
```

## Security Headers

```typescript
// Complete security headers with Helmet
import helmet from 'helmet';

app.use(helmet());

// Or configure individually
app.use(helmet.contentSecurityPolicy({
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", 'data:', 'https:'],
    fontSrc: ["'self'", 'https://fonts.gstatic.com'],
    connectSrc: ["'self'", process.env.API_URL],
    frameSrc: ["'none'"],
    objectSrc: ["'none'"],
    upgradeInsecureRequests: []
  }
}));

app.use(helmet.hsts({
  maxAge: 31536000,
  includeSubDomains: true,
  preload: true
}));

app.use(helmet.referrerPolicy({ policy: 'strict-origin-when-cross-origin' }));
```

## Security Scanning

```bash
# npm audit
npm audit
npm audit fix

# Snyk
npx snyk test
npx snyk monitor

# ESLint security plugin
npm install --save-dev eslint-plugin-security

# .eslintrc.js
module.exports = {
  plugins: ['security'],
  extends: ['plugin:security/recommended']
};

# Semgrep
semgrep --config=p/typescript .
semgrep --config=p/security-audit .
```

## CI/CD Integration

```yaml
name: Security Scan
on: [push, pull_request]

jobs:
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: npm audit
        run: npm audit --audit-level=high

      - name: ESLint Security
        run: npx eslint --ext .ts,.tsx . --rule 'security/*: error'

      - name: Snyk
        uses: snyk/actions/node@master
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}

      - name: Check for secrets
        uses: trufflesecurity/trufflehog@main
```
