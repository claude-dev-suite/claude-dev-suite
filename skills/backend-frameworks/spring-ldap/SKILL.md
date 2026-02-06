---
name: spring-ldap
description: |
  Spring LDAP for LDAP/Active Directory integration and authentication.
  Covers LdapTemplate, @Entry mapping, LdapRepository, and Spring Security integration.

  USE WHEN: user mentions "LDAP", "Active Directory", "AD authentication",
  "LdapTemplate", "@Entry", "directory services", "enterprise authentication"

  DO NOT USE FOR: OAuth2/OIDC - use `spring-security` or `oauth2` skill,
  simple auth - use Spring Security with database
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Spring LDAP - Quick Reference

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `spring-ldap` for comprehensive documentation.

## Dependencies

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-data-ldap</artifactId>
</dependency>
<!-- For embedded LDAP testing -->
<dependency>
    <groupId>com.unboundid</groupId>
    <artifactId>unboundid-ldapsdk</artifactId>
    <scope>test</scope>
</dependency>
```

## Configuration

### application.yml
```yaml
spring:
  ldap:
    urls: ldap://ldap.example.com:389
    base: dc=example,dc=com
    username: cn=admin,dc=example,dc=com
    password: ${LDAP_PASSWORD}

    # For Active Directory
    # urls: ldap://ad.company.com:389
    # base: dc=company,dc=com
    # username: CN=service_account,OU=Service Accounts,DC=company,DC=com

  # Embedded LDAP for development
  ldap:
    embedded:
      base-dn: dc=example,dc=com
      ldif: classpath:test-server.ldif
      port: 8389
```

## LDAP Entry Mapping

### Person Entry
```java
@Entry(base = "ou=people", objectClasses = {"person", "inetOrgPerson"})
public class Person {

    @Id
    private Name dn;

    @Attribute(name = "uid")
    private String uid;

    @Attribute(name = "cn")
    private String fullName;

    @Attribute(name = "sn")
    private String lastName;

    @Attribute(name = "givenName")
    private String firstName;

    @Attribute(name = "mail")
    private String email;

    @Attribute(name = "telephoneNumber")
    private String phone;

    @Attribute(name = "memberOf")
    private List<String> groups;

    @DnAttribute(value = "uid", index = 0)
    private String username;
}
```

### Group Entry
```java
@Entry(base = "ou=groups", objectClasses = {"groupOfNames"})
public class Group {

    @Id
    private Name dn;

    @Attribute(name = "cn")
    private String name;

    @Attribute(name = "description")
    private String description;

    @Attribute(name = "member")
    private Set<Name> members;
}
```

## Repository Pattern

```java
public interface PersonRepository extends LdapRepository<Person> {

    Person findByUid(String uid);

    List<Person> findByLastName(String lastName);

    List<Person> findByEmailContaining(String emailPart);

    @Query("(&(objectClass=person)(|(cn=*{0}*)(mail=*{0}*)))")
    List<Person> searchByNameOrEmail(String query);
}

public interface GroupRepository extends LdapRepository<Group> {

    Group findByName(String name);

    @Query("(&(objectClass=groupOfNames)(member={0}))")
    List<Group> findByMember(Name memberDn);
}
```

## LdapTemplate Operations

```java
@Service
@RequiredArgsConstructor
public class LdapService {

    private final LdapTemplate ldapTemplate;

    // Search
    public List<Person> findAllPeople() {
        return ldapTemplate.findAll(Person.class);
    }

    public Person findByDn(String dn) {
        return ldapTemplate.findByDn(LdapUtils.newLdapName(dn), Person.class);
    }

    // Search with filter
    public List<Person> searchPeople(String query) {
        LdapQuery ldapQuery = LdapQueryBuilder.query()
            .base("ou=people")
            .where("objectClass").is("person")
            .and("cn").like("*" + query + "*");

        return ldapTemplate.find(ldapQuery, Person.class);
    }

    // Create
    public void createPerson(Person person) {
        ldapTemplate.create(person);
    }

    // Update
    public void updatePerson(Person person) {
        ldapTemplate.update(person);
    }

    // Delete
    public void deletePerson(Person person) {
        ldapTemplate.delete(person);
    }

    // Bind (authenticate)
    public boolean authenticate(String username, String password) {
        LdapQuery query = LdapQueryBuilder.query()
            .where("uid").is(username);

        return ldapTemplate.authenticate(query, password);
    }
}
```

## Active Directory Integration

```java
@Configuration
public class ActiveDirectoryConfig {

    @Bean
    public LdapContextSource contextSource() {
        LdapContextSource contextSource = new LdapContextSource();
        contextSource.setUrl("ldap://ad.company.com:389");
        contextSource.setBase("dc=company,dc=com");
        contextSource.setUserDn("CN=service_account,OU=Service Accounts,DC=company,DC=com");
        contextSource.setPassword(adPassword);
        contextSource.setReferral("follow");

        // AD specific settings
        Map<String, Object> env = new HashMap<>();
        env.put("java.naming.ldap.attributes.binary", "objectGUID");
        contextSource.setBaseEnvironmentProperties(env);

        return contextSource;
    }

    @Bean
    public LdapTemplate ldapTemplate(LdapContextSource contextSource) {
        return new LdapTemplate(contextSource);
    }
}
```

### AD User Search
```java
public List<AdUser> searchAdUsers(String query) {
    LdapQuery ldapQuery = LdapQueryBuilder.query()
        .base("OU=Users,DC=company,DC=com")
        .where("objectClass").is("user")
        .and("objectCategory").is("person")
        .and(LdapQueryBuilder.query()
            .where("sAMAccountName").like("*" + query + "*")
            .or("displayName").like("*" + query + "*")
            .or("mail").like("*" + query + "*"));

    return ldapTemplate.search(ldapQuery, new AdUserAttributesMapper());
}
```

## Spring Security Integration

```java
@Configuration
@EnableWebSecurity
public class LdapSecurityConfig {

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/public/**").permitAll()
                .anyRequest().authenticated()
            )
            .formLogin(Customizer.withDefaults())
            .ldapAuthentication(ldap -> ldap
                .userDnPatterns("uid={0},ou=people")
                .groupSearchBase("ou=groups")
                .contextSource(contextSource())
                .passwordCompare(password -> password
                    .passwordEncoder(new BCryptPasswordEncoder())
                    .passwordAttribute("userPassword")
                )
            );
        return http.build();
    }

    @Bean
    public LdapContextSource contextSource() {
        return new LdapContextSource() {{
            setUrl("ldap://localhost:8389");
            setBase("dc=example,dc=com");
        }};
    }
}
```

### Active Directory Authentication
```java
@Bean
public ActiveDirectoryLdapAuthenticationProvider adAuthProvider() {
    ActiveDirectoryLdapAuthenticationProvider provider =
        new ActiveDirectoryLdapAuthenticationProvider(
            "company.com",
            "ldap://ad.company.com:389",
            "dc=company,dc=com"
        );

    provider.setConvertSubErrorCodesToExceptions(true);
    provider.setUseAuthenticationRequestCredentials(true);
    provider.setSearchFilter("(&(objectClass=user)(sAMAccountName={1}))");

    return provider;
}
```

## Connection Pooling

```java
@Bean
public LdapContextSource contextSource() {
    LdapContextSource contextSource = new LdapContextSource();
    contextSource.setUrl("ldap://ldap.example.com:389");
    contextSource.setBase("dc=example,dc=com");
    contextSource.setUserDn("cn=admin,dc=example,dc=com");
    contextSource.setPassword(ldapPassword);
    contextSource.setPooled(true);
    return contextSource;
}

@Bean
public PoolingContextSource poolingContextSource(LdapContextSource contextSource) {
    PoolingContextSource poolingContextSource = new PoolingContextSource();
    poolingContextSource.setContextSource(contextSource);
    poolingContextSource.setDirContextValidator(new DefaultDirContextValidator());
    poolingContextSource.setTestOnBorrow(true);
    poolingContextSource.setTestWhileIdle(true);
    return poolingContextSource;
}
```

## Testing with Embedded LDAP

### test-server.ldif
```ldif
dn: dc=example,dc=com
objectClass: top
objectClass: domain
dc: example

dn: ou=people,dc=example,dc=com
objectClass: organizationalUnit
ou: people

dn: ou=groups,dc=example,dc=com
objectClass: organizationalUnit
ou: groups

dn: uid=john,ou=people,dc=example,dc=com
objectClass: person
objectClass: inetOrgPerson
uid: john
cn: John Doe
sn: Doe
givenName: John
mail: john@example.com
userPassword: password123

dn: cn=developers,ou=groups,dc=example,dc=com
objectClass: groupOfNames
cn: developers
member: uid=john,ou=people,dc=example,dc=com
```

### Test Class
```java
@SpringBootTest
@TestPropertySource(properties = {
    "spring.ldap.embedded.base-dn=dc=example,dc=com",
    "spring.ldap.embedded.ldif=classpath:test-server.ldif",
    "spring.ldap.embedded.port=8389"
})
class LdapServiceTest {

    @Autowired
    private PersonRepository personRepository;

    @Test
    void shouldFindPerson() {
        Person person = personRepository.findByUid("john");
        assertThat(person.getFullName()).isEqualTo("John Doe");
    }
}
```

## Best Practices

| Do | Don't |
|----|-------|
| Use connection pooling | Create new connections per request |
| Use paged results for large queries | Fetch all entries at once |
| Encrypt with LDAPS (port 636) | Use plain LDAP in production |
| Use service accounts | Use user credentials for app |
| Handle referrals appropriately | Ignore AD referrals |

## Production Checklist

- [ ] LDAPS (TLS) enabled
- [ ] Service account with minimal permissions
- [ ] Connection pooling configured
- [ ] Paged results for large queries
- [ ] Proper error handling
- [ ] Timeout configuration
- [ ] Failover for HA
- [ ] Credentials secured (Vault/secrets)
- [ ] Audit logging enabled
- [ ] Search filters sanitized (injection prevention)

## When NOT to Use This Skill

- **OAuth2/OIDC** - Use `spring-security` or `oauth2` skills
- **Simple authentication** - Use Spring Security with database
- **Cloud-native apps** - Consider Keycloak or Auth0
- **Small applications** - LDAP may be overkill

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| New connection per request | Performance issues | Use connection pooling |
| Plain LDAP in production | Credentials exposed | Use LDAPS (port 636) |
| User credentials for app | Security risk | Use service account |
| Fetching all entries | Memory/timeout | Use paged results |
| Unsanitized filters | LDAP injection | Escape filter parameters |

## Quick Troubleshooting

| Problem | Diagnostic | Fix |
|---------|------------|-----|
| Connection refused | Check URL/port | Verify LDAP server accessibility |
| Authentication failed | Check bind DN | Verify service account credentials |
| Entries not found | Check base DN | Verify search base configuration |
| Slow queries | Check filter | Add indexes, limit scope |
| SSL handshake failed | Check certificates | Import CA cert to truststore |

## Reference Documentation
- [Spring LDAP Reference](https://docs.spring.io/spring-ldap/reference/)
