# Gin Middleware

> **Knowledge Base:** Read `knowledge/gin/middleware.md` for complete documentation.

## Built-in Middleware

```go
package main

import "github.com/gin-gonic/gin"

func main() {
    // With default middleware (Logger + Recovery)
    r := gin.Default()

    // Or without default middleware
    r := gin.New()
    r.Use(gin.Logger())
    r.Use(gin.Recovery())
}
```

## Custom Middleware

```go
func Logger() gin.HandlerFunc {
    return func(c *gin.Context) {
        start := time.Now()
        path := c.Request.URL.Path

        // Before request
        c.Next()

        // After request
        latency := time.Since(start)
        status := c.Writer.Status()
        log.Printf("%s %s %d %v", c.Request.Method, path, status, latency)
    }
}

func main() {
    r := gin.New()
    r.Use(Logger())
}
```

## Authentication Middleware

```go
func AuthRequired() gin.HandlerFunc {
    return func(c *gin.Context) {
        token := c.GetHeader("Authorization")
        if token == "" {
            c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
                "error": "No token provided",
            })
            return
        }

        // Validate token
        claims, err := validateToken(strings.TrimPrefix(token, "Bearer "))
        if err != nil {
            c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
                "error": "Invalid token",
            })
            return
        }

        // Set user in context
        c.Set("user", claims)
        c.Next()
    }
}

// Usage
r.GET("/profile", AuthRequired(), func(c *gin.Context) {
    user, _ := c.Get("user")
    c.JSON(http.StatusOK, user)
})
```

## CORS Middleware

```go
func CORS() gin.HandlerFunc {
    return func(c *gin.Context) {
        c.Header("Access-Control-Allow-Origin", "*")
        c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization")

        if c.Request.Method == "OPTIONS" {
            c.AbortWithStatus(http.StatusNoContent)
            return
        }

        c.Next()
    }
}

// Or use github.com/gin-contrib/cors
import "github.com/gin-contrib/cors"

r.Use(cors.New(cors.Config{
    AllowOrigins:     []string{"http://localhost:3000"},
    AllowMethods:     []string{"GET", "POST", "PUT", "DELETE"},
    AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
    AllowCredentials: true,
}))
```

## Rate Limiting

```go
import "golang.org/x/time/rate"

func RateLimit(rps int) gin.HandlerFunc {
    limiter := rate.NewLimiter(rate.Limit(rps), rps)

    return func(c *gin.Context) {
        if !limiter.Allow() {
            c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{
                "error": "Rate limit exceeded",
            })
            return
        }
        c.Next()
    }
}
```

## Error Handling

```go
func ErrorHandler() gin.HandlerFunc {
    return func(c *gin.Context) {
        c.Next()

        // Check for errors after request
        if len(c.Errors) > 0 {
            err := c.Errors.Last()
            c.JSON(http.StatusInternalServerError, gin.H{
                "error": err.Error(),
            })
        }
    }
}

// Usage in handler
func getUser(c *gin.Context) {
    user, err := findUser(c.Param("id"))
    if err != nil {
        c.Error(err) // Will be handled by ErrorHandler
        return
    }
    c.JSON(http.StatusOK, user)
}
```

## Middleware Order

```go
func main() {
    r := gin.New()

    // Global middleware (runs for all routes)
    r.Use(gin.Logger())
    r.Use(gin.Recovery())
    r.Use(CORS())

    // Group middleware
    api := r.Group("/api")
    api.Use(AuthRequired())
    {
        api.GET("/users", getUsers)
    }

    // Route-specific middleware
    r.GET("/admin", AuthRequired(), AdminOnly(), adminHandler)
}
```

**Official docs:** https://gin-gonic.com/docs/examples/using-middleware/
