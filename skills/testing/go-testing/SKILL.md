---
name: go-testing
description: |
  Go testing with go test, testify, and gomock. Covers unit tests, table-driven
  tests, benchmarks, mocking, and test coverage.

  USE WHEN: user mentions "go test", "golang test", "testify", asks about "table-driven test", "gomock", "go benchmark", "testing.T", "httptest"

  DO NOT USE FOR: JavaScript/TypeScript - use `vitest` or `jest`; Java - use `junit`; Python - use `pytest`; E2E browser tests - use Playwright; Rust - use `rust-testing`
allowed-tools: Read, Grep, Glob, Write, Edit, Bash
---

# Go Testing Core Knowledge

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `go` for comprehensive documentation.

> **Full Reference**: See [advanced.md](advanced.md) for HTTP Testing, Benchmarks, Test Helpers, Test Fixtures, Integration Tests, Parallel Tests, and Test Coverage.

## When NOT to Use This Skill

- **JavaScript/TypeScript Projects** - Use `vitest` or `jest`
- **Java Projects** - Use `junit` for Java testing
- **Python Projects** - Use `pytest` for Python
- **E2E Browser Testing** - Use Playwright or Selenium
- **Rust Projects** - Use `rust-testing` skill

## Basic Testing

### Unit Tests

```go
// math.go
package math

func Add(a, b int) int {
    return a + b
}

func Divide(a, b float64) (float64, error) {
    if b == 0 {
        return 0, errors.New("division by zero")
    }
    return a / b, nil
}

// math_test.go
package math

import "testing"

func TestAdd(t *testing.T) {
    result := Add(2, 3)
    if result != 5 {
        t.Errorf("Add(2, 3) = %d; want 5", result)
    }
}

func TestDivide(t *testing.T) {
    result, err := Divide(10, 2)
    if err != nil {
        t.Fatalf("unexpected error: %v", err)
    }
    if result != 5.0 {
        t.Errorf("Divide(10, 2) = %f; want 5.0", result)
    }
}

func TestDivideByZero(t *testing.T) {
    _, err := Divide(10, 0)
    if err == nil {
        t.Error("expected error for division by zero")
    }
}
```

### Running Tests

```bash
# Run all tests
go test ./...

# Run tests in current package
go test

# Run specific test
go test -run TestAdd

# Verbose output
go test -v

# Run with coverage
go test -cover

# Generate coverage report
go test -coverprofile=coverage.out
go tool cover -html=coverage.out

# Run tests with race detector
go test -race

# Set timeout
go test -timeout 30s
```

## Table-Driven Tests

```go
func TestAddTableDriven(t *testing.T) {
    tests := []struct {
        name     string
        a, b     int
        expected int
    }{
        {"positive numbers", 2, 3, 5},
        {"negative numbers", -1, -1, -2},
        {"zero", 0, 0, 0},
        {"mixed", -1, 1, 0},
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            result := Add(tt.a, tt.b)
            if result != tt.expected {
                t.Errorf("Add(%d, %d) = %d; want %d",
                    tt.a, tt.b, result, tt.expected)
            }
        })
    }
}

func TestDivideTableDriven(t *testing.T) {
    tests := []struct {
        name      string
        a, b      float64
        expected  float64
        expectErr bool
    }{
        {"normal division", 10, 2, 5, false},
        {"division by zero", 10, 0, 0, true},
        {"negative result", -10, 2, -5, false},
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            result, err := Divide(tt.a, tt.b)

            if tt.expectErr {
                if err == nil {
                    t.Error("expected error, got nil")
                }
                return
            }

            if err != nil {
                t.Fatalf("unexpected error: %v", err)
            }
            if result != tt.expected {
                t.Errorf("got %f; want %f", result, tt.expected)
            }
        })
    }
}
```

## Testify

```bash
go get github.com/stretchr/testify
```

### Assert Package

```go
import (
    "testing"
    "github.com/stretchr/testify/assert"
)

func TestWithAssert(t *testing.T) {
    // Equality
    assert.Equal(t, 5, Add(2, 3))
    assert.NotEqual(t, 6, Add(2, 3))

    // Boolean
    assert.True(t, true)
    assert.False(t, false)

    // Nil checks
    assert.Nil(t, nil)
    assert.NotNil(t, "value")

    // Error checks
    _, err := Divide(10, 0)
    assert.Error(t, err)
    assert.EqualError(t, err, "division by zero")

    result, err := Divide(10, 2)
    assert.NoError(t, err)
    assert.Equal(t, 5.0, result)

    // Contains
    assert.Contains(t, "hello world", "world")
    assert.Contains(t, []int{1, 2, 3}, 2)

    // Length
    assert.Len(t, []int{1, 2, 3}, 3)

    // Panics
    assert.Panics(t, func() { panic("boom") })
}
```

### Require Package

```go
import (
    "testing"
    "github.com/stretchr/testify/require"
)

func TestWithRequire(t *testing.T) {
    // require stops test on failure (unlike assert)
    result, err := Divide(10, 2)
    require.NoError(t, err) // Test stops here if err != nil
    require.Equal(t, 5.0, result)
}
```

### Suite Package

```go
import (
    "testing"
    "github.com/stretchr/testify/suite"
)

type UserServiceTestSuite struct {
    suite.Suite
    db      *sql.DB
    service *UserService
}

func (s *UserServiceTestSuite) SetupSuite() {
    // Run once before all tests
    var err error
    s.db, err = sql.Open("postgres", "test-connection")
    s.Require().NoError(err)
}

func (s *UserServiceTestSuite) TearDownSuite() {
    // Run once after all tests
    s.db.Close()
}

func (s *UserServiceTestSuite) SetupTest() {
    // Run before each test
    s.service = NewUserService(s.db)
}

func (s *UserServiceTestSuite) TearDownTest() {
    // Run after each test
    s.db.Exec("DELETE FROM users")
}

func (s *UserServiceTestSuite) TestCreateUser() {
    user, err := s.service.Create("alice", "alice@example.com")
    s.Require().NoError(err)
    s.Assert().Equal("alice", user.Name)
    s.Assert().NotZero(user.ID)
}

func TestUserServiceSuite(t *testing.T) {
    suite.Run(t, new(UserServiceTestSuite))
}
```

## Mocking with gomock

```bash
go install go.uber.org/mock/mockgen@latest
```

### Generate Mocks

```go
// user_repository.go
//go:generate mockgen -source=user_repository.go -destination=mocks/user_repository_mock.go -package=mocks

type UserRepository interface {
    Get(id string) (*User, error)
    Create(user *User) error
    Update(user *User) error
    Delete(id string) error
}
```

```bash
# Generate mocks
go generate ./...
```

### Using Mocks

```go
import (
    "testing"
    "github.com/stretchr/testify/assert"
    "go.uber.org/mock/gomock"
    "myapp/mocks"
)

func TestUserService_GetUser(t *testing.T) {
    ctrl := gomock.NewController(t)
    defer ctrl.Finish()

    mockRepo := mocks.NewMockUserRepository(ctrl)

    // Set expectations
    expectedUser := &User{ID: "1", Name: "Alice"}
    mockRepo.EXPECT().
        Get("1").
        Return(expectedUser, nil).
        Times(1)

    // Create service with mock
    service := NewUserService(mockRepo)

    // Test
    user, err := service.GetUser("1")
    assert.NoError(t, err)
    assert.Equal(t, "Alice", user.Name)
}

func TestUserService_CreateUser(t *testing.T) {
    ctrl := gomock.NewController(t)
    defer ctrl.Finish()

    mockRepo := mocks.NewMockUserRepository(ctrl)

    // Match any user with specific name
    mockRepo.EXPECT().
        Create(gomock.Any()).
        DoAndReturn(func(u *User) error {
            u.ID = "generated-id"
            return nil
        }).
        Times(1)

    service := NewUserService(mockRepo)
    user, err := service.CreateUser("Bob", "bob@example.com")

    assert.NoError(t, err)
    assert.Equal(t, "generated-id", user.ID)
}
```

### gomock Matchers

```go
func TestWithMatchers(t *testing.T) {
    ctrl := gomock.NewController(t)
    defer ctrl.Finish()

    mock := mocks.NewMockUserRepository(ctrl)

    // Any value
    mock.EXPECT().Get(gomock.Any()).Return(nil, nil)

    // Specific value
    mock.EXPECT().Get(gomock.Eq("123")).Return(nil, nil)

    // Not equal
    mock.EXPECT().Get(gomock.Not("")).Return(nil, nil)

    // Custom matcher
    userWithName := gomock.Cond(func(u interface{}) bool {
        user, ok := u.(*User)
        return ok && user.Name != ""
    })
    mock.EXPECT().Create(userWithName).Return(nil)
}
```

### Call Order

```go
func TestCallOrder(t *testing.T) {
    ctrl := gomock.NewController(t)
    defer ctrl.Finish()

    mock := mocks.NewMockUserRepository(ctrl)

    // InOrder ensures calls happen in sequence
    gomock.InOrder(
        mock.EXPECT().Get("1").Return(&User{ID: "1"}, nil),
        mock.EXPECT().Update(gomock.Any()).Return(nil),
    )

    // Use mock...
}
```

## Checklist

- [ ] Unit tests for all public functions
- [ ] Table-driven tests for multiple cases
- [ ] testify/assert for cleaner assertions
- [ ] Mock external dependencies
- [ ] HTTP handler tests
- [ ] Benchmarks for performance-critical code
- [ ] Integration tests with build tags
- [ ] Parallel tests where appropriate
- [ ] Coverage reporting in CI

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Solution |
|--------------|--------------|----------|
| Not using table-driven tests | Duplicate test code | Use []struct{} for test cases |
| Testing unexported functions | Coupled to implementation | Test through exported API |
| Not using t.Helper() | Confusing error line numbers | Mark helper functions with t.Helper() |
| Sharing test state | Flaky, order-dependent | Isolate setup in each test |
| Not using subtests | All cases fail if one fails | Use t.Run() for subtests |
| Ignoring race detector | Hidden concurrency bugs | Run tests with -race flag |
| Not benchmarking | Performance regressions | Add benchmarks for critical paths |

## Quick Troubleshooting

| Problem | Likely Cause | Solution |
|---------|--------------|----------|
| "No tests found" | Wrong file naming | Use *_test.go naming |
| Race condition detected | Shared mutable state | Fix data races, use sync primitives |
| Mock not called | Wrong method or args | Check gomock expectations |
| Coverage not accurate | Missing test files | Run go test ./... for all packages |
| Test timeout | Infinite loop or slow operation | Add -timeout flag, investigate |
| "interface conversion" panic | Wrong mock interface | Ensure mock implements correct interface |

## Reference Documentation

- [Unit Tests](quick-ref/unit-tests.md)
- [Testify](quick-ref/testify.md)
- [Mocking](quick-ref/mocking.md)
- [Advanced Patterns](advanced.md)
