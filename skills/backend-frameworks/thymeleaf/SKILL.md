---
name: thymeleaf
description: |
  Thymeleaf template engine for Java/Spring. Covers HTML templates, expressions,
  fragments, i18n, and email templates.

  USE WHEN: user mentions "thymeleaf", "spring template", "HTML template Spring",
  "email template Java", "th:text", "th:each", "th:if", "fragments", "layout"

  DO NOT USE FOR: REST API JSON - use `spring-rest` skill,
  SPA frontend - use React/Vue/Angular skills,
  PDF generation - use JasperReports or iText
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Thymeleaf - Quick Reference

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `thymeleaf` for comprehensive documentation.

## Pattern Essenziali

### Basic Syntax
```html
<!DOCTYPE html>
<html xmlns:th="http://www.thymeleaf.org">
<head>
    <title th:text="${title}">Default</title>
</head>
<body>
    <h1 th:text="${message}">Hello</h1>
    <p th:text="'Welcome, ' + ${name}">Welcome, User</p>
</body>
</html>
```

### Variables & Loops
```html
<!-- Variable -->
<p th:text="${user.name}">Name</p>

<!-- Loop -->
<tr th:each="user : ${users}">
    <td th:text="${user.name}">Name</td>
    <td th:text="${user.email}">Email</td>
</tr>

<!-- Conditionals -->
<p th:if="${user.active}">Active</p>
<p th:unless="${user.active}">Inactive</p>
```

### Email Service
```java
@Service
@RequiredArgsConstructor
public class EmailService {

    private final TemplateEngine templateEngine;
    private final JavaMailSender mailSender;

    public void sendWelcome(User user) {
        Context ctx = new Context();
        ctx.setVariable("userName", user.getName());
        ctx.setVariable("actionUrl", "https://app.com/verify");

        String html = templateEngine.process("emails/welcome", ctx);

        MimeMessage msg = mailSender.createMimeMessage();
        MimeMessageHelper helper = new MimeMessageHelper(msg, true);
        helper.setTo(user.getEmail());
        helper.setSubject("Welcome!");
        helper.setText(html, true);
        mailSender.send(msg);
    }
}
```

### Fragments & Layouts

```html
<!-- fragments/common.html -->
<nav th:fragment="navigation">
    <ul>
        <li><a th:href="@{/}">Home</a></li>
        <li><a th:href="@{/about}">About</a></li>
    </ul>
</nav>

<footer th:fragment="footer(year)">
    <p th:text="'© ' + ${year} + ' My Company'">© 2024 My Company</p>
</footer>
```

```html
<!-- Usage: th:replace vs th:insert -->
<!-- th:replace - replaces host tag completely -->
<div th:replace="~{fragments/common :: navigation}"></div>

<!-- th:insert - inserts fragment inside host tag -->
<div th:insert="~{fragments/common :: navigation}"></div>

<!-- With parameters -->
<div th:replace="~{fragments/common :: footer(${#dates.year(#dates.createNow())})}"></div>
```

### Layout Dialect

```xml
<!-- pom.xml -->
<dependency>
    <groupId>nz.net.ultraq.thymeleaf</groupId>
    <artifactId>thymeleaf-layout-dialect</artifactId>
</dependency>
```

```html
<!-- layouts/main.html -->
<!DOCTYPE html>
<html xmlns:th="http://www.thymeleaf.org"
      xmlns:layout="http://www.ultraq.net.nz/thymeleaf/layout">
<head>
    <title layout:title-pattern="$CONTENT_TITLE - $LAYOUT_TITLE">My App</title>
    <link rel="stylesheet" th:href="@{/css/main.css}"/>
</head>
<body>
    <header th:replace="~{fragments/common :: navigation}"></header>

    <main layout:fragment="content">
        <!-- Page content goes here -->
    </main>

    <footer th:replace="~{fragments/common :: footer}"></footer>

    <script layout:fragment="scripts"></script>
</body>
</html>
```

```html
<!-- pages/home.html -->
<!DOCTYPE html>
<html xmlns:th="http://www.thymeleaf.org"
      xmlns:layout="http://www.ultraq.net.nz/thymeleaf/layout"
      layout:decorate="~{layouts/main}">
<head>
    <title>Home</title>
</head>
<body>
    <main layout:fragment="content">
        <h1>Welcome!</h1>
        <p th:text="${message}">Content</p>
    </main>

    <th:block layout:fragment="scripts">
        <script th:src="@{/js/home.js}"></script>
    </th:block>
</body>
</html>
```

### Form Binding

```html
<form th:action="@{/users}" th:object="${userForm}" method="post">
    <div>
        <label for="name">Name:</label>
        <input type="text" id="name" th:field="*{name}"
               th:classappend="${#fields.hasErrors('name')} ? 'error' : ''"/>
        <span th:if="${#fields.hasErrors('name')}"
              th:errors="*{name}" class="error-msg">Name error</span>
    </div>

    <div>
        <label for="email">Email:</label>
        <input type="email" id="email" th:field="*{email}"/>
        <span th:if="${#fields.hasErrors('email')}"
              th:errors="*{email}" class="error-msg">Email error</span>
    </div>

    <div>
        <label for="role">Role:</label>
        <select id="role" th:field="*{role}">
            <option value="">-- Select --</option>
            <option th:each="role : ${roles}"
                    th:value="${role}"
                    th:text="${role.displayName}">Role</option>
        </select>
    </div>

    <button type="submit">Save</button>
</form>
```

### JavaScript Inlining

```html
<script th:inline="javascript">
    // Natural templates with fallback
    const user = /*[[${user}]]*/ { name: 'default' };
    const userId = /*[[${user.id}]]*/ 0;
    const isAdmin = /*[[${user.admin}]]*/ false;

    // Array
    const items = /*[[${items}]]*/ [];

    // Conditional in JS
    /*[# th:if="${user != null}"]*/
    console.log('User:', user.name);
    /*[/]*/
</script>

<!-- CSS inlining -->
<style th:inline="css">
    .user-bg {
        background-color: [[${user.favoriteColor}]];
    }
</style>
```

### Utility Objects

```html
<!-- Dates -->
<p th:text="${#dates.format(user.createdAt, 'dd/MM/yyyy HH:mm')}">Date</p>
<p th:text="${#dates.dayOfWeekName(date)}">Monday</p>

<!-- Strings -->
<p th:text="${#strings.toUpperCase(name)}">NAME</p>
<p th:text="${#strings.abbreviate(text, 100)}">Truncated...</p>
<p th:text="${#strings.isEmpty(value) ? 'N/A' : value}">Value</p>
<p th:text="${#strings.listJoin(items, ', ')}">a, b, c</p>

<!-- Numbers -->
<p th:text="${#numbers.formatDecimal(price, 1, 2)}">10.50</p>
<p th:text="${#numbers.formatCurrency(amount)}">$1,234.56</p>

<!-- Lists -->
<p th:text="${#lists.size(users)}">Count</p>
<p th:if="${#lists.isEmpty(users)}">No users</p>
<p th:text="${#lists.contains(roles, 'ADMIN')}">Has admin</p>

<!-- Aggregates -->
<p th:text="${#aggregates.sum(prices)}">Total</p>
<p th:text="${#aggregates.avg(scores)}">Average</p>
```

### Switch/Case

```html
<div th:switch="${user.role}">
    <p th:case="'ADMIN'">Administrator</p>
    <p th:case="'MANAGER'">Manager</p>
    <p th:case="'USER'">Regular User</p>
    <p th:case="*">Unknown Role</p>
</div>
```

### Iteration Status

```html
<tr th:each="user, stat : ${users}"
    th:class="${stat.odd} ? 'odd' : 'even'">
    <td th:text="${stat.index}">0</td>
    <td th:text="${stat.count}">1</td>
    <td th:text="${user.name}">Name</td>
    <td th:if="${stat.first}">First!</td>
    <td th:if="${stat.last}">Last!</td>
</tr>
```

## Expressions
| Expr | Uso |
|------|-----|
| `${var}` | Variable |
| `*{prop}` | Selection (con th:object) |
| `@{/url}` | Link URL |
| `#{msg}` | Message i18n |
| `~{frag}` | Fragment |

## Best Practices

| Do | Don't |
|----|-------|
| Use th:text for escaped output | Use th:utext with user input (XSS) |
| Use fragments for reusable components | Duplicate HTML across templates |
| Keep templates simple | Put complex logic in templates |
| Use i18n messages | Hardcode text strings |
| Use layout dialects | Repeat layout in every page |

## When NOT to Use This Skill

- **REST APIs** - Use `spring-rest` skill for JSON responses
- **SPA frontends** - Use React, Vue, or Angular
- **PDF reports** - Use JasperReports or iText
- **High-traffic APIs** - Consider static frontends

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| th:utext with user input | XSS vulnerability | Use th:text for escaping |
| Complex logic in templates | Hard to test, maintain | Move logic to controller |
| Missing th namespace | Silent failures | Always declare xmlns:th |
| Inline styles everywhere | Inconsistent UI | Use CSS classes |
| No fragment reuse | Code duplication | Extract common fragments |

## Quick Troubleshooting

| Problem | Diagnostic | Fix |
|---------|------------|-----|
| Variables not rendering | Check th: prefix | Use th:text, th:value |
| Template not found | Check path | Place in templates/ folder |
| Iteration not working | Check th:each syntax | Verify collection is passed |
| Fragments not included | Check path syntax | Use ~{fragments/name :: fragment} |
| i18n not working | Check messages.properties | Verify file location and keys |

## Reference Documentation
- [Thymeleaf Docs](https://www.thymeleaf.org/documentation.html)
- [Spring + Thymeleaf](https://docs.spring.io/spring-framework/reference/web/webmvc-view/mvc-thymeleaf.html)
