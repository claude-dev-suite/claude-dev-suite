---
name: kotest
description: |
  Kotest — flexible, idiomatic Kotlin testing framework. Multiple specification
  styles (StringSpec, FunSpec, BehaviorSpec, DescribeSpec, FeatureSpec, FreeSpec),
  rich matcher library, property-based testing, data-driven tests, coroutine
  support, KMP-friendly. Drop-in alternative or complement to JUnit.

  USE WHEN: user mentions "Kotest", "io.kotest", "shouldBe", "StringSpec",
  "BehaviorSpec", "DescribeSpec", "kotest property testing", "Arb.list", "forAll",
  "kotest matchers", "kotlin tests"

  DO NOT USE FOR: JUnit-specific patterns - use junit skill (or framework-specific test skills)
  DO NOT USE FOR: Flow testing - use `testing/turbine`
  DO NOT USE FOR: Compose snapshot tests - use `testing/compose-snapshot`
  DO NOT USE FOR: Mobile E2E - use `testing/maestro`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Kotest

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `kotest`.

## Why Kotest

| Feature | Kotest | JUnit 5 | Spek |
|---|---|---|---|
| Spec styles (BDD, FunSpec, StringSpec, etc.) | ✅ 9 styles | ❌ Single | ✅ |
| Rich matchers (`shouldBe`, `shouldContain`, `shouldThrow`) | ✅ Built-in | ❌ Need AssertJ/Hamcrest | ✅ |
| Property-based testing | ✅ Native | ❌ External | ❌ |
| Data-driven tests | ✅ `withData` | ✅ `@ParameterizedTest` | ❌ |
| Coroutine native (`runTest` via `coroutineScope`) | ✅ | ✅ Manual | ❌ |
| KMP support | ✅ Full | Partial (JVM only) | ❌ |
| Lifecycle hooks | ✅ Many | ✅ | ✅ |
| Test isolation modes | ✅ Configurable | ❌ Per-method | ❌ |
| Plugin ecosystem | ✅ Spring, Allure, Koin, MockK | ✅ | Limited |

## Setup

```kotlin
// build.gradle.kts
plugins {
    id("io.kotest.multiplatform") version "5.9.1"      // for KMP
    // OR
    kotlin("jvm")                                        // JVM-only
}

dependencies {
    testImplementation("io.kotest:kotest-runner-junit5:5.9.1")        // JVM
    testImplementation("io.kotest:kotest-assertions-core:5.9.1")
    testImplementation("io.kotest:kotest-property:5.9.1")             // property testing
    testImplementation("io.kotest:kotest-framework-datatest:5.9.1")   // data-driven
    testImplementation("io.kotest.extensions:kotest-extensions-koin:1.3.0")  // Koin plugin
}

// KMP (commonTest)
kotlin {
    sourceSets.commonTest.dependencies {
        implementation("io.kotest:kotest-framework-engine:5.9.1")
        implementation("io.kotest:kotest-assertions-core:5.9.1")
        implementation("io.kotest:kotest-property:5.9.1")
    }
}

tasks.withType<Test> {
    useJUnitPlatform()                                  // for JVM Kotest runs via JUnit Platform
}
```

## Spec Styles

### StringSpec (most idiomatic)

```kotlin
class WalletTest : StringSpec({
    "valid mnemonic creates wallet" {
        val wallet = Wallet.fromMnemonic("abandon abandon ...")
        wallet.address(0) shouldStartWith "bc1q"
    }

    "invalid mnemonic throws" {
        shouldThrow<InvalidMnemonicException> {
            Wallet.fromMnemonic("not enough words")
        }
    }
})
```

### FunSpec

```kotlin
class WalletTest : FunSpec({
    test("valid mnemonic creates wallet") {
        val wallet = Wallet.fromMnemonic(...)
        wallet.address(0) shouldStartWith "bc1q"
    }

    context("when balance is zero") {
        test("send fails") {
            shouldThrow<InsufficientFundsException> { wallet.send(...) }
        }
    }
})
```

### BehaviorSpec (BDD)

```kotlin
class WalletBehavior : BehaviorSpec({
    given("an empty wallet") {
        val wallet = Wallet.empty()
        `when`("sending 1000 sats") {
            then("throws InsufficientFundsException") {
                shouldThrow<InsufficientFundsException> { wallet.send(1000) }
            }
        }
    }

    given("a wallet with 5000 sats") {
        val wallet = Wallet.withBalance(5000)
        `when`("sending 1000 sats") {
            val result = wallet.send(1000)
            then("balance becomes 4000") { wallet.balance shouldBe 4000 }
            then("returns success") { result.isSuccess shouldBe true }
        }
    }
})
```

### DescribeSpec

```kotlin
class WalletDescribe : DescribeSpec({
    describe("Wallet") {
        describe("send()") {
            it("succeeds when sufficient funds") { /* ... */ }
            it("fails on insufficient funds") { /* ... */ }
        }
    }
})
```

### FreeSpec (deeply nested)

```kotlin
class WalletFree : FreeSpec({
    "Wallet" - {
        "send" - {
            "with sufficient funds" - {
                "succeeds" {
                    val wallet = Wallet.withBalance(5000)
                    wallet.send(1000).isSuccess shouldBe true
                }
            }
        }
    }
})
```

Pick **StringSpec** for most cases. Use **BehaviorSpec/DescribeSpec** when stakeholders read tests. **FunSpec** for nested setup with `context`.

## Matchers

```kotlin
// Equality
result shouldBe 42
result shouldNotBe 0
list shouldContainExactly listOf(1, 2, 3)
list shouldContainExactlyInAnyOrder listOf(3, 1, 2)
list shouldContain 5
list shouldHaveSize 3

// Strings
"hello world" shouldContain "world"
"abc" shouldStartWith "a"
"abc" shouldEndWith "c"
"abc" shouldMatch Regex("[a-z]+")
"abc" shouldHaveLength 3

// Collections
emptyList<Int>().shouldBeEmpty()
listOf(1, 2, 3).shouldContainAll(1, 2)
mapOf("a" to 1).shouldContainKey("a")

// Null
foo.shouldBeNull()
bar.shouldNotBeNull()

// Type
result.shouldBeInstanceOf<Success>()
result.shouldBeTypeOf<List<String>>()

// Booleans
flag.shouldBeTrue()
flag.shouldBeFalse()

// Numeric
balance shouldBeGreaterThan 0
balance shouldBeBetween 1000 to 5000
amount.toDouble() shouldBe (1.5 plusOrMinus 0.01)

// Throwable
shouldThrow<IllegalArgumentException> { invalid() }
val ex = shouldThrow<WalletException> { send() }
ex.message shouldContain "insufficient"

// Exact type
shouldThrowExactly<InsufficientFundsException> { /* not subclasses */ }

// Any matcher works in negative
result shouldNotBe null
"abc" shouldNotContain "xyz"
```

Inverse via `shouldNot`:
```kotlin
list shouldNot contain(0)
"abc" shouldNot startWith("z")
```

## Data-Driven Tests (`withData`)

```kotlin
class UriParserTest : FunSpec({
    context("BIP21 parser") {
        withData(
            "bitcoin:bc1q..." to BitcoinUri(address = "bc1q..."),
            "bitcoin:bc1q...?amount=0.1" to BitcoinUri(address = "bc1q...", amount = 10_000_000),
            "bitcoin:bc1q...?label=Test" to BitcoinUri(address = "bc1q...", label = "Test"),
        ) { (input, expected) ->
            BitcoinUri.parse(input) shouldBe expected
        }
    }
})
```

For named cases:

```kotlin
withData(
    nameFn = { "parses ${it.first} → ${it.second}" },
    "bitcoin:bc1q..." to BitcoinUri(...),
    "bitcoin:bc1q...?amount=0.1" to BitcoinUri(...),
) { (input, expected) ->
    BitcoinUri.parse(input) shouldBe expected
}
```

For test class data:

```kotlin
data class TestCase(val input: String, val expected: BitcoinUri)

withData(
    TestCase("bitcoin:bc1q...", BitcoinUri(...)),
    TestCase("bitcoin:bc1q...?amount=0.1", BitcoinUri(...)),
) { (input, expected) ->
    BitcoinUri.parse(input) shouldBe expected
}
```

## Property-Based Testing

```kotlin
import io.kotest.property.*
import io.kotest.property.arbitrary.*

class FeeCalculatorTest : StringSpec({
    "fee is always at least 1 sat/vbyte" {
        forAll<Int>(Arb.int(0..1_000_000)) { weight ->
            val fee = calculateFee(weight, feeRate = 1)
            fee >= weight / 4
        }
    }

    "fee scales linearly" {
        checkAll<Int, Int>(
            Arb.int(100..10_000),       // weight
            Arb.int(1..100),            // fee rate
        ) { weight, rate ->
            val fee = calculateFee(weight, rate)
            fee shouldBe (weight / 4 * rate)
        }
    }
})
```

### Arbitraries

```kotlin
Arb.int(0..100)
Arb.long()
Arb.double(0.0..1.0)
Arb.string(minSize = 1, maxSize = 100)
Arb.string(8..12, Codepoint.alphanumeric())
Arb.list(Arb.int(), 0..10)
Arb.set(Arb.string())
Arb.map(Arb.string(), Arb.int(), 0..10)

// Custom
data class User(val id: Long, val name: String)

val userArb = arbitrary {
    User(
        id = Arb.long().bind(),
        name = Arb.string(1..50).bind(),
    )
}

forAll<User>(userArb) { user ->
    user.id != 0L
}
```

### Shrinking

When a property fails, Kotest **shrinks** the input to find the smallest failing case automatically. Reported in test output.

## Lifecycle Hooks

```kotlin
class WalletTest : StringSpec({
    beforeSpec {
        // Once before all tests in spec
        Db.migrate()
    }

    beforeTest {
        // Before each test
        Db.clear()
    }

    afterTest { (test, result) ->
        // After each test
        if (result.isError) takeDebugSnapshot(test.name.testName)
    }

    afterSpec {
        Db.close()
    }

    "test 1" { /* ... */ }
    "test 2" { /* ... */ }
})

// Or via extension classes
class DatabaseExtension : BeforeSpecListener, AfterSpecListener {
    override suspend fun beforeSpec(spec: Spec) { /* ... */ }
    override suspend fun afterSpec(spec: Spec) { /* ... */ }
}

class WalletTest : StringSpec({
    extension(DatabaseExtension())
    "test" { /* ... */ }
})
```

## Coroutine Support

Kotest test bodies are `suspend` — call suspending functions directly:

```kotlin
class WalletApiTest : StringSpec({
    "fetches user" {
        val api = WalletApi(mockClient())
        val user = api.getUser(1)                       // suspend call OK
        user.id shouldBe 1
    }
})
```

For virtual time / `kotlinx-coroutines-test` integration:

```kotlin
"timeout cancels operation" {
    runTest {
        val result = withTimeoutOrNull(5_000) {
            slowOperation()
        }
        result.shouldBeNull()
    }
}
```

## Test Isolation Modes

```kotlin
class WalletTest : StringSpec({
    isolationMode = IsolationMode.InstancePerTest      // new spec instance per test (slowest, most isolated)
    // OR
    isolationMode = IsolationMode.InstancePerLeaf      // per leaf test
    // OR (default)
    isolationMode = IsolationMode.SingleInstance       // shared spec instance (fastest)

    "test 1" { /* ... */ }
    "test 2" { /* ... */ }
})
```

Use `InstancePerTest` when tests mutate spec-level state.

## Tags & Filtering

```kotlin
object Slow : Tag()
object Smoke : Tag()

class WalletTest : StringSpec({
    "fast test" { /* ... */ }

    "slow integration test".config(tags = setOf(Slow)) {
        /* ... */
    }
})
```

```bash
# Run only smoke tests
./gradlew test -Dkotest.tags="Smoke"

# Exclude slow
./gradlew test -Dkotest.tags="!Slow"
```

## Configuration

`src/test/kotlin/ProjectConfig.kt`:

```kotlin
object ProjectConfig : AbstractProjectConfig() {
    override val parallelism = 4
    override val isolationMode = IsolationMode.InstancePerLeaf
    override val timeout: Duration = 30.seconds

    override suspend fun beforeProject() {
        // run once before all tests in project
    }

    override fun extensions() = listOf(MyGlobalExtension())
}
```

## Mocking — MockK Integration

Kotest doesn't bundle a mocking library — use **MockK** (the Kotlin-native mock library):

```kotlin
testImplementation("io.mockk:mockk:1.13.13")
```

```kotlin
class WalletServiceTest : StringSpec({
    "fetches from cache when available" {
        val cache = mockk<Cache> {
            every { get(1L) } returns Wallet(1, "cached")
        }
        val api = mockk<Api> {
            coEvery { getWallet(any()) } returns Wallet(1, "remote")
        }

        val service = WalletService(cache, api)
        val result = service.getWallet(1L)

        result.name shouldBe "cached"
        verify(exactly = 0) { runBlocking { api.getWallet(any()) } }
    }
})
```

## KMP Specifics

Kotest works in `commonTest`:

```kotlin
// commonTest/kotlin/WalletTest.kt
class WalletTest : StringSpec({
    "valid mnemonic" {
        Wallet.fromMnemonic("abandon ...").address(0) shouldStartWith "bc1q"
    }
})
```

Per-target test code goes in `androidUnitTest`, `iosTest`, `desktopTest`.

```bash
./gradlew :shared:jvmTest
./gradlew :shared:iosSimulatorArm64Test
./gradlew :shared:desktopTest
```

## Spring Integration (kotest-extensions-spring)

For Spring Boot tests:

```kotlin
testImplementation("io.kotest.extensions:kotest-extensions-spring:1.3.0")
```

```kotlin
@SpringBootTest
class UserServiceTest(private val service: UserService) : StringSpec() {
    override fun extensions() = listOf(SpringExtension)

    init {
        "fetches user" {
            service.findById(1)?.name shouldBe "Alice"
        }
    }
}
```

## Test Containers + Kotest

```kotlin
testImplementation("io.kotest.extensions:kotest-extensions-testcontainers:2.0.2")
```

```kotlin
class IntegrationTest : StringSpec({
    val postgres = install(JdbcDatabaseContainerExtension(PostgreSQLContainer("postgres:16")))

    "queries database" {
        val conn = postgres.createConnection("")
        val rs = conn.createStatement().executeQuery("SELECT 1")
        rs.next() shouldBe true
        rs.getInt(1) shouldBe 1
    }
})
```

## Anti-Patterns

| Anti-pattern | Why it's bad | Correct approach |
|---|---|---|
| Mixing JUnit assertions with Kotest matchers | Inconsistent output | Use `shouldBe` everywhere |
| `@Test` annotation on Kotest spec methods | Wrong runner | Don't use `@Test` — Kotest discovers via spec class |
| `class WalletTest : StringSpec()` (no `init {}`) | Tests don't register | Use `: StringSpec({ ... })` constructor block |
| Holding mutable state across tests in `SingleInstance` mode | Flaky | Use `InstancePerTest` or move state inside test |
| Property test with weak assertions (always true) | Doesn't catch bugs | Make assertion meaningful (e.g., round-trip equality) |
| `runBlocking { }` in test body | Wastes Kotest's coroutine support | Just call suspend directly |
| Skipping `useJUnitPlatform()` in Gradle | Tests not discovered | Always set in `tasks.withType<Test>` |
| Forgetting `extensions()` for Spring/Koin | Context not loaded | Override `extensions()` or use `extension(...)` in spec |
| `should fail` with `try/catch` | Verbose | Use `shouldThrow<T>` |
| Hardcoded delays (`Thread.sleep`) | Flaky | Use `eventually` or coroutine-based wait |

## Eventually (Polling)

```kotlin
"value eventually becomes ready" {
    eventually(5.seconds) {
        getStatus() shouldBe "ready"
    }
}
```

Configurable interval, factor, max attempts.

## Test Execution Tips

```bash
# Run specific spec
./gradlew test --tests "com.bhodl.WalletTest"

# Run by name pattern
./gradlew test --tests "*WalletTest*"

# Specific test
./gradlew test --tests "com.bhodl.WalletTest" -Dkotest.test.name="fetches user"
```

For VS Code / IntelliJ: install Kotest plugin to run individual specs/tests from gutter.

## When NOT to Use This Skill

| Scenario | Use Instead |
|----------|-------------|
| Pure JUnit 5 patterns | Framework-specific (Spring Boot Test, etc.) |
| Flow assertion | `testing/turbine` |
| Compose UI tests | Compose Test or `testing/compose-snapshot` |
| Mobile E2E | `testing/maestro` |
| Mocking patterns deep dive | MockK docs |
