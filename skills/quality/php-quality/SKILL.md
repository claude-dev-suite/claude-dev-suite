# PHP Code Quality Skill

> **USE WHEN:** Working with PHP codebases requiring code quality analysis, static analysis, or best practices enforcement.
> **DO NOT USE FOR:** Security-specific issues (use php-security), runtime debugging, or deployment.

## Tools & Configuration

### PHPStan (Static Analysis)
```bash
# Installation
composer require --dev phpstan/phpstan

# Run analysis
./vendor/bin/phpstan analyse src tests --level=8
```

```neon
# phpstan.neon
parameters:
    level: 8
    paths:
        - src
        - tests
    excludePaths:
        - vendor
    checkMissingIterableValueType: true
    checkGenericClassInNonGenericObjectType: true
    reportUnmatchedIgnoredErrors: true
```

### PHP_CodeSniffer (Coding Standards)
```bash
# Installation
composer require --dev squizlabs/php_codesniffer

# Check standards
./vendor/bin/phpcs --standard=PSR12 src/

# Auto-fix
./vendor/bin/phpcbf --standard=PSR12 src/
```

### PHP-CS-Fixer (Code Formatting)
```bash
# Installation
composer require --dev friendsofphp/php-cs-fixer

# Run fixer
./vendor/bin/php-cs-fixer fix src/
```

```php
// .php-cs-fixer.php
<?php
return (new PhpCsFixer\Config())
    ->setRules([
        '@PSR12' => true,
        '@PHP82Migration' => true,
        'strict_param' => true,
        'array_syntax' => ['syntax' => 'short'],
        'no_unused_imports' => true,
        'ordered_imports' => ['sort_algorithm' => 'alpha'],
        'single_quote' => true,
        'trailing_comma_in_multiline' => true,
    ])
    ->setFinder(
        PhpCsFixer\Finder::create()
            ->in(__DIR__ . '/src')
            ->in(__DIR__ . '/tests')
    );
```

### Psalm (Type Safety)
```bash
# Installation
composer require --dev vimeo/psalm

# Initialize
./vendor/bin/psalm --init

# Run analysis
./vendor/bin/psalm
```

```xml
<!-- psalm.xml -->
<?xml version="1.0"?>
<psalm
    errorLevel="1"
    xmlns="https://getpsalm.org/schema/config"
>
    <projectFiles>
        <directory name="src"/>
        <ignoreFiles>
            <directory name="vendor"/>
        </ignoreFiles>
    </projectFiles>
</psalm>
```

## Quality Metrics

| Metric | Target | Tool |
|--------|--------|------|
| Cyclomatic Complexity | < 10 | PHPMD, PHPStan |
| Coupling | < 15 dependencies | PHPMD |
| Code Coverage | > 80% | PHPUnit |
| PHPStan Level | >= 8 | PHPStan |
| PSR-12 Compliance | 100% | PHP_CodeSniffer |

## Code Smells & Fixes

### Long Methods
```php
// Bad: Method does too much
public function processOrder($order) {
    // validate order (10 lines)
    // calculate totals (15 lines)
    // apply discounts (20 lines)
    // save to database (10 lines)
    // send notification (10 lines)
}

// Good: Single responsibility
public function processOrder(Order $order): void {
    $this->validateOrder($order);
    $totals = $this->calculateTotals($order);
    $discountedTotals = $this->applyDiscounts($totals);
    $this->orderRepository->save($order);
    $this->notificationService->sendOrderConfirmation($order);
}
```

### Type Safety
```php
// Bad: No type hints
function getUser($id) {
    return $this->repo->find($id);
}

// Good: Full type hints with strict types
declare(strict_types=1);

public function getUser(int $id): ?User {
    return $this->userRepository->find($id);
}
```

### Dependency Injection
```php
// Bad: Hard-coded dependencies
class OrderService {
    public function process() {
        $logger = new FileLogger();
        $mailer = new SmtpMailer();
    }
}

// Good: Constructor injection
class OrderService {
    public function __construct(
        private readonly LoggerInterface $logger,
        private readonly MailerInterface $mailer,
    ) {}
}
```

### PHPMD Rules
```xml
<!-- phpmd.xml -->
<?xml version="1.0"?>
<ruleset name="Project Rules">
    <rule ref="rulesets/cleancode.xml"/>
    <rule ref="rulesets/codesize.xml">
        <exclude name="TooManyPublicMethods"/>
    </rule>
    <rule ref="rulesets/controversial.xml"/>
    <rule ref="rulesets/design.xml"/>
    <rule ref="rulesets/naming.xml">
        <exclude name="ShortVariable"/>
    </rule>
    <rule ref="rulesets/unusedcode.xml"/>
</ruleset>
```

## Modern PHP Best Practices

### PHP 8.2+ Features
```php
// Readonly classes
readonly class UserDTO {
    public function __construct(
        public string $name,
        public string $email,
    ) {}
}

// Enums
enum OrderStatus: string {
    case Pending = 'pending';
    case Processing = 'processing';
    case Completed = 'completed';

    public function label(): string {
        return match($this) {
            self::Pending => 'In attesa',
            self::Processing => 'In elaborazione',
            self::Completed => 'Completato',
        };
    }
}

// Named arguments
$user = new User(
    name: 'John',
    email: 'john@example.com',
    role: Role::Admin,
);

// Match expressions
$result = match($status) {
    'success' => handleSuccess(),
    'error' => handleError(),
    default => handleUnknown(),
};
```

### Exception Handling
```php
// Define custom exceptions
class DomainException extends \Exception {}
class ValidationException extends DomainException {}
class NotFoundException extends DomainException {}

// Proper exception handling
try {
    $user = $this->userService->findOrFail($id);
} catch (NotFoundException $e) {
    return $this->notFound($e->getMessage());
} catch (ValidationException $e) {
    return $this->badRequest($e->getMessage());
} catch (\Throwable $e) {
    $this->logger->error($e->getMessage(), ['exception' => $e]);
    return $this->serverError('An unexpected error occurred');
}
```

## CI/CD Integration

```yaml
# GitHub Actions
name: PHP Quality
on: [push, pull_request]

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup PHP
        uses: shivammathur/setup-php@v2
        with:
          php-version: '8.2'
          coverage: xdebug

      - name: Install dependencies
        run: composer install --no-progress

      - name: PHPStan
        run: ./vendor/bin/phpstan analyse --error-format=github

      - name: PHP_CodeSniffer
        run: ./vendor/bin/phpcs --report=checkstyle | cs2pr

      - name: Psalm
        run: ./vendor/bin/psalm --output-format=github

      - name: PHPUnit
        run: ./vendor/bin/phpunit --coverage-clover coverage.xml

      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

## Common Commands

```bash
# Full quality check
composer run-script quality

# composer.json scripts
"scripts": {
    "quality": [
        "@phpstan",
        "@phpcs",
        "@psalm"
    ],
    "phpstan": "./vendor/bin/phpstan analyse",
    "phpcs": "./vendor/bin/phpcs",
    "phpcbf": "./vendor/bin/phpcbf",
    "psalm": "./vendor/bin/psalm",
    "test": "./vendor/bin/phpunit",
    "test:coverage": "./vendor/bin/phpunit --coverage-html coverage"
}
```
