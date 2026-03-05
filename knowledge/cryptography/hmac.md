# HMAC (Hash-Based Message Authentication Code)

## Overview

HMAC is a mechanism for verifying both the integrity and authenticity of a message using a shared secret key and a hash function. Unlike a plain hash, HMAC proves that the message was created (or approved) by someone who possesses the secret key. Common uses include webhook signature verification, API request signing, and tamper-evident data exchange.

## How HMAC Works

```
HMAC(K, M) = H((K' XOR opad) || H((K' XOR ipad) || M))
```

HMAC is resistant to length-extension attacks (unlike plain SHA-256 prefix constructions), making it safe for authentication.

## Implementation

### Node.js

```typescript
import { createHmac, timingSafeEqual } from "node:crypto";

function signMessage(message: string, secret: string): string {
  return createHmac("sha256", secret).update(message).digest("hex");
}

function verifyMessage(message: string, signature: string, secret: string): boolean {
  const expected = signMessage(message, secret);
  const sigBuffer = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  if (sigBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(sigBuffer, expectedBuffer);
}
```

### Python

```python
import hmac
import hashlib

def sign_message(message: str, secret: str) -> str:
    return hmac.new(secret.encode("utf-8"), message.encode("utf-8"),
        hashlib.sha256).hexdigest()

def verify_message(message: str, signature: str, secret: str) -> bool:
    expected = sign_message(message, secret)
    return hmac.compare_digest(signature, expected)
```

### Java

```java
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.security.MessageDigest;

public class HmacUtil {
    public static String sign(String message, String secret) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(secret.getBytes("UTF-8"), "HmacSHA256"));
        byte[] hash = mac.doFinal(message.getBytes("UTF-8"));
        StringBuilder sb = new StringBuilder();
        for (byte b : hash) sb.append(String.format("%02x", b));
        return sb.toString();
    }

    public static boolean verify(String message, String signature, String secret)
            throws Exception {
        String expected = sign(message, secret);
        return MessageDigest.isEqual(expected.getBytes("UTF-8"), signature.getBytes("UTF-8"));
    }
}
```

## Webhook Signature Verification

### GitHub Webhooks

```typescript
import { createHmac, timingSafeEqual } from "node:crypto";
import express from "express";

const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET!;

// IMPORTANT: Use raw body, not parsed JSON
app.post("/webhook/github", express.raw({ type: "application/json" }), (req, res) => {
  const signature = req.headers["x-hub-signature-256"] as string;
  if (!signature) return res.status(401).send("Missing signature");

  const expected = "sha256=" +
    createHmac("sha256", WEBHOOK_SECRET).update(req.body).digest("hex");

  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (sigBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(sigBuffer, expectedBuffer)) {
    return res.status(401).send("Invalid signature");
  }

  const payload = JSON.parse(req.body.toString());
  res.status(200).send("OK");
});
```

### Generic Webhook Verification (Python)

```python
import hmac, hashlib, os
from flask import Flask, request, abort

WEBHOOK_SECRET = os.environ["WEBHOOK_SECRET"]

@app.post("/webhook")
def handle_webhook():
    signature = request.headers.get("X-Signature-256")
    if not signature:
        abort(401, "Missing signature")
    expected = "sha256=" + hmac.new(
        WEBHOOK_SECRET.encode("utf-8"), request.get_data(), hashlib.sha256
    ).hexdigest()
    if not hmac.compare_digest(signature, expected):
        abort(401, "Invalid signature")
    payload = request.get_json()
    return "OK", 200
```

## API Request Signing

### Simple Request Signing (Node.js)

```typescript
import { createHmac, timingSafeEqual } from "node:crypto";

function signRequest(method: string, path: string, body: string, secret: string) {
  const timestamp = Date.now();
  const message = `${method}\n${path}\n${timestamp}\n${body}`;
  const signature = createHmac("sha256", secret).update(message).digest("hex");
  return { method, path, body, timestamp, signature };
}

function verifyRequest(req: { method: string; path: string; body: string;
    timestamp: number; signature: string }, secret: string, maxAgeMs = 300000): boolean {
  if (Math.abs(Date.now() - req.timestamp) > maxAgeMs) return false;  // Replay protection
  const message = `${req.method}\n${req.path}\n${req.timestamp}\n${req.body}`;
  const expected = createHmac("sha256", secret).update(message).digest("hex");
  const sigBuf = Buffer.from(req.signature, "hex");
  const expBuf = Buffer.from(expected, "hex");
  if (sigBuf.length !== expBuf.length) return false;
  return timingSafeEqual(sigBuf, expBuf);
}
```

### AWS Signature V4 Style (Python)

```python
import hmac, hashlib, datetime

def sign_request(method, path, body, access_key, secret_key, timestamp=None):
    if timestamp is None:
        timestamp = datetime.datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
    date_stamp = timestamp[:8]

    body_hash = hashlib.sha256(body.encode("utf-8")).hexdigest()
    canonical = f"{method}\n{path}\n\nhost:api.example.com\n\nhost\n{body_hash}"
    canonical_hash = hashlib.sha256(canonical.encode("utf-8")).hexdigest()

    scope = f"{date_stamp}/us-east-1/myservice/request"
    string_to_sign = f"HMAC-SHA256\n{timestamp}\n{scope}\n{canonical_hash}"

    def hmac_sha256(key, msg):
        return hmac.new(key, msg.encode("utf-8"), hashlib.sha256).digest()

    signing_key = hmac_sha256(f"SVC{secret_key}".encode("utf-8"), date_stamp)
    signing_key = hmac_sha256(signing_key, "us-east-1")
    signing_key = hmac_sha256(signing_key, "myservice")
    signing_key = hmac_sha256(signing_key, "request")

    signature = hmac.new(signing_key, string_to_sign.encode("utf-8"),
        hashlib.sha256).hexdigest()
    return {"Authorization": f"HMAC-SHA256 Credential={access_key}/{scope}, "
            f"SignedHeaders=host, Signature={signature}", "X-Timestamp": timestamp}
```

## Timing-Safe Comparison

Standard string comparison (`===`) short-circuits on the first mismatch, leaking information through response timing. Always use constant-time comparison:

| Language | Function |
| -------- | -------- |
| Node.js  | `crypto.timingSafeEqual(a, b)` |
| Python   | `hmac.compare_digest(a, b)` |
| Java     | `MessageDigest.isEqual(a, b)` |
| Go       | `subtle.ConstantTimeCompare(a, b)` |

## Common Pitfalls

**1. Verifying parsed JSON instead of raw body:**
```typescript
// WRONG: JSON.stringify changes whitespace/ordering
const sig = createHmac("sha256", secret).update(JSON.stringify(req.body)).digest("hex");
// RIGHT: Use raw request body
app.post("/webhook", express.raw({ type: "application/json" }), (req, res) => {
  const sig = createHmac("sha256", secret).update(req.body).digest("hex");
});
```

**2. No replay protection:** Include and verify a timestamp with a freshness window (5 minutes).

**3. Weak keys:** Use cryptographically random keys of at least 32 bytes, not human-readable passwords.

**4. Wrong encoding:** Always use explicit, consistent encoding (UTF-8) for both key and message.

**5. Mutable fields in signature:** Only sign canonical, immutable parts of the request.

## HMAC vs Digital Signatures

| Feature         | HMAC                          | Digital Signatures                 |
| --------------- | ----------------------------- | ---------------------------------- |
| Key type        | Shared secret (symmetric)     | Public/private pair (asymmetric)   |
| Verification    | Requires the secret key       | Only requires the public key       |
| Non-repudiation | No (both parties have key)    | Yes (only signer has private key)  |
| Speed           | Fast                          | Slower                             |
| Use case        | Webhooks, internal APIs       | JWTs, code signing, third-party    |

## Anti-Patterns

- **Using `===` for signature comparison**: Vulnerable to timing attacks. Always use constant-time comparison.
- **Signing parsed/re-serialized JSON**: JSON serialization is not deterministic. Sign the raw bytes.
- **No replay protection**: Include and verify a timestamp or nonce.
- **Using MD5 for HMAC**: Use HMAC-SHA256 or HMAC-SHA512.
- **Sharing webhook secrets across environments**: Use different secrets for production, staging, development.

## Production Checklist

- [ ] HMAC-SHA256 or HMAC-SHA512 used (not MD5 or SHA-1)
- [ ] Secret key at least 32 bytes, generated from CSPRNG
- [ ] Timing-safe comparison for all signature verification
- [ ] Raw request body used for webhook verification
- [ ] Timestamp with freshness check included in signed messages
- [ ] Secrets stored in environment variables or secrets manager
- [ ] Different secrets per environment
- [ ] Signature failures logged (without exposing the secret)
- [ ] Webhook endpoints use HTTPS only
- [ ] Key rotation plan documented
