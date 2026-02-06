---
name: gin
description: |
  Gin Go web framework. Covers routing, middleware, binding, validation,
  and rendering. Use for fast, minimalist Go APIs.

  USE WHEN: user mentions "gin", "gin-gonic", "go web framework", "go rest api",
  asks about "gin middleware", "gin binding", "gin validation", "gin router",
  "fast go api", "gin context"

  DO NOT USE FOR: Echo projects - use `echo` instead, Fiber projects - use `fiber` instead,
  Chi projects - use `chi` instead, non-Go backends
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Gin Core Knowledge

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `gin` for comprehensive documentation.

## Basic Setup

```go
package main

import (
    "github.com/gin-gonic/gin"
    "net/http"
)

func main() {
    r := gin.Default()  // Logger and Recovery middleware

    r.GET("/", func(c *gin.Context) {
        c.String(http.StatusOK, "Hello, World!")
    })

    r.Run(":8080")
}
```

## Routing

### Basic Routes

```go
r := gin.Default()

r.GET("/users", listUsers)
r.GET("/users/:id", getUser)
r.POST("/users", createUser)
r.PUT("/users/:id", updateUser)
r.DELETE("/users/:id", deleteUser)

// Any HTTP method
r.Any("/any", handleAny)

// NoRoute handler
r.NoRoute(func(c *gin.Context) {
    c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
})
```

### Path Parameters

```go
// Single parameter
r.GET("/users/:id", func(c *gin.Context) {
    id := c.Param("id")
    c.JSON(http.StatusOK, gin.H{"id": id})
})

// Wildcard
r.GET("/files/*filepath", func(c *gin.Context) {
    filepath := c.Param("filepath")
    c.String(http.StatusOK, "File: %s", filepath)
})
```

### Route Groups

```go
api := r.Group("/api")
{
    v1 := api.Group("/v1")
    {
        v1.GET("/users", listUsersV1)
        v1.POST("/users", createUserV1)
    }

    v2 := api.Group("/v2")
    {
        v2.GET("/users", listUsersV2)
        v2.POST("/users", createUserV2)
    }
}
```

## Request Binding

### JSON Binding

```go
type CreateUserRequest struct {
    Name  string `json:"name" binding:"required"`
    Email string `json:"email" binding:"required,email"`
    Age   int    `json:"age" binding:"gte=0,lte=130"`
}

func createUser(c *gin.Context) {
    var req CreateUserRequest
    if err := c.ShouldBindJSON(&req); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
        return
    }

    c.JSON(http.StatusCreated, gin.H{
        "name":  req.Name,
        "email": req.Email,
    })
}
```

### Query Binding

```go
type ListUsersQuery struct {
    Page    int    `form:"page" binding:"gte=1"`
    PerPage int    `form:"per_page" binding:"gte=1,lte=100"`
    Sort    string `form:"sort"`
}

func listUsers(c *gin.Context) {
    var query ListUsersQuery
    query.Page = 1
    query.PerPage = 20

    if err := c.ShouldBindQuery(&query); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
        return
    }

    c.JSON(http.StatusOK, gin.H{
        "page":     query.Page,
        "per_page": query.PerPage,
    })
}
```

### Form Binding

```go
type LoginForm struct {
    Username string `form:"username" binding:"required"`
    Password string `form:"password" binding:"required"`
}

func login(c *gin.Context) {
    var form LoginForm
    if err := c.ShouldBind(&form); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
        return
    }

    c.JSON(http.StatusOK, gin.H{"username": form.Username})
}
```

### URI Binding

```go
type UserURI struct {
    ID uint `uri:"id" binding:"required"`
}

func getUser(c *gin.Context) {
    var uri UserURI
    if err := c.ShouldBindUri(&uri); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
        return
    }

    c.JSON(http.StatusOK, gin.H{"id": uri.ID})
}
```

## Validation

### Custom Validator

```go
import "github.com/go-playground/validator/v10"

var validateUsername validator.Func = func(fl validator.FieldLevel) bool {
    username := fl.Field().String()
    return len(username) >= 3 && len(username) <= 20
}

func main() {
    r := gin.Default()

    if v, ok := binding.Validator.Engine().(*validator.Validate); ok {
        v.RegisterValidation("username", validateUsername)
    }

    r.Run(":8080")
}

type RegisterRequest struct {
    Username string `json:"username" binding:"required,username"`
    Email    string `json:"email" binding:"required,email"`
}
```

## Middleware

### Built-in Middleware

```go
r := gin.New()

r.Use(gin.Logger())
r.Use(gin.Recovery())

r.Use(gin.LoggerWithFormatter(func(param gin.LogFormatterParams) string {
    return fmt.Sprintf("%s - [%s] %s %s %d %s\n",
        param.ClientIP,
        param.TimeStamp.Format(time.RFC1123),
        param.Method,
        param.Path,
        param.StatusCode,
        param.Latency,
    )
}))
```

### Custom Middleware

```go
func TimingMiddleware() gin.HandlerFunc {
    return func(c *gin.Context) {
        start := time.Now()
        c.Next()
        duration := time.Since(start)
        c.Header("X-Response-Time", duration.String())
    }
}

func main() {
    r := gin.Default()
    r.Use(TimingMiddleware())
}
```

### Authentication Middleware

```go
func AuthMiddleware() gin.HandlerFunc {
    return func(c *gin.Context) {
        token := c.GetHeader("Authorization")

        if token == "" {
            c.JSON(http.StatusUnauthorized, gin.H{"error": "missing token"})
            c.Abort()
            return
        }

        if !strings.HasPrefix(token, "Bearer ") {
            c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid format"})
            c.Abort()
            return
        }

        tokenString := token[7:]
        user, err := validateToken(tokenString)
        if err != nil {
            c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
            c.Abort()
            return
        }

        c.Set("user", user)
        c.Next()
    }
}

protected := r.Group("/api")
protected.Use(AuthMiddleware())
{
    protected.GET("/me", getMe)
}

func getMe(c *gin.Context) {
    user, _ := c.Get("user")
    c.JSON(http.StatusOK, user)
}
```

### CORS Middleware

```go
import "github.com/gin-contrib/cors"

func main() {
    r := gin.Default()

    r.Use(cors.New(cors.Config{
        AllowOrigins:     []string{"https://example.com"},
        AllowMethods:     []string{"GET", "POST", "PUT", "DELETE"},
        AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
        AllowCredentials: true,
        MaxAge:           12 * time.Hour,
    }))

    r.Run(":8080")
}
```

## Response Rendering

### JSON Response

```go
func getUser(c *gin.Context) {
    c.JSON(http.StatusOK, gin.H{
        "id":   1,
        "name": "Alice",
    })
}

type User struct {
    ID   uint   `json:"id"`
    Name string `json:"name"`
}

func getUser(c *gin.Context) {
    user := User{ID: 1, Name: "Alice"}
    c.JSON(http.StatusOK, user)
}
```

### Other Formats

```go
c.XML(http.StatusOK, gin.H{"message": "hello"})
c.YAML(http.StatusOK, gin.H{"message": "hello"})
c.String(http.StatusOK, "Hello, %s!", name)
c.Redirect(http.StatusMovedPermanently, "https://example.com")
c.File("./static/file.txt")
```

## Production Readiness

### Configuration

```go
func main() {
    gin.SetMode(gin.ReleaseMode)

    r := gin.New()
    r.Use(gin.Recovery())
    r.Use(gin.LoggerWithConfig(gin.LoggerConfig{
        Formatter: jsonLogFormatter,
        Output:    os.Stdout,
    }))

    r.Run(":8080")
}

func jsonLogFormatter(param gin.LogFormatterParams) string {
    log := map[string]interface{}{
        "timestamp": param.TimeStamp.Format(time.RFC3339),
        "status":    param.StatusCode,
        "latency":   param.Latency.Milliseconds(),
        "method":    param.Method,
        "path":      param.Path,
    }
    b, _ := json.Marshal(log)
    return string(b) + "\n"
}
```

### Health Checks

```go
func healthHandler(c *gin.Context) {
    c.JSON(http.StatusOK, gin.H{"status": "healthy"})
}

func readyHandler(db *sql.DB) gin.HandlerFunc {
    return func(c *gin.Context) {
        ctx, cancel := context.WithTimeout(c.Request.Context(), 2*time.Second)
        defer cancel()

        if err := db.PingContext(ctx); err != nil {
            c.JSON(http.StatusServiceUnavailable, gin.H{
                "status":   "not ready",
                "database": "disconnected",
            })
            return
        }

        c.JSON(http.StatusOK, gin.H{
            "status":   "ready",
            "database": "connected",
        })
    }
}
```

### Graceful Shutdown

```go
func main() {
    r := gin.Default()
    r.GET("/", func(c *gin.Context) {
        c.String(http.StatusOK, "Hello")
    })

    srv := &http.Server{
        Addr:    ":8080",
        Handler: r,
    }

    go func() {
        if err := srv.ListenAndServe(); err != http.ErrServerClosed {
            log.Fatalf("listen: %s\n", err)
        }
    }()

    quit := make(chan os.Signal, 1)
    signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
    <-quit
    log.Println("Shutting down...")

    ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
    defer cancel()

    if err := srv.Shutdown(ctx); err != nil {
        log.Fatal("Server forced to shutdown:", err)
    }
}
```

### Checklist

- [ ] gin.ReleaseMode for production
- [ ] CORS configured
- [ ] Authentication middleware
- [ ] Request validation
- [ ] Structured JSON logging
- [ ] Health/readiness endpoints
- [ ] Graceful shutdown
- [ ] Rate limiting

## When NOT to Use This Skill

- **Echo projects** - Echo has different middleware patterns
- **Fiber projects** - Fiber is Express-like with different API
- **Chi projects** - Chi is stdlib-compatible router
- **gRPC services** - Use gRPC framework directly
- **Minimal stdlib apps** - Gin adds dependency overhead

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Solution |
|--------------|--------------|----------|
| Using `gin.Default()` without knowing | Includes logger/recovery you may not want | Use `gin.New()` and add middleware explicitly |
| Not checking binding errors | Invalid data processed | Always check `ShouldBindJSON()` error |
| Using `c.String()` for JSON | Manual serialization error-prone | Use `c.JSON()` instead |
| Global variables for config | Hard to test | Pass config via context or dependency injection |
| Missing validation tags | No input validation | Use `binding:"required,email"` tags |
| Not setting gin.ReleaseMode | Debug logs in production | Set `gin.SetMode(gin.ReleaseMode)` |

## Quick Troubleshooting

| Problem | Diagnosis | Fix |
|---------|-----------|-----|
| Route not found (404) | Route not registered | Check router setup and method |
| Binding fails silently | Not checking error | Check `ShouldBindJSON()` return value |
| CORS errors | Not configured | Use `gin-contrib/cors` middleware |
| Middleware not executing | Wrong order | Place middleware before routes |
| Panic in handler | No recovery middleware | Use `gin.Recovery()` |
| Slow JSON serialization | Large response | Use `c.Stream()` or pagination |

## Reference Documentation

- [Routing](quick-ref/routing.md)
- [Binding](quick-ref/binding.md)
- [Middleware](quick-ref/middleware.md)
