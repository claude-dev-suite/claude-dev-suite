---
name: cryptography
description: |
  Application-level cryptography. Password hashing (bcrypt, argon2), encryption
  (AES-GCM), digital signatures, key management, and secure random generation.

  USE WHEN: user mentions "encryption", "hashing", "bcrypt", "argon2", "AES",
  "cryptography", "digital signature", "key management", "HMAC"

  DO NOT USE FOR: TLS/HTTPS configuration - use infrastructure skills;
  JWT tokens - use `jwt`; OAuth flows - use `oauth2`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Cryptography

## Password Hashing

### bcrypt (recommended for most apps)

```typescript
import bcrypt from 'bcrypt';

const SALT_ROUNDS = 12;

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
```

### Argon2 (recommended for high-security)

```typescript
import argon2 from 'argon2';

async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,  // 64 MB
    timeCost: 3,
    parallelism: 4,
  });
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return argon2.verify(hash, password);
}
```

## Symmetric Encryption (AES-256-GCM)

```typescript
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';

function encrypt(plaintext: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

function decrypt(ciphertext: string, key: Buffer): string {
  const buf = Buffer.from(ciphertext, 'base64');
  const iv = buf.subarray(0, 12);
  const authTag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted) + decipher.final('utf8');
}

// Key from environment (32 bytes for AES-256)
const key = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex');
```

## HMAC (Message Authentication)

```typescript
import { createHmac, timingSafeEqual } from 'crypto';

function signPayload(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

function verifySignature(payload: string, signature: string, secret: string): boolean {
  const expected = signPayload(payload, secret);
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
```

## Secure Random Values

```typescript
import { randomBytes, randomUUID } from 'crypto';

const token = randomBytes(32).toString('hex');  // 64-char hex token
const uuid = randomUUID();                       // UUID v4
```

## Python

```python
from passlib.hash import argon2
import os
from cryptography.fernet import Fernet

# Password hashing
hashed = argon2.hash("password")
is_valid = argon2.verify("password", hashed)

# Symmetric encryption
key = Fernet.generate_key()  # Store securely
f = Fernet(key)
encrypted = f.encrypt(b"sensitive data")
decrypted = f.decrypt(encrypted)

# Secure random
token = os.urandom(32).hex()
```

## Anti-Patterns

| Anti-Pattern | Fix |
|--------------|-----|
| MD5/SHA for passwords | Use bcrypt or argon2 |
| ECB mode encryption | Use GCM (authenticated encryption) |
| Hardcoded keys | Use environment variables or KMS |
| `Math.random()` for tokens | Use `crypto.randomBytes()` |
| String comparison for signatures | Use `timingSafeEqual()` to prevent timing attacks |
| Reusing IV/nonce | Generate fresh random IV for each encryption |

## Production Checklist

- [ ] bcrypt (cost 12+) or argon2id for passwords
- [ ] AES-256-GCM for symmetric encryption
- [ ] Keys in environment variables or KMS
- [ ] `crypto.randomBytes` for all random tokens
- [ ] `timingSafeEqual` for signature verification
- [ ] Key rotation plan documented
