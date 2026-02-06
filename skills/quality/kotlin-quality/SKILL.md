# Kotlin Code Quality Skill

> **USE WHEN:** Working with Kotlin codebases requiring code quality analysis, static analysis, or best practices enforcement.
> **DO NOT USE FOR:** Security-specific issues (use kotlin-security), Android-specific concerns, or deployment.

## Tools & Configuration

### Detekt (Static Analysis)
```bash
# Gradle setup
plugins {
    id("io.gitlab.arturbosch.detekt") version "1.23.4"
}

detekt {
    buildUponDefaultConfig = true
    allRules = false
    config.setFrom("$projectDir/config/detekt.yml")
}

# Run
./gradlew detekt
```

```yaml
# detekt.yml
build:
  maxIssues: 0

complexity:
  LongMethod:
    threshold: 30
  LongParameterList:
    functionThreshold: 5
    constructorThreshold: 8
  ComplexCondition:
    threshold: 4
  CyclomaticComplexMethod:
    threshold: 10
  NestedBlockDepth:
    threshold: 4

naming:
  FunctionNaming:
    functionPattern: '[a-z][a-zA-Z0-9]*'
  VariableNaming:
    variablePattern: '[a-z][a-zA-Z0-9]*'

style:
  MaxLineLength:
    maxLineLength: 120
  WildcardImport:
    active: true
  UnusedImports:
    active: true
  UnusedPrivateMember:
    active: true

potential-bugs:
  UnsafeCast:
    active: true
  UselessPostfixExpression:
    active: true
```

### Ktlint (Code Formatting)
```bash
# Gradle setup
plugins {
    id("org.jlleitschuh.gradle.ktlint") version "12.1.0"
}

ktlint {
    version.set("1.1.1")
    android.set(false)
    outputColorName.set("RED")
}

# Run
./gradlew ktlintCheck
./gradlew ktlintFormat
```

```properties
# .editorconfig
[*.{kt,kts}]
ktlint_code_style = ktlint_official
max_line_length = 120
indent_size = 4
ktlint_function_naming_ignore_when_annotated_with = Composable
```

### Konsist (Architecture Tests)
```kotlin
// build.gradle.kts
testImplementation("com.lemonappdev:konsist:0.13.0")

// Architecture tests
class ArchitectureTest {
    @Test
    fun `services should not depend on controllers`() {
        Konsist.scopeFromProject()
            .classes()
            .withNameEndingWith("Service")
            .assertFalse { it.hasImportWithName("..controller..") }
    }

    @Test
    fun `use cases should have single public method`() {
        Konsist.scopeFromProject()
            .classes()
            .withNameEndingWith("UseCase")
            .assertTrue { it.countPublicMethods() == 1 }
    }
}
```

## Quality Metrics

| Metric | Target | Tool |
|--------|--------|------|
| Cyclomatic Complexity | < 10 | Detekt |
| Method Length | < 30 lines | Detekt |
| Code Coverage | > 80% | JaCoCo |
| Code Smells | 0 blockers | Detekt |
| Formatting | 100% compliant | Ktlint |

## Kotlin Best Practices

### Null Safety
```kotlin
// Bad: Platform types and unsafe casts
fun processUser(user: User?) {
    val name = user!!.name  // NullPointerException risk
}

// Good: Safe handling
fun processUser(user: User?): String {
    return user?.name ?: "Unknown"
}

// Good: Early return pattern
fun processUser(user: User?): String {
    val validUser = user ?: return "No user provided"
    return validUser.name
}

// Good: Require for preconditions
fun processUser(user: User?) {
    requireNotNull(user) { "User cannot be null" }
    require(user.age >= 0) { "Age must be positive" }
}
```

### Data Classes
```kotlin
// Bad: Manual equals/hashCode
class User(val id: Int, val name: String) {
    override fun equals(other: Any?): Boolean { ... }
    override fun hashCode(): Int { ... }
}

// Good: Data class
data class User(
    val id: Int,
    val name: String,
    val email: String,
) {
    // Add computed properties if needed
    val displayName: String get() = "$name ($email)"
}
```

### Sealed Classes for State
```kotlin
// Good: Exhaustive when
sealed class Result<out T> {
    data class Success<T>(val data: T) : Result<T>()
    data class Error(val exception: Throwable) : Result<Nothing>()
    data object Loading : Result<Nothing>()
}

fun handleResult(result: Result<User>) = when (result) {
    is Result.Success -> showUser(result.data)
    is Result.Error -> showError(result.exception)
    Result.Loading -> showLoading()
    // Compiler ensures all cases are handled
}
```

### Extension Functions
```kotlin
// Good: Readable extensions
fun String.isValidEmail(): Boolean =
    matches(Regex("^[A-Za-z0-9+_.-]+@[A-Za-z0-9.-]+$"))

fun <T> List<T>.secondOrNull(): T? = getOrNull(1)

// Use scope functions appropriately
val user = User().apply {
    name = "John"
    email = "john@example.com"
}.also {
    logger.info("Created user: ${it.name}")
}

val result = data.let { transform(it) }
    .takeIf { it.isValid }
    ?: defaultValue
```

### Coroutines Best Practices
```kotlin
// Bad: Blocking in coroutine
suspend fun fetchData(): Data {
    return withContext(Dispatchers.IO) {
        Thread.sleep(1000)  // Bad!
    }
}

// Good: Proper suspension
suspend fun fetchData(): Data = withContext(Dispatchers.IO) {
    delay(1000)  // Non-blocking
    repository.fetch()
}

// Good: Structured concurrency
class UserService(
    private val scope: CoroutineScope,
    private val dispatcher: CoroutineDispatcher = Dispatchers.Default
) {
    fun processAsync() = scope.launch(dispatcher) {
        // Work happens in controlled scope
    }
}

// Good: Exception handling
suspend fun safeFetch(): Result<Data> = runCatching {
    withContext(Dispatchers.IO) {
        api.fetch()
    }
}
```

### Collections
```kotlin
// Bad: Mutable collections exposed
class UserRepository {
    private val users = mutableListOf<User>()
    fun getUsers(): MutableList<User> = users  // Exposes internal state!
}

// Good: Immutable interface
class UserRepository {
    private val _users = mutableListOf<User>()
    val users: List<User> get() = _users.toList()
}

// Good: Collection transformations
val activeAdminEmails = users
    .filter { it.isActive }
    .filter { it.role == Role.ADMIN }
    .map { it.email }
    .distinct()

// Good: Sequence for large collections
val result = largeList.asSequence()
    .filter { expensiveCheck(it) }
    .map { transform(it) }
    .take(10)
    .toList()
```

## Code Smells & Fixes

### God Class
```kotlin
// Bad: Class does everything
class OrderManager {
    fun createOrder() { ... }
    fun validateOrder() { ... }
    fun calculatePricing() { ... }
    fun sendNotification() { ... }
    fun generateReport() { ... }
}

// Good: Single responsibility
class OrderService(
    private val validator: OrderValidator,
    private val pricingService: PricingService,
    private val notificationService: NotificationService,
) {
    fun createOrder(request: CreateOrderRequest): Order {
        validator.validate(request)
        val pricing = pricingService.calculate(request.items)
        val order = orderRepository.save(Order(request, pricing))
        notificationService.sendConfirmation(order)
        return order
    }
}
```

### Feature Envy
```kotlin
// Bad: Method uses another class's data too much
fun calculateDiscount(order: Order): Double {
    return if (order.customer.loyaltyPoints > 100 &&
               order.customer.memberSince.isBefore(oneYearAgo) &&
               order.customer.totalOrders > 10) {
        order.total * 0.15
    } else {
        0.0
    }
}

// Good: Move logic to appropriate class
// In Customer class
fun Customer.isEligibleForPremiumDiscount(): Boolean =
    loyaltyPoints > 100 &&
    memberSince.isBefore(LocalDate.now().minusYears(1)) &&
    totalOrders > 10

// Usage
fun calculateDiscount(order: Order): Double =
    if (order.customer.isEligibleForPremiumDiscount()) order.total * 0.15 else 0.0
```

## CI/CD Integration

```yaml
# GitHub Actions
name: Kotlin Quality
on: [push, pull_request]

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup JDK
        uses: actions/setup-java@v4
        with:
          java-version: '21'
          distribution: 'temurin'

      - name: Cache Gradle
        uses: actions/cache@v4
        with:
          path: |
            ~/.gradle/caches
            ~/.gradle/wrapper
          key: gradle-${{ hashFiles('**/*.gradle*', '**/gradle-wrapper.properties') }}

      - name: Detekt
        run: ./gradlew detekt

      - name: Ktlint
        run: ./gradlew ktlintCheck

      - name: Tests with Coverage
        run: ./gradlew test jacocoTestReport

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: build/reports/jacoco/test/jacocoTestReport.xml
```

## Common Commands

```bash
# Full quality check
./gradlew check

# Individual tools
./gradlew detekt
./gradlew ktlintCheck
./gradlew ktlintFormat

# Test with coverage
./gradlew test jacocoTestReport

# Generate reports
./gradlew detekt --report html:build/reports/detekt.html
```
