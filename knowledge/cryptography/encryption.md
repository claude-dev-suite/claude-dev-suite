# Encryption

## Overview

Encryption transforms plaintext data into ciphertext that can only be reversed with the correct key. This guide covers **symmetric encryption** (same key for encrypt/decrypt), **asymmetric encryption** (public/private key pairs), **envelope encryption** (combining both), and practical implementations across Node.js, Python, and Java.

## Symmetric Encryption

### AES-256-GCM (Recommended)

AES-256-GCM provides both confidentiality and integrity (authenticated encryption). GCM mode produces an authentication tag that detects tampering. This is the standard choice for application-level encryption.

**Parameters:**
- **Key**: 256 bits (32 bytes), cryptographically random
- **IV/Nonce**: 96 bits (12 bytes), unique per encryption, never reuse with the same key
- **Auth Tag**: 128 bits (16 bytes), produced during encryption, required for decryption

### Node.js

```typescript
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function encrypt(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf8");
  encrypted = Buffer.concat([encrypted, cipher.final()]);

  const tag = cipher.getAuthTag();

  // Format: iv:tag:ciphertext (all base64)
  return [
    iv.toString("base64"),
    tag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

function decrypt(encryptedStr: string, key: Buffer): string {
  const [ivB64, tagB64, ciphertextB64] = encryptedStr.split(":");
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const ciphertext = Buffer.from(ciphertextB64, "base64");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(ciphertext);
  decrypted = Buffer.concat([decrypted, decipher.final()]);

  return decrypted.toString("utf8");
}

// Generate a key
const key = randomBytes(32); // 256-bit key
const encrypted = encrypt("sensitive data", key);
const decrypted = decrypt(encrypted, key);
```

### Python

```python
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import os
import base64

def encrypt(plaintext: str, key: bytes) -> str:
    """Encrypt with AES-256-GCM. Returns iv:ciphertext (base64)."""
    nonce = os.urandom(12)  # 96-bit nonce
    aesgcm = AESGCM(key)
    # GCM appends the auth tag to the ciphertext automatically
    ciphertext = aesgcm.encrypt(nonce, plaintext.encode("utf-8"), None)

    return base64.b64encode(nonce).decode() + ":" + base64.b64encode(ciphertext).decode()

def decrypt(encrypted_str: str, key: bytes) -> str:
    """Decrypt AES-256-GCM. Input format: iv:ciphertext (base64)."""
    nonce_b64, ct_b64 = encrypted_str.split(":")
    nonce = base64.b64decode(nonce_b64)
    ciphertext = base64.b64decode(ct_b64)

    aesgcm = AESGCM(key)
    plaintext = aesgcm.decrypt(nonce, ciphertext, None)
    return plaintext.decode("utf-8")

# Generate key
key = AESGCM.generate_key(bit_length=256)
encrypted = encrypt("sensitive data", key)
decrypted = decrypt(encrypted, key)
```

### Java (JCA)

```java
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import java.security.SecureRandom;
import java.util.Base64;

public class AesGcmEncryptor {
    private static final String ALGORITHM = "AES/GCM/NoPadding";
    private static final int GCM_TAG_LENGTH = 128; // bits
    private static final int IV_LENGTH = 12;        // bytes

    public static String encrypt(String plaintext, SecretKey key) throws Exception {
        byte[] iv = new byte[IV_LENGTH];
        new SecureRandom().nextBytes(iv);

        Cipher cipher = Cipher.getInstance(ALGORITHM);
        cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(GCM_TAG_LENGTH, iv));
        byte[] ciphertext = cipher.doFinal(plaintext.getBytes("UTF-8"));

        // Prepend IV to ciphertext
        byte[] combined = new byte[iv.length + ciphertext.length];
        System.arraycopy(iv, 0, combined, 0, iv.length);
        System.arraycopy(ciphertext, 0, combined, iv.length, ciphertext.length);

        return Base64.getEncoder().encodeToString(combined);
    }

    public static String decrypt(String encrypted, SecretKey key) throws Exception {
        byte[] combined = Base64.getDecoder().decode(encrypted);
        byte[] iv = new byte[IV_LENGTH];
        byte[] ciphertext = new byte[combined.length - IV_LENGTH];
        System.arraycopy(combined, 0, iv, 0, IV_LENGTH);
        System.arraycopy(combined, IV_LENGTH, ciphertext, 0, ciphertext.length);

        Cipher cipher = Cipher.getInstance(ALGORITHM);
        cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(GCM_TAG_LENGTH, iv));
        byte[] plaintext = cipher.doFinal(ciphertext);

        return new String(plaintext, "UTF-8");
    }

    public static SecretKey generateKey() throws Exception {
        KeyGenerator keyGen = KeyGenerator.getInstance("AES");
        keyGen.init(256);
        return keyGen.generateKey();
    }
}
```

### Associated Data (AAD)

GCM supports Additional Authenticated Data -- data that is not encrypted but is integrity-protected. Use AAD for context binding (e.g., user ID, record ID) to prevent ciphertext from being moved between contexts.

```python
# Python with AAD
def encrypt_with_aad(plaintext: str, key: bytes, aad: bytes) -> str:
    nonce = os.urandom(12)
    aesgcm = AESGCM(key)
    ciphertext = aesgcm.encrypt(nonce, plaintext.encode("utf-8"), aad)
    return base64.b64encode(nonce).decode() + ":" + base64.b64encode(ciphertext).decode()

def decrypt_with_aad(encrypted_str: str, key: bytes, aad: bytes) -> str:
    nonce_b64, ct_b64 = encrypted_str.split(":")
    nonce = base64.b64decode(nonce_b64)
    ciphertext = base64.b64decode(ct_b64)
    aesgcm = AESGCM(key)
    plaintext = aesgcm.decrypt(nonce, ciphertext, aad)
    return plaintext.decode("utf-8")

# Bind encryption to a specific user
encrypted = encrypt_with_aad("SSN: 123-45-6789", key, b"user:42")
# Decryption with wrong AAD raises InvalidTag
```

## Asymmetric Encryption

### RSA-OAEP

RSA encrypts data with a public key; only the corresponding private key can decrypt. RSA is slow and limited to small payloads (key size minus padding overhead). Use it for key exchange or wrapping symmetric keys, not for bulk data.

```python
from cryptography.hazmat.primitives.asymmetric import rsa, padding
from cryptography.hazmat.primitives import hashes

# Generate key pair
private_key = rsa.generate_private_key(public_exponent=65537, key_size=4096)
public_key = private_key.public_key()

# Encrypt (with public key)
ciphertext = public_key.encrypt(
    b"secret message",
    padding.OAEP(
        mgf=padding.MGF1(algorithm=hashes.SHA256()),
        algorithm=hashes.SHA256(),
        label=None
    )
)

# Decrypt (with private key)
plaintext = private_key.decrypt(
    ciphertext,
    padding.OAEP(
        mgf=padding.MGF1(algorithm=hashes.SHA256()),
        algorithm=hashes.SHA256(),
        label=None
    )
)
```

### Ed25519 / X25519

Ed25519 is for digital signatures (see signing.md). X25519 is the corresponding key agreement algorithm for encryption. Use X25519 for Diffie-Hellman key exchange, then derive a symmetric key for actual encryption.

```python
from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives import hashes

# Key exchange
alice_private = X25519PrivateKey.generate()
alice_public = alice_private.public_key()

bob_private = X25519PrivateKey.generate()
bob_public = bob_private.public_key()

# Both derive the same shared secret
shared_secret = alice_private.exchange(bob_public)

# Derive encryption key from shared secret
derived_key = HKDF(
    algorithm=hashes.SHA256(),
    length=32,
    salt=None,
    info=b"encryption-key"
).derive(shared_secret)

# Now use derived_key with AES-256-GCM for actual encryption
```

## Envelope Encryption

Envelope encryption uses a two-tier key hierarchy: a **Data Encryption Key (DEK)** encrypts the data with AES-GCM, then a **Key Encryption Key (KEK)** encrypts the DEK. The KEK typically lives in a KMS.

```
Plaintext --> AES-GCM(DEK) --> Ciphertext
DEK --> RSA/KMS(KEK) --> Encrypted DEK
Store: Ciphertext + Encrypted DEK
```

```python
import os
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

def envelope_encrypt(plaintext: bytes, kek_encrypt_fn) -> dict:
    """Envelope encryption: generate DEK, encrypt data, wrap DEK."""
    # Generate a random Data Encryption Key
    dek = AESGCM.generate_key(bit_length=256)

    # Encrypt data with DEK
    nonce = os.urandom(12)
    aesgcm = AESGCM(dek)
    ciphertext = aesgcm.encrypt(nonce, plaintext, None)

    # Wrap DEK with KEK (e.g., KMS encrypt call)
    encrypted_dek = kek_encrypt_fn(dek)

    return {
        "ciphertext": ciphertext,
        "nonce": nonce,
        "encrypted_dek": encrypted_dek
    }

def envelope_decrypt(envelope: dict, kek_decrypt_fn) -> bytes:
    """Envelope decryption: unwrap DEK, decrypt data."""
    dek = kek_decrypt_fn(envelope["encrypted_dek"])
    aesgcm = AESGCM(dek)
    return aesgcm.decrypt(envelope["nonce"], envelope["ciphertext"], None)
```

## At-Rest vs In-Transit Encryption

| Aspect       | At-Rest                            | In-Transit                    |
| ------------ | ---------------------------------- | ----------------------------- |
| Protects     | Stored data                        | Data moving over networks     |
| Mechanism    | AES-256-GCM, envelope encryption   | TLS 1.3, mTLS                |
| Managed by   | Application or cloud provider      | Web server, load balancer     |
| Key storage  | KMS, HSM, secrets manager          | Certificate authority, certs  |
| Examples     | Database encryption, file encryption | HTTPS, gRPC TLS, VPN        |

## Field-Level Encryption

Encrypt individual fields within a record rather than the entire database. This provides fine-grained access control: different keys for different sensitivity levels.

```typescript
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

interface UserRecord {
  id: string;
  name: string; // Not encrypted
  email: string; // Encrypted
  ssn: string; // Encrypted with different key
}

class FieldEncryptor {
  constructor(private keys: Record<string, Buffer>) {}

  encryptField(value: string, keyName: string): string {
    const key = this.keys[keyName];
    if (!key) throw new Error(`Unknown key: ${keyName}`);
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    let enc = cipher.update(value, "utf8");
    enc = Buffer.concat([enc, cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${keyName}:${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
  }

  decryptField(encrypted: string): string {
    const [keyName, ivB64, tagB64, ctB64] = encrypted.split(":");
    const key = this.keys[keyName];
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(ivB64, "base64")
    );
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    let dec = decipher.update(Buffer.from(ctB64, "base64"));
    dec = Buffer.concat([dec, decipher.final()]);
    return dec.toString("utf8");
  }
}

// Usage
const encryptor = new FieldEncryptor({
  pii: randomBytes(32),
  sensitive: randomBytes(32),
});

const record: UserRecord = {
  id: "user-1",
  name: "Alice",
  email: encryptor.encryptField("alice@example.com", "pii"),
  ssn: encryptor.encryptField("123-45-6789", "sensitive"),
};
```

## Anti-Patterns

- **Using ECB mode**: ECB encrypts identical plaintext blocks to identical ciphertext blocks, leaking patterns. Always use GCM or CTR modes.
- **Reusing IVs/nonces**: Reusing a nonce with the same key in GCM completely breaks confidentiality and authenticity. Generate a fresh random nonce for every encryption.
- **Using AES-CBC without HMAC**: CBC provides confidentiality but not integrity. It is vulnerable to padding oracle attacks. Use GCM instead, or pair CBC with HMAC-then-encrypt (but GCM is simpler).
- **Hardcoding encryption keys**: Keys in source code are trivially extractable. Use KMS, environment variables, or secrets managers.
- **Using RSA for bulk encryption**: RSA is limited to small payloads and is slow. Use envelope encryption: RSA wraps a symmetric key, AES-GCM encrypts the data.
- **Encrypting without authentication**: Unauthenticated encryption (e.g., raw AES-CTR) allows ciphertext modification. Always use authenticated encryption (GCM, ChaCha20-Poly1305).
- **Using 128-bit keys when 256 is available**: AES-256 provides a larger security margin against quantum computing threats at minimal performance cost.

## Production Checklist

- [ ] Using AES-256-GCM or ChaCha20-Poly1305 for symmetric encryption
- [ ] IVs/nonces are unique per encryption, generated with cryptographic RNG
- [ ] Encryption keys stored in KMS or secrets manager, not in code
- [ ] Key rotation procedure documented and tested
- [ ] AAD used to bind ciphertext to its context where applicable
- [ ] Envelope encryption used for data at rest (DEK + KEK)
- [ ] Field-level encryption applied to PII/sensitive fields
- [ ] TLS 1.2+ enforced for all data in transit
- [ ] Decryption failures logged and monitored (potential tampering)
- [ ] Key access audited (who accessed which key, when)
- [ ] Backup encryption keys stored separately from encrypted data
