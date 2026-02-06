# PHP Security Skill

> **USE WHEN:** Securing PHP applications, reviewing code for vulnerabilities, or implementing security best practices.
> **DO NOT USE FOR:** Code quality issues (use php-quality), general PHP development patterns.

## OWASP Top 10 for PHP

### A01: Broken Access Control

```php
// Bad: IDOR vulnerability
public function getOrder(int $orderId): Order {
    return $this->orderRepository->find($orderId);  // No ownership check!
}

// Good: Ownership verification
public function getOrder(int $orderId, User $currentUser): Order {
    $order = $this->orderRepository->find($orderId);

    if ($order->getUserId() !== $currentUser->getId() &&
        !$currentUser->hasRole('ADMIN')) {
        throw new AccessDeniedException('Cannot access this order');
    }

    return $order;
}

// Good: Using Symfony voters
#[IsGranted('VIEW', subject: 'order')]
public function show(Order $order): Response {
    return $this->render('order/show.html.twig', ['order' => $order]);
}
```

### A03: Injection

```php
// Bad: SQL Injection
$query = "SELECT * FROM users WHERE id = " . $_GET['id'];
$result = $pdo->query($query);

// Good: Prepared statements (PDO)
$stmt = $pdo->prepare("SELECT * FROM users WHERE id = :id");
$stmt->execute(['id' => $_GET['id']]);

// Good: Doctrine DQL
$user = $entityManager->createQuery(
    'SELECT u FROM User u WHERE u.email = :email'
)->setParameter('email', $email)->getOneOrNullResult();

// Bad: Command injection
exec("ls " . $_GET['dir']);

// Good: escapeshellarg or avoid shell entirely
$dir = escapeshellarg($_GET['dir']);
exec("ls $dir");

// Better: Use PHP functions instead of shell
$files = scandir($_GET['dir']); // Still validate path!
```

### A04: Cryptographic Failures

```php
// Bad: MD5 for passwords
$hash = md5($password);

// Good: password_hash with Argon2id
$hash = password_hash($password, PASSWORD_ARGON2ID, [
    'memory_cost' => 65536,
    'time_cost' => 4,
    'threads' => 3,
]);

// Verify password
if (!password_verify($inputPassword, $storedHash)) {
    throw new AuthenticationException('Invalid credentials');
}

// Good: Secure random generation
$token = bin2hex(random_bytes(32));
$apiKey = base64_encode(random_bytes(24));

// Good: Encryption with libsodium
$key = sodium_crypto_secretbox_keygen();
$nonce = random_bytes(SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
$encrypted = sodium_crypto_secretbox($plaintext, $nonce, $key);
$decrypted = sodium_crypto_secretbox_open($encrypted, $nonce, $key);
```

### A05: XSS Prevention

```php
// Bad: Direct output
echo "<div>" . $_GET['name'] . "</div>";

// Good: Escape output
echo "<div>" . htmlspecialchars($_GET['name'], ENT_QUOTES, 'UTF-8') . "</div>";

// Good: Twig auto-escaping (enabled by default)
{{ user.name }}  {# Automatically escaped #}
{{ user.bio|raw }}  {# Only use raw when content is trusted #}

// Good: Content Security Policy
header("Content-Security-Policy: default-src 'self'; script-src 'self'");
```

### A07: Authentication Failures

```php
// Good: Secure session configuration
ini_set('session.cookie_httponly', 1);
ini_set('session.cookie_secure', 1);
ini_set('session.cookie_samesite', 'Strict');
ini_set('session.use_strict_mode', 1);
ini_set('session.sid_length', 48);

// Good: Session regeneration after login
session_regenerate_id(true);

// Good: Rate limiting with Symfony
use Symfony\Component\RateLimiter\RateLimiterFactory;

public function login(RateLimiterFactory $loginLimiter): Response {
    $limiter = $loginLimiter->create($request->getClientIp());

    if (!$limiter->consume()->isAccepted()) {
        throw new TooManyRequestsHttpException();
    }

    // Process login
}

// Good: Timing-safe comparison
if (!hash_equals($storedToken, $inputToken)) {
    throw new InvalidTokenException();
}
```

### A08: Software Integrity

```php
// Good: Verify file uploads
$allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif'];
$finfo = new finfo(FILEINFO_MIME_TYPE);
$mimeType = $finfo->file($_FILES['upload']['tmp_name']);

if (!in_array($mimeType, $allowedMimeTypes, true)) {
    throw new InvalidArgumentException('Invalid file type');
}

// Good: Secure deserialization - NEVER unserialize untrusted data
// Use JSON instead
$data = json_decode($input, true, 512, JSON_THROW_ON_ERROR);

// If you must use unserialize, use allowed_classes
$data = unserialize($input, ['allowed_classes' => [AllowedClass::class]]);
```

## Framework-Specific Security

### Laravel Security

```php
// CSRF protection (automatic in forms)
@csrf

// Mass assignment protection
class User extends Model {
    protected $fillable = ['name', 'email'];  // Whitelist
    // OR
    protected $guarded = ['id', 'is_admin'];  // Blacklist
}

// Query scopes for authorization
public function scopeForUser(Builder $query, User $user): Builder {
    return $query->where('user_id', $user->id);
}

// Validation
$validated = $request->validate([
    'email' => 'required|email:rfc,dns|unique:users',
    'password' => 'required|min:12|confirmed',
]);

// Encryption
use Illuminate\Support\Facades\Crypt;
$encrypted = Crypt::encryptString($data);
$decrypted = Crypt::decryptString($encrypted);
```

### Symfony Security

```php
// Security configuration
# config/packages/security.yaml
security:
    password_hashers:
        Symfony\Component\Security\Core\User\PasswordAuthenticatedUserInterface:
            algorithm: argon2id

    firewalls:
        main:
            lazy: true
            provider: app_user_provider
            custom_authenticator: App\Security\LoginAuthenticator
            logout:
                path: app_logout

    access_control:
        - { path: ^/admin, roles: ROLE_ADMIN }
        - { path: ^/api, roles: ROLE_API }

// Voters for fine-grained access
class OrderVoter extends Voter {
    protected function supports(string $attribute, mixed $subject): bool {
        return $subject instanceof Order && in_array($attribute, ['VIEW', 'EDIT']);
    }

    protected function voteOnAttribute(string $attribute, mixed $subject, TokenInterface $token): bool {
        $user = $token->getUser();
        return $subject->getUser() === $user;
    }
}
```

## Security Headers

```php
// Comprehensive security headers
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('X-XSS-Protection: 1; mode=block');
header('Referrer-Policy: strict-origin-when-cross-origin');
header('Permissions-Policy: geolocation=(), microphone=(), camera=()');

// CSP with nonce
$nonce = base64_encode(random_bytes(16));
header("Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-$nonce'");

// Strict Transport Security
header('Strict-Transport-Security: max-age=31536000; includeSubDomains; preload');
```

## Input Validation

```php
// Validation class
class InputValidator {
    public static function email(string $input): string {
        $email = filter_var($input, FILTER_VALIDATE_EMAIL);
        if ($email === false) {
            throw new ValidationException('Invalid email');
        }
        return $email;
    }

    public static function integer(mixed $input, int $min = PHP_INT_MIN, int $max = PHP_INT_MAX): int {
        $value = filter_var($input, FILTER_VALIDATE_INT, [
            'options' => ['min_range' => $min, 'max_range' => $max]
        ]);
        if ($value === false) {
            throw new ValidationException("Invalid integer");
        }
        return $value;
    }

    public static function url(string $input): string {
        $url = filter_var($input, FILTER_VALIDATE_URL);
        if ($url === false || !in_array(parse_url($url, PHP_URL_SCHEME), ['http', 'https'])) {
            throw new ValidationException('Invalid URL');
        }
        return $url;
    }
}
```

## File Upload Security

```php
class SecureUploader {
    private const MAX_SIZE = 5 * 1024 * 1024; // 5MB
    private const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'pdf'];
    private const ALLOWED_MIMES = [
        'image/jpeg', 'image/png', 'application/pdf'
    ];

    public function upload(UploadedFile $file): string {
        // Check size
        if ($file->getSize() > self::MAX_SIZE) {
            throw new FileTooLargeException();
        }

        // Check extension
        $extension = strtolower($file->getClientOriginalExtension());
        if (!in_array($extension, self::ALLOWED_EXTENSIONS, true)) {
            throw new InvalidFileTypeException();
        }

        // Check MIME type (from file content, not header)
        $finfo = new finfo(FILEINFO_MIME_TYPE);
        $mimeType = $finfo->file($file->getPathname());
        if (!in_array($mimeType, self::ALLOWED_MIMES, true)) {
            throw new InvalidFileTypeException();
        }

        // Generate safe filename
        $filename = bin2hex(random_bytes(16)) . '.' . $extension;

        // Store outside web root
        $file->move('/var/uploads/', $filename);

        return $filename;
    }
}
```

## Security Scanning

```bash
# Composer audit
composer audit

# PHPCS Security rules
composer require --dev pheromone/phpcs-security-audit
./vendor/bin/phpcs --standard=Security src/

# Psalm security analysis
composer require --dev psalm/plugin-security
./vendor/bin/psalm --taint-analysis

# Local-PHP-Security-Checker
local-php-security-checker

# RIPS (commercial) or Progpilot (open source)
./vendor/bin/progpilot src/
```

## CI/CD Security Integration

```yaml
name: Security Scan
on: [push, pull_request]

jobs:
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup PHP
        uses: shivammathur/setup-php@v2
        with:
          php-version: '8.2'

      - name: Install dependencies
        run: composer install

      - name: Composer Audit
        run: composer audit --format=json > audit.json

      - name: PHPCS Security
        run: ./vendor/bin/phpcs --standard=Security src/

      - name: Psalm Taint Analysis
        run: ./vendor/bin/psalm --taint-analysis

      - name: Check for secrets
        uses: trufflesecurity/trufflehog@main
        with:
          path: ./
```
