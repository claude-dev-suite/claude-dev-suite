---
name: entity-framework-core
description: |
  Entity Framework Core with DbContext, migrations, LINQ queries, relationships,
  and performance optimization. Covers EF Core 8+ patterns.

  USE WHEN: user mentions "Entity Framework", "EF Core", "DbContext", "migrations",
  "LINQ", "EF relationships", "database first", "code first"

  DO NOT USE FOR: Prisma - use `prisma`, Drizzle - use `drizzle`,
  Spring Data JPA - use `spring-data-jpa`, Dapper (raw SQL)
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Entity Framework Core - Quick Reference

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `entity-framework-core` for comprehensive documentation.

## DbContext Setup

```csharp
public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<User> Users => Set<User>();
    public DbSet<Order> Orders => Set<Order>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(AppDbContext).Assembly);
    }
}

// Registration
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("Default")));
```

## Entity Configuration (Fluent API)

```csharp
public class UserConfiguration : IEntityTypeConfiguration<User>
{
    public void Configure(EntityTypeBuilder<User> builder)
    {
        builder.HasKey(u => u.Id);
        builder.Property(u => u.Name).IsRequired().HasMaxLength(100);
        builder.Property(u => u.Email).IsRequired().HasMaxLength(255);
        builder.HasIndex(u => u.Email).IsUnique();

        // Relationships
        builder.HasMany(u => u.Orders)
            .WithOne(o => o.User)
            .HasForeignKey(o => o.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        // Value conversion
        builder.Property(u => u.Status)
            .HasConversion<string>();

        // Default values
        builder.Property(u => u.CreatedAt)
            .HasDefaultValueSql("GETUTCDATE()");
    }
}
```

## Migrations

```bash
# Add migration
dotnet ef migrations add InitialCreate

# Update database
dotnet ef database update

# Remove last migration (not applied)
dotnet ef migrations remove

# Generate SQL script
dotnet ef migrations script

# Revert to specific migration
dotnet ef database update MigrationName
```

## LINQ Queries

```csharp
// Basic queries
var user = await context.Users.FindAsync(id);
var users = await context.Users.Where(u => u.IsActive).ToListAsync();
var user = await context.Users.FirstOrDefaultAsync(u => u.Email == email);

// Projection
var dtos = await context.Users
    .Where(u => u.IsActive)
    .Select(u => new UserResponse(u.Id, u.Name, u.Email))
    .ToListAsync();

// Include related data
var usersWithOrders = await context.Users
    .Include(u => u.Orders)
    .ThenInclude(o => o.OrderItems)
    .ToListAsync();

// Pagination
var page = await context.Users
    .OrderBy(u => u.Name)
    .Skip((pageNumber - 1) * pageSize)
    .Take(pageSize)
    .ToListAsync();

// Aggregation
var count = await context.Users.CountAsync(u => u.IsActive);
var avgAge = await context.Users.AverageAsync(u => u.Age);
```

## Repository Pattern

```csharp
public interface IRepository<T> where T : class
{
    Task<T?> GetByIdAsync(int id);
    Task<IEnumerable<T>> GetAllAsync();
    Task AddAsync(T entity);
    void Update(T entity);
    void Remove(T entity);
    Task<bool> ExistsAsync(Expression<Func<T, bool>> predicate);
    Task SaveChangesAsync();
}

public class Repository<T> : IRepository<T> where T : class
{
    protected readonly AppDbContext _context;
    protected readonly DbSet<T> _dbSet;

    public Repository(AppDbContext context)
    {
        _context = context;
        _dbSet = context.Set<T>();
    }

    public async Task<T?> GetByIdAsync(int id) => await _dbSet.FindAsync(id);
    public async Task<IEnumerable<T>> GetAllAsync() => await _dbSet.ToListAsync();
    public async Task AddAsync(T entity) => await _dbSet.AddAsync(entity);
    public void Update(T entity) => _dbSet.Update(entity);
    public void Remove(T entity) => _dbSet.Remove(entity);
    public async Task<bool> ExistsAsync(Expression<Func<T, bool>> predicate)
        => await _dbSet.AnyAsync(predicate);
    public async Task SaveChangesAsync() => await _context.SaveChangesAsync();
}
```

## Performance Tips

| Tip | Implementation |
|-----|----------------|
| Use `AsNoTracking()` for read-only | `context.Users.AsNoTracking().ToListAsync()` |
| Use `Select` to project | Avoid loading full entities |
| Use `AsSplitQuery()` | Prevent cartesian explosion with includes |
| Use compiled queries | `EF.CompileAsyncQuery(...)` for hot paths |
| Batch operations | `ExecuteUpdateAsync` / `ExecuteDeleteAsync` (EF Core 7+) |

```csharp
// Bulk update (EF Core 7+)
await context.Users
    .Where(u => u.LastLoginAt < cutoff)
    .ExecuteUpdateAsync(u => u.SetProperty(x => x.IsActive, false));

// Bulk delete
await context.Users
    .Where(u => u.IsDeleted)
    .ExecuteDeleteAsync();
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| Loading full entities for display | Memory waste, slow | Use `Select` projections |
| N+1 queries | Performance killer | Use `Include` or projections |
| Not using `AsNoTracking` | Unnecessary overhead | Use for read-only queries |
| Calling `SaveChanges` per entity | Slow batch operations | Call once after all changes |
| Using `DbContext` as singleton | Thread-safety issues | Use `AddDbContext` (Scoped) |

## Quick Troubleshooting

| Issue | Likely Cause | Solution |
|-------|--------------|----------|
| Tracking conflict | Entity already tracked | Use `AsNoTracking` or detach |
| Migration fails | Model mismatch | Check pending changes, rebuild |
| Slow query | Missing index | Add `HasIndex` in configuration |
| Lazy loading fails | Not configured | Use `Include` (explicit loading) |
| Concurrency conflict | Stale data | Add `[ConcurrencyCheck]` or `RowVersion` |
