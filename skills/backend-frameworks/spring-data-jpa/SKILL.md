---
name: spring-data-jpa
description: |
  Spring Data JPA for database access in Spring Boot applications. Covers repositories,
  entities, relationships, queries, pagination, and auditing. Based on production
  patterns from castellino and gestionale-presenze projects.

  USE WHEN: user mentions "JPA", "repository", "entity", "database queries", asks about "pagination", "Criteria API", "Specifications", "@Query", "relationships"

  DO NOT USE FOR: Spring Boot basics (use `spring-boot`), Spring Security (use `spring-security`), MongoDB (use `mongodb-expert`), SQL-only tasks (use `sql-expert`)
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Spring Data JPA

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `spring-data-jpa` for comprehensive documentation.

## Entity with Auditing

```java
@Entity
@Table(name = "users")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EntityListeners(AuditingEntityListener.class)
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(unique = true, nullable = false)
    private String email;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private UserRole role = UserRole.USER;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private UserStatus status = UserStatus.ACTIVE;

    @CreatedDate
    @Column(updatable = false)
    private LocalDateTime createdAt;

    @LastModifiedDate
    private LocalDateTime updatedAt;

    @CreatedBy
    @Column(updatable = false)
    private String createdBy;

    @LastModifiedBy
    private String updatedBy;
}
```

## Repository Interface

```java
@Repository
public interface UserRepository extends JpaRepository<User, Long> {

    // Derived query methods
    Optional<User> findByEmail(String email);
    boolean existsByEmail(String email);
    List<User> findByStatus(UserStatus status);
    List<User> findByRoleIn(List<UserRole> roles);

    // Query with JPQL
    @Query("SELECT u FROM User u WHERE u.status = :status AND u.role = :role")
    List<User> findByStatusAndRole(
        @Param("status") UserStatus status,
        @Param("role") UserRole role
    );

    // Native query
    @Query(value = "SELECT * FROM users WHERE email LIKE %:domain", nativeQuery = true)
    List<User> findByEmailDomain(@Param("domain") String domain);

    // Pagination
    Page<User> findByNameContainingIgnoreCase(String name, Pageable pageable);

    // Sorting
    List<User> findByStatus(UserStatus status, Sort sort);

    // Modifying queries
    @Modifying
    @Query("UPDATE User u SET u.status = :status WHERE u.id = :id")
    int updateStatus(@Param("id") Long id, @Param("status") UserStatus status);

    @Modifying
    @Query("DELETE FROM User u WHERE u.status = :status")
    int deleteByStatus(@Param("status") UserStatus status);
}
```

## Relationships

```java
// One-to-Many
@Entity
public class Department {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @OneToMany(mappedBy = "department", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<Employee> employees = new ArrayList<>();
}

@Entity
public class Employee {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "department_id", nullable = false)
    private Department department;
}

// Many-to-Many
@Entity
public class User {
    @ManyToMany(fetch = FetchType.LAZY)
    @JoinTable(
        name = "user_roles",
        joinColumns = @JoinColumn(name = "user_id"),
        inverseJoinColumns = @JoinColumn(name = "role_id")
    )
    private Set<Role> roles = new HashSet<>();
}
```

## Pagination & Sorting

```java
@Service
public class UserService {

    public Page<UserResponse> findAll(int page, int size, String sortBy, String direction) {
        Sort sort = Sort.by(Sort.Direction.fromString(direction), sortBy);
        Pageable pageable = PageRequest.of(page, size, sort);
        return userRepository.findAll(pageable)
            .map(userMapper::toResponse);
    }

    public Page<UserResponse> search(String query, Pageable pageable) {
        return userRepository.findByNameContainingIgnoreCase(query, pageable)
            .map(userMapper::toResponse);
    }
}

// Controller
@GetMapping
public ResponseEntity<Page<UserResponse>> findAll(
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "10") int size,
        @RequestParam(defaultValue = "createdAt") String sortBy,
        @RequestParam(defaultValue = "desc") String direction) {
    return ResponseEntity.ok(userService.findAll(page, size, sortBy, direction));
}
```

## Specifications (Dynamic Queries)

```java
public class UserSpecifications {

    public static Specification<User> hasStatus(UserStatus status) {
        return (root, query, cb) ->
            status == null ? null : cb.equal(root.get("status"), status);
    }

    public static Specification<User> hasRole(UserRole role) {
        return (root, query, cb) ->
            role == null ? null : cb.equal(root.get("role"), role);
    }

    public static Specification<User> nameContains(String name) {
        return (root, query, cb) ->
            name == null ? null : cb.like(cb.lower(root.get("name")),
                "%" + name.toLowerCase() + "%");
    }
}

// Repository extends JpaSpecificationExecutor
public interface UserRepository extends
        JpaRepository<User, Long>,
        JpaSpecificationExecutor<User> {}

// Usage
Specification<User> spec = Specification
    .where(UserSpecifications.hasStatus(UserStatus.ACTIVE))
    .and(UserSpecifications.hasRole(UserRole.ADMIN))
    .and(UserSpecifications.nameContains("john"));

List<User> users = userRepository.findAll(spec);
```

## Enable Auditing

```java
@Configuration
@EnableJpaAuditing
public class JpaConfig {

    @Bean
    public AuditorAware<String> auditorProvider() {
        return () -> Optional.ofNullable(SecurityContextHolder.getContext())
            .map(SecurityContext::getAuthentication)
            .filter(Authentication::isAuthenticated)
            .map(Authentication::getName);
    }
}
```

## Key Annotations

| Annotation | Purpose |
|------------|---------|
| `@Entity` | JPA entity |
| `@Table` | Table mapping |
| `@Id` | Primary key |
| `@GeneratedValue` | Auto-generation strategy |
| `@Column` | Column mapping |
| `@ManyToOne` / `@OneToMany` | Relationships |
| `@Query` | Custom JPQL/SQL |
| `@Modifying` | Update/Delete queries |
| `@CreatedDate` / `@LastModifiedDate` | Auditing |

## When NOT to Use This Skill

- **Spring Boot application setup** → Use `spring-boot` skill
- **REST API patterns** → Use `spring-web` skill
- **MongoDB operations** → Use `mongodb-expert` skill
- **Security configuration** → Use `spring-security` skill
- **Raw SQL optimization** → Use `sql-expert` skill
- **Reactive database access** → Use `spring-r2dbc` skill

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| N+1 queries | Poor performance | Use `@EntityGraph` or fetch joins |
| Missing `@Transactional` | Data inconsistency | Always use for write operations |
| Bidirectional relations without care | Infinite recursion | Use `@JsonManagedReference/@JsonBackReference` |
| Fetch EAGER everywhere | Loads unnecessary data | Use LAZY, fetch only when needed |
| No pagination | Memory issues | Always paginate large results |
| Query in loop | Performance killer | Use batch fetch or single query |

## Quick Troubleshooting

| Problem | Likely Cause | Solution |
|---------|--------------|----------|
| LazyInitializationException | Accessing lazy field outside transaction | Fetch in transaction or use `@EntityGraph` |
| MultipleBagFetchException | Multiple `@OneToMany` EAGER fetch | Use `@EntityGraph` or separate queries |
| Slow queries | Missing indexes or N+1 | Add indexes, check query logs |
| No query results | Wrong method name | Follow naming convention or use `@Query` |
| Constraint violation | Entity state mismatch | Check `cascade` and `orphanRemoval` |
| DetachedEntityException | Entity not managed | Use `merge()` or reload entity |

## Reference Documentation
- [Spring Data JPA Reference](https://docs.spring.io/spring-data/jpa/reference/)
- [Query Methods](https://docs.spring.io/spring-data/jpa/reference/jpa/query-methods.html)
- [Specifications](https://docs.spring.io/spring-data/jpa/reference/jpa/specifications.html)
