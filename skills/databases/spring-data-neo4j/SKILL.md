---
name: spring-data-neo4j
description: |
  Spring Data Neo4j for graph database operations.
  Covers node/relationship entities, Cypher queries, and Neo4jTemplate.

  USE WHEN: user mentions "spring data neo4j", "Neo4jRepository", "@Node",
  "@Relationship", "Cypher Spring", "graph database Spring Boot"

  DO NOT USE FOR: raw Cypher queries - consult Neo4j documentation,
  relational databases - use `spring-data-jpa` instead
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Spring Data Neo4j - Quick Reference

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `spring-data-neo4j` for comprehensive documentation.

## Dependencies

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-data-neo4j</artifactId>
</dependency>
```

## Configuration

### application.yml
```yaml
spring:
  neo4j:
    uri: bolt://localhost:7687
    authentication:
      username: neo4j
      password: ${NEO4J_PASSWORD}

  data:
    neo4j:
      database: mydb  # Neo4j 4.0+
```

## Graph Concepts

```
┌─────────────────────────────────────────────────────────────┐
│                       Graph Model                           │
│                                                             │
│     ┌─────────┐                      ┌─────────┐           │
│     │  Person │─────FOLLOWS────────▶│  Person │           │
│     │  (John) │                      │  (Jane) │           │
│     └────┬────┘                      └────┬────┘           │
│          │                                │                 │
│       WORKS_AT                         WORKS_AT            │
│          │                                │                 │
│          ▼                                ▼                 │
│     ┌─────────┐                      ┌─────────┐           │
│     │ Company │◀─────KNOWS───────────│  Person │           │
│     │ (Acme)  │                      │  (Bob)  │           │
│     └─────────┘                      └─────────┘           │
│                                                             │
│  Nodes: Person, Company                                     │
│  Relationships: FOLLOWS, WORKS_AT, KNOWS                   │
└─────────────────────────────────────────────────────────────┘
```

## Node Entities

```java
@Node("Person")
public class Person {

    @Id
    @GeneratedValue
    private Long id;

    private String name;

    private String email;

    private LocalDate birthDate;

    // Outgoing relationship
    @Relationship(type = "FOLLOWS", direction = Direction.OUTGOING)
    private Set<Person> following = new HashSet<>();

    // Incoming relationship
    @Relationship(type = "FOLLOWS", direction = Direction.INCOMING)
    private Set<Person> followers = new HashSet<>();

    // Relationship with properties
    @Relationship(type = "WORKS_AT")
    private WorksAt employment;

    // Multiple relationships of same type
    @Relationship(type = "KNOWS")
    private List<Knows> connections = new ArrayList<>();
}

@Node("Company")
public class Company {

    @Id
    @GeneratedValue
    private Long id;

    private String name;

    private String industry;

    @Relationship(type = "WORKS_AT", direction = Direction.INCOMING)
    private Set<Person> employees = new HashSet<>();
}
```

## Relationship Entities

```java
@RelationshipProperties
public class WorksAt {

    @Id
    @GeneratedValue
    private Long id;

    @TargetNode
    private Company company;

    private String position;

    private LocalDate startDate;

    private LocalDate endDate;

    private BigDecimal salary;
}

@RelationshipProperties
public class Knows {

    @Id
    @GeneratedValue
    private Long id;

    @TargetNode
    private Person person;

    private String context;  // "work", "school", "family"

    private LocalDate since;

    private Integer trustLevel;
}
```

## Repository Pattern

```java
public interface PersonRepository extends Neo4jRepository<Person, Long> {

    // Derived queries
    Optional<Person> findByEmail(String email);

    List<Person> findByNameContaining(String name);

    // Custom Cypher queries
    @Query("MATCH (p:Person)-[:FOLLOWS]->(f:Person) WHERE p.id = $personId RETURN f")
    List<Person> findFollowing(Long personId);

    @Query("MATCH (p:Person)<-[:FOLLOWS]-(f:Person) WHERE p.id = $personId RETURN f")
    List<Person> findFollowers(Long personId);

    @Query("""
        MATCH (p:Person {id: $personId})-[:FOLLOWS*2..3]->(fof:Person)
        WHERE NOT (p)-[:FOLLOWS]->(fof) AND p <> fof
        RETURN DISTINCT fof
        LIMIT $limit
        """)
    List<Person> findFriendsOfFriends(Long personId, int limit);

    @Query("""
        MATCH (p1:Person {id: $person1Id}), (p2:Person {id: $person2Id}),
              path = shortestPath((p1)-[:KNOWS*]-(p2))
        RETURN path
        """)
    List<Person> findShortestPath(Long person1Id, Long person2Id);

    // Aggregations
    @Query("""
        MATCH (p:Person)-[:WORKS_AT]->(c:Company)
        RETURN c.name as company, count(p) as employeeCount
        ORDER BY employeeCount DESC
        """)
    List<CompanyStats> getCompanyStats();

    // With relationship properties
    @Query("""
        MATCH (p:Person)-[w:WORKS_AT]->(c:Company)
        WHERE p.id = $personId
        RETURN p, w, c
        """)
    Person findWithEmployment(Long personId);
}

public interface CompanyRepository extends Neo4jRepository<Company, Long> {

    @Query("""
        MATCH (c:Company)<-[:WORKS_AT]-(p:Person)
        WHERE c.id = $companyId
        RETURN p
        """)
    List<Person> findEmployees(Long companyId);
}
```

## Neo4jTemplate Operations

```java
@Service
@RequiredArgsConstructor
public class GraphService {

    private final Neo4jTemplate neo4jTemplate;
    private final Neo4jClient neo4jClient;

    // Save operations
    public Person savePerson(Person person) {
        return neo4jTemplate.save(person);
    }

    // Find by ID
    public Optional<Person> findById(Long id) {
        return neo4jTemplate.findById(id, Person.class);
    }

    // Custom queries with Neo4jClient
    public List<Map<String, Object>> findMutualConnections(Long person1Id, Long person2Id) {
        return neo4jClient.query("""
            MATCH (p1:Person {id: $person1Id})-[:KNOWS]-(mutual:Person)-[:KNOWS]-(p2:Person {id: $person2Id})
            RETURN mutual.name as name, mutual.email as email
            """)
            .bind(person1Id).to("person1Id")
            .bind(person2Id).to("person2Id")
            .fetch()
            .all()
            .stream()
            .toList();
    }

    // Create relationship
    public void createFollowRelationship(Long followerId, Long followeeId) {
        neo4jClient.query("""
            MATCH (a:Person {id: $followerId}), (b:Person {id: $followeeId})
            MERGE (a)-[:FOLLOWS]->(b)
            """)
            .bind(followerId).to("followerId")
            .bind(followeeId).to("followeeId")
            .run();
    }

    // Delete relationship
    public void removeFollowRelationship(Long followerId, Long followeeId) {
        neo4jClient.query("""
            MATCH (a:Person {id: $followerId})-[r:FOLLOWS]->(b:Person {id: $followeeId})
            DELETE r
            """)
            .bind(followerId).to("followerId")
            .bind(followeeId).to("followeeId")
            .run();
    }

    // Complex graph traversal
    public List<Person> findInfluencers(int minFollowers) {
        return neo4jClient.query("""
            MATCH (p:Person)<-[:FOLLOWS]-(follower:Person)
            WITH p, count(follower) as followerCount
            WHERE followerCount >= $minFollowers
            RETURN p
            ORDER BY followerCount DESC
            """)
            .bind(minFollowers).to("minFollowers")
            .fetchAs(Person.class)
            .mappedBy((typeSystem, record) -> {
                // Custom mapping if needed
                return neo4jTemplate.findById(
                    record.get("p").asNode().id(),
                    Person.class
                ).orElse(null);
            })
            .all()
            .stream()
            .filter(Objects::nonNull)
            .toList();
    }
}
```

## Projections

```java
// Interface projection
public interface PersonSummary {
    String getName();
    String getEmail();
    int getFollowerCount();
}

// DTO projection
public record PersonDto(
    Long id,
    String name,
    String email,
    List<String> followerNames
) {}

public interface PersonRepository extends Neo4jRepository<Person, Long> {

    @Query("""
        MATCH (p:Person)
        WHERE p.id = $id
        OPTIONAL MATCH (p)<-[:FOLLOWS]-(f:Person)
        RETURN p.id as id, p.name as name, p.email as email,
               collect(f.name) as followerNames
        """)
    Optional<PersonDto> findPersonDtoById(Long id);
}
```

## Transactions

```java
@Service
@Transactional
public class SocialNetworkService {

    private final PersonRepository personRepository;
    private final Neo4jClient neo4jClient;

    @Transactional
    public void transferFollowers(Long fromPersonId, Long toPersonId) {
        // All operations in single transaction
        neo4jClient.query("""
            MATCH (from:Person {id: $fromId})<-[r:FOLLOWS]-(follower:Person)
            MATCH (to:Person {id: $toId})
            CREATE (follower)-[:FOLLOWS]->(to)
            DELETE r
            """)
            .bind(fromPersonId).to("fromId")
            .bind(toPersonId).to("toId")
            .run();
    }

    @Transactional(readOnly = true)
    public List<Person> findRecommendations(Long personId) {
        // Read-only transaction
        return personRepository.findFriendsOfFriends(personId, 10);
    }
}
```

## Reactive Support

```java
public interface ReactivePersonRepository extends ReactiveNeo4jRepository<Person, Long> {

    Flux<Person> findByNameContaining(String name);

    @Query("MATCH (p:Person)-[:FOLLOWS]->(f:Person) WHERE p.id = $personId RETURN f")
    Flux<Person> findFollowing(Long personId);
}

@Service
public class ReactiveGraphService {

    private final ReactiveNeo4jClient neo4jClient;

    public Flux<Person> streamInfluencers() {
        return neo4jClient.query("""
            MATCH (p:Person)<-[:FOLLOWS]-(f:Person)
            WITH p, count(f) as followers
            WHERE followers > 100
            RETURN p
            ORDER BY followers DESC
            """)
            .fetchAs(Person.class)
            .all();
    }
}
```

## Testing with Testcontainers

```java
@SpringBootTest
@Testcontainers
class PersonRepositoryTest {

    @Container
    static Neo4jContainer<?> neo4j = new Neo4jContainer<>("neo4j:5")
        .withAdminPassword("password");

    @DynamicPropertySource
    static void neo4jProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.neo4j.uri", neo4j::getBoltUrl);
        registry.add("spring.neo4j.authentication.username", () -> "neo4j");
        registry.add("spring.neo4j.authentication.password", neo4j::getAdminPassword);
    }

    @Autowired
    private PersonRepository personRepository;

    @Test
    void shouldFindFollowers() {
        Person john = personRepository.save(new Person("John"));
        Person jane = personRepository.save(new Person("Jane"));

        john.getFollowing().add(jane);
        personRepository.save(john);

        List<Person> followers = personRepository.findFollowers(jane.getId());
        assertThat(followers).contains(john);
    }
}
```

## Best Practices

| Do | Don't |
|----|-------|
| Model relationships explicitly | Use arrays for connections |
| Use projections for partial data | Fetch entire graph |
| Index frequently queried properties | Query without indexes |
| Use MERGE for idempotent creates | CREATE duplicates |
| Limit traversal depth | Unbounded graph traversals |

## Production Checklist

- [ ] Indexes on lookup properties
- [ ] Constraints for uniqueness
- [ ] Connection pooling configured
- [ ] Transaction timeouts set
- [ ] Query profiling enabled
- [ ] Backup strategy defined
- [ ] Cluster configuration (if HA)
- [ ] Memory settings tuned
- [ ] Monitoring enabled
- [ ] Cypher query optimization

## When NOT to Use This Skill

- **Raw Cypher queries** - Consult Neo4j documentation directly
- **Relational data** - Use `spring-data-jpa` for tabular data
- **Document storage** - Use `spring-data-mongodb`
- **Simple key-value** - Use `spring-data-redis`

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| Fetching entire graph | Memory issues | Use projections, limit depth |
| CREATE instead of MERGE | Duplicate nodes | Use MERGE for idempotent creates |
| Unbounded traversals | Performance issues | Add depth limits |
| Missing indexes | Slow lookups | Create indexes on lookup properties |
| Arrays for relationships | Loses graph benefits | Use proper @Relationship |
| Ignoring relationship direction | Wrong query results | Specify INCOMING/OUTGOING |

## Quick Troubleshooting

| Problem | Diagnostic | Fix |
|---------|------------|-----|
| Connection refused | Check Neo4j running | Start Neo4j, check bolt URI |
| Node not persisted | Check @Node annotation | Add annotation, verify ID |
| Relationship missing | Check @Relationship | Verify type and direction |
| Slow Cypher | Use PROFILE/EXPLAIN | Add indexes, optimize query |
| Circular reference | Check entity graph | Use @Relationship carefully |

## Reference Documentation
- [Spring Data Neo4j Reference](https://docs.spring.io/spring-data/neo4j/reference/)
