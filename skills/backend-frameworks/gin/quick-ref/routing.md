# Gin Routing

> **Knowledge Base:** Read `knowledge/gin/routing.md` for complete documentation.

## Basic Routing

```go
package main

import (
    "net/http"
    "github.com/gin-gonic/gin"
)

func main() {
    r := gin.Default()

    // HTTP methods
    r.GET("/users", getUsers)
    r.POST("/users", createUser)
    r.PUT("/users/:id", updateUser)
    r.DELETE("/users/:id", deleteUser)
    r.PATCH("/users/:id", patchUser)

    r.Run(":8080")
}

func getUsers(c *gin.Context) {
    c.JSON(http.StatusOK, gin.H{"users": []string{}})
}
```

## Path Parameters

```go
// Single parameter
r.GET("/users/:id", func(c *gin.Context) {
    id := c.Param("id")
    c.JSON(http.StatusOK, gin.H{"id": id})
})

// Multiple parameters
r.GET("/users/:userId/posts/:postId", func(c *gin.Context) {
    userId := c.Param("userId")
    postId := c.Param("postId")
    c.JSON(http.StatusOK, gin.H{
        "userId": userId,
        "postId": postId,
    })
})

// Wildcard
r.GET("/files/*filepath", func(c *gin.Context) {
    filepath := c.Param("filepath")
    c.String(http.StatusOK, "File: %s", filepath)
})
```

## Query Parameters

```go
r.GET("/search", func(c *gin.Context) {
    // Single value
    query := c.Query("q")
    page := c.DefaultQuery("page", "1")

    // Multiple values
    tags := c.QueryArray("tags")

    // Map
    filters := c.QueryMap("filter")

    c.JSON(http.StatusOK, gin.H{
        "query":   query,
        "page":    page,
        "tags":    tags,
        "filters": filters,
    })
})
```

## Route Groups

```go
func main() {
    r := gin.Default()

    // API v1
    v1 := r.Group("/api/v1")
    {
        v1.GET("/users", getUsers)
        v1.POST("/users", createUser)
    }

    // API v2
    v2 := r.Group("/api/v2")
    {
        v2.GET("/users", getUsersV2)
    }

    // With middleware
    admin := r.Group("/admin")
    admin.Use(AuthRequired())
    {
        admin.GET("/dashboard", dashboard)
        admin.GET("/users", adminUsers)
    }

    r.Run()
}
```

## Request Binding

```go
type CreateUserRequest struct {
    Email    string `json:"email" binding:"required,email"`
    Password string `json:"password" binding:"required,min=8"`
    Name     string `json:"name" binding:"omitempty,min=2"`
}

r.POST("/users", func(c *gin.Context) {
    var req CreateUserRequest

    if err := c.ShouldBindJSON(&req); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
        return
    }

    c.JSON(http.StatusCreated, gin.H{"user": req})
})

// Other binding types
c.ShouldBindQuery(&query)   // Query params
c.ShouldBindUri(&uri)       // Path params
c.ShouldBind(&form)         // Auto-detect
```

## Response Types

```go
// JSON
c.JSON(http.StatusOK, gin.H{"message": "success"})

// XML
c.XML(http.StatusOK, user)

// String
c.String(http.StatusOK, "Hello %s", name)

// HTML
c.HTML(http.StatusOK, "index.html", gin.H{"title": "Home"})

// File
c.File("/path/to/file.pdf")

// Redirect
c.Redirect(http.StatusFound, "/new-url")

// Stream
c.Stream(func(w io.Writer) bool {
    // Write to stream
    return true
})
```

## Static Files

```go
// Single file
r.StaticFile("/favicon.ico", "./assets/favicon.ico")

// Directory
r.Static("/assets", "./assets")

// Embedded files
r.StaticFS("/static", http.FS(embeddedFiles))
```

**Official docs:** https://gin-gonic.com/docs/
