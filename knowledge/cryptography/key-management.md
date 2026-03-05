# Key Management

## Overview

Key management is the process of generating, storing, distributing, rotating, and revoking cryptographic keys. Poor key management renders even the strongest encryption useless. This guide covers the key lifecycle, cloud KMS services, key derivation functions, and operational best practices.

## Key Lifecycle

```
Generation --> Storage --> Distribution --> Usage --> Rotation --> Revocation --> Destruction
```

### 1. Generation

Keys must be generated using cryptographically secure random number generators (CSPRNG). Never derive keys from weak sources (timestamps, Math.random, sequential counters).

```typescript
import { randomBytes } from "node:crypto";

// AES-256 key
const aesKey = randomBytes(32); // 256 bits

// HMAC key
const hmacKey = randomBytes(64); // 512 bits recommended for HMAC-SHA256
```

```python
import os

aes_key = os.urandom(32)   # 256 bits from /dev/urandom
hmac_key = os.urandom(64)
```

```java
import java.security.SecureRandom;

byte[] aesKey = new byte[32];
new SecureRandom().nextBytes(aesKey);
```

### 2. Storage

Keys must never be stored in source code, configuration files committed to version control, or plaintext on disk.

| Storage Method | Security Level | Use Case |
| -------------- | -------------- | -------- |
| Environment variables | Low | Development only |
| Secrets manager (AWS Secrets Manager, Vault) | High | Application secrets |
| KMS (AWS KMS, Azure Key Vault) | Very high | Encryption keys (key never leaves KMS) |
| HSM (Hardware Security Module) | Highest | Regulatory compliance, root keys |

### 3. Distribution

- **Never transmit keys over unencrypted channels** (email, chat, HTTP).
- Use envelope encryption: wrap keys with a KEK before transmitting.
- Use Diffie-Hellman key exchange for establishing shared keys between parties.
- For applications, inject keys via secrets managers or KMS APIs at runtime.

### 4. Rotation

Key rotation limits the blast radius of a compromised key. Define rotation periods based on data sensitivity.

| Key Type | Recommended Rotation Period |
| -------- | --------------------------- |
| Data Encryption Key (DEK) | 90 days or per-record |
| Key Encryption Key (KEK) | 1 year |
| API signing key | 90 days |
| TLS certificate | 90 days (Let's Encrypt default) |
| Root CA key | 5-10 years (or never; protect offline) |

### 5. Revocation

When a key is compromised or retired:
1. Immediately stop using it for new operations
2. Re-encrypt all data protected by the compromised key with a new key
3. Invalidate any tokens or signatures created with the key
4. Log and alert on any continued use

### 6. Destruction

Destroyed keys must be irrecoverable. Ensure all copies (backups, caches, replicas) are destroyed.

## Cloud KMS Services

### AWS KMS

```python
import boto3

kms = boto3.client("kms")

# Create a customer-managed key
response = kms.create_key(
    Description="Application encryption key",
    KeyUsage="ENCRYPT_DECRYPT",
    KeySpec="SYMMETRIC_DEFAULT"  # AES-256-GCM
)
key_id = response["KeyMetadata"]["KeyId"]

# Encrypt data (up to 4 KB directly; use envelope encryption for larger data)
encrypted = kms.encrypt(
    KeyId=key_id,
    Plaintext=b"sensitive data"
)
ciphertext_blob = encrypted["CiphertextBlob"]

# Decrypt
decrypted = kms.decrypt(
    KeyId=key_id,
    CiphertextBlob=ciphertext_blob
)
plaintext = decrypted["Plaintext"]

# Generate a Data Encryption Key for envelope encryption
dek_response = kms.generate_data_key(
    KeyId=key_id,
    KeySpec="AES_256"
)
plaintext_dek = dek_response["Plaintext"]       # Use this to encrypt data locally
encrypted_dek = dek_response["CiphertextBlob"]  # Store this alongside ciphertext
# Immediately discard plaintext_dek from memory after use

# Enable automatic key rotation (rotates annually)
kms.enable_key_rotation(KeyId=key_id)
```

### Azure Key Vault

```python
from azure.identity import DefaultAzureCredential
from azure.keyvault.keys import KeyClient
from azure.keyvault.keys.crypto import CryptographyClient, EncryptionAlgorithm

credential = DefaultAzureCredential()
vault_url = "https://my-vault.vault.azure.net/"

# Key management
key_client = KeyClient(vault_url, credential)
key = key_client.create_rsa_key("my-key", size=4096)

# Encryption
crypto_client = CryptographyClient(key.id, credential)
result = crypto_client.encrypt(EncryptionAlgorithm.rsa_oaep_256, b"sensitive data")
ciphertext = result.ciphertext

# Decryption
result = crypto_client.decrypt(EncryptionAlgorithm.rsa_oaep_256, ciphertext)
plaintext = result.plaintext
```

### HashiCorp Vault

```bash
# Enable the transit secrets engine (encryption as a service)
vault secrets enable transit

# Create an encryption key
vault write -f transit/keys/my-app-key type=aes256-gcm96

# Encrypt (data must be base64-encoded)
vault write transit/encrypt/my-app-key \
  plaintext=$(echo -n "sensitive data" | base64)

# Decrypt
vault write transit/decrypt/my-app-key \
  ciphertext="vault:v1:..."

# Rotate key (previous versions kept for decryption)
vault write -f transit/keys/my-app-key/rotate

# Set minimum decryption version (prevent use of old key versions)
vault write transit/keys/my-app-key min_decryption_version=2
```

```python
import hvac

client = hvac.Client(url="https://vault.example.com", token="s.xxxxx")

# Encrypt
response = client.secrets.transit.encrypt_data(
    name="my-app-key",
    plaintext=base64.b64encode(b"sensitive data").decode()
)
ciphertext = response["data"]["ciphertext"]

# Decrypt
response = client.secrets.transit.decrypt_data(
    name="my-app-key",
    ciphertext=ciphertext
)
plaintext = base64.b64decode(response["data"]["plaintext"])
```

## Key Derivation Functions

Key derivation functions (KDFs) derive one or more cryptographic keys from a source key material. They are essential for converting shared secrets (e.g., Diffie-Hellman output) or passwords into encryption keys.

### HKDF (HMAC-based Key Derivation Function)

Use HKDF when you have high-entropy input material (e.g., shared secret from key exchange). Do NOT use HKDF for passwords (use argon2/bcrypt/scrypt instead).

```python
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives import hashes

# Derive multiple keys from one shared secret
def derive_keys(shared_secret: bytes) -> tuple[bytes, bytes]:
    """Derive separate encryption and MAC keys from a shared secret."""
    encryption_key = HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=None,                          # Optional but recommended
        info=b"encryption-key-v1"           # Context string
    ).derive(shared_secret)

    mac_key = HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=None,
        info=b"mac-key-v1"
    ).derive(shared_secret)

    return encryption_key, mac_key
```

```typescript
import { hkdf } from "node:crypto";
import { promisify } from "node:util";

const hkdfAsync = promisify(hkdf);

async function deriveKey(
  sharedSecret: Buffer,
  info: string
): Promise<Buffer> {
  const derived = await hkdfAsync(
    "sha256",
    sharedSecret,
    Buffer.alloc(0), // salt (empty = no salt)
    info,
    32 // output length
  );
  return Buffer.from(derived);
}
```

### PBKDF2

PBKDF2 is a password-based key derivation function. It is acceptable when argon2/scrypt is not available (e.g., FIPS compliance), but argon2id is preferred for new systems.

```python
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes
import os

salt = os.urandom(16)
kdf = PBKDF2HMAC(
    algorithm=hashes.SHA256(),
    length=32,
    salt=salt,
    iterations=600000        # OWASP recommended minimum for SHA-256
)
key = kdf.derive(b"user-password")
```

```typescript
import { pbkdf2, randomBytes } from "node:crypto";
import { promisify } from "node:util";

const pbkdf2Async = promisify(pbkdf2);

const salt = randomBytes(16);
const key = await pbkdf2Async("user-password", salt, 600000, 32, "sha256");
```

## Key Wrapping

Key wrapping encrypts a key with another key, allowing secure storage or transport of encryption keys.

```python
from cryptography.hazmat.primitives.keywrap import aes_key_wrap, aes_key_unwrap
import os

kek = os.urandom(32)   # Key Encryption Key (must be 16, 24, or 32 bytes)
dek = os.urandom(32)   # Data Encryption Key to wrap

# Wrap
wrapped_dek = aes_key_wrap(kek, dek)

# Unwrap
unwrapped_dek = aes_key_unwrap(kek, wrapped_dek)
assert unwrapped_dek == dek
```

## Separation of Duties

Implement separation of duties so that no single person or system has access to all components needed to decrypt data:

1. **Key administrator**: Creates and manages KMS keys, sets access policies. Cannot access encrypted data.
2. **Application**: Uses KMS to encrypt/decrypt DEKs. Cannot modify key policies.
3. **Data administrator**: Manages databases and storage. Cannot access encryption keys.
4. **Auditor**: Reviews key access logs. Has read-only access to audit trails.

```
Key Admin --> Creates KMS key, sets IAM policies
Application --> Calls KMS to wrap/unwrap DEKs
DBA         --> Manages encrypted data in databases
Auditor     --> Reviews CloudTrail/audit logs
```

### IAM Policy Example (AWS)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowApplicationEncryptDecrypt",
      "Effect": "Allow",
      "Principal": {"AWS": "arn:aws:iam::123456789012:role/app-role"},
      "Action": ["kms:Encrypt", "kms:Decrypt", "kms:GenerateDataKey"],
      "Resource": "*"
    },
    {
      "Sid": "AllowKeyAdminManagement",
      "Effect": "Allow",
      "Principal": {"AWS": "arn:aws:iam::123456789012:role/key-admin-role"},
      "Action": ["kms:CreateKey", "kms:PutKeyPolicy", "kms:EnableKeyRotation"],
      "Resource": "*"
    }
  ]
}
```

## Key Rotation Implementation

```typescript
// Application-level key rotation with version tracking
interface EncryptedRecord {
  keyVersion: number;
  ciphertext: string;
}

class KeyRotator {
  private keys: Map<number, Buffer>; // version -> key
  private currentVersion: number;

  constructor(keys: Map<number, Buffer>, currentVersion: number) {
    this.keys = keys;
    this.currentVersion = currentVersion;
  }

  encrypt(plaintext: string): EncryptedRecord {
    const key = this.keys.get(this.currentVersion)!;
    return {
      keyVersion: this.currentVersion,
      ciphertext: encryptAesGcm(plaintext, key),
    };
  }

  decrypt(record: EncryptedRecord): string {
    const key = this.keys.get(record.keyVersion);
    if (!key) throw new Error(`Key version ${record.keyVersion} not found`);
    return decryptAesGcm(record.ciphertext, key);
  }

  // Re-encrypt a record with the current key version
  reEncrypt(record: EncryptedRecord): EncryptedRecord {
    const plaintext = this.decrypt(record);
    return this.encrypt(plaintext);
  }
}
```

## Anti-Patterns

- **Hardcoding keys in source code**: Keys in code are visible in version control, builds, and logs. Use KMS or secrets managers.
- **Using the same key for encryption and MAC**: Derive separate keys for different purposes using HKDF with distinct `info` parameters.
- **Never rotating keys**: Long-lived keys increase the blast radius of compromise. Define and enforce rotation policies.
- **Storing keys alongside encrypted data**: If an attacker accesses the storage, they get both. Keys and ciphertext must be separated.
- **Using PBKDF2 with low iterations**: Below 600,000 iterations for SHA-256 is insufficient. Better yet, use argon2id for password-derived keys.
- **Not versioning keys**: Without key versions, rotation requires re-encrypting all data simultaneously. Version keys so old ciphertext can still be decrypted during migration.
- **Skipping key destruction**: Retired keys must be actually deleted from all locations, including backups and caches.

## Production Checklist

- [ ] Keys generated using CSPRNG (os.urandom, crypto.randomBytes, SecureRandom)
- [ ] Keys stored in KMS, HSM, or secrets manager -- never in code or config files
- [ ] Key rotation schedule defined and automated
- [ ] Key versions tracked in encrypted records for graceful rotation
- [ ] Separation of duties: key admins, application, DBA, auditors have distinct roles
- [ ] Key access audit logging enabled (CloudTrail, Vault audit, etc.)
- [ ] Envelope encryption used (DEK encrypted by KEK in KMS)
- [ ] HKDF used to derive purpose-specific keys from shared secrets
- [ ] Key destruction procedure documented and tested
- [ ] Disaster recovery: backup keys stored in separate, secured location
- [ ] Minimum key sizes enforced (AES-256, RSA-4096, Ed25519)
