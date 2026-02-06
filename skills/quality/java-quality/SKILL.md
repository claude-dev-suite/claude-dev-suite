---
name: java-quality
description: |
  Java code quality with Checkstyle, SpotBugs, PMD, and SonarJava.
  Covers static analysis, code style, and best practices.

  USE WHEN: user works with "Java", "Spring Boot", "Maven", "Gradle", asks about "Checkstyle", "SpotBugs", "PMD", "Java code smells", "Java best practices"

  DO NOT USE FOR: SonarQube generic - use `sonarqube` skill, testing - use Spring Boot test skills, security - use `java-security` skill
allowed-tools: Read, Grep, Glob, Bash
---
# Java Quality - Quick Reference

## When NOT to Use This Skill
- **SonarQube generic setup** - Use `sonarqube` skill
- **Spring Boot testing** - Use Spring Boot test skills
- **Security scanning** - Use `java-security` skill
- **Coverage reporting** - Use `jacoco` skill

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `spring-boot` for framework-specific patterns.

## Tool Overview

| Tool | Focus | Speed | Integration |
|------|-------|-------|-------------|
| **Checkstyle** | Code style, formatting | Fast | Maven/Gradle |
| **SpotBugs** | Bug patterns, bytecode | Medium | Maven/Gradle |
| **PMD** | Code smells, complexity | Fast | Maven/Gradle |
| **SonarJava** | All-in-one | Slow | SonarQube |
| **Error Prone** | Compile-time bugs | Fast | Compiler plugin |

## Checkstyle Setup

### Maven Configuration

```xml
<!-- pom.xml -->
<plugin>
    <groupId>org.apache.maven.plugins</groupId>
    <artifactId>maven-checkstyle-plugin</artifactId>
    <version>3.3.1</version>
    <configuration>
        <configLocation>checkstyle.xml</configLocation>
        <consoleOutput>true</consoleOutput>
        <failsOnError>true</failsOnError>
        <violationSeverity>warning</violationSeverity>
    </configuration>
    <executions>
        <execution>
            <id>validate</id>
            <phase>validate</phase>
            <goals>
                <goal>check</goal>
            </goals>
        </execution>
    </executions>
    <dependencies>
        <dependency>
            <groupId>com.puppycrawl.tools</groupId>
            <artifactId>checkstyle</artifactId>
            <version>10.12.5</version>
        </dependency>
    </dependencies>
</plugin>
```

### checkstyle.xml (Google Style Based)

```xml
<?xml version="1.0"?>
<!DOCTYPE module PUBLIC
    "-//Checkstyle//DTD Checkstyle Configuration 1.3//EN"
    "https://checkstyle.org/dtds/configuration_1_3.dtd">

<module name="Checker">
    <property name="severity" value="warning"/>
    <property name="fileExtensions" value="java"/>

    <module name="TreeWalker">
        <!-- Naming -->
        <module name="ConstantName"/>
        <module name="LocalVariableName"/>
        <module name="MemberName"/>
        <module name="MethodName"/>
        <module name="PackageName"/>
        <module name="ParameterName"/>
        <module name="TypeName"/>

        <!-- Imports -->
        <module name="IllegalImport"/>
        <module name="RedundantImport"/>
        <module name="UnusedImports"/>

        <!-- Size -->
        <module name="LineLength">
            <property name="max" value="120"/>
        </module>
        <module name="MethodLength">
            <property name="max" value="50"/>
        </module>
        <module name="ParameterNumber">
            <property name="max" value="5"/>
        </module>

        <!-- Complexity -->
        <module name="CyclomaticComplexity">
            <property name="max" value="10"/>
        </module>
        <module name="NPathComplexity">
            <property name="max" value="200"/>
        </module>

        <!-- Best Practices -->
        <module name="EmptyBlock"/>
        <module name="EqualsHashCode"/>
        <module name="HiddenField"/>
        <module name="MissingSwitchDefault"/>
        <module name="SimplifyBooleanExpression"/>
        <module name="SimplifyBooleanReturn"/>
    </module>

    <!-- File-level checks -->
    <module name="FileLength">
        <property name="max" value="500"/>
    </module>
    <module name="NewlineAtEndOfFile"/>
</module>
```

### Commands

```bash
# Run Checkstyle
./mvnw checkstyle:check

# Generate report
./mvnw checkstyle:checkstyle
```

## SpotBugs Setup

### Maven Configuration

```xml
<!-- pom.xml -->
<plugin>
    <groupId>com.github.spotbugs</groupId>
    <artifactId>spotbugs-maven-plugin</artifactId>
    <version>4.8.3.0</version>
    <configuration>
        <effort>Max</effort>
        <threshold>Medium</threshold>
        <failOnError>true</failOnError>
        <plugins>
            <plugin>
                <groupId>com.h3xstream.findsecbugs</groupId>
                <artifactId>findsecbugs-plugin</artifactId>
                <version>1.12.0</version>
            </plugin>
        </plugins>
    </configuration>
    <executions>
        <execution>
            <goals>
                <goal>check</goal>
            </goals>
        </execution>
    </executions>
</plugin>
```

### Exclude False Positives

```xml
<!-- spotbugs-exclude.xml -->
<?xml version="1.0" encoding="UTF-8"?>
<FindBugsFilter>
    <!-- Exclude generated code -->
    <Match>
        <Package name="~.*\.generated\..*"/>
    </Match>

    <!-- Exclude specific patterns -->
    <Match>
        <Bug pattern="EI_EXPOSE_REP"/>
        <Class name="~.*Dto"/>
    </Match>
</FindBugsFilter>
```

### Commands

```bash
# Run SpotBugs
./mvnw spotbugs:check

# Generate report
./mvnw spotbugs:spotbugs

# GUI viewer
./mvnw spotbugs:gui
```

### Common SpotBugs Warnings

| Bug ID | Description | Fix |
|--------|-------------|-----|
| NP_NULL_ON_SOME_PATH | Possible null dereference | Add null check or use Optional |
| EI_EXPOSE_REP | Returns mutable object | Return defensive copy |
| MS_SHOULD_BE_FINAL | Static field should be final | Add final modifier |
| SQL_INJECTION | SQL injection risk | Use parameterized queries |
| DM_DEFAULT_ENCODING | Uses default encoding | Specify charset explicitly |

## PMD Setup

### Maven Configuration

```xml
<!-- pom.xml -->
<plugin>
    <groupId>org.apache.maven.plugins</groupId>
    <artifactId>maven-pmd-plugin</artifactId>
    <version>3.21.2</version>
    <configuration>
        <rulesets>
            <ruleset>pmd-rules.xml</ruleset>
        </rulesets>
        <failOnViolation>true</failOnViolation>
        <printFailingErrors>true</printFailingErrors>
    </configuration>
    <executions>
        <execution>
            <goals>
                <goal>check</goal>
            </goals>
        </execution>
    </executions>
</plugin>
```

### pmd-rules.xml

```xml
<?xml version="1.0"?>
<ruleset name="Custom Rules">
    <description>Custom PMD ruleset</description>

    <!-- Best Practices -->
    <rule ref="category/java/bestpractices.xml">
        <exclude name="JUnitTestContainsTooManyAsserts"/>
    </rule>

    <!-- Code Style -->
    <rule ref="category/java/codestyle.xml">
        <exclude name="AtLeastOneConstructor"/>
        <exclude name="OnlyOneReturn"/>
    </rule>

    <!-- Design -->
    <rule ref="category/java/design.xml">
        <exclude name="LawOfDemeter"/>
    </rule>

    <!-- Error Prone -->
    <rule ref="category/java/errorprone.xml"/>

    <!-- Performance -->
    <rule ref="category/java/performance.xml"/>

    <!-- Custom thresholds -->
    <rule ref="category/java/design.xml/CyclomaticComplexity">
        <properties>
            <property name="methodReportLevel" value="10"/>
        </properties>
    </rule>

    <rule ref="category/java/design.xml/CognitiveComplexity">
        <properties>
            <property name="reportLevel" value="15"/>
        </properties>
    </rule>
</ruleset>
```

### Commands

```bash
# Run PMD
./mvnw pmd:check

# Generate report
./mvnw pmd:pmd

# Copy-paste detection
./mvnw pmd:cpd
```

## Error Prone Setup

### Maven Configuration

```xml
<!-- pom.xml -->
<plugin>
    <groupId>org.apache.maven.plugins</groupId>
    <artifactId>maven-compiler-plugin</artifactId>
    <version>3.12.1</version>
    <configuration>
        <compilerArgs>
            <arg>-XDcompilePolicy=simple</arg>
            <arg>-Xplugin:ErrorProne</arg>
        </compilerArgs>
        <annotationProcessorPaths>
            <path>
                <groupId>com.google.errorprone</groupId>
                <artifactId>error_prone_core</artifactId>
                <version>2.24.1</version>
            </path>
        </annotationProcessorPaths>
    </configuration>
</plugin>
```

## Combined Quality Profile

### All-in-One Maven Profile

```xml
<!-- pom.xml -->
<profiles>
    <profile>
        <id>quality</id>
        <build>
            <plugins>
                <!-- Checkstyle -->
                <plugin>
                    <groupId>org.apache.maven.plugins</groupId>
                    <artifactId>maven-checkstyle-plugin</artifactId>
                    <executions>
                        <execution>
                            <goals><goal>check</goal></goals>
                        </execution>
                    </executions>
                </plugin>

                <!-- SpotBugs -->
                <plugin>
                    <groupId>com.github.spotbugs</groupId>
                    <artifactId>spotbugs-maven-plugin</artifactId>
                    <executions>
                        <execution>
                            <goals><goal>check</goal></goals>
                        </execution>
                    </executions>
                </plugin>

                <!-- PMD -->
                <plugin>
                    <groupId>org.apache.maven.plugins</groupId>
                    <artifactId>maven-pmd-plugin</artifactId>
                    <executions>
                        <execution>
                            <goals><goal>check</goal></goals>
                        </execution>
                    </executions>
                </plugin>
            </plugins>
        </build>
    </profile>
</profiles>
```

```bash
# Run all quality checks
./mvnw verify -Pquality
```

## Common Code Smells & Fixes

### 1. God Class

```java
// BAD - Class does too much
public class OrderService {
    public Order createOrder() { ... }
    public void sendEmail() { ... }
    public void generatePdf() { ... }
    public void calculateTax() { ... }
    public void updateInventory() { ... }
}

// GOOD - Single responsibility
public class OrderService {
    private final EmailService emailService;
    private final PdfGenerator pdfGenerator;
    private final TaxCalculator taxCalculator;
    private final InventoryService inventoryService;

    public Order createOrder(OrderRequest request) {
        Order order = buildOrder(request);
        order.setTax(taxCalculator.calculate(order));
        inventoryService.reserve(order.getItems());
        return orderRepository.save(order);
    }
}
```

### 2. Long Parameter List

```java
// BAD
public void createUser(String name, String email, String phone,
    String address, String city, String country, String zipCode) { }

// GOOD - Use builder or DTO
public void createUser(CreateUserRequest request) { }

@Builder
public record CreateUserRequest(
    String name,
    String email,
    String phone,
    Address address
) {}
```

### 3. Feature Envy

```java
// BAD - Method uses another object's data excessively
public double calculateTotal(Order order) {
    double total = 0;
    for (OrderItem item : order.getItems()) {
        total += item.getPrice() * item.getQuantity();
        if (item.getDiscount() > 0) {
            total -= item.getPrice() * item.getQuantity() * item.getDiscount();
        }
    }
    return total;
}

// GOOD - Move logic to Order
public class Order {
    public double calculateTotal() {
        return items.stream()
            .mapToDouble(OrderItem::getSubtotal)
            .sum();
    }
}

public class OrderItem {
    public double getSubtotal() {
        double base = price * quantity;
        return discount > 0 ? base * (1 - discount) : base;
    }
}
```

### 4. Primitive Obsession

```java
// BAD
public void sendEmail(String email) {
    if (!email.matches("^[A-Za-z0-9+_.-]+@(.+)$")) {
        throw new IllegalArgumentException("Invalid email");
    }
}

// GOOD - Value object
public record Email(String value) {
    public Email {
        if (!value.matches("^[A-Za-z0-9+_.-]+@(.+)$")) {
            throw new IllegalArgumentException("Invalid email: " + value);
        }
    }
}

public void sendEmail(Email email) { ... }
```

### 5. Deep Nesting

```java
// BAD
public void process(Order order) {
    if (order != null) {
        if (order.isValid()) {
            for (OrderItem item : order.getItems()) {
                if (item.isAvailable()) {
                    if (item.getQuantity() > 0) {
                        // process
                    }
                }
            }
        }
    }
}

// GOOD - Guard clauses
public void process(Order order) {
    if (order == null || !order.isValid()) {
        return;
    }

    order.getItems().stream()
        .filter(OrderItem::isAvailable)
        .filter(item -> item.getQuantity() > 0)
        .forEach(this::processItem);
}
```

## Quality Metrics Targets

| Metric | Target | Tool |
|--------|--------|------|
| Cyclomatic Complexity | < 10 | Checkstyle, PMD |
| Cognitive Complexity | < 15 | PMD, SonarQube |
| Method Length | < 50 lines | Checkstyle |
| Class Length | < 500 lines | Checkstyle |
| Parameters | < 5 | Checkstyle |
| Nesting Depth | < 4 | PMD |

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

      - name: Set up JDK
        uses: actions/setup-java@v4
        with:
          java-version: '21'
          distribution: 'temurin'
          cache: maven

      - name: Run quality checks
        run: ./mvnw verify -Pquality

      - name: Upload reports
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: quality-reports
          path: |
            target/checkstyle-result.xml
            target/spotbugsXml.xml
            target/pmd.xml
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| Suppressing all warnings | Hides real issues | Fix or justify individually |
| No static analysis in CI | Quality degrades over time | Add to build pipeline |
| Only running Checkstyle | Misses bugs and smells | Combine with SpotBugs + PMD |
| High complexity thresholds | Allows unmaintainable code | Keep < 10 cyclomatic |
| Excluding entire packages | Ignores quality in areas | Be specific with exclusions |

## Quick Troubleshooting

| Issue | Likely Cause | Solution |
|-------|--------------|----------|
| Checkstyle fails on generated code | No exclusion pattern | Add `<exclude>` for generated dirs |
| SpotBugs false positive on DTO | EI_EXPOSE_REP on records | Exclude pattern for DTOs |
| PMD too slow | Analyzing all files | Configure incremental analysis |
| Error Prone conflicts | Version mismatch | Align with JDK version |
| Quality gate fails in CI | Different config locally | Commit config files |

## Related Skills
- [SonarQube](../sonarqube/SKILL.md)
- [JaCoCo](../jacoco/SKILL.md)
- [Clean Code](../../best-practices/clean-code/SKILL.md)
- [Java Security](../../security/java-security/SKILL.md)
