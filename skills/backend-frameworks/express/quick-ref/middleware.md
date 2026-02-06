# Express Middleware Patterns

> **Knowledge Base:** Read `knowledge/express/middleware.md` for complete documentation.

## Middleware Basics

```ts
import express, { Request, Response, NextFunction } from 'express';

const app = express();

// Middleware function signature
const myMiddleware = (req: Request, res: Response, next: NextFunction) => {
  console.log('Request received:', req.method, req.path);
  next(); // Pass to next middleware
};

app.use(myMiddleware);
```

## Common Middleware Stack

```ts
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';

const app = express();

// Security headers
app.use(helmet());

// CORS
app.use(cors({ origin: 'http://localhost:3000', credentials: true }));

// Logging
app.use(morgan('combined'));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Compression
app.use(compression());
```

## Custom Middleware

```ts
// Request timing
const timing = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on('finish', () => {
    console.log(`${req.method} ${req.path} - ${Date.now() - start}ms`);
  });
  next();
};

// Async middleware wrapper
const asyncHandler = (fn: Function) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Usage
app.get('/users', asyncHandler(async (req, res) => {
  const users = await User.findAll();
  res.json(users);
}));
```

## Authentication Middleware

```ts
import jwt from 'jsonwebtoken';

interface AuthRequest extends Request {
  user?: { id: string; email: string };
}

const authenticate = (req: AuthRequest, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!);
    req.user = decoded as { id: string; email: string };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Protected route
app.get('/profile', authenticate, (req: AuthRequest, res) => {
  res.json({ user: req.user });
});
```

## Route-Specific Middleware

```ts
import { Router } from 'express';

const router = Router();

// Apply to all routes in router
router.use(authenticate);

// Apply to specific route
router.get('/admin', authorize('admin'), (req, res) => {
  res.json({ admin: true });
});
```

## Middleware Order

```ts
// Order matters!
app.use(express.json());        // 1. Parse body first
app.use(authenticate);          // 2. Then authenticate
app.use('/api', apiRouter);     // 3. Then routes
app.use(notFoundHandler);       // 4. 404 handler
app.use(errorHandler);          // 5. Error handler last
```

**Official docs:** https://expressjs.com/en/guide/using-middleware.html
