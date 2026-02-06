---
name: spring-authorization-server
description: |
  Spring Authorization Server for building OAuth 2.1 and OpenID Connect providers.

  USE WHEN: user mentions "OAuth2 server", "authorization server", "OIDC provider", "token endpoint", asks about "how to implement OAuth2", "create authorization server", "issue JWT tokens", "custom OAuth provider"

  DO NOT USE FOR: OAuth2 client configuration - use `spring-security` instead, resource server JWT validation - use `spring-security` instead
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Spring Authorization Server - Quick Reference

> **Full Reference**: See [advanced.md](advanced.md) for JPA client persistence, JWT configuration, custom token claims, user info endpoint, consent controller, token revocation, resource server integration, and testing.

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `spring-authorization-server` for comprehensive documentation.

## Dependencies

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-oauth2-authorization-server</artifactId>
</dependency>
```

## OAuth 2.1 Flows

```
Authorization Code + PKCE:

Client ──(1) Authorization Request + code_challenge──▶ Auth Server
      ◀──(2) Authorization Code──────────────────────
      ──(3) Token Request + code_verifier────────────▶
      ◀──(4) Access Token + Refresh Token + ID Token─
```

## Basic Configuration

```java
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    @Order(1)
    public SecurityFilterChain authorizationServerSecurityFilterChain(HttpSecurity http)
            throws Exception {
        OAuth2AuthorizationServerConfiguration.applyDefaultSecurity(http);

        http.getConfigurer(OAuth2AuthorizationServerConfigurer.class)
            .oidc(Customizer.withDefaults());  // Enable OpenID Connect

        http.exceptionHandling(exceptions -> exceptions
                .defaultAuthenticationEntryPointFor(
                    new LoginUrlAuthenticationEntryPoint("/login"),
                    new MediaTypeRequestMatcher(MediaType.TEXT_HTML)
                )
            )
            .oauth2ResourceServer(oauth2 -> oauth2.jwt(Customizer.withDefaults()));

        return http.build();
    }

    @Bean
    @Order(2)
    public SecurityFilterChain defaultSecurityFilterChain(HttpSecurity http) throws Exception {
        http.authorizeHttpRequests(authorize -> authorize.anyRequest().authenticated())
            .formLogin(Customizer.withDefaults());
        return http.build();
    }
}
```

## Client Registration

```java
@Bean
public RegisteredClientRepository registeredClientRepository() {
    RegisteredClient webClient = RegisteredClient.withId(UUID.randomUUID().toString())
        .clientId("web-client")
        .clientSecret("{noop}secret")
        .clientAuthenticationMethod(ClientAuthenticationMethod.CLIENT_SECRET_BASIC)
        .authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)
        .authorizationGrantType(AuthorizationGrantType.REFRESH_TOKEN)
        .redirectUri("http://localhost:8080/login/oauth2/code/web-client")
        .scope(OidcScopes.OPENID)
        .scope(OidcScopes.PROFILE)
        .scope("read")
        .clientSettings(ClientSettings.builder()
            .requireAuthorizationConsent(true)
            .requireProofKey(true)  // PKCE required
            .build())
        .tokenSettings(TokenSettings.builder()
            .accessTokenTimeToLive(Duration.ofMinutes(15))
            .refreshTokenTimeToLive(Duration.ofDays(7))
            .reuseRefreshTokens(false)
            .build())
        .build();

    return new InMemoryRegisteredClientRepository(webClient);
}
```

## Best Practices

| Do | Don't |
|----|-------|
| Require PKCE for public clients | Allow plain authorization code |
| Use short-lived access tokens | Long-lived access tokens |
| Rotate refresh tokens | Reuse refresh tokens indefinitely |
| Store keys securely (Vault) | Hardcode keys in config |
| Validate redirect URIs strictly | Allow open redirects |

## When NOT to Use This Skill

- **OAuth2 Client Configuration** - Use `spring-security`
- **Resource Server** - For validating JWT tokens use `spring-security`
- **Basic Authentication** - Use `spring-security`
- **Session Management** - Use `spring-session`

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Better Approach |
|-------------|--------------|-----------------|
| Reusing refresh tokens | Security risk if compromised | Rotate on each use |
| Long-lived access tokens | Increased exposure window | Keep to 15-30 min |
| Hardcoded client secrets | Secrets in version control | Use secret management |
| No PKCE for SPAs | Code interception vulnerability | Always require PKCE |
| Wildcard redirect URIs | Open redirect vulnerability | Whitelist exact URIs |

## Quick Troubleshooting

| Issue | Possible Cause | Solution |
|-------|---------------|----------|
| 401 at /oauth2/authorize | User not authenticated | Check SecurityFilterChain order |
| Invalid client error | Client not registered | Verify RegisteredClientRepository |
| JWKS endpoint 404 | JWKSource bean missing | Ensure JWKSource configured |
| Token validation fails | Issuer mismatch | Check issuer URL matches |
| PKCE validation fails | code_verifier mismatch | Verify PKCE implementation |

## Production Checklist

- [ ] HTTPS everywhere
- [ ] RSA keys in secure storage
- [ ] Client secrets encrypted
- [ ] PKCE required for public clients
- [ ] Token lifetimes configured
- [ ] Consent flow implemented
- [ ] Token revocation working
- [ ] Rate limiting enabled
- [ ] Audit logging configured

## Reference Documentation
- [Spring Authorization Server Reference](https://docs.spring.io/spring-authorization-server/reference/)
- [OAuth 2.1 Specification](https://oauth.net/2.1/)
