---
name: dotnet-quality
description: |
  .NET code quality with Roslyn analyzers, StyleCop, and dotnet format.
  Covers linting, formatting, and best practices for C#/.NET.

  USE WHEN: user works with "C#", ".NET", "ASP.NET Core", asks about "Roslyn analyzers", "StyleCop", "dotnet format", ".NET linting", "C# best practices"

  DO NOT USE FOR: SonarQube - use `sonarqube` skill, testing - use .NET test skills, security - use `dotnet-security` skill
allowed-tools: Read, Grep, Glob, Bash
---
# .NET Quality - Quick Reference

## When NOT to Use This Skill
- **SonarQube setup** - Use `sonarqube` skill
- **Security scanning** - Use `dotnet-security` skill
- **Testing** - Use .NET test skills

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `dotnet` for comprehensive documentation.

## Tool Overview

| Tool | Focus | Installation |
|------|-------|--------------|
| **dotnet format** | Formatting + analyzers | Built-in |
| **Roslyn Analyzers** | Code analysis | NuGet |
| **StyleCop.Analyzers** | Style rules | NuGet |
| **Roslynator** | Refactoring | NuGet |
| **SonarAnalyzer.CSharp** | SonarQube rules | NuGet |

## Roslyn Analyzers Setup

### Install Analyzers

```xml
<!-- Directory.Build.props (solution-wide) -->
<Project>
  <PropertyGroup>
    <AnalysisLevel>latest-all</AnalysisLevel>
    <EnforceCodeStyleInBuild>true</EnforceCodeStyleInBuild>
    <TreatWarningsAsErrors>true</TreatWarningsAsErrors>
  </PropertyGroup>

  <ItemGroup>
    <PackageReference Include="Microsoft.CodeAnalysis.NetAnalyzers" Version="8.0.0">
      <PrivateAssets>all</PrivateAssets>
      <IncludeAssets>runtime; build; native; contentfiles; analyzers</IncludeAssets>
    </PackageReference>
    <PackageReference Include="StyleCop.Analyzers" Version="1.2.0-beta.556">
      <PrivateAssets>all</PrivateAssets>
      <IncludeAssets>runtime; build; native; contentfiles; analyzers</IncludeAssets>
    </PackageReference>
    <PackageReference Include="Roslynator.Analyzers" Version="4.10.0">
      <PrivateAssets>all</PrivateAssets>
      <IncludeAssets>runtime; build; native; contentfiles; analyzers</IncludeAssets>
    </PackageReference>
  </ItemGroup>
</Project>
```

### .editorconfig

```ini
# .editorconfig
root = true

[*]
indent_style = space
indent_size = 4
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true

[*.cs]
# Organize usings
dotnet_sort_system_directives_first = true
dotnet_separate_import_directive_groups = false

# this. qualification
dotnet_style_qualification_for_field = false:warning
dotnet_style_qualification_for_property = false:warning
dotnet_style_qualification_for_method = false:warning
dotnet_style_qualification_for_event = false:warning

# Language keywords vs BCL types
dotnet_style_predefined_type_for_locals_parameters_members = true:warning
dotnet_style_predefined_type_for_member_access = true:warning

# var preferences
csharp_style_var_for_built_in_types = true:suggestion
csharp_style_var_when_type_is_apparent = true:suggestion
csharp_style_var_elsewhere = true:suggestion

# Expression-bodied members
csharp_style_expression_bodied_methods = when_on_single_line:suggestion
csharp_style_expression_bodied_constructors = false:suggestion
csharp_style_expression_bodied_properties = true:suggestion
csharp_style_expression_bodied_accessors = true:suggestion
csharp_style_expression_bodied_lambdas = true:suggestion

# Pattern matching
csharp_style_pattern_matching_over_is_with_cast_check = true:warning
csharp_style_pattern_matching_over_as_with_null_check = true:warning

# Null checking
csharp_style_throw_expression = true:suggestion
csharp_style_conditional_delegate_call = true:warning
dotnet_style_coalesce_expression = true:warning
dotnet_style_null_propagation = true:warning

# Code style
csharp_prefer_braces = true:warning
csharp_prefer_simple_using_statement = true:suggestion
csharp_style_prefer_switch_expression = true:suggestion

# Naming conventions
dotnet_naming_rule.interface_should_be_begins_with_i.severity = warning
dotnet_naming_rule.interface_should_be_begins_with_i.symbols = interface
dotnet_naming_rule.interface_should_be_begins_with_i.style = begins_with_i

dotnet_naming_symbols.interface.applicable_kinds = interface
dotnet_naming_symbols.interface.applicable_accessibilities = public, internal, private, protected
dotnet_naming_style.begins_with_i.required_prefix = I
dotnet_naming_style.begins_with_i.capitalization = pascal_case

dotnet_naming_rule.private_field_should_be_camel_case_with_underscore.severity = warning
dotnet_naming_rule.private_field_should_be_camel_case_with_underscore.symbols = private_field
dotnet_naming_rule.private_field_should_be_camel_case_with_underscore.style = camel_case_underscore

dotnet_naming_symbols.private_field.applicable_kinds = field
dotnet_naming_symbols.private_field.applicable_accessibilities = private
dotnet_naming_style.camel_case_underscore.required_prefix = _
dotnet_naming_style.camel_case_underscore.capitalization = camel_case

# Analyzer severity
dotnet_diagnostic.CA1062.severity = warning  # Validate arguments
dotnet_diagnostic.CA1307.severity = warning  # Specify StringComparison
dotnet_diagnostic.CA1310.severity = warning  # Specify StringComparison for correctness
dotnet_diagnostic.CA2007.severity = none     # ConfigureAwait (not needed in ASP.NET Core)
dotnet_diagnostic.IDE0058.severity = none    # Expression value never used

# StyleCop
dotnet_diagnostic.SA1101.severity = none     # Prefix local calls with this
dotnet_diagnostic.SA1309.severity = none     # Field names must not begin with underscore
dotnet_diagnostic.SA1600.severity = none     # Elements should be documented
dotnet_diagnostic.SA1633.severity = none     # File should have header
```

## dotnet format

### Commands

```bash
# Check formatting
dotnet format --verify-no-changes

# Fix formatting
dotnet format

# Specific project
dotnet format ./src/MyProject

# Analyzers only
dotnet format analyzers

# Style only
dotnet format style

# Whitespace only
dotnet format whitespace

# With severity
dotnet format --severity warn
```

## Common Analyzer Warnings

### CA1062 - Validate Arguments

```csharp
// BAD - No null check
public void Process(string input)
{
    Console.WriteLine(input.Length);  // CA1062
}

// GOOD - Null check
public void Process(string input)
{
    ArgumentNullException.ThrowIfNull(input);
    Console.WriteLine(input.Length);
}

// GOOD - Nullable reference type
public void Process(string? input)
{
    if (input is null) return;
    Console.WriteLine(input.Length);
}
```

### CA1307/CA1310 - StringComparison

```csharp
// BAD - Culture-dependent
if (name.Equals("admin"))  // CA1307

// GOOD - Explicit comparison
if (name.Equals("admin", StringComparison.OrdinalIgnoreCase))

// GOOD - For user-facing
if (name.Equals(otherName, StringComparison.CurrentCultureIgnoreCase))
```

### CA2000 - Dispose Objects

```csharp
// BAD - Not disposed
public void Process()
{
    var stream = new FileStream("file.txt", FileMode.Open);  // CA2000
    // forgot to dispose
}

// GOOD - Using statement
public void Process()
{
    using var stream = new FileStream("file.txt", FileMode.Open);
    // automatically disposed
}
```

### IDE0090 - Use Target-typed new

```csharp
// Before
List<string> items = new List<string>();

// After
List<string> items = new();

// Or with var
var items = new List<string>();
```

## Common Code Smells & Fixes

### 1. God Class

```csharp
// BAD - Does too much
public class OrderProcessor
{
    public void CreateOrder() { ... }
    public void SendEmail() { ... }
    public void GeneratePdf() { ... }
    public void CalculateTax() { ... }
}

// GOOD - Single responsibility
public class OrderService
{
    private readonly IEmailService _emailService;
    private readonly IPdfGenerator _pdfGenerator;
    private readonly ITaxCalculator _taxCalculator;

    public OrderService(
        IEmailService emailService,
        IPdfGenerator pdfGenerator,
        ITaxCalculator taxCalculator)
    {
        _emailService = emailService;
        _pdfGenerator = pdfGenerator;
        _taxCalculator = taxCalculator;
    }

    public async Task<Order> CreateOrderAsync(OrderRequest request)
    {
        var order = BuildOrder(request);
        order.Tax = _taxCalculator.Calculate(order);
        return order;
    }
}
```

### 2. Async/Await Pitfalls

```csharp
// BAD - Blocking async
public void Process()
{
    var result = GetDataAsync().Result;  // Deadlock risk!
}

// BAD - Async void (except event handlers)
public async void ProcessAsync()  // Can't be awaited, exceptions lost
{
    await DoWorkAsync();
}

// GOOD - Async all the way
public async Task ProcessAsync()
{
    var result = await GetDataAsync();
}

// GOOD - When truly fire-and-forget
public void StartBackgroundWork()
{
    _ = Task.Run(async () =>
    {
        try { await DoWorkAsync(); }
        catch (Exception ex) { _logger.LogError(ex, "Background work failed"); }
    });
}
```

### 3. Nullable Reference Types

```csharp
// Enable in .csproj
// <Nullable>enable</Nullable>

// BAD - Ignoring nullability
public string GetName(User user)
{
    return user.Name;  // Warning if Name is string?
}

// GOOD - Handle null
public string GetName(User user)
{
    return user.Name ?? "Unknown";
}

// GOOD - Return nullable
public string? GetName(User? user)
{
    return user?.Name;
}
```

### 4. Record Types for DTOs

```csharp
// BAD - Mutable class with boilerplate
public class UserDto
{
    public int Id { get; set; }
    public string Name { get; set; }
    public string Email { get; set; }

    // Equals, GetHashCode, ToString...
}

// GOOD - Immutable record
public record UserDto(int Id, string Name, string Email);

// With validation
public record UserDto
{
    public int Id { get; init; }
    public string Name { get; init; }
    public string Email { get; init; }

    public UserDto(int id, string name, string email)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(name);
        ArgumentException.ThrowIfNullOrWhiteSpace(email);

        Id = id;
        Name = name;
        Email = email;
    }
}
```

### 5. Pattern Matching

```csharp
// BAD - Type checking with cast
if (shape is Circle)
{
    var circle = (Circle)shape;
    return circle.Radius * circle.Radius * Math.PI;
}

// GOOD - Pattern matching
if (shape is Circle circle)
{
    return circle.Radius * circle.Radius * Math.PI;
}

// GOOD - Switch expression
return shape switch
{
    Circle c => c.Radius * c.Radius * Math.PI,
    Rectangle r => r.Width * r.Height,
    _ => throw new ArgumentException("Unknown shape")
};
```

## Pre-commit Setup

### .pre-commit-config.yaml

```yaml
repos:
  - repo: local
    hooks:
      - id: dotnet-format
        name: dotnet format
        entry: dotnet format --verify-no-changes
        language: system
        types: [c#]
        pass_filenames: false

      - id: dotnet-build
        name: dotnet build
        entry: dotnet build --no-restore -warnaserror
        language: system
        types: [c#]
        pass_filenames: false
```

## Quality Metrics Targets

| Metric | Target | Tool |
|--------|--------|------|
| Cyclomatic Complexity | < 10 | Roslynator |
| Method Lines | < 50 | StyleCop |
| Parameters | < 5 | CA1026 |
| Test Coverage | > 80% | coverlet |
| Maintainability Index | > 60 | VS Metrics |

## CI/CD Integration

### GitHub Actions

```yaml
name: Quality
on: [push, pull_request]

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup .NET
        uses: actions/setup-dotnet@v4
        with:
          dotnet-version: '8.0.x'

      - name: Restore
        run: dotnet restore

      - name: Format check
        run: dotnet format --verify-no-changes

      - name: Build
        run: dotnet build --no-restore -warnaserror

      - name: Test
        run: dotnet test --no-build --collect:"XPlat Code Coverage"

      - name: Upload coverage
        uses: codecov/codecov-action@v4
```

## VS Code / Rider Settings

```json
// .vscode/settings.json
{
  "omnisharp.enableEditorConfigSupport": true,
  "omnisharp.enableRoslynAnalyzers": true,
  "[csharp]": {
    "editor.defaultFormatter": "ms-dotnettools.csharp",
    "editor.formatOnSave": true
  }
}
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| `.Result` / `.Wait()` | Deadlock risk | Use `async/await` |
| `async void` | Exceptions lost | Use `async Task` |
| Ignoring CA warnings | Real issues hidden | Fix or suppress with reason |
| No nullable reference types | NullReferenceException | Enable `<Nullable>enable</Nullable>` |
| `#pragma warning disable` | Hides issues | Fix or suppress specifically |
| Mutable DTOs | Unexpected changes | Use records or init-only |

## Quick Troubleshooting

| Issue | Likely Cause | Solution |
|-------|--------------|----------|
| Analyzer not running | Package not installed | Add to `.csproj` |
| Too many warnings | First-time enable | Suppress and fix incrementally |
| Format changes on build | Different settings | Commit `.editorconfig` |
| Nullable warnings everywhere | Legacy code | Enable gradually per project |
| StyleCop conflicts | Different conventions | Configure in `.editorconfig` |

## Related Skills
- [SonarQube](../sonarqube/SKILL.md)
- [Clean Code](../../best-practices/clean-code/SKILL.md)
- [.NET Security](../../security/dotnet-security/SKILL.md)
