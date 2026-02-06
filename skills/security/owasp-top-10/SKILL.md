---
name: owasp-top-10
description: |
  OWASP Top 10:2025 security vulnerabilities. Covers access control, injection,
  supply chain, cryptographic failures, and more. Use for security reviews.

  USE WHEN: user mentions "OWASP 2025", "Top 10", "security review", "vulnerability assessment", asks about "broken access control", "injection", "supply chain", "cryptographic failures", "exception handling"

  DO NOT USE FOR: general OWASP (2021) - use `owasp` instead, secrets - use `secrets-management`, dependencies - use `supply-chain`
allowed-tools: Read, Grep, Glob
---
# OWASP Top 10:2025

## When NOT to Use This Skill
- **OWASP Top 10:2021** - Use `owasp` skill for 2021 version
- **Detailed secrets management** - Use `secrets-management` skill
- **Detailed supply chain security** - Use `supply-chain` skill for in-depth dependency management
- **License compliance** - Use `license-compliance` skill

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `owasp` for comprehensive documentation.

## Quick Reference

| Rank | Category | Prevention |
|------|----------|------------|
| A01 | Broken Access Control | Authorization checks, deny by default |
| A02 | Security Misconfiguration | Hardening, security headers, no defaults |
| A03 | Supply Chain Failures | Dependency audits, lockfiles, SBOMs |
| A04 | Cryptographic Failures | Strong algorithms, proper key management |
| A05 | Injection | Parameterized queries, input validation |
| A06 | Insecure Design | Threat modeling, secure patterns |
| A07 | Authentication Failures | MFA, rate limiting, secure sessions |
| A08 | Integrity Failures | Signed updates, safe deserialization |
| A09 | Logging Failures | Audit logs, alerting, monitoring |
| A10 | Exception Handling | Graceful errors, no info leakage |

## A01: Broken Access Control

```typescript
// Always verify ownership
if (resource.userId !== currentUser.id) {
  throw new ForbiddenException();
}

// Deny by default
const allowed = permissions.includes(requiredPermission);
if (!allowed) throw new ForbiddenException();

// Rate limit sensitive endpoints
app.use('/api/admin/*', adminRateLimiter);
```

## A02: Security Misconfiguration

```typescript
// Security headers
import helmet from 'helmet';
app.use(helmet());

// Strict CORS
app.use(cors({
  origin: ['https://myapp.com'],
  credentials: true
}));

// Hide errors in production
if (process.env.NODE_ENV === 'production') {
  app.use((err, req, res, next) => {
    res.status(500).json({ error: 'Internal error' });
  });
}
```

## A03: Supply Chain Failures (NEW in 2025)

```bash
# Audit dependencies
npm audit
pip-audit
mvn dependency-check:check

# Use lockfiles
npm ci  # Instead of npm install

# Verify package integrity
npm install --ignore-scripts
npm config set ignore-scripts true
```

## A04: Cryptographic Failures

```typescript
// Strong password hashing
import { hash, verify } from 'argon2';
const hashed = await hash(password, { type: argon2id });

// Secure random
import { randomBytes, randomUUID } from 'crypto';
const token = randomBytes(32).toString('hex');

// AES-256-GCM for encryption (not CBC)
```

## A05: Injection

```typescript
// SQL - use parameterized queries
const user = await prisma.user.findUnique({ where: { id } });
await db.query('SELECT * FROM users WHERE id = $1', [id]);

// Command - use execFile, not exec
import { execFile } from 'child_process';
execFile('ls', ['-la', safeArg]);

// XSS - sanitize HTML
import DOMPurify from 'dompurify';
element.innerHTML = DOMPurify.sanitize(userInput);
```

## A06: Insecure Design

Key practices:
- Threat modeling during design phase
- Secure design patterns (fail-safe, defense in depth)
- Security requirements in user stories
- Abuse case testing

## A07: Authentication Failures

```typescript
// Rate limiting
import rateLimit from 'express-rate-limit';
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5
});

// Secure cookies
res.cookie('session', token, {
  httpOnly: true,
  secure: true,
  sameSite: 'strict'
});

// Strong passwords (12+ chars, mixed)
```

## A08: Integrity Failures

```typescript
// Verify signatures on updates
// Use subresource integrity (SRI)
<script src="lib.js"
  integrity="sha384-..."
  crossorigin="anonymous">
</script>

// Safe deserialization
// Avoid: JSON.parse(untrusted)
// Use: zod/yup validation
```

## A09: Logging & Alerting Failures

```typescript
// Log security events
logger.warn({
  event: 'auth_failure',
  userId: attemptedId,
  ip: req.ip,
  timestamp: new Date().toISOString()
});

// Events to log:
// - Login success/failure
// - Password changes
// - Permission denied
// - Rate limit exceeded
```

## A10: Exception Handling (NEW in 2025)

```typescript
// Graceful error handling
try {
  await riskyOperation();
} catch (error) {
  logger.error({ error, context });
  // Generic response to user
  throw new InternalServerException('Operation failed');
}

// Never expose stack traces
// Never expose internal paths
// Never expose SQL/DB errors
```

## Security Scanning Commands

```bash
# Dependencies
npm audit --json
snyk test

# Secrets
gitleaks detect
trufflehog git file://.

# SAST
semgrep --config=p/security-audit .

# Docker
trivy image myimage:latest
```

## Checklist

| Risk | Prevention |
|------|------------|
| SQL Injection | Parameterized queries, ORMs |
| XSS | Escape output, CSP headers |
| CSRF | CSRF tokens, SameSite cookies |
| Auth issues | MFA, rate limiting, secure sessions |
| Secrets | Environment variables, vaults |
| Supply chain | Audit, lockfiles, SBOMs |

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| Checking permissions in frontend only | Client-side bypass (A01) | Always verify on backend |
| Using weak crypto (MD5, DES) | Easily broken (A04) | Use AES-256-GCM, argon2, SHA-256+ |
| `npm install` in CI/CD | Non-deterministic builds (A03) | Use `npm ci` with lockfiles |
| Catching all exceptions silently | Hides security issues (A10) | Log errors, fail gracefully |
| Trusting user input in queries | Injection attacks (A05) | Always use parameterized queries |
| No session timeout | Session hijacking (A07) | Implement idle + absolute timeout |

## Quick Troubleshooting

| Issue | Likely Cause | Solution |
|-------|--------------|----------|
| npm audit shows vulnerabilities | Outdated dependencies (A03) | Run `npm audit fix` or update manually |
| Login always fails after 5 attempts | Rate limiter too strict (A07) | Review rate limit settings |
| Secrets leaked in git history | Committed .env file (A02) | Use BFG to clean history, rotate secrets |
| Database queries slow/failing | SQL injection attack (A05) | Review logs, switch to parameterized queries |
| Users accessing others' data | Missing authorization (A01) | Add ownership checks in all endpoints |
| Stack traces in production | Exception handling disabled (A10) | Enable production error handling |

## Related Skills
- [Supply Chain Security](../supply-chain/SKILL.md)
- [Secrets Management](../secrets-management/SKILL.md)
- [JWT Security](../../authentication/jwt/SKILL.md)
