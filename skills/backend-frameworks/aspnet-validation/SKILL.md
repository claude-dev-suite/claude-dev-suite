---
name: aspnet-validation
description: |
  ASP.NET Core validation with FluentValidation, Data Annotations, and model validation.
  Covers custom validators and validation pipeline.

  USE WHEN: user mentions "FluentValidation", "Data Annotations", "model validation",
  ".NET validation", "input validation", "validator", "validation pipeline"

  DO NOT USE FOR: Spring Validation - use `spring-validation`,
  Zod/Yup - use frontend validation skills
allowed-tools: Read, Grep, Glob, Write, Edit
---
# ASP.NET Validation - Quick Reference

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `aspnet-core` for validation documentation.

## Data Annotations

```csharp
public class CreateUserRequest
{
    [Required(ErrorMessage = "Name is required")]
    [StringLength(100, MinimumLength = 2)]
    public string Name { get; set; } = default!;

    [Required]
    [EmailAddress]
    [StringLength(255)]
    public string Email { get; set; } = default!;

    [Required]
    [Range(0, 150)]
    public int Age { get; set; }

    [Url]
    public string? Website { get; set; }
}
```

## FluentValidation Setup

```csharp
// Install: dotnet add package FluentValidation.AspNetCore
builder.Services.AddValidatorsFromAssemblyContaining<Program>();
```

## FluentValidation Patterns

```csharp
public class CreateUserValidator : AbstractValidator<CreateUserRequest>
{
    private readonly IUserRepository _repository;

    public CreateUserValidator(IUserRepository repository)
    {
        _repository = repository;

        RuleFor(x => x.Name)
            .NotEmpty().WithMessage("Name is required")
            .Length(2, 100);

        RuleFor(x => x.Email)
            .NotEmpty()
            .EmailAddress()
            .MaximumLength(255)
            .MustAsync(BeUniqueEmail).WithMessage("Email already exists");

        RuleFor(x => x.Age)
            .InclusiveBetween(0, 150);

        RuleFor(x => x.Password)
            .NotEmpty()
            .MinimumLength(12)
            .Matches(@"[A-Z]").WithMessage("Must contain uppercase letter")
            .Matches(@"[a-z]").WithMessage("Must contain lowercase letter")
            .Matches(@"\d").WithMessage("Must contain digit")
            .Matches(@"[@$!%*?&]").WithMessage("Must contain special character");
    }

    private async Task<bool> BeUniqueEmail(string email, CancellationToken ct)
    {
        return !await _repository.ExistsAsync(u => u.Email == email);
    }
}
```

## Validation Filter (Minimal API)

```csharp
public class ValidationFilter<T> : IEndpointFilter where T : class
{
    public async ValueTask<object?> InvokeAsync(
        EndpointFilterInvocationContext context,
        EndpointFilterDelegate next)
    {
        var validator = context.HttpContext.RequestServices.GetService<IValidator<T>>();
        var argument = context.Arguments.OfType<T>().FirstOrDefault();

        if (validator is not null && argument is not null)
        {
            var result = await validator.ValidateAsync(argument);
            if (!result.IsValid)
                return Results.ValidationProblem(result.ToDictionary());
        }

        return await next(context);
    }
}
```

## Collection and Nested Validation

```csharp
public class OrderValidator : AbstractValidator<CreateOrderRequest>
{
    public OrderValidator()
    {
        RuleFor(x => x.Items)
            .NotEmpty().WithMessage("Order must have at least one item");

        RuleForEach(x => x.Items).ChildRules(item =>
        {
            item.RuleFor(x => x.ProductId).GreaterThan(0);
            item.RuleFor(x => x.Quantity).InclusiveBetween(1, 1000);
        });
    }
}
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| Validation in controllers | Repetitive, inconsistent | Use FluentValidation + filter |
| Only client-side validation | Easily bypassed | Always validate server-side |
| No async validation | Can't check DB uniqueness | Use `MustAsync` |
| Generic error messages | Bad UX | Provide specific `.WithMessage()` |

## Quick Troubleshooting

| Issue | Likely Cause | Solution |
|-------|--------------|----------|
| Validator not running | Not registered | Call `AddValidatorsFromAssembly` |
| Async validator timeout | DB query slow | Add appropriate indexes |
| ModelState not checked | Missing `[ApiController]` | Add attribute or check manually |
| Nested validation skipped | Missing `SetValidator` | Use `ChildRules` or `SetValidator` |
