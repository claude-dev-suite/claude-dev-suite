---
name: cors-security-headers
description: |
  CORS configuration and HTTP security headers. CORS middleware, preflight
  requests, Content-Security-Policy, CSRF protection, Helmet.js, and
  secure cookie configuration.

  USE WHEN: user mentions "CORS", "cross-origin", "CSP", "Content-Security-Policy",
  "CSRF", "security headers", "Helmet", "preflight", "Access-Control"

  DO NOT USE FOR: authentication tokens - use `jwt` or `oauth2`;
  encryption - use `cryptography`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# CORS & Security Headers

## CORS (Express)

```typescript
import cors from 'cors';

// Restrictive (recommended)
app.use(cors({
  origin: ['https://myapp.com', 'https://admin.myapp.com'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 86400, // Preflight cache: 24h
}));

// Dynamic origin
app.use(cors({
  origin: (origin, callback) => {
    const allowed = ALLOWED_ORIGINS.includes(origin!) || !origin; // !origin = same-origin
    callback(null, allowed ? origin : false);
  },
  credentials: true,
}));
```

## Security Headers (Helmet.js)

```typescript
import helmet from 'helmet';

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.example.com'],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'https://api.example.com'],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
    },
  },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));
```

## CSRF Protection

```typescript
import csrf from 'csurf';

// For server-rendered forms (session-based apps)
app.use(csrf({ cookie: true }));
app.get('/form', (req, res) => {
  res.render('form', { csrfToken: req.csrfToken() });
});

// For SPAs: use SameSite cookies + custom header
// No csrf library needed — rely on:
// 1. SameSite=Strict/Lax cookies
// 2. Check Origin/Referer header matches
// 3. Custom header requirement (X-Requested-With)
```

## Secure Cookies

```typescript
app.use(session({
  cookie: {
    httpOnly: true,        // No JS access
    secure: true,          // HTTPS only
    sameSite: 'lax',       // CSRF protection
    maxAge: 24 * 60 * 60 * 1000,
    domain: '.myapp.com',  // Shared across subdomains
  },
}));
```

## Spring Boot Security Headers

```java
@Bean
SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
    return http
        .cors(cors -> cors.configurationSource(corsConfig()))
        .headers(headers -> headers
            .contentSecurityPolicy(csp -> csp.policyDirectives("default-src 'self'"))
            .referrerPolicy(ref -> ref.policy(ReferrerPolicyHeaderWriter.ReferrerPolicy.STRICT_ORIGIN))
            .frameOptions(frame -> frame.deny())
        )
        .csrf(csrf -> csrf.csrfTokenRepository(CookieCsrfTokenRepository.withHttpOnlyFalse()))
        .build();
}

@Bean
CorsConfigurationSource corsConfig() {
    var config = new CorsConfiguration();
    config.setAllowedOrigins(List.of("https://myapp.com"));
    config.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE"));
    config.setAllowCredentials(true);
    var source = new UrlBasedCorsConfigurationSource();
    source.registerCorsConfiguration("/**", config);
    return source;
}
```

## Key Headers Reference

| Header | Purpose | Recommended Value |
|--------|---------|------------------|
| `Strict-Transport-Security` | Force HTTPS | `max-age=31536000; includeSubDomains` |
| `Content-Security-Policy` | Restrict resource loading | `default-src 'self'` + specifics |
| `X-Content-Type-Options` | Prevent MIME sniffing | `nosniff` |
| `X-Frame-Options` | Prevent clickjacking | `DENY` |
| `Referrer-Policy` | Control referrer info | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | Restrict browser features | `camera=(), microphone=()` |

## Anti-Patterns

| Anti-Pattern | Fix |
|--------------|-----|
| `Access-Control-Allow-Origin: *` with credentials | Specify exact origins |
| No CSP header | Add Content-Security-Policy |
| CSRF token in URL query params | Use header or hidden form field |
| `SameSite=None` without `Secure` | Always pair SameSite=None with Secure |
| Missing HSTS | Enable with long max-age and preload |

## Production Checklist

- [ ] CORS: specific origins, no wildcard with credentials
- [ ] Helmet.js (or equivalent) for all security headers
- [ ] CSP configured and tested
- [ ] HSTS with preload
- [ ] Secure, HttpOnly, SameSite cookies
- [ ] CSRF protection for state-changing requests
