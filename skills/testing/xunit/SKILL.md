---
name: xunit
description: |
  xUnit.net testing framework with Fact, Theory, fixtures, DI, and mocking
  with Moq and NSubstitute. Covers .NET testing best practices.

  USE WHEN: user mentions "xUnit", ".NET testing", "Fact", "Theory", "InlineData",
  "Moq", "NSubstitute", "C# unit test"

  DO NOT USE FOR: NUnit - use `nunit`, Vitest - use `vitest`,
  Jest - use `jest`, Playwright - use `playwright`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# xUnit.net - Quick Reference

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `xunit` for comprehensive documentation.

## Basic Tests

```csharp
public class UserServiceTests
{
    [Fact]
    public async Task GetById_ExistingUser_ReturnsUser()
    {
        // Arrange
        var repository = new Mock<IUserRepository>();
        repository.Setup(r => r.GetByIdAsync(1))
            .ReturnsAsync(new User { Id = 1, Name = "Alice" });

        var service = new UserService(repository.Object, Mock.Of<ILogger<UserService>>());

        // Act
        var result = await service.GetByIdAsync(1);

        // Assert
        Assert.NotNull(result);
        Assert.Equal("Alice", result.Name);
    }

    [Fact]
    public async Task GetById_NonExistingUser_ReturnsNull()
    {
        var repository = new Mock<IUserRepository>();
        repository.Setup(r => r.GetByIdAsync(999)).ReturnsAsync((User?)null);

        var service = new UserService(repository.Object, Mock.Of<ILogger<UserService>>());

        var result = await service.GetByIdAsync(999);

        Assert.Null(result);
    }
}
```

## Theory (Parameterized Tests)

```csharp
[Theory]
[InlineData("", false)]
[InlineData("a", false)]
[InlineData("ab", true)]
[InlineData("valid@email.com", true)]
public void Validate_Name_ReturnsExpected(string name, bool expected)
{
    var validator = new UserValidator();
    var result = validator.IsValidName(name);
    Assert.Equal(expected, result);
}

[Theory]
[MemberData(nameof(GetTestUsers))]
public async Task Create_ValidUser_Succeeds(CreateUserRequest request)
{
    // Test with complex objects
}

public static IEnumerable<object[]> GetTestUsers()
{
    yield return new object[] { new CreateUserRequest("Alice", "alice@test.com") };
    yield return new object[] { new CreateUserRequest("Bob", "bob@test.com") };
}
```

## Mocking with Moq

```csharp
// Setup
var mock = new Mock<IUserRepository>();

// Return value
mock.Setup(r => r.GetByIdAsync(It.IsAny<int>()))
    .ReturnsAsync(new User { Id = 1, Name = "Test" });

// Callback
mock.Setup(r => r.AddAsync(It.IsAny<User>()))
    .Callback<User>(user => user.Id = 42)
    .Returns(Task.CompletedTask);

// Verify
mock.Verify(r => r.AddAsync(It.Is<User>(u => u.Name == "Alice")), Times.Once);
mock.Verify(r => r.DeleteAsync(It.IsAny<int>()), Times.Never);

// Sequence
mock.SetupSequence(r => r.GetByIdAsync(1))
    .ReturnsAsync(new User { Name = "First" })
    .ReturnsAsync(new User { Name = "Second" });
```

## Mocking with NSubstitute

```csharp
var repository = Substitute.For<IUserRepository>();

// Return value
repository.GetByIdAsync(1).Returns(new User { Id = 1, Name = "Test" });

// Verify
await repository.Received(1).AddAsync(Arg.Is<User>(u => u.Name == "Alice"));
await repository.DidNotReceive().DeleteAsync(Arg.Any<int>());
```

## Fixtures (Shared Context)

```csharp
// Class fixture - shared per test class
public class DatabaseFixture : IAsyncLifetime
{
    public AppDbContext Context { get; private set; } = default!;

    public async Task InitializeAsync()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        Context = new AppDbContext(options);
        await Context.Database.EnsureCreatedAsync();
    }

    public async Task DisposeAsync()
    {
        await Context.DisposeAsync();
    }
}

public class UserRepositoryTests : IClassFixture<DatabaseFixture>
{
    private readonly AppDbContext _context;

    public UserRepositoryTests(DatabaseFixture fixture)
    {
        _context = fixture.Context;
    }
}

// Collection fixture - shared across test classes
[CollectionDefinition("Database")]
public class DatabaseCollection : ICollectionFixture<DatabaseFixture> { }

[Collection("Database")]
public class OrderRepositoryTests { }
```

## FluentAssertions (Optional)

```csharp
// Install: dotnet add package FluentAssertions
result.Should().NotBeNull();
result.Name.Should().Be("Alice");
result.Age.Should().BeGreaterThan(0).And.BeLessThan(150);
users.Should().HaveCount(3).And.OnlyContain(u => u.IsActive);
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| Testing implementation details | Brittle tests | Test behavior |
| Shared mutable state | Flaky tests | Use fresh fixtures per test |
| No assertion message | Hard to debug | Use descriptive assertions |
| Testing private methods | Coupling to internals | Test through public API |

## Quick Troubleshooting

| Issue | Likely Cause | Solution |
|-------|--------------|----------|
| Test not discovered | Missing `[Fact]`/`[Theory]` | Add test attribute |
| Fixture not shared | Missing `IClassFixture<T>` | Implement fixture interface |
| Mock returns null | Missing setup | Add `.Setup()` for the call |
| Async test deadlock | Missing `async` keyword | Use `async Task` return type |
