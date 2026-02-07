---
name: nunit
description: |
  NUnit testing framework with TestCase, SetUp/TearDown, assertions,
  and parameterized tests for .NET applications.

  USE WHEN: user mentions "NUnit", "TestCase", "TestFixture", "NUnit assertions",
  "NUnit parameterized tests", ".NET NUnit"

  DO NOT USE FOR: xUnit - use `xunit`, MSTest,
  JavaScript testing frameworks
allowed-tools: Read, Grep, Glob, Write, Edit
---
# NUnit - Quick Reference

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `xunit` for .NET testing patterns (concepts transfer).

## Basic Test Structure

```csharp
[TestFixture]
public class UserServiceTests
{
    private Mock<IUserRepository> _repository = null!;
    private UserService _service = null!;

    [SetUp]
    public void SetUp()
    {
        _repository = new Mock<IUserRepository>();
        _service = new UserService(_repository.Object, Mock.Of<ILogger<UserService>>());
    }

    [Test]
    public async Task GetById_ExistingUser_ReturnsUser()
    {
        _repository.Setup(r => r.GetByIdAsync(1))
            .ReturnsAsync(new User { Id = 1, Name = "Alice" });

        var result = await _service.GetByIdAsync(1);

        Assert.That(result, Is.Not.Null);
        Assert.That(result!.Name, Is.EqualTo("Alice"));
    }

    [Test]
    public async Task GetById_NonExisting_ReturnsNull()
    {
        _repository.Setup(r => r.GetByIdAsync(999)).ReturnsAsync((User?)null);

        var result = await _service.GetByIdAsync(999);

        Assert.That(result, Is.Null);
    }
}
```

## Parameterized Tests

```csharp
[TestCase("", false)]
[TestCase("a", false)]
[TestCase("ab", true)]
[TestCase("valid name", true)]
public void IsValidName_ReturnsExpected(string name, bool expected)
{
    var result = _validator.IsValidName(name);
    Assert.That(result, Is.EqualTo(expected));
}

[TestCaseSource(nameof(GetTestData))]
public void Calculate_ReturnsExpected(int a, int b, int expected)
{
    Assert.That(_calculator.Add(a, b), Is.EqualTo(expected));
}

private static IEnumerable<TestCaseData> GetTestData()
{
    yield return new TestCaseData(1, 2, 3).SetName("Positive numbers");
    yield return new TestCaseData(-1, 1, 0).SetName("Mixed signs");
    yield return new TestCaseData(0, 0, 0).SetName("Zeros");
}
```

## Constraint-Based Assertions

```csharp
// Equality
Assert.That(result, Is.EqualTo(42));
Assert.That(name, Is.EqualTo("alice").IgnoreCase);

// Comparison
Assert.That(age, Is.GreaterThan(0).And.LessThan(150));
Assert.That(price, Is.InRange(0m, 1000m));

// Collections
Assert.That(users, Has.Count.EqualTo(3));
Assert.That(users, Has.Exactly(1).Matches<User>(u => u.Name == "Alice"));
Assert.That(names, Is.Ordered.Ascending);
Assert.That(items, Does.Contain("expected"));

// Exceptions
Assert.ThrowsAsync<NotFoundException>(async () => await _service.GetByIdAsync(999));
Assert.That(async () => await _service.CreateAsync(null!), Throws.ArgumentNullException);

// String
Assert.That(message, Does.StartWith("Error").And.Contains("not found"));
```

## SetUp and TearDown

```csharp
[TestFixture]
public class IntegrationTests
{
    [OneTimeSetUp]  // Runs once before all tests
    public async Task OneTimeSetUp() { /* DB setup */ }

    [SetUp]  // Runs before each test
    public void SetUp() { /* Reset state */ }

    [TearDown]  // Runs after each test
    public void TearDown() { /* Cleanup */ }

    [OneTimeTearDown]  // Runs once after all tests
    public async Task OneTimeTearDown() { /* DB teardown */ }
}
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| Classic `Assert.AreEqual` | Less readable | Use constraint model `Assert.That` |
| Shared state between tests | Flaky tests | Reset in `[SetUp]` |
| `[Test]` on async void | Exceptions lost | Use `async Task` return type |
| Too many asserts per test | Hard to identify failure | One logical assertion per test |

## Quick Troubleshooting

| Issue | Likely Cause | Solution |
|-------|--------------|----------|
| Test not discovered | Missing `[Test]` or `[TestFixture]` | Add required attributes |
| SetUp not running | Wrong attribute | Use `[SetUp]` not `[Setup]` |
| Async test ignored | Missing `async Task` | Change return type from `void` |
| TestCaseSource fails | Method not static | Make source method `static` |
