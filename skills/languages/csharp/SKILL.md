---
name: csharp
description: |
  C# 12 language features including records, pattern matching, nullable reference types,
  LINQ, async/await, and modern language patterns.

  USE WHEN: user mentions "C#", "C# records", "pattern matching", "LINQ", "async/await",
  "nullable reference types", "C# generics", "C# language features"

  DO NOT USE FOR: TypeScript - use `typescript`, Java - use Java skills,
  F# or VB.NET specific features
allowed-tools: Read, Grep, Glob, Write, Edit
---
# C# 12 - Quick Reference

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `csharp` for comprehensive documentation.

## Records

```csharp
// Positional record (immutable)
public record UserDto(int Id, string Name, string Email);

// Record with additional members
public record OrderDto(int Id, decimal Total)
{
    public string FormattedTotal => Total.ToString("C");
}

// Record struct (value type, C# 10)
public readonly record struct Point(double X, double Y);

// With-expression (non-destructive mutation)
var updated = user with { Name = "New Name" };
```

## Pattern Matching (C# 12)

```csharp
// Switch expression
string GetDiscount(Customer customer) => customer switch
{
    { Type: CustomerType.Premium, YearsActive: > 5 } => "30%",
    { Type: CustomerType.Premium } => "20%",
    { Type: CustomerType.Regular, YearsActive: > 3 } => "10%",
    _ => "0%",
};

// List patterns (C# 11)
var result = numbers switch
{
    [1, 2, 3] => "exact match",
    [1, .., 3] => "starts with 1, ends with 3",
    [_, > 5, ..] => "second element > 5",
    [] => "empty",
    _ => "other",
};

// Type pattern with when
if (shape is Circle { Radius: > 10 } circle)
{
    Console.WriteLine($"Large circle: {circle.Radius}");
}
```

## Nullable Reference Types

```csharp
// Enable in .csproj: <Nullable>enable</Nullable>

public class UserService
{
    // Nullable return type
    public User? FindById(int id) => _users.FirstOrDefault(u => u.Id == id);

    // Non-nullable parameter
    public void Update(User user)
    {
        ArgumentNullException.ThrowIfNull(user);
        // user is guaranteed non-null here
    }

    // Null-conditional and coalescing
    public string GetDisplayName(User? user)
        => user?.Name ?? "Unknown";

    // Required members (C# 11)
    public required string Name { get; init; }
}
```

## Async/Await Patterns

```csharp
// Basic async method
public async Task<User> GetUserAsync(int id)
{
    var user = await _repository.FindAsync(id);
    return user ?? throw new NotFoundException($"User {id} not found");
}

// Parallel async
public async Task<(User[], Order[])> GetDashboardDataAsync(int userId)
{
    var usersTask = _userService.GetAllAsync();
    var ordersTask = _orderService.GetByUserAsync(userId);
    await Task.WhenAll(usersTask, ordersTask);
    return (usersTask.Result, ordersTask.Result);
}

// IAsyncEnumerable
public async IAsyncEnumerable<User> GetUsersStreamAsync(
    [EnumeratorCancellation] CancellationToken ct = default)
{
    await foreach (var user in _context.Users.AsAsyncEnumerable().WithCancellation(ct))
    {
        yield return user;
    }
}

// ValueTask for hot paths
public ValueTask<User?> GetCachedUserAsync(int id)
{
    if (_cache.TryGetValue(id, out var user))
        return ValueTask.FromResult<User?>(user);
    return new ValueTask<User?>(LoadUserAsync(id));
}
```

## LINQ

```csharp
// Method syntax (preferred)
var result = users
    .Where(u => u.IsActive)
    .OrderBy(u => u.Name)
    .Select(u => new { u.Name, u.Email })
    .ToList();

// GroupBy
var grouped = orders
    .GroupBy(o => o.Status)
    .Select(g => new { Status = g.Key, Count = g.Count(), Total = g.Sum(o => o.Amount) });

// Aggregate
var summary = orders.Aggregate(
    new { Count = 0, Total = 0m },
    (acc, order) => new { Count = acc.Count + 1, Total = acc.Total + order.Amount });

// Chunk (C# 12 / .NET 8)
var batches = users.Chunk(100); // IEnumerable<User[]>
```

## Primary Constructors (C# 12)

```csharp
// Class primary constructor
public class UserService(IUserRepository repository, ILogger<UserService> logger)
{
    public async Task<User> GetByIdAsync(int id)
    {
        logger.LogInformation("Getting user {Id}", id);
        return await repository.GetByIdAsync(id)
            ?? throw new NotFoundException($"User {id} not found");
    }
}

// Record primary constructor (already existed)
public record UserDto(int Id, string Name, string Email);
```

## Collection Expressions (C# 12)

```csharp
// Array
int[] numbers = [1, 2, 3, 4, 5];

// List
List<string> names = ["Alice", "Bob", "Charlie"];

// Spread
int[] first = [1, 2, 3];
int[] second = [4, 5, 6];
int[] combined = [..first, ..second]; // [1, 2, 3, 4, 5, 6]
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| `.Result` / `.Wait()` | Deadlocks | Use `async/await` |
| `async void` | Exceptions lost | Use `async Task` |
| Mutable DTOs | Unexpected mutations | Use `record` types |
| No null checking | NullReferenceException | Enable nullable references |
| String concatenation in loops | Memory pressure | Use `StringBuilder` |

## Quick Troubleshooting

| Issue | Likely Cause | Solution |
|-------|--------------|----------|
| Nullable warning | Missing null check | Add `?`, `??`, or null guard |
| Deadlock | `.Result` in async context | Use `await` |
| LINQ multiple enumeration | Iterating IEnumerable twice | Call `.ToList()` first |
| Record equality fails | Reference type property | Override `Equals` or use value types |
