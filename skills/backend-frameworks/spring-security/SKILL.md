---
name: spring-security
description: |
  Spring Security JWT authentication for Spring Boot 3. Covers SecurityFilterChain,
  JWT filter, authentication, authorization, CORS, rate limiting, and security headers.

  USE WHEN: user mentions "security", "JWT", "authentication", "authorization", asks about "login", "token", "CORS", "roles", "permissions", "@PreAuthorize"

  DO NOT USE FOR: Spring Boot basics (use `spring-boot`), OAuth2 details (use OAuth2 skill if available), general encryption (use security-expert)
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Spring Security - Quick Reference

## When to Use This Skill
- Configure JWT authentication
- Role-based access control
- Method-level security

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `spring-security` for comprehensive documentation.

## Essential Patterns

### Security Config
```java
@Configuration
@EnableWebSecurity
@EnableMethodSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtAuthFilter;

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        return http
            .csrf(AbstractHttpConfigurer::disable)
            .cors(Customizer.withDefaults())
            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/v1/auth/**").permitAll()
                .requestMatchers("/swagger-ui/**", "/v3/api-docs/**").permitAll()
                .requestMatchers("/api/v1/admin/**").hasRole("ADMIN")
                .anyRequest().authenticated())
            .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class)
            .build();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
}
```

### JWT Filter
```java
@Component
@RequiredArgsConstructor
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final JwtService jwtService;
    private final UserDetailsService userDetailsService;

    @Override
    protected void doFilterInternal(HttpServletRequest request,
            HttpServletResponse response, FilterChain chain) throws Exception {

        String authHeader = request.getHeader("Authorization");
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            chain.doFilter(request, response);
            return;
        }

        String jwt = authHeader.substring(7);
        String email = jwtService.extractUsername(jwt);

        if (email != null && SecurityContextHolder.getContext().getAuthentication() == null) {
            UserDetails user = userDetailsService.loadUserByUsername(email);
            if (jwtService.isTokenValid(jwt, user)) {
                var auth = new UsernamePasswordAuthenticationToken(user, null, user.getAuthorities());
                SecurityContextHolder.getContext().setAuthentication(auth);
            }
        }
        chain.doFilter(request, response);
    }
}
```

### Method Security
```java
@PreAuthorize("hasRole('ADMIN')")
@DeleteMapping("/{id}")
public void delete(@PathVariable Long id) { ... }

@PreAuthorize("#id == authentication.principal.id or hasRole('ADMIN')")
@GetMapping("/{id}/profile")
public UserProfile getProfile(@PathVariable Long id) { ... }
```

### UserDetails
```java
public class UserPrincipal implements UserDetails {
    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return List.of(new SimpleGrantedAuthority("ROLE_" + role.name()));
    }
}
```

## Common Annotations
| Annotation | Usage |
|------------|-------|
| `@PreAuthorize` | Check before method execution |
| `hasRole('X')` | Requires role |
| `hasAnyRole` | Any of the roles |

## Anti-Patterns to Avoid
- Do not disable CSRF without stateless
- Do not forget CORS for frontend
- Do not hardcode JWT secret

## Production Readiness

### JWT Service

```java
@Service
@RequiredArgsConstructor
public class JwtService {

    @Value("${security.jwt.secret-key}")
    private String secretKey;

    @Value("${security.jwt.expiration}")
    private long jwtExpiration;

    @Value("${security.jwt.refresh-expiration}")
    private long refreshExpiration;

    public String generateToken(UserDetails userDetails) {
        return buildToken(userDetails, jwtExpiration);
    }

    public String generateRefreshToken(UserDetails userDetails) {
        return buildToken(userDetails, refreshExpiration);
    }

    private String buildToken(UserDetails userDetails, long expiration) {
        return Jwts.builder()
            .setSubject(userDetails.getUsername())
            .claim("roles", userDetails.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .toList())
            .setIssuedAt(new Date())
            .setExpiration(new Date(System.currentTimeMillis() + expiration))
            .signWith(getSigningKey(), SignatureAlgorithm.HS256)
            .compact();
    }

    public boolean isTokenValid(String token, UserDetails userDetails) {
        try {
            final String username = extractUsername(token);
            return username.equals(userDetails.getUsername()) && !isTokenExpired(token);
        } catch (ExpiredJwtException | MalformedJwtException e) {
            return false;
        }
    }

    private SecretKey getSigningKey() {
        byte[] keyBytes = Decoders.BASE64.decode(secretKey);
        return Keys.hmacShaKeyFor(keyBytes);
    }
}
```

### CORS Configuration

```java
@Configuration
public class CorsConfig {

    @Bean
    public CorsFilter corsFilter() {
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        CorsConfiguration config = new CorsConfiguration();

        config.setAllowCredentials(true);
        config.setAllowedOrigins(List.of(
            "https://yourdomain.com",
            "https://app.yourdomain.com"
        ));
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("*"));
        config.setExposedHeaders(List.of("Authorization"));
        config.setMaxAge(3600L);

        source.registerCorsConfiguration("/**", config);
        return new CorsFilter(source);
    }
}
```

### Rate Limiting

```java
@Component
public class RateLimitingFilter extends OncePerRequestFilter {

    private final Cache<String, AtomicInteger> requestCounts = Caffeine.newBuilder()
        .expireAfterWrite(1, TimeUnit.MINUTES)
        .build();

    @Override
    protected void doFilterInternal(HttpServletRequest request,
            HttpServletResponse response, FilterChain chain) throws Exception {

        String clientIP = getClientIP(request);
        AtomicInteger count = requestCounts.get(clientIP, k -> new AtomicInteger(0));

        if (count.incrementAndGet() > 100) {
            response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
            response.getWriter().write("{\"error\": \"Rate limit exceeded\"}");
            return;
        }

        chain.doFilter(request, response);
    }

    private String getClientIP(HttpServletRequest request) {
        String xForwardedFor = request.getHeader("X-Forwarded-For");
        if (xForwardedFor != null && !xForwardedFor.isEmpty()) {
            return xForwardedFor.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }
}
```

### Security Headers

```java
@Bean
public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
    return http
        // ... existing config
        .headers(headers -> headers
            .contentSecurityPolicy(csp -> csp
                .policyDirectives("default-src 'self'; frame-ancestors 'none'"))
            .frameOptions(frame -> frame.deny())
            .xssProtection(xss -> xss.block(true))
            .contentTypeOptions(Customizer.withDefaults())
            .referrerPolicy(referrer -> referrer
                .policy(ReferrerPolicyHeaderWriter.ReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN)))
        .build();
}
```

### Security Testing

```java
@WebMvcTest(UserController.class)
@Import(SecurityConfig.class)
class UserControllerSecurityTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private UserService userService;

    @Test
    void unauthenticated_shouldReturn401() throws Exception {
        mockMvc.perform(get("/api/v1/users"))
            .andExpect(status().isUnauthorized());
    }

    @Test
    @WithMockUser(roles = "ADMIN")
    void adminEndpoint_withAdminRole_shouldSucceed() throws Exception {
        mockMvc.perform(delete("/api/v1/admin/users/1"))
            .andExpect(status().isOk());
    }

    @Test
    @WithMockUser(roles = "USER")
    void adminEndpoint_withUserRole_shouldReturn403() throws Exception {
        mockMvc.perform(delete("/api/v1/admin/users/1"))
            .andExpect(status().isForbidden());
    }
}
```

### Monitoring Metrics

| Metric | Target |
|--------|--------|
| Failed auth attempts | Monitor spikes |
| Token validation time | < 5ms |
| Rate limit hits | < 1% |
| Security exceptions | 0 unhandled |

### Checklist

- [ ] JWT secret from environment variable
- [ ] Token expiration configured
- [ ] Refresh token mechanism
- [ ] CORS whitelist (no wildcards in prod)
- [ ] Rate limiting enabled
- [ ] Security headers configured
- [ ] Method-level security (@PreAuthorize)
- [ ] Password encoding (BCrypt)
- [ ] HTTPS enforced
- [ ] Security integration tests

## When NOT to Use This Skill

- **Spring Boot application setup** → Use `spring-boot` skill
- **OAuth2 server implementation** → Use OAuth2-specific skill
- **General cryptography** → Use `security-expert` skill
- **Database access** → Use `spring-data-jpa` skill
- **REST API patterns** → Use `spring-web` skill

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| Hardcoded JWT secret | Security risk | Use environment variables |
| Disable CSRF without stateless | Vulnerable to attacks | Only disable with JWT (stateless) |
| Permit all in production | No security | Configure proper authorization |
| Store passwords in plain text | Critical security flaw | Use `BCryptPasswordEncoder` |
| No token expiration | Tokens never invalidate | Set proper expiration time |
| Allow all CORS origins | CSRF vulnerability | Whitelist specific origins |

## Quick Troubleshooting

| Problem | Likely Cause | Solution |
|---------|--------------|----------|
| 401 Unauthorized | Token missing/invalid | Check Authorization header format |
| 403 Forbidden | Insufficient permissions | Check user roles and `@PreAuthorize` |
| CORS errors | Origin not allowed | Add origin to CORS configuration |
| Filter not executing | Wrong filter order | Check `addFilterBefore` placement |
| JWT parsing fails | Wrong secret key | Verify JWT_SECRET matches |
| Authentication null | Filter not applied | Ensure `SecurityContextHolder` is set |

## Further Reading
> For advanced configurations: `mcp__documentation__fetch_docs`
> - Technology: `spring-security`, Topic: `basics`
> - [Spring Security Docs](https://docs.spring.io/spring-security/reference/)
