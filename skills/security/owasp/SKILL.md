---
name: owasp
description: |
  OWASP security guidelines and Top 10 vulnerabilities

  USE WHEN: user mentions "OWASP", "security audit", "vulnerability scan", asks about "injection", "XSS", "CSRF", "access control", "authentication security"

  DO NOT USE FOR: OWASP Top 10:2025 specific - use `owasp-top-10` instead
allowed-tools: Read, Grep, Glob
---
# OWASP Security - Quick Reference

## When to Use This Skill
- Identify common vulnerabilities
- Implement security controls
- Code review for security issues

## When NOT to Use This Skill
- **OWASP Top 10:2025** - Use `owasp-top-10` skill for latest 2025 standards
- **Secrets management** - Use `secrets-management` skill for credentials handling
- **Supply chain security** - Use `supply-chain` skill for dependency issues
- **JWT/OAuth security** - Use authentication skills for protocol-specific issues

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `owasp` for comprehensive documentation.

## OWASP Top 10 (2021)

### A01: Broken Access Control
```java
// BAD - Direct object reference
@GetMapping("/users/{id}")
public User getUser(@PathVariable Long id) {
    return userRepository.findById(id);
}

// GOOD - Check authorization
@GetMapping("/users/{id}")
public User getUser(@PathVariable Long id, Authentication auth) {
    User user = userRepository.findById(id);
    if (!user.getId().equals(auth.getPrincipal().getId())) {
        throw new AccessDeniedException("Not authorized");
    }
    return user;
}
```

### A02: Cryptographic Failures
```java
// BAD - Weak hashing
String hash = DigestUtils.md5Hex(password);

// GOOD - Strong hashing with salt
BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();
String hash = encoder.encode(password);
```

### A03: Injection
```java
// BAD - SQL Injection
String query = "SELECT * FROM users WHERE name = '" + name + "'";

// GOOD - Parameterized query
@Query("SELECT u FROM User u WHERE u.name = :name")
User findByName(@Param("name") String name);
```

### A04: Insecure Design
- Threat modeling during design phase
- Security requirements in user stories
- Defense in depth architecture

### A05: Security Misconfiguration
```yaml
# Spring Security - disable defaults carefully
spring:
  security:
    headers:
      content-security-policy: "default-src 'self'"
      x-frame-options: DENY
      x-content-type-options: nosniff
```

### A06: Vulnerable Components
```bash
# Check for vulnerabilities
npm audit
mvn dependency-check:check
pip-audit
```

### A07: Auth Failures
```java
// Implement rate limiting
@RateLimiter(name = "login", fallbackMethod = "loginFallback")
public AuthResponse login(LoginRequest request) {
    // ...
}

// Account lockout
if (failedAttempts >= 5) {
    lockAccount(user);
}
```

### A08: Software Integrity
- Verify signatures of dependencies
- Use lock files (package-lock.json, pom.xml)
- CI/CD pipeline security

### A09: Logging Failures
```java
// Log security events
log.info("Login attempt", Map.of(
    "user", username,
    "ip", request.getRemoteAddr(),
    "success", authenticated
));

// DON'T log sensitive data
log.info("Password: {}", password);  // NEVER!
```

### A10: SSRF
```java
// Validate URLs
private boolean isAllowedUrl(String url) {
    URL parsed = new URL(url);
    return allowedHosts.contains(parsed.getHost());
}
```

## Security Headers

```java
@Configuration
public class SecurityConfig {
    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) {
        return http
            .headers(headers -> headers
                .contentSecurityPolicy(csp -> csp.policyDirectives("default-src 'self'"))
                .frameOptions(frame -> frame.deny())
                .xssProtection(xss -> xss.disable())
            )
            .build();
    }
}
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| Direct object references without auth | IDOR vulnerability (A01) | Always verify ownership before access |
| Using MD5/SHA1 for passwords | Easily cracked | Use bcrypt/argon2 with salt |
| String concatenation in SQL | SQL injection | Use parameterized queries/ORMs |
| Exposing stack traces in prod | Information disclosure | Generic error messages only |
| No rate limiting on login | Brute force attacks | Implement rate limiting + account lockout |
| Storing secrets in code | Credential exposure | Use environment variables/vaults |

## Quick Troubleshooting

| Issue | Likely Cause | Solution |
|-------|--------------|----------|
| 403 Forbidden on valid request | CORS misconfiguration | Check allowed origins in CORS config |
| Session not persisting | SameSite cookie issue | Set `SameSite=Lax` or `None` with HTTPS |
| JWT token rejected | Clock skew or expired | Add clock skew tolerance (5min) |
| File upload fails | CSP blocking | Add upload domain to CSP directives |
| API returns 401 unexpectedly | Missing/invalid Authorization header | Check Bearer token format |
