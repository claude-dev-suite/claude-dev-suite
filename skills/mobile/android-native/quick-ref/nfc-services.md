# NFC + Foreground Services + WorkManager — Quick Reference

## NFC — NDEF Reading

For reading tags (e.g., wallet backup cards, contact cards, BTC payment URIs).

`AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.NFC" />
<uses-feature android:name="android.hardware.nfc" android:required="false" />

<activity android:name=".NfcReadActivity" android:launchMode="singleTask">
    <intent-filter>
        <action android:name="android.nfc.action.NDEF_DISCOVERED" />
        <category android:name="android.intent.category.DEFAULT" />
        <data android:scheme="bitcoin" />              <!-- bitcoin:bc1q... URI on tag -->
    </intent-filter>
</activity>
```

### Foreground Dispatch (Activity in foreground intercepts tags)

```kotlin
class NfcReadActivity : ComponentActivity() {
    private lateinit var adapter: NfcAdapter
    private lateinit var pendingIntent: PendingIntent

    override fun onCreate(s: Bundle?) {
        super.onCreate(s)
        adapter = NfcAdapter.getDefaultAdapter(this) ?: run {
            // No NFC hardware
            return
        }
        pendingIntent = PendingIntent.getActivity(
            this, 0,
            Intent(this, javaClass).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_MUTABLE,
        )
        setContent { /* UI */ }
    }

    override fun onResume() {
        super.onResume()
        adapter.enableForegroundDispatch(this, pendingIntent, null, null)
    }

    override fun onPause() {
        super.onPause()
        adapter.disableForegroundDispatch(this)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleNfcIntent(intent)
    }

    private fun handleNfcIntent(intent: Intent) {
        val rawMessages = intent.getParcelableArrayExtra(
            NfcAdapter.EXTRA_NDEF_MESSAGES,
            NdefMessage::class.java,
        )
        rawMessages?.firstOrNull()?.records?.forEach { record ->
            when {
                record.tnf == NdefRecord.TNF_WELL_KNOWN -> handleWellKnown(record)
                record.tnf == NdefRecord.TNF_MIME_MEDIA -> handleMime(record)
                record.tnf == NdefRecord.TNF_ABSOLUTE_URI -> handleUri(record)
            }
        }
    }
}
```

### Reader Mode (Recommended — More Control)

```kotlin
override fun onResume() {
    super.onResume()
    adapter.enableReaderMode(
        this,
        { tag: Tag ->
            val ndef = Ndef.get(tag)
            ndef?.connect()
            try {
                val message = ndef?.ndefMessage
                runOnUiThread { handleMessage(message) }
            } finally {
                ndef?.close()
            }
        },
        NfcAdapter.FLAG_READER_NFC_A or NfcAdapter.FLAG_READER_NFC_B
            or NfcAdapter.FLAG_READER_SKIP_NDEF_CHECK,
        null,
    )
}

override fun onPause() {
    super.onPause()
    adapter.disableReaderMode(this)
}
```

Reader Mode lets you handle low-level Tag protocols (`IsoDep`, `MifareClassic`, `NfcA`) for non-NDEF tags (e.g., COLDCARD-style wallet protocols).

## NFC — Writing NDEF

```kotlin
fun writeUri(tag: Tag, uri: String): Boolean {
    val ndef = Ndef.get(tag) ?: return false
    return try {
        ndef.connect()
        if (!ndef.isWritable) return false
        val record = NdefRecord.createUri(uri)
        val message = NdefMessage(arrayOf(record))
        if (ndef.maxSize < message.byteArrayLength) return false
        ndef.writeNdefMessage(message)
        true
    } catch (e: IOException) {
        false
    } finally {
        ndef.close()
    }
}

// Example: write a Bitcoin payment URI
writeUri(tag, "bitcoin:bc1q...?amount=0.001")
```

## Host Card Emulation (HCE)

App emulates a smart card for contactless payments / authentication. App must respond within 1ms — no UI work.

`AndroidManifest.xml`:

```xml
<service
    android:name=".HostApduService"
    android:exported="true"
    android:permission="android.permission.BIND_NFC_SERVICE">
    <intent-filter>
        <action android:name="android.nfc.cardemulation.action.HOST_APDU_SERVICE" />
    </intent-filter>
    <meta-data
        android:name="android.nfc.cardemulation.host_apdu_service"
        android:resource="@xml/apdu_service" />
</service>
```

`res/xml/apdu_service.xml`:

```xml
<host-apdu-service
    android:description="@string/service_description"
    android:requireDeviceUnlock="true">
    <aid-group android:description="@string/aid_group_description"
               android:category="other">
        <aid-filter android:name="F0010203040506" />     <!-- custom AID -->
    </aid-group>
</host-apdu-service>
```

```kotlin
class HostApduService : android.nfc.cardemulation.HostApduService() {

    override fun processCommandApdu(commandApdu: ByteArray, extras: Bundle?): ByteArray {
        // Process APDU, return response (must be < 1ms)
        return when {
            isSelectAid(commandApdu) -> SUCCESS_RESPONSE
            isReadCommand(commandApdu) -> readResponse()
            else -> ERROR_RESPONSE
        }
    }

    override fun onDeactivated(reason: Int) {
        // reason: DEACTIVATION_LINK_LOSS or DEACTIVATION_DESELECTED
    }

    companion object {
        private val SUCCESS_RESPONSE = byteArrayOf(0x90.toByte(), 0x00)   // SW1=0x90, SW2=0x00
        private val ERROR_RESPONSE = byteArrayOf(0x6A.toByte(), 0x82.toByte())
    }
}
```

For BHODL-style: NOT typically used. HCE requires AID provisioning and is for payment terminal interaction.

## Foreground Services — Types (Android 14+)

Mandatory `foregroundServiceType` declaration:

| Type | Use case |
|---|---|
| `dataSync` | Sync data with server (BHODL wallet sync) |
| `mediaPlayback` | Audio/video playback |
| `phoneCall` | Voice/video calling |
| `location` | GPS tracking |
| `connectedDevice` | Bluetooth/companion device |
| `mediaProjection` | Screen recording/cast |
| `camera` / `microphone` | Camera/mic in background |
| `health` | Health monitoring (steps, HR) |
| `remoteMessaging` | Federated messaging |
| `systemExempted` | System apps only |
| `shortService` | Short critical task (max 3 min) |
| `specialUse` | Other (requires `specialUseExemption` declaration) |

```xml
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_DATA_SYNC" />

<service
    android:name=".SyncService"
    android:exported="false"
    android:foregroundServiceType="dataSync" />
```

```kotlin
class SyncService : Service() {
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForeground(
            1,
            buildNotification(),
            ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC,        // declare type at runtime too
        )
        // do work
        return START_STICKY
    }
}
```

## WorkManager — Advanced

### Constraints

```kotlin
val constraints = Constraints.Builder()
    .setRequiredNetworkType(NetworkType.CONNECTED)         // CONNECTED, UNMETERED, METERED, NOT_REQUIRED
    .setRequiresCharging(false)
    .setRequiresBatteryNotLow(true)
    .setRequiresDeviceIdle(false)
    .setRequiresStorageNotLow(true)
    .build()
```

### One-Time Work with Initial Delay

```kotlin
val work = OneTimeWorkRequestBuilder<UploadWorker>()
    .setConstraints(constraints)
    .setInitialDelay(10, TimeUnit.MINUTES)
    .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
    .setInputData(workDataOf("file_path" to path))
    .addTag("upload")
    .build()

WorkManager.getInstance(context).enqueue(work)
```

### Periodic Work

Minimum interval: 15 minutes. WorkManager schedules it best-effort within the window.

```kotlin
val sync = PeriodicWorkRequestBuilder<SyncWorker>(15, TimeUnit.MINUTES)
    .setConstraints(constraints)
    .build()

WorkManager.getInstance(context).enqueueUniquePeriodicWork(
    "wallet_sync",
    ExistingPeriodicWorkPolicy.UPDATE,                   // KEEP, UPDATE, REPLACE
    sync,
)
```

### Chained Work

```kotlin
WorkManager.getInstance(context)
    .beginWith(OneTimeWorkRequestBuilder<DownloadWorker>().build())
    .then(OneTimeWorkRequestBuilder<ProcessWorker>().build())
    .then(OneTimeWorkRequestBuilder<UploadWorker>().build())
    .enqueue()

// Combine multiple
WorkManager.getInstance(context)
    .beginWith(listOf(work1, work2))                      // parallel
    .then(work3)                                           // after both complete
    .enqueue()
```

### Observe Work

```kotlin
WorkManager.getInstance(context).getWorkInfoByIdLiveData(work.id)
    .observe(lifecycleOwner) { info ->
        when (info?.state) {
            WorkInfo.State.RUNNING -> showProgress()
            WorkInfo.State.SUCCEEDED -> showSuccess(info.outputData)
            WorkInfo.State.FAILED -> showError()
            WorkInfo.State.CANCELLED -> { /* ... */ }
            else -> {}
        }
    }

// In Compose
val workInfo by WorkManager.getInstance(context)
    .getWorkInfoByIdFlow(work.id)
    .collectAsStateWithLifecycle(initialValue = null)
```

### Hilt Worker

```kotlin
implementation("androidx.hilt:hilt-work:1.2.0")
ksp("androidx.hilt:hilt-compiler:1.2.0")
```

```kotlin
@HiltWorker
class SyncWorker @AssistedInject constructor(
    @Assisted ctx: Context,
    @Assisted params: WorkerParameters,
    private val repo: WalletRepository,
) : CoroutineWorker(ctx, params) {

    override suspend fun doWork(): Result = try {
        repo.syncAll()
        Result.success()
    } catch (e: Throwable) {
        if (runAttemptCount < 3) Result.retry() else Result.failure()
    }
}

// Application
@HiltAndroidApp
class App : Application(), Configuration.Provider {
    @Inject lateinit var workerFactory: HiltWorkerFactory

    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder()
            .setWorkerFactory(workerFactory)
            .build()
}
```

### Foreground WorkManager

For long-running work that must show notification:

```kotlin
class DownloadWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {

    override suspend fun doWork(): Result {
        setForeground(createForegroundInfo("Downloading"))
        // ... do work
        return Result.success()
    }

    private fun createForegroundInfo(progress: String): ForegroundInfo {
        val notification = NotificationCompat.Builder(applicationContext, "downloads")
            .setContentTitle("Downloading")
            .setContentText(progress)
            .setSmallIcon(R.drawable.ic_download)
            .setOngoing(true)
            .build()

        return if (Build.VERSION.SDK_INT >= 29) {
            ForegroundInfo(1, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            ForegroundInfo(1, notification)
        }
    }
}
```

## Pitfalls

| Pitfall | Fix |
|---|---|
| NFC not detecting tags | Check `enableReaderMode` / `enableForegroundDispatch` lifecycle |
| `Ndef.get(tag)` returns null | Tag may not support NDEF — try `IsoDep`, `MifareClassic` |
| Heavy work in `processCommandApdu` | Must complete <1ms — pre-compute, cache responses |
| `Foreground Service` crash on Android 14+ | Add `foregroundServiceType` permission + manifest attribute |
| WorkManager periodic <15min | Min interval 15min; use AlarmManager for shorter (with caveats) |
| WorkManager not running on Doze | Use `setRequiresBatteryNotLow(false)` or whitelist via `ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` |
| Hilt worker not injecting | Verify `Configuration.Provider` impl on Application |
| Lost notification channel after reinstall | Re-create channel on Application startup |
| Foreground service stops after 6h (Android 14) | Use `setForegroundAsync` with `dataSync` type, or chunk into shorter sessions |
