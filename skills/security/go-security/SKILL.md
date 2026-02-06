---
name: go-security
description: |
  Go security patterns for web applications. Covers dependency auditing,
  secure coding practices, crypto, and OWASP for Go ecosystem.

  USE WHEN: user works with "Go", "Golang", "Gin", "Fiber", "Echo", asks about "Go vulnerabilities", "Go modules security", "Go injection", "Go authentication"

  DO NOT USE FOR: general OWASP concepts - use `owasp` or `owasp-top-10` instead, other language security - use language-specific skills
allowed-tools: Read, Grep, Glob, Bash
---
# Go Security - Quick Reference

## When NOT to Use This Skill
- **General OWASP concepts** - Use `owasp` or `owasp-top-10` skill
- **Java security** - Use `java-security` skill
- **Python security** - Use `python-security` skill
- **Secrets management** - Use `secrets-management` skill

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `go` for Go security documentation.

## Dependency Auditing

```bash
# Go built-in vulnerability check (Go 1.18+)
go list -m -json all | go run golang.org/x/vuln/cmd/govulncheck@latest

# govulncheck direct
govulncheck ./...

# Check for outdated modules
go list -u -m all

# Verify module checksums
go mod verify

# Snyk for Go
snyk test
```

### CI/CD Integration

```yaml
# GitHub Actions
- name: Security audit
  run: |
    go install golang.org/x/vuln/cmd/govulncheck@latest
    govulncheck ./...

- name: Snyk scan
  uses: snyk/actions/golang@master
  with:
    args: --severity-threshold=high
```

## SQL Injection Prevention

### database/sql - Safe

```go
// SAFE - Parameterized query with ?
row := db.QueryRow("SELECT * FROM users WHERE email = ?", email)

// SAFE - Parameterized query with $n (PostgreSQL)
row := db.QueryRow("SELECT * FROM users WHERE email = $1", email)

// SAFE - Named parameters with sqlx
row := db.NamedQuery("SELECT * FROM users WHERE email = :email",
    map[string]interface{}{"email": email})
```

### database/sql - UNSAFE

```go
// UNSAFE - String formatting
query := fmt.Sprintf("SELECT * FROM users WHERE email = '%s'", email)  // NEVER!
row := db.QueryRow(query)

// UNSAFE - String concatenation
query := "SELECT * FROM users WHERE email = '" + email + "'"  // NEVER!
```

### GORM - Safe

```go
// SAFE - GORM where clause
var user User
db.Where("email = ?", email).First(&user)

// SAFE - GORM struct condition
db.Where(&User{Email: email}).First(&user)

// SAFE - GORM map condition
db.Where(map[string]interface{}{"email": email}).First(&user)
```

### GORM - UNSAFE

```go
// UNSAFE - Raw with formatting
db.Raw(fmt.Sprintf("SELECT * FROM users WHERE email = '%s'", email))  // NEVER!
```

## XSS Prevention

### html/template (Auto-escaping)

```go
// SAFE - html/template auto-escapes
import "html/template"

tmpl := template.Must(template.ParseFiles("page.html"))
tmpl.Execute(w, data)  // data.UserInput is auto-escaped
```

```html
<!-- Template - auto-escaped -->
<p>{{.UserInput}}</p>
```

### text/template - UNSAFE for HTML

```go
// UNSAFE for HTML - text/template does NOT escape
import "text/template"  // Only for non-HTML content!
```

### Manual Sanitization

```go
import "html"

// Escape HTML entities
safeString := html.EscapeString(userInput)

// For rich HTML, use bluemonday
import "github.com/microcosm-cc/bluemonday"

p := bluemonday.UGCPolicy()
safeHTML := p.Sanitize(userInput)
```

## Authentication - JWT

### JWT with golang-jwt

```go
import (
    "github.com/golang-jwt/jwt/v5"
    "time"
)

var jwtKey = []byte(os.Getenv("JWT_SECRET"))

type Claims struct {
    UserID string `json:"user_id"`
    Email  string `json:"email"`
    jwt.RegisteredClaims
}

func GenerateToken(userID, email string) (string, error) {
    claims := &Claims{
        UserID: userID,
        Email:  email,
        RegisteredClaims: jwt.RegisteredClaims{
            ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
            IssuedAt:  jwt.NewNumericDate(time.Now()),
            Issuer:    "myapp",
        },
    }

    token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
    return token.SignedString(jwtKey)
}

func ValidateToken(tokenString string) (*Claims, error) {
    claims := &Claims{}

    token, err := jwt.ParseWithClaims(tokenString, claims,
        func(token *jwt.Token) (interface{}, error) {
            // Validate signing method
            if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
                return nil, fmt.Errorf("unexpected signing method")
            }
            return jwtKey, nil
        })

    if err != nil || !token.Valid {
        return nil, err
    }

    return claims, nil
}
```

### Password Hashing with bcrypt

```go
import "golang.org/x/crypto/bcrypt"

func HashPassword(password string) (string, error) {
    // Cost 12 is recommended
    bytes, err := bcrypt.GenerateFromPassword([]byte(password), 12)
    return string(bytes), err
}

func CheckPassword(password, hash string) bool {
    err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
    return err == nil
}
```

### Password Hashing with Argon2

```go
import "golang.org/x/crypto/argon2"

func HashPasswordArgon2(password string) (string, error) {
    salt := make([]byte, 16)
    if _, err := rand.Read(salt); err != nil {
        return "", err
    }

    hash := argon2.IDKey([]byte(password), salt, 1, 64*1024, 4, 32)

    // Encode for storage
    return base64.StdEncoding.EncodeToString(append(salt, hash...)), nil
}
```

## Input Validation

### Using go-playground/validator

```go
import "github.com/go-playground/validator/v10"

type CreateUserRequest struct {
    Email    string `json:"email" validate:"required,email,max=255"`
    Password string `json:"password" validate:"required,min=12,max=128,containsany=ABCDEFGHIJKLMNOPQRSTUVWXYZ,containsany=abcdefghijklmnopqrstuvwxyz,containsany=0123456789,containsany=@$!%*?&"`
    Name     string `json:"name" validate:"required,min=2,max=100,alpha"`
}

var validate = validator.New()

func CreateUser(c *gin.Context) {
    var req CreateUserRequest
    if err := c.ShouldBindJSON(&req); err != nil {
        c.JSON(400, gin.H{"error": err.Error()})
        return
    }

    if err := validate.Struct(req); err != nil {
        c.JSON(400, gin.H{"error": err.Error()})
        return
    }

    // req is validated
}
```

### Custom Validation

```go
// Register custom validation
validate.RegisterValidation("safe_string", func(fl validator.FieldLevel) bool {
    return regexp.MustCompile(`^[a-zA-Z\s\-']+$`).MatchString(fl.Field().String())
})

type Request struct {
    Name string `validate:"required,safe_string"`
}
```

## Command Injection Prevention

```go
import "os/exec"

// SAFE - Use exec.Command with separate arguments
cmd := exec.Command("ls", "-la", directory)
output, err := cmd.Output()

// SAFE - Use exec.CommandContext for timeout
ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
defer cancel()
cmd := exec.CommandContext(ctx, "ls", "-la", directory)

// UNSAFE - Shell expansion
cmd := exec.Command("sh", "-c", "ls -la " + directory)  // NEVER with user input!

// UNSAFE - Using os.system equivalent
// Go doesn't have os.system, but avoid shell=true patterns
```

## Secure File Upload

```go
func UploadHandler(w http.ResponseWriter, r *http.Request) {
    // Limit request size
    r.Body = http.MaxBytesReader(w, r.Body, 10<<20) // 10 MB

    file, header, err := r.FormFile("file")
    if err != nil {
        http.Error(w, "File too large or invalid", http.StatusBadRequest)
        return
    }
    defer file.Close()

    // Validate content type
    allowedTypes := map[string]bool{
        "image/jpeg":      true,
        "image/png":       true,
        "application/pdf": true,
    }

    buffer := make([]byte, 512)
    file.Read(buffer)
    contentType := http.DetectContentType(buffer)
    file.Seek(0, 0) // Reset reader

    if !allowedTypes[contentType] {
        http.Error(w, "File type not allowed", http.StatusBadRequest)
        return
    }

    // Generate safe filename
    ext := filepath.Ext(header.Filename)
    safeName := fmt.Sprintf("%s%s", uuid.New().String(), ext)

    // Save outside web root
    destPath := filepath.Join(uploadDir, safeName)
    dest, err := os.Create(destPath)
    if err != nil {
        http.Error(w, "Failed to save file", http.StatusInternalServerError)
        return
    }
    defer dest.Close()

    io.Copy(dest, file)

    json.NewEncoder(w).Encode(map[string]string{"filename": safeName})
}
```

## CORS Configuration

### Gin

```go
import "github.com/gin-contrib/cors"

r := gin.Default()

r.Use(cors.New(cors.Config{
    AllowOrigins:     []string{"https://myapp.com"},
    AllowMethods:     []string{"GET", "POST", "PUT", "DELETE"},
    AllowHeaders:     []string{"Authorization", "Content-Type"},
    AllowCredentials: true,
    MaxAge:           12 * time.Hour,
}))
```

### Standard Library

```go
func corsMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        origin := r.Header.Get("Origin")
        allowedOrigins := map[string]bool{"https://myapp.com": true}

        if allowedOrigins[origin] {
            w.Header().Set("Access-Control-Allow-Origin", origin)
            w.Header().Set("Access-Control-Allow-Credentials", "true")
        }

        if r.Method == "OPTIONS" {
            w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE")
            w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
            w.WriteHeader(http.StatusNoContent)
            return
        }

        next.ServeHTTP(w, r)
    })
}
```

## Security Headers Middleware

```go
func securityHeaders(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.Header().Set("X-Content-Type-Options", "nosniff")
        w.Header().Set("X-Frame-Options", "DENY")
        w.Header().Set("X-XSS-Protection", "0") // Use CSP instead
        w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
        w.Header().Set("Content-Security-Policy", "default-src 'self'")
        w.Header().Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")

        next.ServeHTTP(w, r)
    })
}
```

## Rate Limiting

```go
import "golang.org/x/time/rate"

// Per-IP rate limiter
type IPRateLimiter struct {
    ips map[string]*rate.Limiter
    mu  *sync.RWMutex
    r   rate.Limit
    b   int
}

func NewIPRateLimiter(r rate.Limit, b int) *IPRateLimiter {
    return &IPRateLimiter{
        ips: make(map[string]*rate.Limiter),
        mu:  &sync.RWMutex{},
        r:   r,
        b:   b,
    }
}

func (i *IPRateLimiter) GetLimiter(ip string) *rate.Limiter {
    i.mu.Lock()
    defer i.mu.Unlock()

    limiter, exists := i.ips[ip]
    if !exists {
        limiter = rate.NewLimiter(i.r, i.b)
        i.ips[ip] = limiter
    }

    return limiter
}

// Middleware
func rateLimitMiddleware(limiter *IPRateLimiter) gin.HandlerFunc {
    return func(c *gin.Context) {
        ip := c.ClientIP()
        if !limiter.GetLimiter(ip).Allow() {
            c.AbortWithStatusJSON(429, gin.H{"error": "Too many requests"})
            return
        }
        c.Next()
    }
}
```

## Secrets Management

```go
import "os"

// Load from environment
type Config struct {
    JWTSecret    string
    DatabaseURL  string
    APIKey       string
}

func LoadConfig() (*Config, error) {
    jwtSecret := os.Getenv("JWT_SECRET")
    if jwtSecret == "" {
        return nil, errors.New("JWT_SECRET not set")
    }

    return &Config{
        JWTSecret:   jwtSecret,
        DatabaseURL: os.Getenv("DATABASE_URL"),
        APIKey:      os.Getenv("API_KEY"),
    }, nil
}

// NEVER hardcode secrets
// const jwtSecret = "hardcoded-secret"  // NEVER!
```

## Logging Security Events

```go
import "log/slog"

func LogLoginAttempt(username string, success bool, ip string) {
    slog.Info("login attempt",
        "user", username,
        "success", success,
        "ip", ip,
    )
}

func LogAccessDenied(userID string, resource string, ip string) {
    slog.Warn("access denied",
        "user_id", userID,
        "resource", resource,
        "ip", ip,
    )
}

// NEVER log sensitive data
// slog.Info("password", "value", password)  // NEVER!
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| `fmt.Sprintf` in SQL | SQL injection | Use parameterized queries |
| `text/template` for HTML | XSS vulnerability | Use `html/template` |
| Hardcoded secrets | Secret exposure | Use environment variables |
| `exec.Command("sh", "-c", input)` | Command injection | Use separate arguments |
| Weak JWT signing | Token forgery | Use HS256 minimum, verify alg |
| No request size limit | DoS attack | Use `MaxBytesReader` |
| Using MD5/SHA1 for passwords | Easily cracked | Use bcrypt or argon2 |

## Quick Troubleshooting

| Issue | Likely Cause | Solution |
|-------|--------------|----------|
| govulncheck finds CVE | Vulnerable dependency | Update with `go get -u` |
| JWT validation fails | Wrong signing method | Verify algorithm in ParseWithClaims |
| CORS error | Origin not allowed | Add origin to allowed list |
| bcrypt too slow | Cost factor too high | Use cost 10-12 |
| File upload fails | Size limit exceeded | Increase MaxBytesReader limit |
| Template not escaping | Using text/template | Switch to html/template |

## Security Scanning Commands

```bash
# Vulnerability check
govulncheck ./...

# Static analysis
staticcheck ./...
go vet ./...

# Security linter
gosec ./...

# Dependency check
go list -m -json all | nancy sleuth

# Snyk
snyk test

# Check for secrets
gitleaks detect
trufflehog git file://.
```

## Related Skills
- [OWASP Top 10:2025](../owasp-top-10/SKILL.md)
- [OWASP General](../owasp/SKILL.md)
- [Secrets Management](../secrets-management/SKILL.md)
- [Supply Chain Security](../supply-chain/SKILL.md)
