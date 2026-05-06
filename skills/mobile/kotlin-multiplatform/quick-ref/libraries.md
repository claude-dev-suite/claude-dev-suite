# KMP Library Ecosystem — Quick Reference

Curated list of production-grade libraries with KMP support, organized by concern.

## Networking

### Ktor Client (de facto standard)

```kotlin
// commonMain
val client = HttpClient {
    install(ContentNegotiation) {
        json(Json {
            ignoreUnknownKeys = true
            encodeDefaults = false
        })
    }
    install(Logging) { level = LogLevel.INFO }
    install(HttpTimeout) { requestTimeoutMillis = 30_000 }
    defaultRequest {
        url("https://api.example.com")
        header("Accept", "application/json")
    }
}

@Serializable
data class User(val id: Long, val name: String)

suspend fun getUser(id: Long): User =
    client.get("users/$id").body()
```

Per-platform engine:
- Android: `ktor-client-okhttp` (or `ktor-client-android`)
- iOS: `ktor-client-darwin`
- Desktop: `ktor-client-okhttp` or `ktor-client-cio` (pure Kotlin)
- JS: `ktor-client-js`

### Alternatives

| Lib | Notes |
|---|---|
| **GraphQL: Apollo Kotlin** | First-class KMP, type-safe codegen |
| **gRPC: Wire by Square** | KMP support, lightweight |
| **WebSockets** | `ktor-client-websockets` plugin |

## Serialization

### kotlinx.serialization (standard)

```kotlin
@Serializable
data class Wallet(
    val id: String,
    @SerialName("created_at") val createdAt: Instant,
    val balance: Balance? = null,
)

@Serializable
sealed class Result<out T> {
    @Serializable @SerialName("success") data class Success<T>(val value: T) : Result<T>()
    @Serializable @SerialName("failure") data class Failure(val message: String) : Result<Nothing>()
}

val json = Json {
    ignoreUnknownKeys = true
    classDiscriminator = "type"
    encodeDefaults = true
    explicitNulls = false
}

val s = json.encodeToString(wallet)
val w = json.decodeFromString<Wallet>(s)
```

Polymorphism via `@JsonClassDiscriminator` or sealed hierarchies. Custom serializers via `KSerializer<T>`.

### Alternatives

| Lib | Notes |
|---|---|
| **kotlinx.serialization protobuf** | Binary format |
| **kotlinx.serialization cbor** | Compact binary |
| **Okio** | I/O for binary protocols |

## Persistence

### SQLDelight (typed SQL)

```sql
-- shared/src/commonMain/sqldelight/com/example/AppDatabase.sq
CREATE TABLE Wallet (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL
);

selectAll:
SELECT * FROM Wallet;

selectById:
SELECT * FROM Wallet WHERE id = ?;

insert:
INSERT INTO Wallet (id, name, created_at) VALUES (?, ?, ?);

deleteById:
DELETE FROM Wallet WHERE id = ?;
```

```kotlin
// commonMain
import com.example.AppDatabase
import com.example.WalletQueries

class WalletRepository(database: AppDatabase) {
    private val q: WalletQueries = database.walletQueries

    fun all(): Flow<List<Wallet>> =
        q.selectAll().asFlow().mapToList(Dispatchers.Default)

    suspend fun insert(w: Wallet) = withContext(Dispatchers.IO) {
        q.insert(w.id, w.name, w.createdAt.toEpochMilliseconds())
    }
}
```

Generates `Wallet`, `WalletQueries` Kotlin types. Migrations supported via `*.sqm` files.

### Alternatives

| Lib | Notes |
|---|---|
| **Room KMP** (preview) | If you already use Room, KMP support coming |
| **Realm Kotlin** | Object DB, KMP-first |
| **MultiplatformSettings** | Key-value preferences cross-platform |
| **Store5** by Mobius | Caching layer over network + DB |

## Date/Time

### kotlinx-datetime

```kotlin
import kotlinx.datetime.*

val now: Instant = Clock.System.now()
val timezone = TimeZone.currentSystemDefault()
val local: LocalDateTime = now.toLocalDateTime(timezone)

val tomorrow = now.plus(1, DateTimeUnit.DAY, timezone)
val duration = tomorrow - now    // Duration

// Parsing
val parsed = "2026-05-04T10:00:00Z".toInstant()
val formatted = local.format(LocalDateTime.Format {
    year(); char('-'); monthNumber(); char('-'); dayOfMonth()
})
```

`Instant` for timestamps, `LocalDateTime` for wall-clock with timezone, `Duration` for elapsed.

## Coroutines & Async

### kotlinx.coroutines

```kotlin
val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

scope.launch {
    val results = listOf(
        async { api.getUser(1) },
        async { api.getPosts(1) }
    ).awaitAll()
}
```

Same API on all platforms. iOS uses native main runloop for `Dispatchers.Main`.

### kotlinx.coroutines.flow

See `languages/kotlin/quick-ref/coroutines.md` for full Flow patterns.

## Dependency Injection

### Koin (KMP-native, recommended)

```kotlin
// commonMain
val sharedModule = module {
    single { httpClient() }
    single { WalletApi(get()) }
    single<WalletRepository> { WalletRepositoryImpl(get(), get()) }
    factory { ViewModelFactory(get()) }
}

fun initKoin(extraModules: List<Module> = emptyList()) =
    startKoin {
        modules(sharedModule + extraModules)
    }
```

```kotlin
// Android
class App : Application() {
    override fun onCreate() {
        super.onCreate()
        initKoin(listOf(module {
            single<Context> { applicationContext }
        }))
    }
}
```

```swift
// iOS — via Kotlin entry point
KoinKt.doInitKoin(extraModules: [])
```

### kotlin-inject (compile-time DI)

Uses KSP for compile-time wiring. Better for large codebases (no reflection, faster startup).

```kotlin
@Component
@Singleton
abstract class AppComponent {
    abstract val walletRepository: WalletRepository

    @Provides @Singleton fun client(): HttpClient = httpClient()
}
```

## Logging

### Napier or Kermit (KMP loggers)

```kotlin
// Kermit by Touchlab
import co.touchlab.kermit.Logger

Logger.i { "Loaded user $userId" }
Logger.e(throwable) { "Sync failed" }

// Configure platform sinks
Logger.setLogWriters(platformLogWriter())
```

| Lib | Notes |
|---|---|
| **Kermit** | Touchlab, popular, integrates with Crashlytics |
| **Napier** | Simpler, fewer features |

## Crash Reporting

### Sentry KMP

```kotlin
Sentry.captureException(error)
```

Self-hosted Sentry server for privacy-respecting setups (BHODL-style). KMP SDK in beta.

### Alternatives

- Crashlytics (Firebase) — Android only via shared module's Android side
- Bugsnag KMP

## Image Loading (Compose Multiplatform)

### Coil 3 (KMP)

```kotlin
import coil3.compose.AsyncImage

AsyncImage(
    model = "https://...",
    contentDescription = null,
    modifier = Modifier.size(64.dp)
)
```

Works in Compose Multiplatform — Android, iOS, Desktop, Wasm. See `frontend-frameworks/compose-multiplatform`.

## Cryptography

### KMP-Crypto (libsodium binding)

For wallet primitives (encryption, hashing, key derivation):

```kotlin
// commonMain via expect/actual
expect class CryptoBox {
    fun encrypt(plaintext: ByteArray, key: ByteArray): ByteArray
    fun decrypt(ciphertext: ByteArray, key: ByteArray): ByteArray?
}
```

For Bitcoin-specific crypto, use **bdk** (KMP-bound) or **bitcoin-kmp** (pure Kotlin reimplementation):

| Lib | Type | Notes |
|---|---|---|
| **bdk** (BDK KMP bindings) | Rust-backed via UniFFI KMP fork | Production wallet stack |
| **bitcoin-kmp** by ACINQ | Pure Kotlin Bitcoin primitives | Lighter, no native lib |
| **secp256k1-kmp** by ACINQ | secp256k1 binding for KMP | Schnorr, ECDSA, MuSig2 |

For BHODL: use **bdk** + **ldk-node** + **lwk** + **breez-sdk-liquid** (all KMP via UniFFI fork).

## Settings / Preferences

### MultiplatformSettings

```kotlin
expect class SettingsFactory {
    fun create(): Settings
}

class Prefs(settings: Settings) {
    var theme: String by settings.string("theme", "light")
    var locale: String? by settings.nullableString("locale")
}
```

```kotlin
// androidMain
actual class SettingsFactory(private val context: Context) {
    actual fun create(): Settings = SharedPreferencesSettings(
        context.getSharedPreferences("prefs", MODE_PRIVATE)
    )
}

// iosMain
actual class SettingsFactory {
    actual fun create(): Settings =
        NSUserDefaultsSettings(NSUserDefaults.standardUserDefaults)
}
```

For secure storage, layer on top of expect class wrapping Keychain (iOS) / EncryptedSharedPreferences (Android).

## Testing

### kotlin.test + coroutines-test

```kotlin
// commonTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlinx.coroutines.test.runTest

class WalletRepositoryTest {
    @Test fun `inserts and retrieves`() = runTest {
        val repo = WalletRepository(inMemoryDatabase())
        repo.insert(testWallet())
        val all = repo.all().first()
        assertEquals(1, all.size)
    }
}
```

Tests run on JVM by default. Configure to also run on `iosSimulatorArm64Test`, `desktopTest`.

### Kotest (richer matchers, KMP)

```kotlin
class WalletSpec : StringSpec({
    "inserts wallet" {
        val repo = WalletRepository(inMemoryDatabase())
        repo.insert(testWallet())
        repo.all().first() shouldHaveSize 1
    }
})
```

### Turbine (Flow testing)

```kotlin
@Test fun `state emits loading then success`() = runTest {
    viewModel.state.test {
        viewModel.load()
        assertEquals(UiState.Loading, awaitItem())
        assertEquals(UiState.Success(testUser), awaitItem())
        cancelAndIgnoreRemainingEvents()
    }
}
```

## State Management

### MVI with kotlinx.coroutines

Roll-your-own with `StateFlow` (recommended for KMP):

```kotlin
class WalletViewModel(private val repo: WalletRepository) {
    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    private val scope = CoroutineScope(Dispatchers.Default + SupervisorJob())

    fun load() = scope.launch {
        _state.update { it.copy(loading = true) }
        try {
            val wallets = repo.all().first()
            _state.update { it.copy(loading = false, wallets = wallets) }
        } catch (e: Throwable) {
            _state.update { it.copy(loading = false, error = e.message) }
        }
    }

    fun close() = scope.cancel()
}
```

### Libraries

| Lib | Notes |
|---|---|
| **MoleculeKMP** by Cash App | Compose-style state machines for non-UI logic |
| **Decompose** | Lifecycle + navigation + state for KMP |
| **MVIKotlin** | Full MVI framework for KMP |

## Navigation (Cross-Platform)

### Voyager (Compose Multiplatform)

```kotlin
class HomeScreen : Screen {
    @Composable override fun Content() {
        val navigator = LocalNavigator.currentOrThrow
        Button(onClick = { navigator.push(DetailScreen(id = 42)) }) {
            Text("Open detail")
        }
    }
}

// Setup
Navigator(HomeScreen())
```

### Decompose (more powerful, less Compose-coupled)

```kotlin
interface RootComponent {
    val stack: Value<ChildStack<*, Child>>
    sealed class Child {
        class Home(val component: HomeComponent) : Child()
        class Detail(val component: DetailComponent) : Child()
    }
}

class DefaultRootComponent(componentContext: ComponentContext) :
    RootComponent, ComponentContext by componentContext {

    private val nav = StackNavigation<Config>()
    override val stack = childStack(
        source = nav,
        serializer = Config.serializer(),
        initialConfiguration = Config.Home,
        handleBackButton = true,
        childFactory = ::child,
    )
    // ...
}
```

Decompose handles process death restoration and works with any UI (Compose, native).

## Resources

### Compose Multiplatform Resources

```kotlin
import org.jetbrains.compose.resources.painterResource

Image(painterResource(Res.drawable.logo), contentDescription = null)
Text(stringResource(Res.string.welcome))
```

Works without Compose UI for raw bytes (`Res.readBytes("files/data.json")`).

## File I/O

### Okio (KMP)

```kotlin
import okio.FileSystem
import okio.Path.Companion.toPath

val fs = FileSystem.SYSTEM         // Android/JVM/Desktop
// iOS: use FakeFileSystem in tests, or expect/actual platform path

val data = fs.read("config.json".toPath()) { readUtf8() }
fs.write("output.txt".toPath()) { writeUtf8("hello") }
```

For iOS file paths, get sandbox dirs via expect/actual or use platform.Foundation.

## Comprehensive Compatibility Matrix (Mid-2026)

| Library | Android | iOS | JVM Desktop | JS | Wasm |
|---|---|---|---|---|---|
| Ktor Client | ✅ | ✅ | ✅ | ✅ | ✅ |
| kotlinx.serialization | ✅ | ✅ | ✅ | ✅ | ✅ |
| kotlinx-datetime | ✅ | ✅ | ✅ | ✅ | ✅ |
| kotlinx.coroutines | ✅ | ✅ | ✅ | ✅ | ⚠️ |
| SQLDelight | ✅ | ✅ | ✅ | ✅ | ❌ |
| Koin | ✅ | ✅ | ✅ | ✅ | ⚠️ |
| Compose Multiplatform | ✅ | ✅ | ✅ | ⚠️ | ⚠️ |
| Coil 3 | ✅ | ✅ | ✅ | ⚠️ | ⚠️ |
| Decompose | ✅ | ✅ | ✅ | ✅ | ⚠️ |
| Kermit | ✅ | ✅ | ✅ | ✅ | ⚠️ |
| Okio | ✅ | ✅ | ✅ | ✅ | ⚠️ |
| Sentry KMP | ✅ | ⚠️ | ✅ | ❌ | ❌ |

(✅ stable, ⚠️ alpha/beta, ❌ unsupported)

## Picking a Stack for a New KMP App

**Minimal modern stack** (2026):
- **Networking**: Ktor 3.x + kotlinx.serialization
- **DB**: SQLDelight (or Realm Kotlin if you need objects)
- **DI**: Koin
- **State**: StateFlow + custom MVI
- **Logging**: Kermit
- **DateTime**: kotlinx-datetime
- **Navigation**: Voyager (with Compose) or Decompose (UI-agnostic)
- **Image**: Coil 3 (with Compose)
- **Tests**: kotlin.test + kotlinx-coroutines-test + Turbine

For Bitcoin/wallet apps: add **bdk-kmp** + **ldk-node-kmp** via UniFFI KMP fork (see `languages/uniffi`).
