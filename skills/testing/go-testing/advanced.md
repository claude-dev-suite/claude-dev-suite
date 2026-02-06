# Go Testing Advanced Patterns

## HTTP Testing

### Testing HTTP Handlers

```go
import (
    "net/http"
    "net/http/httptest"
    "testing"
)

func TestHandler(t *testing.T) {
    handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.WriteHeader(http.StatusOK)
        w.Write([]byte(`{"message": "hello"}`))
    })

    req := httptest.NewRequest("GET", "/hello", nil)
    w := httptest.NewRecorder()

    handler.ServeHTTP(w, req)

    assert.Equal(t, http.StatusOK, w.Code)
    assert.Contains(t, w.Body.String(), "hello")
}

func TestHandlerWithJSON(t *testing.T) {
    handler := CreateUserHandler(userService)

    body := strings.NewReader(`{"name": "Alice", "email": "alice@example.com"}`)
    req := httptest.NewRequest("POST", "/users", body)
    req.Header.Set("Content-Type", "application/json")

    w := httptest.NewRecorder()
    handler.ServeHTTP(w, req)

    assert.Equal(t, http.StatusCreated, w.Code)

    var response User
    json.Unmarshal(w.Body.Bytes(), &response)
    assert.Equal(t, "Alice", response.Name)
}
```

### Testing HTTP Client

```go
func TestHTTPClient(t *testing.T) {
    // Create test server
    server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        if r.URL.Path == "/users/1" && r.Method == "GET" {
            w.WriteHeader(http.StatusOK)
            json.NewEncoder(w).Encode(User{ID: "1", Name: "Alice"})
            return
        }
        w.WriteHeader(http.StatusNotFound)
    }))
    defer server.Close()

    // Use server.URL as base URL
    client := NewAPIClient(server.URL)

    user, err := client.GetUser("1")
    assert.NoError(t, err)
    assert.Equal(t, "Alice", user.Name)
}
```

---

## Benchmarks

```go
func BenchmarkAdd(b *testing.B) {
    for i := 0; i < b.N; i++ {
        Add(100, 200)
    }
}

func BenchmarkAddParallel(b *testing.B) {
    b.RunParallel(func(pb *testing.PB) {
        for pb.Next() {
            Add(100, 200)
        }
    })
}

func BenchmarkWithSetup(b *testing.B) {
    // Setup (not timed)
    data := make([]int, 1000)
    for i := range data {
        data[i] = i
    }

    b.ResetTimer() // Start timing

    for i := 0; i < b.N; i++ {
        sum := 0
        for _, v := range data {
            sum += v
        }
    }
}

func BenchmarkComparison(b *testing.B) {
    sizes := []int{10, 100, 1000, 10000}

    for _, size := range sizes {
        b.Run(fmt.Sprintf("size-%d", size), func(b *testing.B) {
            data := make([]int, size)
            b.ResetTimer()

            for i := 0; i < b.N; i++ {
                _ = processData(data)
            }
        })
    }
}
```

```bash
# Run benchmarks
go test -bench=.

# Run specific benchmark
go test -bench=BenchmarkAdd

# With memory allocation stats
go test -bench=. -benchmem

# Run multiple times
go test -bench=. -count=5
```

---

## Test Helpers

```go
// testhelper.go
package testutil

import (
    "testing"
    "database/sql"
)

type TestDB struct {
    *sql.DB
    t *testing.T
}

func NewTestDB(t *testing.T) *TestDB {
    t.Helper()

    db, err := sql.Open("postgres", "test-connection")
    if err != nil {
        t.Fatalf("failed to connect to test db: %v", err)
    }

    return &TestDB{DB: db, t: t}
}

func (db *TestDB) Cleanup() {
    db.t.Helper()
    db.Exec("DELETE FROM users")
    db.Exec("DELETE FROM orders")
}

func (db *TestDB) Close() {
    db.DB.Close()
}

// Usage
func TestWithTestDB(t *testing.T) {
    db := testutil.NewTestDB(t)
    defer db.Close()
    t.Cleanup(db.Cleanup)

    // Test code...
}
```

### Test Fixtures

```go
type Fixture struct {
    t        *testing.T
    db       *sql.DB
    users    []*User
    cleanup  []func()
}

func NewFixture(t *testing.T, db *sql.DB) *Fixture {
    return &Fixture{t: t, db: db}
}

func (f *Fixture) CreateUser(name, email string) *User {
    f.t.Helper()

    user := &User{Name: name, Email: email}
    err := insertUser(f.db, user)
    if err != nil {
        f.t.Fatalf("failed to create user: %v", err)
    }

    f.users = append(f.users, user)
    f.cleanup = append(f.cleanup, func() {
        deleteUser(f.db, user.ID)
    })

    return user
}

func (f *Fixture) Cleanup() {
    for i := len(f.cleanup) - 1; i >= 0; i-- {
        f.cleanup[i]()
    }
}

// Usage
func TestUserWorkflow(t *testing.T) {
    fixture := NewFixture(t, db)
    defer fixture.Cleanup()

    user := fixture.CreateUser("Alice", "alice@example.com")
    // Test with user...
}
```

---

## Integration Tests

```go
// integration_test.go
//go:build integration
// +build integration

package integration

import (
    "testing"
    "os"
)

func TestMain(m *testing.M) {
    // Setup
    db := setupTestDB()
    defer db.Close()

    // Run tests
    code := m.Run()

    // Teardown
    cleanupTestDB(db)

    os.Exit(code)
}

func TestDatabaseIntegration(t *testing.T) {
    // Integration test code
}
```

```bash
# Run integration tests
go test -tags=integration ./...

# Skip integration tests
go test ./...
```

---

## Parallel Tests

```go
func TestParallel(t *testing.T) {
    t.Parallel() // Mark test as parallel

    tests := []struct {
        name     string
        input    int
        expected int
    }{
        {"case1", 1, 2},
        {"case2", 2, 4},
        {"case3", 3, 6},
    }

    for _, tt := range tests {
        tt := tt // Capture range variable
        t.Run(tt.name, func(t *testing.T) {
            t.Parallel() // Mark subtest as parallel
            result := Double(tt.input)
            assert.Equal(t, tt.expected, result)
        })
    }
}
```

---

## Test Coverage

```bash
# Generate coverage profile
go test -coverprofile=coverage.out ./...

# View coverage in terminal
go tool cover -func=coverage.out

# Generate HTML report
go tool cover -html=coverage.out -o coverage.html

# Coverage for specific package
go test -cover -coverprofile=coverage.out ./pkg/...

# Coverage with race detection
go test -race -coverprofile=coverage.out ./...
```
