---
name: android-native
description: |
  Android native platform APIs beyond UI: Activity/Fragment lifecycle,
  Android Keystore (hardware-backed key storage), BiometricPrompt, EncryptedSharedPreferences,
  WorkManager, NFC (NDEF + HCE), Foreground Services, broadcast receivers,
  ContentProviders, Intents, FileProvider, App Links, ProGuard/R8 rules,
  permissions model.

  USE WHEN: user mentions "Android Keystore", "KeyGenParameterSpec", "BiometricPrompt",
  "EncryptedSharedPreferences", "WorkManager", "NFC", "HCE", "Foreground Service",
  "BroadcastReceiver", "ContentProvider", "App Links", "FileProvider", "ProGuard", "R8",
  "Activity lifecycle"

  DO NOT USE FOR: UI with Jetpack Compose - use `mobile/jetpack-compose`
  DO NOT USE FOR: Kotlin language patterns - use `languages/kotlin`
  DO NOT USE FOR: KMP setup - use `mobile/kotlin-multiplatform`
  DO NOT USE FOR: SQLCipher - use `databases/sqlcipher`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Android Native Platform APIs

> **References**: [keystore-biometric.md](quick-ref/keystore-biometric.md) for Keystore (KeyGenParameterSpec, StrongBox, attestation), BiometricPrompt with crypto object binding, EncryptedSharedPreferences, certificate pinning. [nfc-services.md](quick-ref/nfc-services.md) for NFC (NDEF reading/writing, HCE for payment-style apps), Foreground Services, WorkManager.
>
> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `android`.

## Activity Lifecycle (Modern)

```kotlin
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent { App() }

        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                viewModel.events.collect { handle(it) }
            }
        }
    }
}
```

Key callbacks (rarely overridden in Compose-first apps):
- `onCreate(savedInstanceState)` — initial setup
- `onStart` / `onStop` — visible/invisible
- `onResume` / `onPause` — focused/unfocused
- `onDestroy` — final cleanup
- `onSaveInstanceState(outState)` — survive process death

For Compose: prefer `LifecycleResumeEffect`, `LifecycleEventEffect` over manual lifecycle observers.

## Permissions

`AndroidManifest.xml`:

```xml
<manifest>
    <uses-permission android:name="android.permission.CAMERA" />
    <uses-permission android:name="android.permission.USE_BIOMETRIC" />
    <uses-permission android:name="android.permission.NFC" />
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
    <uses-feature android:name="android.hardware.camera" android:required="false" />
</manifest>
```

Runtime requests via Activity Result Contracts (see `mobile/jetpack-compose/quick-ref/interop.md`).

## Android Keystore (Hardware-Backed Keys)

The Android Keystore stores cryptographic keys in a container that prevents extraction from the device. On supported hardware (StrongBox-equipped devices), keys live in a tamper-resistant secure element.

### Generate AES key for symmetric encryption

```kotlin
fun generateAesKey(alias: String, requireAuth: Boolean = false): SecretKey {
    val keyGen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
    val spec = KeyGenParameterSpec.Builder(
        alias,
        KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
    )
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setKeySize(256)
        .setUserAuthenticationRequired(requireAuth)         // gate by biometric
        .setUserAuthenticationParameters(
            0,                                                // 0 = each use
            KeyProperties.AUTH_BIOMETRIC_STRONG,
        )
        .setIsStrongBoxBacked(true)                          // hardware secure element
        .setRandomizedEncryptionRequired(true)
        .build()
    keyGen.init(spec)
    return keyGen.generateKey()
}
```

### Encrypt / Decrypt with GCM

```kotlin
fun encryptAesGcm(alias: String, plaintext: ByteArray): ByteArray {
    val key = (KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        .getEntry(alias, null) as KeyStore.SecretKeyEntry).secretKey

    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, key)
    val iv = cipher.iv                                  // 12 bytes for GCM
    val ciphertext = cipher.doFinal(plaintext)
    return iv + ciphertext                              // prepend IV
}

fun decryptAesGcm(alias: String, blob: ByteArray): ByteArray {
    val key = (KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        .getEntry(alias, null) as KeyStore.SecretKeyEntry).secretKey

    val iv = blob.sliceArray(0..11)
    val ciphertext = blob.sliceArray(12 until blob.size)

    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, iv))
    return cipher.doFinal(ciphertext)
}
```

### Generate EC key for signing

```kotlin
fun generateSigningKey(alias: String, requireAuth: Boolean = true): KeyPair {
    val keyGen = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, "AndroidKeyStore")
    val spec = KeyGenParameterSpec.Builder(
        alias,
        KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY,
    )
        .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))   // P-256
        .setDigests(KeyProperties.DIGEST_SHA256)
        .setUserAuthenticationRequired(requireAuth)
        .setIsStrongBoxBacked(true)
        .setAttestationChallenge("challenge-bytes".toByteArray())     // for remote attestation
        .build()
    keyGen.initialize(spec)
    return keyGen.generateKeyPair()
}
```

For wallet apps: Keystore P-256 keys are NOT secp256k1 (Bitcoin) — use Keystore for WRAPPING the wallet seed encryption key, store the wrapped seed, and derive secp256k1 keys outside Keystore from the unlocked seed.

See [keystore-biometric.md](quick-ref/keystore-biometric.md) for attestation, key migration, StrongBox detection.

## BiometricPrompt

Modern API (replaces old FingerprintManager). Supports Face/Iris/Fingerprint based on device capability.

```kotlin
class BiometricAuthHelper(private val activity: FragmentActivity) {

    fun authenticate(
        title: String = "Unlock",
        subtitle: String = "Use biometric to access wallet",
        cipher: Cipher? = null,                              // for crypto-bound auth
        onSuccess: (BiometricPrompt.CryptoObject?) -> Unit,
        onError: (Int, CharSequence) -> Unit,
    ) {
        val executor = ContextCompat.getMainExecutor(activity)

        val callback = object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                onSuccess(result.cryptoObject)
            }
            override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                onError(errorCode, errString)
            }
        }

        val prompt = BiometricPrompt(activity, executor, callback)
        val info = BiometricPrompt.PromptInfo.Builder()
            .setTitle(title)
            .setSubtitle(subtitle)
            .setNegativeButtonText("Cancel")
            .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
            .build()

        if (cipher != null) {
            prompt.authenticate(info, BiometricPrompt.CryptoObject(cipher))
        } else {
            prompt.authenticate(info)
        }
    }
}
```

### Crypto Object Binding (Recommended)

Bind biometric auth to a Keystore key via `CryptoObject`. The key generated with `setUserAuthenticationRequired(true)` cannot be used until biometric prompt succeeds — stronger than just "ask user, then use key".

```kotlin
fun unlockWalletKey(activity: FragmentActivity, onUnlocked: (Cipher) -> Unit) {
    val keyAlias = "wallet_seed_key"
    val key = (KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        .getEntry(keyAlias, null) as KeyStore.SecretKeyEntry).secretKey

    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, key)               // throws UserNotAuthenticatedException if needed

    BiometricAuthHelper(activity).authenticate(
        cipher = cipher,
        onSuccess = { cryptoObject ->
            cryptoObject?.cipher?.let(onUnlocked)
        },
        onError = { _, _ -> /* ... */ },
    )
}
```

### Check biometric availability

```kotlin
fun canAuthenticate(context: Context): Int =
    BiometricManager.from(context)
        .canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG)

// Returns:
// BiometricManager.BIOMETRIC_SUCCESS                   = 0
// BIOMETRIC_ERROR_NO_HARDWARE                          = 12
// BIOMETRIC_ERROR_HW_UNAVAILABLE                       = 1
// BIOMETRIC_ERROR_NONE_ENROLLED                        = 11
// BIOMETRIC_ERROR_SECURITY_UPDATE_REQUIRED             = 15
```

If `BIOMETRIC_ERROR_NONE_ENROLLED`, prompt user to enroll:

```kotlin
val intent = Intent(Settings.ACTION_BIOMETRIC_ENROLL).apply {
    putExtra(
        Settings.EXTRA_BIOMETRIC_AUTHENTICATORS_ALLOWED,
        BiometricManager.Authenticators.BIOMETRIC_STRONG,
    )
}
context.startActivity(intent)
```

## EncryptedSharedPreferences

Wrapper around SharedPreferences using AES-GCM keys stored in Keystore. Good for storing tokens, small secrets.

```kotlin
implementation("androidx.security:security-crypto:1.1.0-alpha07")

val masterKey = MasterKey.Builder(context)
    .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
    .setRequestStrongBoxBacked(true)
    .build()

val prefs = EncryptedSharedPreferences.create(
    context,
    "secure_prefs",
    masterKey,
    EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
    EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
)

prefs.edit { putString("auth_token", token) }
val token = prefs.getString("auth_token", null)
```

For wallet seed storage, **prefer manual Keystore + libsodium-encrypted file** — more control, easier to audit.

## WorkManager (Background Tasks)

For deferrable, guaranteed-execution background work (sync, upload, periodic refresh).

```kotlin
implementation("androidx.work:work-runtime-ktx:2.10.0")
implementation("androidx.hilt:hilt-work:1.2.0")
ksp("androidx.hilt:hilt-compiler:1.2.0")
```

```kotlin
@HiltWorker
class SyncWorker @AssistedInject constructor(
    @Assisted context: Context,
    @Assisted params: WorkerParameters,
    private val repo: WalletRepository,
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        return try {
            repo.syncAll()
            Result.success()
        } catch (e: Throwable) {
            if (runAttemptCount < 3) Result.retry() else Result.failure()
        }
    }
}

// Schedule
val sync = PeriodicWorkRequestBuilder<SyncWorker>(15, TimeUnit.MINUTES)
    .setConstraints(
        Constraints.Builder()
            .setRequiredNetworkType(NetworkType.UNMETERED)
            .setRequiresBatteryNotLow(true)
            .build()
    )
    .build()

WorkManager.getInstance(context).enqueueUniquePeriodicWork(
    "wallet_sync",
    ExistingPeriodicWorkPolicy.UPDATE,
    sync,
)
```

Constraint types: NetworkType, RequiresCharging, RequiresBatteryNotLow, RequiresStorageNotLow, RequiresDeviceIdle.

## Foreground Services

For ongoing user-visible work (long sync, audio playback, location tracking). Mandatory for tasks >10 minutes (since Android 14).

```kotlin
class WalletSyncService : Service() {
    private val scope = CoroutineScope(Dispatchers.Default + SupervisorJob())

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForeground(NOTIFICATION_ID, buildNotification())

        scope.launch {
            try { performSync() } finally { stopSelf() }
        }
        return START_STICKY
    }

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun buildNotification(): Notification = NotificationCompat.Builder(this, "sync_channel")
        .setContentTitle("Syncing wallet")
        .setSmallIcon(R.drawable.ic_sync)
        .setOngoing(true)
        .build()

    companion object { private const val NOTIFICATION_ID = 1 }
}
```

`AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_DATA_SYNC" />

<service
    android:name=".WalletSyncService"
    android:exported="false"
    android:foregroundServiceType="dataSync" />
```

Android 14 requires explicit `foregroundServiceType` (`dataSync`, `mediaPlayback`, `location`, `connectedDevice`, etc.).

## Notifications

```kotlin
// Channel (one-time setup, e.g., in App.onCreate)
val channel = NotificationChannel(
    "wallet_alerts",
    "Wallet Alerts",
    NotificationManager.IMPORTANCE_HIGH,
).apply {
    description = "Transaction notifications"
}
NotificationManagerCompat.from(context).createNotificationChannel(channel)

// Show
val notification = NotificationCompat.Builder(context, "wallet_alerts")
    .setSmallIcon(R.drawable.ic_btc)
    .setContentTitle("Received 100,000 sats")
    .setContentText("From bc1q...")
    .setStyle(NotificationCompat.BigTextStyle().bigText("..."))
    .setAutoCancel(true)
    .setContentIntent(pendingIntent)
    .build()

NotificationManagerCompat.from(context).notify(notificationId, notification)
```

Android 13+ requires `POST_NOTIFICATIONS` runtime permission.

## App Links / Deep Links

`AndroidManifest.xml`:

```xml
<activity android:name=".MainActivity" android:exported="true">
    <!-- Universal Links (HTTPS, auto-verified) -->
    <intent-filter android:autoVerify="true">
        <action android:name="android.intent.action.VIEW" />
        <category android:name="android.intent.category.DEFAULT" />
        <category android:name="android.intent.category.BROWSABLE" />
        <data android:scheme="https" android:host="bhodl.app" />
    </intent-filter>

    <!-- Custom URI scheme -->
    <intent-filter>
        <action android:name="android.intent.action.VIEW" />
        <category android:name="android.intent.category.DEFAULT" />
        <category android:name="android.intent.category.BROWSABLE" />
        <data android:scheme="bitcoin" />
        <data android:scheme="lightning" />
    </intent-filter>
</activity>
```

For universal links, host `https://bhodl.app/.well-known/assetlinks.json`:

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "com.bhodl.android",
    "sha256_cert_fingerprints": ["AB:CD:..."]
  }
}]
```

## FileProvider

Required to share files (image capture, PDF export) with other apps.

`AndroidManifest.xml`:

```xml
<provider
    android:name="androidx.core.content.FileProvider"
    android:authorities="${applicationId}.fileprovider"
    android:exported="false"
    android:grantUriPermissions="true">
    <meta-data
        android:name="android.support.FILE_PROVIDER_PATHS"
        android:resource="@xml/provider_paths" />
</provider>
```

`res/xml/provider_paths.xml`:

```xml
<paths>
    <files-path name="exports" path="exports/" />
    <cache-path name="cache" path="/" />
</paths>
```

```kotlin
val file = File(context.filesDir, "exports/labels.bip329")
val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)

val intent = Intent(Intent.ACTION_SEND).apply {
    type = "application/json"
    putExtra(Intent.EXTRA_STREAM, uri)
    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
}
context.startActivity(Intent.createChooser(intent, null))
```

## ProGuard / R8

`app/build.gradle.kts`:

```kotlin
android {
    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
}
```

`proguard-rules.pro` for KMP/Compose/Hilt:

```
# Keep Compose
-keepclasseswithmembers class * {
    @androidx.compose.runtime.Composable <methods>;
}

# Keep kotlinx.serialization
-keep,includedescriptorclasses class com.bhodl.**$$serializer { *; }
-keepclassmembers class com.bhodl.** {
    *** Companion;
}
-keepclasseswithmembers class com.bhodl.** {
    kotlinx.serialization.KSerializer serializer(...);
}

# Keep Hilt-generated
-keep class * extends dagger.hilt.android.internal.managers.ViewComponentManager.FragmentContextWrapper { *; }

# Keep UniFFI generated
-keep class uniffi.** { *; }
-keepclassmembers class uniffi.** { *; }

# Keep JNI
-keepclasseswithmembernames class * {
    native <methods>;
}
```

## Anti-Patterns

| Anti-pattern | Why it's bad | Correct approach |
|---|---|---|
| Storing secrets in SharedPreferences | World-readable on rooted devices | EncryptedSharedPreferences or Keystore-wrapped file |
| Generating wallet keys in Keystore | P-256 only, not secp256k1 | Use Keystore for wrapping, derive Bitcoin keys from unlocked seed |
| `Context` field in static/companion | Memory leak | Use `applicationContext` if global, or weak ref |
| `AsyncTask` (deprecated) | API removed | Use coroutines |
| `BroadcastReceiver` registered without unregister | Leak | Pair `register`/`unregister` in lifecycle |
| `StartActivityForResult` (deprecated) | Brittle | Activity Result Contracts |
| `runOnUiThread { }` from Compose | Wrong abstraction | Use `Dispatchers.Main` or composable side effect |
| Plain HTTP traffic | Insecure | Network Security Config + TLS only |
| Skipping `POST_NOTIFICATIONS` permission (API 33+) | Notifications silently ignored | Request runtime permission |
| Hardcoded `String` for permission | Typo crashes | `Manifest.permission.CAMERA` constant |
| Foreground service without `foregroundServiceType` (API 34+) | Crash | Declare type in manifest |

## Network Security Config

For HTTPS-only + cert pinning:

```xml
<!-- res/xml/network_security_config.xml -->
<network-security-config>
    <base-config cleartextTrafficPermitted="false" />
    <domain-config>
        <domain includeSubdomains="true">api.bhodl.app</domain>
        <pin-set>
            <pin digest="SHA-256">AAAA...</pin>
            <pin digest="SHA-256">BBBB...</pin>     <!-- backup pin -->
        </pin-set>
    </domain-config>
</network-security-config>
```

`AndroidManifest.xml`:

```xml
<application android:networkSecurityConfig="@xml/network_security_config">
```

## When NOT to Use This Skill

| Scenario | Use Instead |
|----------|-------------|
| Compose UI patterns | `mobile/jetpack-compose` |
| Cross-platform Kotlin | `mobile/kotlin-multiplatform` |
| Encrypted database | `databases/sqlcipher` |
| Generic encryption primitives | `security/libsodium` |
| Kotlin language details | `languages/kotlin` |
| Keystore deep dive (StrongBox, attestation, migration) | [keystore-biometric.md](quick-ref/keystore-biometric.md) |
| NFC HCE, WorkManager constraints, Foreground Service types | [nfc-services.md](quick-ref/nfc-services.md) |
