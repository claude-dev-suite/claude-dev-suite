# iOS Keychain Services + Secure Enclave — Deep Reference

Hardware-backed secret storage for wallet apps.

## Keychain Services Overview

Apple's encrypted key-value store. Persists across app uninstall (unless `*ThisDeviceOnly` accessibility set). Used for:
- Auth tokens (OAuth, JWT refresh)
- Encryption keys (wrapping the wallet seed)
- Passwords
- Certificates

Items have:
- **Class**: `kSecClassGenericPassword`, `kSecClassInternetPassword`, `kSecClassKey`, `kSecClassCertificate`, `kSecClassIdentity`
- **Account/Service**: identifies the item (composite key)
- **Accessibility**: when item can be accessed
- **Access Control**: biometric/passcode requirements
- **Access Group**: shared between apps with same group entitlement

## Accessibility Levels

Most → least restrictive:

| Constant | When accessible | Backed up | Notes |
|---|---|---|---|
| `WhenPasscodeSetThisDeviceOnly` | Only when device unlocked + passcode set | ❌ Not in iCloud, not restored | **Use for wallet seeds** — irrecoverable if device wiped, but non-portable |
| `WhenUnlockedThisDeviceOnly` | Only when device unlocked | ❌ Not in iCloud | Tokens, secrets that shouldn't migrate |
| `WhenUnlocked` | Only when device unlocked | ✅ iCloud Keychain (if user enabled) | Default for typical secrets |
| `AfterFirstUnlockThisDeviceOnly` | After first unlock since boot | ❌ Not in iCloud | Background work needs |
| `AfterFirstUnlock` | After first unlock | ✅ iCloud Keychain | Background work, syncable |
| `Always` (deprecated) | Always | ✅ | **Don't use** |

For BHODL-style wallet: **`WhenPasscodeSetThisDeviceOnly`** for seed encryption keys.

## Saving an Item

```swift
import Security
import Foundation

enum KeychainError: Error {
    case status(OSStatus)
    case unexpected
}

func save(
    data: Data,
    service: String,
    account: String,
    accessGroup: String? = nil,
    accessibility: CFString = kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly,
    accessControl: SecAccessControl? = nil
) throws {
    var query: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: service,
        kSecAttrAccount as String: account,
        kSecValueData as String: data,
    ]

    if let accessGroup {
        query[kSecAttrAccessGroup as String] = accessGroup
    }

    if let accessControl {
        query[kSecAttrAccessControl as String] = accessControl
    } else {
        query[kSecAttrAccessible as String] = accessibility
    }

    // Delete any existing item first
    SecItemDelete(query as CFDictionary)

    let status = SecItemAdd(query as CFDictionary, nil)
    guard status == errSecSuccess else { throw KeychainError.status(status) }
}
```

## Loading an Item

```swift
func load(
    service: String,
    account: String,
    accessGroup: String? = nil,
    prompt: String? = nil
) throws -> Data {
    var query: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: service,
        kSecAttrAccount as String: account,
        kSecReturnData as String: true,
        kSecMatchLimit as String: kSecMatchLimitOne,
    ]

    if let accessGroup {
        query[kSecAttrAccessGroup as String] = accessGroup
    }

    if let prompt {
        query[kSecUseOperationPrompt as String] = prompt    // shown if biometric required
    }

    var item: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &item)

    guard status == errSecSuccess else {
        throw KeychainError.status(status)
    }
    guard let data = item as? Data else {
        throw KeychainError.unexpected
    }

    return data
}
```

## Updating

```swift
func update(data: Data, service: String, account: String) throws {
    let query: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: service,
        kSecAttrAccount as String: account,
    ]

    let updates: [String: Any] = [kSecValueData as String: data]

    let status = SecItemUpdate(query as CFDictionary, updates as CFDictionary)
    guard status == errSecSuccess else { throw KeychainError.status(status) }
}
```

## Deleting

```swift
func delete(service: String, account: String) throws {
    let query: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: service,
        kSecAttrAccount as String: account,
    ]

    let status = SecItemDelete(query as CFDictionary)
    guard status == errSecSuccess || status == errSecItemNotFound else {
        throw KeychainError.status(status)
    }
}
```

## Access Control (Biometric Binding)

```swift
import LocalAuthentication

func makeBiometricAccessControl() -> SecAccessControl {
    var error: Unmanaged<CFError>?
    let access = SecAccessControlCreateWithFlags(
        nil,
        kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly,
        [.privateKeyUsage, .biometryCurrentSet],            // require Face/TouchID
        &error
    )
    if let error = error?.takeRetainedValue() {
        fatalError("\(error)")
    }
    return access!
}
```

`SecAccessControlCreateFlags`:

| Flag | Effect |
|---|---|
| `.userPresence` | Requires biometric OR passcode |
| `.biometryAny` | Any enrolled biometric (changing biometrics keeps key valid) |
| `.biometryCurrentSet` | Current biometrics — invalidated when added/removed |
| `.devicePasscode` | Passcode only |
| `.privateKeyUsage` | For SEP keys |
| `.applicationPassword` | App-defined password |
| `.or` / `.and` | Combine flags |

For wallet seeds, prefer **`.biometryCurrentSet`** + **`WhenPasscodeSetThisDeviceOnly`** — invalidates if attacker enrolls new face/finger.

## Access Groups (Sharing Between Apps/Extensions)

In Capabilities tab, add Keychain Sharing entitlement:

```xml
<!-- entitlements file -->
<key>keychain-access-groups</key>
<array>
    <string>$(AppIdentifierPrefix)com.bhodl.shared</string>
</array>
```

```swift
let group = "TEAMID.com.bhodl.shared"
try save(data: tokenData, service: "auth", account: "user", accessGroup: group)

// Read from extension or another app with same group
let token = try load(service: "auth", account: "user", accessGroup: group)
```

## iCloud Keychain Sync

For non-`ThisDeviceOnly` items, set `kSecAttrSynchronizable = true`:

```swift
query[kSecAttrSynchronizable as String] = true
query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
```

**Never** sync wallet seeds — leaks across devices.

## Secure Enclave (SEP)

Hardware-isolated cryptographic processor. Generates and uses P-256 ECC keys without ever exposing the private material.

### Generate Key

```swift
import CryptoKit
import LocalAuthentication

func generateSEPKey() throws -> SecureEnclave.P256.Signing.PrivateKey {
    let access = SecAccessControlCreateWithFlags(
        nil,
        kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly,
        [.privateKeyUsage, .biometryCurrentSet],
        nil
    )!

    let key = try SecureEnclave.P256.Signing.PrivateKey(
        accessControl: access,
        authenticationContext: LAContext()
    )

    return key
}
```

### Persist Key Reference

The private key never leaves SEP, but you must persist its **representation** (an opaque blob) to recreate the reference later.

```swift
let key = try generateSEPKey()
let dataRepresentation = key.dataRepresentation
try save(data: dataRepresentation, service: "sep_keys", account: "wallet_signing")

// Later
let blob = try load(service: "sep_keys", account: "wallet_signing")
let restored = try SecureEnclave.P256.Signing.PrivateKey(
    dataRepresentation: blob,
    authenticationContext: LAContext()
)
```

### Sign / Verify

```swift
let key = try generateSEPKey()
let publicKey = key.publicKey                       // exportable

let data = "message to sign".data(using: .utf8)!
let signature = try key.signature(for: data)        // prompts biometric

// Verify with public key (anywhere, no SEP needed)
let isValid = publicKey.isValidSignature(signature, for: data)
```

### Key Agreement (ECDH)

```swift
let alice = try generateSEPKey()
let bob = try generateSEPKey()

let shared = try alice.sharedSecretFromKeyAgreement(with: bob.publicKey)
let symKey = shared.hkdfDerivedSymmetricKey(
    using: SHA256.self,
    salt: Data(),
    sharedInfo: Data(),
    outputByteCount: 32
)
```

For BHODL: SEP is **not** for Bitcoin secp256k1 keys (incompatible curve). Use SEP for **wrapping the AES key** that encrypts the seed:

1. Generate seed externally (BIP39)
2. Generate AES-GCM key (random)
3. Encrypt seed with AES key
4. Use SEP P-256 key to encrypt the AES key (via ECIES or HPKE)
5. Store encrypted seed + encrypted AES key in Keychain

## Attestation (DCAppAttest)

Hardware attestation that proves the app is genuine and running on real hardware. Use for server-side device integrity checks.

```swift
import DeviceCheck

let service = DCAppAttestService.shared
guard service.isSupported else { return }

// One-time per install
service.generateKey { keyId, error in
    guard let keyId else { return }
    let challenge = "...".data(using: .utf8)!
    service.attestKey(keyId, clientDataHash: SHA256.hash(data: challenge).withUnsafeBytes { Data($0) }) { attestation, error in
        // Send attestation + keyId + challenge to server
    }
}

// Each request
service.generateAssertion(keyId, clientDataHash: requestHash) { assertion, error in
    // Send assertion with API request
}
```

Server verifies via Apple's public attestation root.

## Common OSStatus Codes

| Status | Constant | Meaning |
|---|---|---|
| 0 | `errSecSuccess` | OK |
| -25291 | `errSecNotAvailable` | Service unavailable |
| -25299 | `errSecDuplicateItem` | Item exists; use update or delete first |
| -25300 | `errSecItemNotFound` | No matching item |
| -25303 | `errSecParam` | Bad parameters |
| -25308 | `errSecInteractionNotAllowed` | UI required (e.g., locked device) |
| -34018 | `errSecMissingEntitlement` | Missing keychain access entitlement |
| -128 | `errSecUserCanceled` | User cancelled biometric prompt |

## Backups

Items with `*ThisDeviceOnly` accessibility are NOT included in:
- iTunes/Finder backups
- iCloud backups
- Restore from another device

If user restores from backup, these items are **gone**. Plan for this:

```swift
struct WalletStorage {
    func loadOrPromptRestore() async throws -> Wallet {
        do {
            let seed = try keychain.load(service: "wallet", account: "seed")
            return Wallet(seed: seed)
        } catch KeychainError.status(errSecItemNotFound) {
            // Likely restored from backup — prompt user to re-import
            await promptForRecovery()
            throw WalletError.requiresRecovery
        }
    }
}
```

## Pitfalls

| Pitfall | Fix |
|---|---|
| Storing seed in `WhenUnlocked` (syncable) | Use `WhenPasscodeSetThisDeviceOnly` |
| Forgetting to delete before save | `errSecDuplicateItem` |
| Not handling `errSecItemNotFound` | Treat as "first run" or "post-restore" |
| Using SEP keys for Bitcoin secp256k1 | Wrong curve — wrap AES key with SEP, derive Bitcoin keys from seed |
| Force-unwrapping `SecAccessControlCreateWithFlags` | Check error |
| Asking biometric on every minor action | UX — auth once per session, gate sensitive ops only |
| `.biometryAny` for wallet keys | Compromised if attacker can enroll — use `.biometryCurrentSet` |
| Persisting SEP key without `dataRepresentation` | Key gone after process exits |
| Treating Keychain items as "always there" | Plan for restore-wipes; have recovery flow |
| String-based seed manipulation | Strings can't be wiped from memory; use `Data` and `data.resetBytes(in:)` |
| Forgetting `kSecAttrAccessGroup` in extension | Items invisible from extension |
| Sync error: `errSecItemNotFound` after iCloud restore | Detect and re-fetch from server (for non-seed secrets) |
