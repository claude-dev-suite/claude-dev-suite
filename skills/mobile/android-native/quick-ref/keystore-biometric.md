# Android Keystore + BiometricPrompt — Deep Reference

Hardware-backed key storage with biometric gating. Critical for wallet apps storing seed encryption keys.

## Hardware Layers

| Layer | Description | Detection |
|---|---|---|
| **TEE (TrustZone)** | Secure CPU mode, key material isolated from OS | Default on most modern devices |
| **StrongBox** | Dedicated tamper-resistant hardware (separate chip, e.g., Titan M / Pixel) | Pixel 3+, some Samsung flagships |
| **Software** | Keys in app sandbox (no hardware) | Older/cheap devices, emulators |

```kotlin
fun checkSecurityLevel(context: Context): String {
    val km = context.getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
    return when {
        context.packageManager.hasSystemFeature(PackageManager.FEATURE_STRONGBOX_KEYSTORE) ->
            "StrongBox available"
        else -> "TEE only (most devices)"
    }
}
```

Or via `KeyInfo`:

```kotlin
val keyFactory = KeyFactory.getInstance(privateKey.algorithm, "AndroidKeyStore")
val keyInfo = keyFactory.getKeySpec(privateKey, KeyInfo::class.java)
val securityLevel = keyInfo.securityLevel    // KeyProperties.SECURITY_LEVEL_*
```

`SECURITY_LEVEL_STRONGBOX` > `SECURITY_LEVEL_TRUSTED_ENVIRONMENT` > `SECURITY_LEVEL_SOFTWARE` > `SECURITY_LEVEL_UNKNOWN`.

## KeyGenParameterSpec — Full Reference

```kotlin
KeyGenParameterSpec.Builder(
    "wallet_seed_key",
    KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
)
    // === Algorithm options ===
    .setKeySize(256)                                      // AES-256
    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)

    // === User authentication binding ===
    .setUserAuthenticationRequired(true)
    .setUserAuthenticationParameters(
        validityDurationSeconds = 0,                      // 0 = require auth on EACH use
                                                          // >0 = valid for N seconds after auth
        type = KeyProperties.AUTH_BIOMETRIC_STRONG        // or AUTH_DEVICE_CREDENTIAL
                or KeyProperties.AUTH_DEVICE_CREDENTIAL,
    )
    .setInvalidatedByBiometricEnrollment(true)            // Invalidate if user adds new biometric
    .setUserPresenceRequired(true)                        // Physical user presence (Android 12+)

    // === Storage ===
    .setIsStrongBoxBacked(true)                           // Prefer StrongBox if available
    .setUnlockedDeviceRequired(true)                      // Only usable when device unlocked

    // === Misc ===
    .setRandomizedEncryptionRequired(true)                // GCM IV must be random
    .setKeyValidityStart(Date())
    .setKeyValidityEnd(Date(System.currentTimeMillis() + 365L * 86400 * 1000))

    // === Attestation ===
    .setAttestationChallenge("server-provided-challenge".toByteArray())
    .build()
```

### setIsStrongBoxBacked Fallback

```kotlin
fun generateKeyWithFallback(alias: String): SecretKey {
    val builder = KeyGenParameterSpec.Builder(
        alias,
        KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
    ).apply {
        setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        setKeySize(256)
    }

    return try {
        // Try StrongBox first
        builder.setIsStrongBoxBacked(true).buildAndGenerate()
    } catch (e: StrongBoxUnavailableException) {
        // Fall back to TEE
        builder.setIsStrongBoxBacked(false).buildAndGenerate()
    }
}

private fun KeyGenParameterSpec.Builder.buildAndGenerate(): SecretKey {
    val keyGen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
    keyGen.init(build())
    return keyGen.generateKey()
}
```

## Key Attestation

Get a certificate chain from Google attesting that the key was generated in real Android Keystore (not on rooted device, emulator, etc.). Used for:
- Server-side device integrity verification
- Hardware-backed identity for wallets

```kotlin
fun getAttestationChain(alias: String): List<X509Certificate> {
    val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    val chain = keyStore.getCertificateChain(alias) ?: return emptyList()
    return chain.map { it as X509Certificate }
}

// Send chain to server, server verifies:
//  1. Root CA matches Google's hardware attestation root
//  2. Extension OID 1.3.6.1.4.1.11129.2.1.17 contains Keystore attestation extension
//  3. Decoded extension proves: TEE/StrongBox security level, OS version, key purpose
```

Server-side libraries: `google-keyattestation` (Java), `android-keystore-attestation` (Rust).

## Key Lifecycle

```kotlin
// Check if key exists
val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
val exists = ks.containsAlias("wallet_seed_key")

// List all aliases
val aliases = ks.aliases().toList()

// Delete key
ks.deleteEntry("wallet_seed_key")

// Get info about existing key
val key = ks.getKey("wallet_seed_key", null)
val factory = if (key is SecretKey)
    SecretKeyFactory.getInstance(key.algorithm, "AndroidKeyStore")
else
    KeyFactory.getInstance(key!!.algorithm, "AndroidKeyStore")

val info = factory.getKeySpec(key, KeyInfo::class.java)
println("Hardware-backed: ${info.isInsideSecureHardware}")
println("User auth required: ${info.isUserAuthenticationRequired}")
println("Validity: ${info.keyValidityStart} - ${info.keyValidityForOriginationEnd}")
```

## Key Invalidation

Keys are automatically invalidated when:
- User removes screen lock (if `setUserAuthenticationRequired(true)`)
- User adds new biometric enrollment (if `setInvalidatedByBiometricEnrollment(true)`)
- User factory-resets the device

Detect with `KeyPermanentlyInvalidatedException`:

```kotlin
try {
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, iv))
    cipher.doFinal(ciphertext)
} catch (e: KeyPermanentlyInvalidatedException) {
    // Key gone — prompt user to re-authenticate / re-import seed
    deleteKey("wallet_seed_key")
    promptUserToRestoreFromBackup()
}
```

## BiometricPrompt — Full Reference

### Authenticator Types

| Constant | Strength | Notes |
|---|---|---|
| `BIOMETRIC_STRONG` | Class 3 (CDD-defined) | Required for crypto binding; FAR ≤ 1/100,000 |
| `BIOMETRIC_WEAK` | Class 2 | OK for unlock, NOT for crypto binding |
| `DEVICE_CREDENTIAL` | PIN/Pattern/Password | Fallback when biometric not available |

```kotlin
.setAllowedAuthenticators(
    BiometricManager.Authenticators.BIOMETRIC_STRONG or
    BiometricManager.Authenticators.DEVICE_CREDENTIAL
)
```

When using `DEVICE_CREDENTIAL` together with biometric, `setNegativeButtonText` is NOT allowed (system shows "Use PIN" instead).

### Crypto Object Modes

```kotlin
// Cipher mode (encrypt/decrypt)
val cipher = Cipher.getInstance("AES/GCM/NoPadding")
cipher.init(Cipher.ENCRYPT_MODE, key)
prompt.authenticate(info, BiometricPrompt.CryptoObject(cipher))

// Signature mode (sign data)
val signature = Signature.getInstance("SHA256withECDSA")
signature.initSign(privateKey)
prompt.authenticate(info, BiometricPrompt.CryptoObject(signature))

// MAC mode (HMAC)
val mac = Mac.getInstance("HmacSHA256")
mac.init(macKey)
prompt.authenticate(info, BiometricPrompt.CryptoObject(mac))
```

After `onAuthenticationSucceeded`, the cipher/signature/mac is "unlocked" for one operation.

### Error Codes

| Code | Constant | Meaning |
|---|---|---|
| 1 | `ERROR_HW_UNAVAILABLE` | Sensor temporarily unavailable |
| 2 | `ERROR_UNABLE_TO_PROCESS` | Sensor couldn't process |
| 3 | `ERROR_TIMEOUT` | Auth took too long |
| 4 | `ERROR_NO_SPACE` | Storage full (rare) |
| 5 | `ERROR_CANCELED` | System cancelled |
| 7 | `ERROR_LOCKOUT` | Too many failed attempts (try later) |
| 9 | `ERROR_LOCKOUT_PERMANENT` | Locked until other auth succeeds |
| 10 | `ERROR_USER_CANCELED` | User pressed Cancel |
| 11 | `ERROR_NO_BIOMETRICS` | No biometrics enrolled |
| 12 | `ERROR_HW_NOT_PRESENT` | No biometric hardware |
| 14 | `ERROR_NO_DEVICE_CREDENTIAL` | No PIN/Pattern/Password set |
| 15 | `ERROR_SECURITY_UPDATE_REQUIRED` | OS security update needed |

```kotlin
override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
    when (errorCode) {
        BiometricPrompt.ERROR_USER_CANCELED,
        BiometricPrompt.ERROR_NEGATIVE_BUTTON -> { /* user cancelled — no-op */ }
        BiometricPrompt.ERROR_LOCKOUT,
        BiometricPrompt.ERROR_LOCKOUT_PERMANENT -> showLockoutMessage()
        BiometricPrompt.ERROR_NO_BIOMETRICS -> promptToEnroll()
        else -> showError(errString.toString())
    }
}
```

## Wallet Pattern: Seed Storage

Recommended for BHODL-style wallets:

1. **Generate seed** (BIP39) outside Keystore (e.g., from Rust BDK)
2. **Generate AES-256 wrapping key** in Keystore with `setUserAuthenticationRequired(true)` + `setUserAuthenticationParameters(0, AUTH_BIOMETRIC_STRONG)`
3. **Encrypt seed** with wrapping key (AES-GCM)
4. **Store ciphertext** in app's `filesDir` (or EncryptedSharedPreferences)
5. **On unlock**: BiometricPrompt → unlock cipher → decrypt seed → derive Bitcoin keys
6. **In memory**: zero seed bytes after derivation; keep only derived keys

```kotlin
class WalletStorage(private val context: Context) {

    private val keyAlias = "wallet_seed_wrap_key"
    private val seedFile = File(context.filesDir, "wallet.encrypted")

    fun isInitialized(): Boolean = seedFile.exists()

    suspend fun saveSeed(activity: FragmentActivity, seedBytes: ByteArray) {
        val key = generateOrGetKey()
        val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply {
            init(Cipher.ENCRYPT_MODE, key)
        }

        // Bind to biometric for the encrypt operation too (defense in depth)
        val unlockedCipher = authenticateWithCipher(activity, cipher)

        val ciphertext = unlockedCipher.doFinal(seedBytes)
        seedFile.writeBytes(unlockedCipher.iv + ciphertext)

        seedBytes.fill(0)                                 // zero out plaintext
    }

    suspend fun loadSeed(activity: FragmentActivity): ByteArray {
        val blob = seedFile.readBytes()
        val iv = blob.sliceArray(0..11)
        val ciphertext = blob.sliceArray(12 until blob.size)

        val key = (KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
            .getEntry(keyAlias, null) as KeyStore.SecretKeyEntry).secretKey

        val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply {
            init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, iv))
        }

        val unlockedCipher = authenticateWithCipher(activity, cipher)
        return unlockedCipher.doFinal(ciphertext)
    }

    private fun generateOrGetKey(): SecretKey {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        if (ks.containsAlias(keyAlias)) {
            return (ks.getEntry(keyAlias, null) as KeyStore.SecretKeyEntry).secretKey
        }
        val keyGen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        keyGen.init(
            KeyGenParameterSpec.Builder(
                keyAlias,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .setUserAuthenticationRequired(true)
                .setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG)
                .setInvalidatedByBiometricEnrollment(true)
                .setIsStrongBoxBacked(true)
                .build()
        )
        return keyGen.generateKey()
    }

    private suspend fun authenticateWithCipher(
        activity: FragmentActivity,
        cipher: Cipher,
    ): Cipher = suspendCancellableCoroutine { cont ->
        val callback = object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                cont.resume(result.cryptoObject?.cipher ?: cipher) { _, _, _ -> }
            }
            override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                cont.resumeWithException(SecurityException("$errorCode: $errString"))
            }
        }
        BiometricPrompt(activity, ContextCompat.getMainExecutor(activity), callback).authenticate(
            BiometricPrompt.PromptInfo.Builder()
                .setTitle("Unlock wallet")
                .setNegativeButtonText("Cancel")
                .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
                .build(),
            BiometricPrompt.CryptoObject(cipher),
        )
    }
}
```

**Critical**: zero plaintext seed bytes after use. Use `ByteArray.fill(0)`. Avoid `String` for seed — `String` is interned and not zeroable.

## Pitfalls

| Pitfall | Fix |
|---|---|
| Storing seed in plain SharedPreferences | Use Keystore-wrapped + biometric-bound encryption |
| `setUserAuthenticationRequired(false)` for sensitive keys | Always require auth for wallet keys |
| Using `BIOMETRIC_WEAK` with crypto object | Crypto binding requires `BIOMETRIC_STRONG` |
| Forgetting `setInvalidatedByBiometricEnrollment(true)` | Risk: attacker who shoulder-surfs PIN can add fingerprint and steal funds |
| Not handling `KeyPermanentlyInvalidatedException` | App breaks silently on biometric re-enroll |
| Long `validityDurationSeconds` | Reduces security — use 0 (per-use) for crypto |
| Generating P-256 key in Keystore for Bitcoin | secp256k1 not supported — wrap-don't-replace pattern |
| Skipping StrongBox detection | Some devices lie about availability — use try/catch fallback |
| Holding seed in `String` | Strings can't be wiped from memory |
| Forgetting `cipher.iv` when storing ciphertext | Can't decrypt later |
