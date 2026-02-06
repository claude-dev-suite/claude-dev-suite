---
name: spring-shell
description: |
  Spring Shell for building interactive CLI applications.
  Covers @ShellComponent, @ShellMethod, input validation, tables, and command groups.

  USE WHEN: user mentions "spring shell", "@ShellComponent", "@ShellMethod",
  "CLI application Spring", "interactive shell", "command line tool Spring"

  DO NOT USE FOR: simple scripts - use regular main method,
  batch processing - use `spring-batch` skill,
  web endpoints - use `spring-rest` skill
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Spring Shell - Quick Reference

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `spring-shell` for comprehensive documentation.

## Dependencies

```xml
<dependency>
    <groupId>org.springframework.shell</groupId>
    <artifactId>spring-shell-starter</artifactId>
</dependency>
```

## Configuration

### application.yml
```yaml
spring:
  shell:
    interactive:
      enabled: true
    noninteractive:
      enabled: true
    history:
      enabled: true
      name: .myapp_history
    command:
      version:
        enabled: true
```

## Basic Commands

### Simple Command
```java
@ShellComponent
public class GreetingCommands {

    @ShellMethod(value = "Say hello", key = "hello")
    public String hello(
            @ShellOption(defaultValue = "World") String name) {
        return "Hello, " + name + "!";
    }

    @ShellMethod("Add two numbers")
    public int add(int a, int b) {
        return a + b;
    }

    @ShellMethod("Show current date")
    public String date() {
        return LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);
    }
}
```

### Command Groups
```java
@ShellComponent
@ShellCommandGroup("User Management")
public class UserCommands {

    @ShellMethod("List all users")
    public Table listUsers() {
        List<User> users = userService.findAll();
        return buildUserTable(users);
    }

    @ShellMethod("Create a new user")
    public String createUser(
            @ShellOption(help = "Username") String username,
            @ShellOption(help = "Email address") String email,
            @ShellOption(help = "User role", defaultValue = "USER") String role) {

        User user = userService.create(username, email, role);
        return "Created user: " + user.getId();
    }

    @ShellMethod("Delete a user")
    public String deleteUser(@ShellOption(help = "User ID") Long id) {
        userService.delete(id);
        return "User deleted successfully";
    }
}
```

## Shell Options

### Option Annotations
```java
@ShellComponent
public class AdvancedCommands {

    @ShellMethod("Process file with options")
    public String process(
            // Required option
            @ShellOption(help = "Input file path") String input,

            // Optional with default
            @ShellOption(defaultValue = "output.txt", help = "Output file") String output,

            // Boolean flag
            @ShellOption(defaultValue = "false", help = "Verbose mode") boolean verbose,

            // Array/List option
            @ShellOption(help = "Tags to apply") String[] tags,

            // Arity (number of values)
            @ShellOption(arity = 2, help = "Coordinates x y") int[] coords) {

        // Implementation
        return "Processing " + input;
    }

    // Named options with aliases
    @ShellMethod("Export data")
    public String export(
            @ShellOption(value = {"-f", "--format"}, defaultValue = "json") String format,
            @ShellOption(value = {"-o", "--output"}) String output,
            @ShellOption(value = {"-c", "--compress"}, defaultValue = "false") boolean compress) {

        return String.format("Exporting to %s in %s format (compressed: %s)",
            output, format, compress);
    }
}
```

## Availability and Validation

### Command Availability
```java
@ShellComponent
public class AdminCommands {

    private boolean authenticated = false;

    @ShellMethod("Login to the system")
    public String login(String username, String password) {
        if (authService.authenticate(username, password)) {
            authenticated = true;
            return "Login successful";
        }
        return "Login failed";
    }

    @ShellMethod("Perform admin action")
    @ShellMethodAvailability("isAuthenticated")
    public String adminAction() {
        return "Admin action performed";
    }

    public Availability isAuthenticated() {
        return authenticated
            ? Availability.available()
            : Availability.unavailable("You must login first");
    }

    // Apply to multiple methods
    @ShellMethodAvailability({"adminAction", "deleteAll", "resetSystem"})
    public Availability requiresAdmin() {
        return currentUser.isAdmin()
            ? Availability.available()
            : Availability.unavailable("Admin privileges required");
    }
}
```

### Input Validation
```java
@ShellComponent
public class ValidatedCommands {

    @ShellMethod("Create user with validation")
    public String createUser(
            @ShellOption @Size(min = 3, max = 20) String username,
            @ShellOption @Email String email,
            @ShellOption @Min(18) @Max(120) int age) {

        return "User created: " + username;
    }
}

// Custom validator
@Component
public class FileExistsValidator implements Validator {

    @Override
    public boolean supports(Class<?> clazz) {
        return String.class.isAssignableFrom(clazz);
    }

    @Override
    public void validate(Object target, Errors errors) {
        String path = (String) target;
        if (!Files.exists(Path.of(path))) {
            errors.reject("file.notfound", "File does not exist: " + path);
        }
    }
}
```

## Output Formatting

### Tables
```java
@ShellComponent
public class TableCommands {

    @ShellMethod("Show users in table format")
    public Table showUsers() {
        List<User> users = userService.findAll();

        TableModel model = new BeanListTableModel<>(users,
            new LinkedHashMap<>() {{
                put("id", "ID");
                put("username", "Username");
                put("email", "Email");
                put("role", "Role");
                put("createdAt", "Created");
            }});

        TableBuilder tableBuilder = new TableBuilder(model);
        tableBuilder.addFullBorder(BorderStyle.fancy_light);
        return tableBuilder.build();
    }

    // Custom table
    @ShellMethod("Show system info")
    public Table systemInfo() {
        String[][] data = {
            {"OS", System.getProperty("os.name")},
            {"Java", System.getProperty("java.version")},
            {"Memory", Runtime.getRuntime().maxMemory() / 1024 / 1024 + " MB"},
            {"Processors", String.valueOf(Runtime.getRuntime().availableProcessors())}
        };

        TableModel model = new ArrayTableModel(data);
        TableBuilder builder = new TableBuilder(model);
        builder.addHeaderBorder(BorderStyle.fancy_double);
        return builder.build();
    }
}
```

### Colored Output
```java
@ShellComponent
public class ColoredCommands {

    @ShellMethod("Show status with colors")
    public AttributedString status() {
        AttributedStringBuilder builder = new AttributedStringBuilder();

        builder.append("Status: ");
        builder.style(AttributedStyle.DEFAULT.foreground(AttributedStyle.GREEN));
        builder.append("RUNNING");
        builder.style(AttributedStyle.DEFAULT);
        builder.append("\n");

        builder.append("Errors: ");
        builder.style(AttributedStyle.DEFAULT.foreground(AttributedStyle.RED).bold());
        builder.append("3");
        builder.style(AttributedStyle.DEFAULT);

        return builder.toAttributedString();
    }
}
```

## Interactive Input

### User Prompts
```java
@ShellComponent
public class InteractiveCommands {

    private final LineReader lineReader;

    @ShellMethod("Interactive user creation")
    public String createUserInteractive() {
        String username = lineReader.readLine("Enter username: ");
        String email = lineReader.readLine("Enter email: ");
        String password = lineReader.readLine("Enter password: ", '*');

        String confirm = lineReader.readLine("Create user? (y/n): ");
        if ("y".equalsIgnoreCase(confirm)) {
            userService.create(username, email, password);
            return "User created successfully";
        }
        return "Cancelled";
    }
}
```

### Progress Indicators
```java
@ShellComponent
public class ProgressCommands {

    private final TerminalUI terminalUI;

    @ShellMethod("Import data with progress")
    public void importData(String file) throws Exception {
        List<String> lines = Files.readAllLines(Path.of(file));
        int total = lines.size();

        try (ProgressView progress = terminalUI.progressView()
                .spinner(Spinner.SIMPLE)
                .text("Importing data...")
                .max(total)
                .start()) {

            for (int i = 0; i < total; i++) {
                processLine(lines.get(i));
                progress.setValue(i + 1);
                progress.setText("Processing " + (i + 1) + "/" + total);
            }
        }
    }
}
```

## Non-Interactive Mode

```java
// Run single command
// java -jar myapp.jar hello --name John

// Run script
// java -jar myapp.jar @commands.txt

@SpringBootApplication
public class CliApplication implements CommandLineRunner {

    @Autowired
    private Shell shell;

    @Override
    public void run(String... args) throws Exception {
        if (args.length > 0 && args[0].equals("--batch")) {
            // Run in non-interactive mode
            shell.evaluate(() -> "process-batch --file data.csv");
            shell.evaluate(() -> "export --format json --output result.json");
            System.exit(0);
        }
        // Otherwise, start interactive shell
    }
}
```

## Custom Prompt

```java
@Component
public class CustomPromptProvider implements PromptProvider {

    private String currentContext = "default";

    @Override
    public AttributedString getPrompt() {
        return new AttributedString(
            String.format("myapp:%s> ", currentContext),
            AttributedStyle.DEFAULT.foreground(AttributedStyle.CYAN)
        );
    }

    public void setContext(String context) {
        this.currentContext = context;
    }
}
```

## Exception Handling

```java
@Component
public class CustomExceptionHandler implements CommandExceptionResolver {

    @Override
    public CommandHandlingResult resolve(Exception ex) {
        if (ex instanceof IllegalArgumentException) {
            return CommandHandlingResult.of(
                "Invalid argument: " + ex.getMessage() + "\n",
                1  // Exit code
            );
        }
        if (ex instanceof ResourceNotFoundException) {
            return CommandHandlingResult.of(
                "Error: " + ex.getMessage() + "\n",
                2
            );
        }
        // Let default handler process
        return null;
    }
}
```

## Testing

```java
@SpringBootTest
class CommandsTest {

    @Autowired
    private Shell shell;

    @Test
    void shouldSayHello() {
        Object result = shell.evaluate(() -> "hello --name John");
        assertThat(result).isEqualTo("Hello, John!");
    }

    @Test
    void shouldAddNumbers() {
        Object result = shell.evaluate(() -> "add 5 3");
        assertThat(result).isEqualTo(8);
    }

    @Test
    void shouldShowUnavailableForAdminCommands() {
        Object result = shell.evaluate(() -> "admin-action");
        assertThat(result.toString()).contains("must login first");
    }
}
```

## Best Practices

| Do | Don't |
|----|-------|
| Group related commands | Create flat command structure |
| Provide --help for all options | Leave options undocumented |
| Use tables for structured data | Dump raw data |
| Implement availability checks | Let commands fail cryptically |
| Support both interactive and batch | Force one mode only |

## Production Checklist

- [ ] Commands grouped logically
- [ ] All options documented (help)
- [ ] Input validation implemented
- [ ] Proper error handling
- [ ] Progress indicators for long ops
- [ ] Non-interactive mode supported
- [ ] Exit codes defined
- [ ] History enabled/configured
- [ ] Security checks (authentication)
- [ ] Tab completion working

## When NOT to Use This Skill

- **Simple scripts** - Use regular main method
- **Batch processing** - Use `spring-batch` skill
- **Web APIs** - Use `spring-rest` skill
- **GUI applications** - Consider JavaFX

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| Flat command structure | Hard to navigate | Group related commands |
| Undocumented options | Poor UX | Add help to all options |
| No availability checks | Cryptic failures | Implement @ShellMethodAvailability |
| Raw data output | Unreadable | Use tables for structured data |
| Interactive-only mode | Not scriptable | Support batch mode |

## Quick Troubleshooting

| Problem | Diagnostic | Fix |
|---------|------------|-----|
| Command not found | Check annotation | Add @ShellComponent |
| Option not recognized | Check naming | Verify @ShellOption config |
| Validation not working | Check annotations | Add Bean Validation |
| Command unavailable | Check availability | Verify availability method |
| Tab completion missing | Check setup | Configure completion bean |

## Reference Documentation
- [Spring Shell Reference](https://docs.spring.io/spring-shell/reference/)
