# Digital Signatures

## Overview

Digital signatures provide three guarantees: **authentication** (the signer is who they claim to be), **integrity** (the message has not been modified), and **non-repudiation** (the signer cannot deny having signed). Unlike HMAC, digital signatures use asymmetric cryptography: a private key signs, and the corresponding public key verifies.

## Algorithm Comparison

| Algorithm     | Key Size      | Signature Size | Speed        | Recommendation              |
| ------------- | ------------- | -------------- | ------------ | --------------------------- |
| Ed25519       | 256 bit       | 64 bytes       | Very fast    | Best for new systems        |
| ECDSA (P-256) | 256 bit       | 64 bytes       | Fast         | When Ed25519 unavailable    |
| RSA-PSS       | 2048-4096 bit | 256-512 bytes  | Slow sign    | Legacy compatibility only   |

## Ed25519 Signatures (Recommended)

Ed25519 is fast, has small keys/signatures, and is resistant to implementation pitfalls (e.g., ECDSA nonce reuse).

### Python

```python
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives import serialization

private_key = Ed25519PrivateKey.generate()
public_key = private_key.public_key()

# Sign (Ed25519 does not use a separate hash algorithm)
message = b"Important document content"
signature = private_key.sign(message)

# Verify
try:
    public_key.verify(signature, message)
    print("Valid")
except Exception:
    print("Invalid")
```

### Node.js

```typescript
import { generateKeyPairSync, sign, verify } from "node:crypto";

const { publicKey, privateKey } = generateKeyPairSync("ed25519", {
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

const message = Buffer.from("Important document content");
const signature = sign(null, message, privateKey);      // null algorithm for Ed25519
const isValid = verify(null, message, publicKey, signature);
```

### Java (BouncyCastle)

```java
import org.bouncycastle.crypto.params.*;
import org.bouncycastle.crypto.signers.Ed25519Signer;
import java.security.SecureRandom;

Ed25519PrivateKeyParameters privateKey = new Ed25519PrivateKeyParameters(new SecureRandom());
Ed25519PublicKeyParameters publicKey = privateKey.generatePublicKey();

Ed25519Signer signer = new Ed25519Signer();
signer.init(true, privateKey);
byte[] message = "Important document content".getBytes("UTF-8");
signer.update(message, 0, message.length);
byte[] signature = signer.generateSignature();

Ed25519Signer verifier = new Ed25519Signer();
verifier.init(false, publicKey);
verifier.update(message, 0, message.length);
boolean isValid = verifier.verifySignature(signature);
```

## RSA-PSS Signatures

Use RSA-PSS (not PKCS#1 v1.5) when RSA is required for legacy compatibility.

```python
from cryptography.hazmat.primitives.asymmetric import rsa, padding
from cryptography.hazmat.primitives import hashes

private_key = rsa.generate_private_key(public_exponent=65537, key_size=4096)

signature = private_key.sign(b"message", padding.PSS(
    mgf=padding.MGF1(hashes.SHA256()), salt_length=padding.PSS.MAX_LENGTH
), hashes.SHA256())

private_key.public_key().verify(signature, b"message", padding.PSS(
    mgf=padding.MGF1(hashes.SHA256()), salt_length=padding.PSS.MAX_LENGTH
), hashes.SHA256())
```

## ECDSA Signatures

Widely supported (TLS certificates), but nonce reuse completely compromises the private key.

```python
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import hashes

private_key = ec.generate_private_key(ec.SECP256R1())
signature = private_key.sign(b"message", ec.ECDSA(hashes.SHA256()))

private_key.public_key().verify(signature, b"message", ec.ECDSA(hashes.SHA256()))
```

## JWT Signing

| Algorithm | Type           | Key              | Recommendation                     |
| --------- | -------------- | ---------------- | ---------------------------------- |
| HS256     | HMAC-SHA256    | Shared secret    | Internal services only             |
| RS256     | RSA-PKCS1      | RSA key pair     | Legacy, widely supported           |
| ES256     | ECDSA-P256     | EC key pair      | Good, smaller keys than RSA        |
| EdDSA     | Ed25519        | Ed25519 key pair | Best performance and security      |

### Node.js JWT with Ed25519

```typescript
import jwt from "jsonwebtoken";
import { generateKeyPairSync } from "node:crypto";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");

const token = jwt.sign({ sub: "user-123", role: "admin" }, privateKey,
  { algorithm: "EdDSA", expiresIn: "1h", issuer: "auth-service" });

const decoded = jwt.verify(token, publicKey,
  { algorithms: ["EdDSA"], issuer: "auth-service" });
```

### Python JWT with RS256

```python
import jwt, datetime
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives import serialization

private_key = rsa.generate_private_key(public_exponent=65537, key_size=4096)
private_pem = private_key.private_bytes(serialization.Encoding.PEM,
    serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
public_pem = private_key.public_key().public_bytes(serialization.Encoding.PEM,
    serialization.PublicFormat.SubjectPublicKeyInfo)

token = jwt.encode({"sub": "user-123", "exp": datetime.datetime.utcnow() +
    datetime.timedelta(hours=1)}, private_pem, algorithm="RS256")

decoded = jwt.decode(token, public_pem, algorithms=["RS256"],
    options={"require": ["exp", "sub"]})
```

### JWT Security Rules

1. **Always specify `algorithms` in verification** -- without it, attackers can switch to `alg: none`.
2. **Validate `exp`, `iss`, `aud`** -- do not just verify the signature.
3. **Use asymmetric algorithms for multi-service architectures** -- HS256 requires the same secret everywhere.
4. **Keep tokens short-lived** -- 15-60 minutes for access tokens.
5. **Never store sensitive data in JWT payload** -- JWTs are base64-encoded, not encrypted.

## Code Signing

```python
from cryptography.hazmat.primitives.asymmetric import ed25519
from cryptography.hazmat.primitives import serialization
import hashlib

def sign_artifact(file_path: str, private_key: ed25519.Ed25519PrivateKey) -> dict:
    with open(file_path, "rb") as f:
        content = f.read()
    return {
        "file": file_path,
        "hash": hashlib.sha256(content).hexdigest(),
        "signature": private_key.sign(content).hex(),
        "public_key": private_key.public_key().public_bytes(
            serialization.Encoding.Raw, serialization.PublicFormat.Raw).hex()
    }

def verify_artifact(file_path: str, sig_metadata: dict) -> bool:
    with open(file_path, "rb") as f:
        content = f.read()
    if hashlib.sha256(content).hexdigest() != sig_metadata["hash"]:
        return False
    public_key = ed25519.Ed25519PublicKey.from_public_bytes(
        bytes.fromhex(sig_metadata["public_key"]))
    try:
        public_key.verify(bytes.fromhex(sig_metadata["signature"]), content)
        return True
    except Exception:
        return False
```

## Certificate Chains

Trust is established through chains: root CA signs intermediate CAs, which sign end-entity certificates.

```
Root CA (self-signed, in trust store)
  -> Intermediate CA (signed by Root)
       -> End-Entity Certificate (signed by Intermediate)
```

## Signature Verification Patterns

### Detached Signatures

```typescript
import { sign, verify } from "node:crypto";
import { readFileSync } from "node:fs";

function signFile(filePath: string, privateKey: string): Buffer {
  return sign(null, readFileSync(filePath), privateKey);
}

function verifyFile(filePath: string, signature: Buffer, publicKey: string): boolean {
  return verify(null, readFileSync(filePath), publicKey, signature);
}
```

## Anti-Patterns

- **Using RSA PKCS#1 v1.5 for new systems**: Use RSA-PSS or Ed25519/ECDSA. PKCS#1 v1.5 has padding oracle vulnerabilities.
- **ECDSA nonce reuse**: Leaks the private key. Use Ed25519 (deterministic by design) or RFC 6979.
- **Not validating JWT `alg` header**: Attackers can set `alg: none` or switch RS256 to HS256.
- **Same key for signing and encryption**: Different purposes require different keys.
- **Not checking certificate expiration**: Verify `notBefore` and `notAfter` dates.
- **Trusting self-signed certificates in production**: Self-signed provides encryption but not authentication.

## Production Checklist

- [ ] Ed25519 used for new signing systems (RSA-PSS or ECDSA P-256 if unavailable)
- [ ] Private keys stored securely (KMS, HSM, or encrypted at rest)
- [ ] Key sizes meet minimums (RSA: 4096 bit, ECDSA: P-256+)
- [ ] JWT algorithms explicitly specified in verification
- [ ] JWT claims validated (exp, iss, aud, sub)
- [ ] Certificate chain validation includes expiration and revocation checks
- [ ] Code signing keys separated from TLS/encryption keys
- [ ] Key rotation plan documented with signature version tracking
- [ ] Signature verification failures logged and monitored
- [ ] Public keys distributed through trusted channels (JWKS endpoints, certificate pinning)
