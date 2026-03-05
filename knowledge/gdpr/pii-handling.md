# PII Handling Under GDPR

## Overview

Personal Identifiable Information (PII) under GDPR encompasses any data that can directly or indirectly identify a natural person. GDPR imposes strict requirements on how PII is collected, stored, processed, and shared. This guide covers PII identification, data minimization, encryption, access control, retention policies, log scrubbing, and database design patterns for PII isolation.

---

## PII Identification and Classification

### Classification Tiers

```typescript
enum PIICategory {
  // Direct identifiers (can identify a person on their own)
  DIRECT_IDENTIFIER = 'DIRECT',

  // Quasi-identifiers (can identify when combined)
  QUASI_IDENTIFIER = 'QUASI',

  // Sensitive / Special Category (Article 9)
  SPECIAL_CATEGORY = 'SPECIAL',

  // Non-personal data
  NON_PERSONAL = 'NON_PERSONAL',
}

const PII_CLASSIFICATION: Record<string, { category: PIICategory; sensitivity: 'HIGH' | 'MEDIUM' | 'LOW' }> = {
  // Direct identifiers
  'full_name':           { category: PIICategory.DIRECT_IDENTIFIER, sensitivity: 'HIGH' },
  'email_address':       { category: PIICategory.DIRECT_IDENTIFIER, sensitivity: 'HIGH' },
  'phone_number':        { category: PIICategory.DIRECT_IDENTIFIER, sensitivity: 'HIGH' },
  'national_id':         { category: PIICategory.DIRECT_IDENTIFIER, sensitivity: 'HIGH' },
  'passport_number':     { category: PIICategory.DIRECT_IDENTIFIER, sensitivity: 'HIGH' },
  'ip_address':          { category: PIICategory.DIRECT_IDENTIFIER, sensitivity: 'MEDIUM' },
  'device_id':           { category: PIICategory.DIRECT_IDENTIFIER, sensitivity: 'MEDIUM' },

  // Quasi-identifiers
  'date_of_birth':       { category: PIICategory.QUASI_IDENTIFIER,  sensitivity: 'MEDIUM' },
  'postal_code':         { category: PIICategory.QUASI_IDENTIFIER,  sensitivity: 'LOW' },
  'gender':              { category: PIICategory.QUASI_IDENTIFIER,  sensitivity: 'LOW' },
  'job_title':           { category: PIICategory.QUASI_IDENTIFIER,  sensitivity: 'LOW' },

  // Special category data (Article 9)
  'racial_ethnic_origin':{ category: PIICategory.SPECIAL_CATEGORY,  sensitivity: 'HIGH' },
  'political_opinions':  { category: PIICategory.SPECIAL_CATEGORY,  sensitivity: 'HIGH' },
  'religious_beliefs':   { category: PIICategory.SPECIAL_CATEGORY,  sensitivity: 'HIGH' },
  'health_data':         { category: PIICategory.SPECIAL_CATEGORY,  sensitivity: 'HIGH' },
  'biometric_data':      { category: PIICategory.SPECIAL_CATEGORY,  sensitivity: 'HIGH' },
  'sexual_orientation':  { category: PIICategory.SPECIAL_CATEGORY,  sensitivity: 'HIGH' },
  'trade_union_membership':{ category: PIICategory.SPECIAL_CATEGORY, sensitivity: 'HIGH' },
};
```

### Automated PII Detection

```typescript
// utils/pii-scanner.ts
const PII_PATTERNS: { name: string; pattern: RegExp; category: PIICategory }[] = [
  { name: 'email',       pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, category: PIICategory.DIRECT_IDENTIFIER },
  { name: 'phone_us',    pattern: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,                   category: PIICategory.DIRECT_IDENTIFIER },
  { name: 'phone_intl',  pattern: /\+\d{1,3}[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{3,10}/g,    category: PIICategory.DIRECT_IDENTIFIER },
  { name: 'ssn_us',      pattern: /\b\d{3}-\d{2}-\d{4}\b/g,                            category: PIICategory.DIRECT_IDENTIFIER },
  { name: 'credit_card', pattern: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,                      category: PIICategory.DIRECT_IDENTIFIER },
  { name: 'ipv4',        pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,                      category: PIICategory.DIRECT_IDENTIFIER },
  { name: 'dob',         pattern: /\b\d{4}-\d{2}-\d{2}\b/g,                            category: PIICategory.QUASI_IDENTIFIER },
];

function scanForPII(text: string): { name: string; matches: string[]; category: PIICategory }[] {
  return PII_PATTERNS
    .map(p => ({
      name: p.name,
      matches: [...text.matchAll(p.pattern)].map(m => m[0]),
      category: p.category,
    }))
    .filter(r => r.matches.length > 0);
}
```

---

## Data Minimization

**Article 5(1)(c):** Personal data must be adequate, relevant, and limited to what is necessary.

```typescript
// Middleware to strip unnecessary fields before storage
function minimizeData<T extends Record<string, unknown>>(
  data: T,
  allowedFields: (keyof T)[]
): Partial<T> {
  const minimized: Partial<T> = {};
  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      minimized[field] = data[field];
    }
  }
  return minimized;
}

// Example: registration only needs email and password hash
const REGISTRATION_FIELDS = ['email', 'passwordHash', 'consentTimestamp'] as const;

router.post('/register', async (req, res) => {
  const minimized = minimizeData(req.body, [...REGISTRATION_FIELDS]);
  // Do NOT store: full name, phone, address unless needed for the purpose
  await userService.create(minimized);
});
```

---

## Pseudonymization vs Anonymization

| Aspect | Pseudonymization | Anonymization |
|--------|-----------------|---------------|
| Reversible | Yes (with mapping key) | No |
| GDPR applies | Yes (still personal data) | No (no longer personal data) |
| Use case | Processing where re-identification is needed | Analytics, research, open data |
| Technique | Replace identifiers with tokens | Remove or generalize all identifiers |
| Risk if breached | Re-identification possible if key leaked | No re-identification risk |

### Pseudonymization Implementation

```typescript
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';

const PSEUDONYM_KEY = Buffer.from(process.env.PSEUDONYM_KEY!, 'hex'); // 256-bit key
const ALGORITHM = 'aes-256-gcm';

function pseudonymize(identifier: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, PSEUDONYM_KEY, iv);

  let encrypted = cipher.update(identifier, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  // Combine IV + authTag + ciphertext
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

function dePseudonymize(pseudonym: string): string {
  const [ivHex, authTagHex, encrypted] = pseudonym.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = createDecipheriv(ALGORITHM, PSEUDONYM_KEY, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// One-way hash for cases where reversibility is not needed
function tokenize(identifier: string, salt: string): string {
  return createHash('sha256').update(salt + identifier).digest('hex');
}
```

---

## Encryption at Rest and in Transit

### At Rest (Database-Level)

```sql
-- PostgreSQL: Transparent Data Encryption via pgcrypto
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Encrypt sensitive columns
CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_encrypted BYTEA NOT NULL,      -- pgp_sym_encrypt(email, key)
  email_hash      VARCHAR(64) NOT NULL, -- SHA-256 for lookups
  name_encrypted  BYTEA,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Insert with encryption
INSERT INTO users (email_encrypted, email_hash, name_encrypted)
VALUES (
  pgp_sym_encrypt('user@example.com', current_setting('app.encryption_key')),
  encode(digest('user@example.com', 'sha256'), 'hex'),
  pgp_sym_encrypt('John Doe', current_setting('app.encryption_key'))
);

-- Query by hash, decrypt for display
SELECT
  pgp_sym_decrypt(email_encrypted, current_setting('app.encryption_key')) AS email,
  pgp_sym_decrypt(name_encrypted, current_setting('app.encryption_key')) AS name
FROM users
WHERE email_hash = encode(digest('user@example.com', 'sha256'), 'hex');
```

### In Transit

```typescript
// Express: enforce HTTPS and HSTS
app.use((req, res, next) => {
  if (!req.secure && process.env.NODE_ENV === 'production') {
    return res.redirect(301, `https://${req.headers.host}${req.url}`);
  }
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  next();
});

// TLS configuration for Node.js server
import { createServer } from 'https';
import { readFileSync } from 'fs';

const server = createServer({
  key: readFileSync('/etc/ssl/private/server.key'),
  cert: readFileSync('/etc/ssl/certs/server.crt'),
  minVersion: 'TLSv1.2',
  ciphers: 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256',
}, app);
```

---

## Access Control for PII

```typescript
// Role-based access to PII fields
const PII_ACCESS_MATRIX: Record<string, string[]> = {
  'customer_support': ['email', 'name', 'phone'],
  'billing':          ['email', 'name', 'billing_address', 'payment_last4'],
  'analytics':        ['pseudonymized_id', 'usage_data'],    // No raw PII
  'engineering':      ['pseudonymized_id', 'technical_logs'], // No raw PII
  'dpo':              ['email', 'name', 'all_pii'],           // Full access for rights requests
  'admin':            ['all_pii'],
};

function filterPIIByRole(data: Record<string, unknown>, role: string): Record<string, unknown> {
  const allowedFields = PII_ACCESS_MATRIX[role];
  if (!allowedFields) return {}; // Deny by default

  if (allowedFields.includes('all_pii')) return data;

  const filtered: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      filtered[field] = data[field];
    }
  }
  return filtered;
}

// Middleware
function piiAccessControl(req: Request, res: Response, next: NextFunction) {
  const originalJson = res.json.bind(res);
  res.json = function(body: any) {
    const filtered = filterPIIByRole(body, req.user.role);
    return originalJson(filtered);
  };
  next();
}
```

---

## Data Retention Policies

```typescript
interface RetentionPolicy {
  dataCategory: string;
  retentionPeriod: string;  // ISO 8601 duration
  legalBasis: string;
  deletionMethod: 'HARD_DELETE' | 'ANONYMIZE' | 'ARCHIVE_THEN_DELETE';
  reviewCycle: string;
}

const RETENTION_POLICIES: RetentionPolicy[] = [
  {
    dataCategory: 'user_account_data',
    retentionPeriod: 'P3Y',       // 3 years after account closure
    legalBasis: 'Contract performance + legitimate interest',
    deletionMethod: 'HARD_DELETE',
    reviewCycle: 'P1Y',
  },
  {
    dataCategory: 'transaction_records',
    retentionPeriod: 'P7Y',       // Tax/financial regulation
    legalBasis: 'Legal obligation',
    deletionMethod: 'ARCHIVE_THEN_DELETE',
    reviewCycle: 'P1Y',
  },
  {
    dataCategory: 'marketing_consent',
    retentionPeriod: 'P0D',       // Delete when withdrawn
    legalBasis: 'Consent',
    deletionMethod: 'HARD_DELETE',
    reviewCycle: 'P6M',
  },
  {
    dataCategory: 'server_logs',
    retentionPeriod: 'P90D',      // 90 days
    legalBasis: 'Legitimate interest (security)',
    deletionMethod: 'HARD_DELETE',
    reviewCycle: 'P3M',
  },
];

// Automated retention enforcement
async function enforceRetention(): Promise<void> {
  for (const policy of RETENTION_POLICIES) {
    const cutoffDate = subtractDuration(new Date(), policy.retentionPeriod);
    const expiredRecords = await db.findExpiredRecords(policy.dataCategory, cutoffDate);

    for (const record of expiredRecords) {
      switch (policy.deletionMethod) {
        case 'HARD_DELETE':
          await db.deleteRecord(record.id);
          break;
        case 'ANONYMIZE':
          await anonymizationService.anonymize(record);
          break;
        case 'ARCHIVE_THEN_DELETE':
          await archiveService.archive(record);
          await db.deleteRecord(record.id);
          break;
      }
    }

    await auditLog.record({
      type: 'RETENTION_ENFORCEMENT',
      dataCategory: policy.dataCategory,
      recordsProcessed: expiredRecords.length,
      method: policy.deletionMethod,
    });
  }
}
```

---

## PII in Logs (Scrubbing)

Logs must never contain raw PII. Scrub before writing.

```typescript
// utils/log-scrubber.ts
const SCRUB_PATTERNS: { pattern: RegExp; replacement: string }[] = [
  { pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,   replacement: '[EMAIL_REDACTED]' },
  { pattern: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,                      replacement: '[PHONE_REDACTED]' },
  { pattern: /\b\d{3}-\d{2}-\d{4}\b/g,                               replacement: '[SSN_REDACTED]' },
  { pattern: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,                         replacement: '[CC_REDACTED]' },
  { pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,                         replacement: '[IP_REDACTED]' },
  { pattern: /"password"\s*:\s*"[^"]*"/gi,                            replacement: '"password":"[REDACTED]"' },
  { pattern: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/g,                      replacement: 'Bearer [TOKEN_REDACTED]' },
];

function scrubPII(message: string): string {
  let scrubbed = message;
  for (const { pattern, replacement } of SCRUB_PATTERNS) {
    scrubbed = scrubbed.replace(pattern, replacement);
  }
  return scrubbed;
}

// Winston transport with PII scrubbing
import { createLogger, format, transports } from 'winston';

const piiScrubFormat = format((info) => {
  info.message = scrubPII(info.message);
  if (info.meta) {
    info.meta = JSON.parse(scrubPII(JSON.stringify(info.meta)));
  }
  return info;
});

const logger = createLogger({
  format: format.combine(piiScrubFormat(), format.timestamp(), format.json()),
  transports: [new transports.Console()],
});
```

---

## Database Design for PII Isolation

Separate PII from operational data so that access to business data does not expose personal information.

```sql
-- Schema: operational data (no PII)
CREATE SCHEMA operational;

CREATE TABLE operational.orders (
  id            UUID PRIMARY KEY,
  customer_ref  UUID NOT NULL,        -- References PII schema, not directly identifying
  product_id    UUID NOT NULL,
  quantity      INTEGER NOT NULL,
  total_amount  DECIMAL(10,2),
  status        VARCHAR(20),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Schema: PII data (restricted access)
CREATE SCHEMA pii;

CREATE TABLE pii.customers (
  id              UUID PRIMARY KEY,
  email_encrypted BYTEA NOT NULL,
  email_hash      VARCHAR(64) NOT NULL UNIQUE,
  name_encrypted  BYTEA,
  phone_encrypted BYTEA,
  address_encrypted BYTEA,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Separate roles with different access
GRANT USAGE ON SCHEMA operational TO app_service;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA operational TO app_service;

GRANT USAGE ON SCHEMA pii TO pii_service;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA pii TO pii_service;

-- app_service CANNOT access pii schema
REVOKE ALL ON SCHEMA pii FROM app_service;

-- Analytics role: only operational schema
GRANT USAGE ON SCHEMA operational TO analytics_role;
GRANT SELECT ON ALL TABLES IN SCHEMA operational TO analytics_role;
REVOKE ALL ON SCHEMA pii FROM analytics_role;
```

---

## Anti-Patterns

| Anti-Pattern | Problem | Correct Approach |
|-------------|---------|------------------|
| PII in log messages | Exposure in log aggregation systems | Scrub before logging |
| Single database with PII mixed in | Every query exposes PII | Separate PII into dedicated schema/service |
| Encryption key in source code | Key compromised if code leaks | Use KMS (AWS KMS, Azure Key Vault, HashiCorp Vault) |
| Same encryption key for all data | Single point of failure | Per-tenant or per-category keys |
| No retention enforcement | Data accumulates indefinitely | Automated retention jobs with audit |
| Storing PII "just in case" | Violates data minimization | Collect only what is needed for declared purpose |
| Pseudonymization key alongside data | Defeats the purpose | Store mapping key in separate, access-controlled system |

---

## Production Checklist

- [ ] PII classification completed for all data fields
- [ ] Data minimization enforced at collection points
- [ ] Encryption at rest enabled for all PII columns
- [ ] TLS 1.2+ enforced for all connections
- [ ] Role-based access control restricts PII by function
- [ ] Log scrubbing active in all environments (including dev)
- [ ] PII isolated in dedicated schema or microservice
- [ ] Retention policies defined and enforced automatically
- [ ] Encryption keys managed via KMS, not application config
- [ ] Regular PII audits scheduled (quarterly)
- [ ] Data inventory maintained and up to date
- [ ] Pseudonymization applied for analytics workloads
- [ ] Breach notification process tested (72-hour deadline)
