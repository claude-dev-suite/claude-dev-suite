# Password Hashing

## Overview

Password hashing converts plaintext passwords into irreversible digests using deliberately slow algorithms. Unlike general-purpose hash functions (SHA-256, MD5), password hashing algorithms are designed to be computationally expensive, making brute-force attacks impractical. The three modern algorithms are **bcrypt**, **argon2id**, and **scrypt**.

## NEVER Use These for Passwords

**MD5, SHA-1, SHA-256, SHA-512** are general-purpose hash functions designed for speed. A modern GPU can compute billions of SHA-256 hashes per second, making password cracking trivial.

```
WRONG: SHA-256("password123") -> cracked in milliseconds
RIGHT: argon2id("password123", salt, params) -> designed to take 100ms+
```

Even HMAC-SHA256 with a secret key is not a password hash. Use purpose-built password hashing algorithms.

## Algorithm Comparison

| Algorithm | Recommended | Memory-Hard | Parallelism Resistance | Notes |
| --------- | ----------- | ----------- | ---------------------- | ----- |
| argon2id  | Yes (best)  | Yes         | Yes                    | Winner of 2015 Password Hashing Competition |
| bcrypt    | Yes         | No          | Partial                | Battle-tested, widely supported, 72-byte input limit |
| scrypt    | Yes         | Yes         | Yes                    | Good but harder to tune correctly than argon2 |
| PBKDF2    | Legacy      | No          | No                     | Only if nothing else is available (e.g., FIPS compliance) |

## Argon2id (Recommended)

Argon2id is a hybrid of Argon2i (side-channel resistant) and Argon2d (GPU resistant). It is the OWASP-recommended algorithm for password hashing.

### Parameters

| Parameter      | Description                    | OWASP Minimum     | Recommended |
| -------------- | ------------------------------ | ------------------ | ----------- |
| Memory (m)     | Memory in KiB                  | 19456 (19 MiB)     | 65536 (64 MiB) |
| Iterations (t) | Time cost (passes over memory) | 2                  | 3           |
| Parallelism (p)| Threads                        | 1                  | 1-4         |
| Salt length    | Random salt bytes              | 16                 | 16          |
| Hash length    | Output hash bytes              | 32                 | 32          |

### Node.js

```bash
npm install argon2
```

```typescript
import argon2 from "argon2";

// Hash a password
async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536, // 64 MiB
    timeCost: 3,
    parallelism: 1,
    saltLength: 16,
    hashLength: 32,
  });
}

// Verify a password
async function verifyPassword(
  hash: string,
  password: string
): Promise<boolean> {
  return argon2.verify(hash, password);
}

// Check if rehash is needed (parameters changed)
async function needsRehash(hash: string): Promise<boolean> {
  return argon2.needsRehash(hash, {
    memoryCost: 65536,
    timeCost: 3,
  });
}
```

### Python

```bash
pip install argon2-cffi
```

```python
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

ph = PasswordHasher(
    time_cost=3,
    memory_cost=65536,    # 64 MiB
    parallelism=1,
    hash_len=32,
    salt_len=16
)

# Hash
hashed = ph.hash("my_password")
# Output: $argon2id$v=19$m=65536,t=3,p=1$<salt>$<hash>

# Verify
try:
    ph.verify(hashed, "my_password")
    print("Password matches")
except VerifyMismatchError:
    print("Wrong password")

# Check if rehash needed (parameters updated)
if ph.check_needs_rehash(hashed):
    new_hash = ph.hash("my_password")
    # Update stored hash in database
```

### Java (Spring Security)

```java
import org.springframework.security.crypto.argon2.Argon2PasswordEncoder;

// Parameters: saltLength, hashLength, parallelism, memory (KiB), iterations
Argon2PasswordEncoder encoder = new Argon2PasswordEncoder(16, 32, 1, 65536, 3);

String hash = encoder.encode("my_password");
boolean matches = encoder.matches("my_password", hash);
```

## bcrypt

bcrypt is the most widely deployed password hashing algorithm. It has a 72-byte input limit (longer passwords are silently truncated). Despite this limitation, it remains a solid choice for most applications.

### Work Factor

The work factor (cost) controls the number of iterations as 2^cost. Each increment doubles the computation time.

| Cost | Approximate Time | Recommendation |
| ---- | ---------------- | -------------- |
| 10   | ~100ms           | Minimum for production |
| 12   | ~400ms           | Good default |
| 14   | ~1.5s            | High security |

Adjust the cost factor so that hashing takes 100-500ms on your production hardware.

### Node.js

```bash
npm install bcrypt
```

```typescript
import bcrypt from "bcrypt";

const SALT_ROUNDS = 12;

// Hash
async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

// Verify
async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
```

### Python

```bash
pip install bcrypt
```

```python
import bcrypt

# Hash
password = "my_password".encode("utf-8")
salt = bcrypt.gensalt(rounds=12)
hashed = bcrypt.hashpw(password, salt)

# Verify
if bcrypt.checkpw(password, hashed):
    print("Password matches")
```

Using passlib (supports multiple algorithms):

```python
from passlib.context import CryptContext

pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto",
    bcrypt__rounds=12
)

hashed = pwd_context.hash("my_password")
verified = pwd_context.verify("my_password", hashed)
needs_update = pwd_context.needs_update(hashed)
```

### Java (Spring Security)

```java
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

BCryptPasswordEncoder encoder = new BCryptPasswordEncoder(12);
String hash = encoder.encode("my_password");
boolean matches = encoder.matches("my_password", hash);
```

## scrypt

scrypt is memory-hard, making it resistant to GPU and ASIC attacks. It is more difficult to tune than argon2 but is a solid alternative when argon2 is not available.

### Parameters

| Parameter | Description             | Recommended |
| --------- | ----------------------- | ----------- |
| N         | CPU/memory cost (2^n)   | 2^15 = 32768 |
| r         | Block size              | 8           |
| p         | Parallelism             | 1           |

### Node.js

```typescript
import { scrypt, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scryptAsync(password, salt, 64, {
    N: 32768,
    r: 8,
    p: 1,
  })) as Buffer;
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

async function verifyPassword(
  password: string,
  stored: string
): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(":");
  const salt = Buffer.from(saltHex, "hex");
  const storedHash = Buffer.from(hashHex, "hex");
  const derived = (await scryptAsync(password, salt, 64, {
    N: 32768,
    r: 8,
    p: 1,
  })) as Buffer;
  return timingSafeEqual(storedHash, derived);
}
```

### Python

```python
import hashlib
import os

def hash_password(password: str) -> str:
    salt = os.urandom(16)
    derived = hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt,
        n=32768, r=8, p=1,
        dklen=64
    )
    return f"{salt.hex()}:{derived.hex()}"

def verify_password(password: str, stored: str) -> bool:
    salt_hex, hash_hex = stored.split(":")
    salt = bytes.fromhex(salt_hex)
    stored_hash = bytes.fromhex(hash_hex)
    derived = hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt,
        n=32768, r=8, p=1,
        dklen=64
    )
    return hmac.compare_digest(stored_hash, derived)
```

## Migrating Between Algorithms

When upgrading from an older algorithm (e.g., bcrypt to argon2id), use a lazy migration strategy:

```python
from passlib.context import CryptContext

pwd_context = CryptContext(
    schemes=["argon2", "bcrypt"],     # argon2 is primary, bcrypt is legacy
    deprecated=["bcrypt"],            # Mark bcrypt as deprecated
    argon2__memory_cost=65536,
    argon2__time_cost=3,
    bcrypt__rounds=12
)

def login(username: str, password: str) -> bool:
    user = get_user(username)
    if not pwd_context.verify(password, user.password_hash):
        return False

    # Rehash with current algorithm if using deprecated scheme
    if pwd_context.needs_update(user.password_hash):
        new_hash = pwd_context.hash(password)
        update_user_hash(username, new_hash)

    return True
```

### Migration Steps

1. Update password hashing library to support both old and new algorithms
2. Configure new algorithm as primary, old as deprecated
3. On every successful login, check if rehash is needed
4. If needed, hash with new algorithm and update the stored hash
5. After sufficient time (months), audit remaining old hashes
6. Force password reset for accounts that have not logged in

## Work Factor Tuning

The work factor should be calibrated to your production hardware so that hashing takes 100-500ms:

```python
import time
from argon2 import PasswordHasher

def calibrate_argon2(target_ms=250):
    """Find argon2 parameters that take approximately target_ms."""
    for memory_cost in [32768, 65536, 131072, 262144]:
        for time_cost in [1, 2, 3, 4, 5]:
            ph = PasswordHasher(memory_cost=memory_cost, time_cost=time_cost, parallelism=1)
            start = time.perf_counter()
            ph.hash("benchmark_password")
            elapsed_ms = (time.perf_counter() - start) * 1000
            print(f"m={memory_cost}, t={time_cost}: {elapsed_ms:.0f}ms")
            if abs(elapsed_ms - target_ms) < target_ms * 0.3:
                return memory_cost, time_cost
    return 65536, 3  # Fallback to defaults

memory, iterations = calibrate_argon2(target_ms=250)
```

## Security Warnings

1. **Never store plaintext passwords**. This should be obvious, but it still happens.
2. **Never use MD5 or SHA for passwords**. They are designed for speed, not resistance to brute-force.
3. **Never implement your own password hashing**. Use established libraries.
4. **Never use a static salt**. Each password must have a unique random salt.
5. **Never log passwords**, even temporarily during debugging.
6. **Never compare hashes with `==`**. Use constant-time comparison (`timingSafeEqual`, `hmac.compare_digest`) to prevent timing attacks.
7. **Never truncate passwords before hashing** (except bcrypt's inherent 72-byte limit). Let the algorithm handle the full input.

## Production Checklist

- [ ] Using argon2id (preferred), bcrypt, or scrypt -- not MD5/SHA/PBKDF2
- [ ] Work factor calibrated to 100-500ms on production hardware
- [ ] Unique random salt per password (handled automatically by argon2/bcrypt libraries)
- [ ] Hash stored as the full encoded string (includes algorithm, parameters, salt, hash)
- [ ] Verification uses constant-time comparison (library handles this)
- [ ] Rehash-on-login implemented for parameter upgrades
- [ ] Migration path defined if switching algorithms
- [ ] Password length limit set (prevent DoS with extremely long passwords; 128-1024 chars is reasonable)
- [ ] Rate limiting on login endpoints to slow online brute-force
- [ ] Passwords never logged, never stored in plaintext, never transmitted without TLS
