---
name: java-review
description: |
  Reviewing Java code - what to flag, and what javac, the IDE and SpotBugs already flag for you

  USE WHEN: you are reviewing, critiquing or auditing existing Java code - a
  "code review", a "review" of a .java file, a diff, a PR or a pull request;
  deciding what to comment on in Java; avoiding false positives on Java code

  DO NOT USE FOR: writing, explaining or learning Java - use `languages/java`;
  anything javac warnings, SpotBugs or a standard Checkstyle run already report
  (this skill lists those so you can stay silent about them); Spring specifics -
  use the Spring skills; JPA mapping - use `backend-frameworks/spring-data-jpa`
allowed-tools: Read, Grep, Glob
---
# Reviewing Java

A reviewer's leverage is what the toolchain cannot say. Every check below
describes a defect that survives `javac -Xlint:all` and a default SpotBugs run.

Java's particular trap is that its static analysis is **not on by default**.
`javac` alone reports very little; SpotBugs, ErrorProne and NullAway are
separate build steps that many projects never add. Check the build file before
deciding whether a finding is yours.

The snippets are fragments cut down to the defect, not runnable programs.

## Already covered - do not spend review on it

| Defect | Reported by |
|---|---|
| Unused local variable | the IDE; `javac` only with `-Xlint` in some cases |
| Raw type where a generic belongs | `javac -Xlint:rawtypes` |
| Unchecked cast | `javac -Xlint:unchecked` |
| Missing `@Override` | the IDE; ErrorProne `MissingOverride` |
| `equals` without `hashCode` | SpotBugs `HE_EQUALS_NO_HASHCODE` - **only if SpotBugs runs** |
| Comparing boxed types with `==` | ErrorProne `ReferenceEquality` - **only if ErrorProne runs** |
| Resource not closed | `javac -Xlint:try` for try-with-resources; SpotBugs `OBL_*` |
| String comparison with `==` | SpotBugs `ES_COMPARING_STRINGS_WITH_EQ` |
| Switch on enum missing a case | `javac -Xlint:fallthrough` covers fallthrough only, not exhaustiveness |

**Read `pom.xml` or `build.gradle` first.** If SpotBugs and ErrorProne are
absent — and in a plain Spring Boot starter they are — then rows 5 through 8 are
review findings, not tool findings. That is one comment about the build, plus
the specific instances.

## The checks that earn their place

### An `Optional` that reintroduces the null it replaced

```java
Optional<User> u = repo.findById(id);
return u.get().getName();          // throws NoSuchElementException
```

**When you see it**: `.get()` without a preceding `isPresent()` on the same
value, `Optional` used as a field or a method parameter, or an `Optional`
returned as `null`.

**Ask**: what does absence mean here? `orElseThrow` with a domain exception says
it; `.get()` throws a stack trace that names nothing. An `Optional` field is
worse than a nullable one - it is not `Serializable` and it costs an allocation
to express what a null already expressed.

### A stream collected into an immutable list that is later mutated

```java
List<Item> items = stream.collect(Collectors.toList());   // mutable, unspecified
List<Item> items = stream.toList();                       // immutable since 16
items.add(extra);   // UnsupportedOperationException with toList()
```

**When you see it**: `.toList()` (Java 16+) or `List.of(...)` whose result flows
somewhere that adds, sorts or removes.

**Ask**: does anything downstream mutate this? The two collectors read almost
identically and differ exactly here. `Collectors.toList()` makes no guarantee
either way, which is its own reason to be explicit.

### A checked exception swallowed to satisfy the compiler

```java
try {
    doWork();
} catch (IOException e) {
    e.printStackTrace();   // execution continues as if nothing failed
}
```

**When you see it**: a catch block whose body is `printStackTrace()`, a bare
log, or empty - and no rethrow.

**Ask**: what does the caller believe happened? The method returns normally, so
the failure becomes a wrong result rather than an error. Also: `printStackTrace`
writes to stderr, bypassing the logging pipeline entirely, so it is invisible in
production log aggregation.

### `equals` and `hashCode` that disagree with mutability

```java
record Key(List<String> parts) { }         // hashCode derives from a mutable list
map.put(new Key(parts), value);
parts.add("x");                            // the key is now unfindable
```

**When you see it**: a `record`, or a class with generated `equals`/`hashCode`,
whose components include a mutable collection or array - then used as a map key
or in a set.

**Ask**: can any component change after insertion? Records give value semantics
over whatever they hold, and they hold the reference, not a copy.

### An entity's `equals` based on a generated id

```java
@Entity class Order {
    @Id @GeneratedValue Long id;
    public boolean equals(Object o) { return o instanceof Order x && id.equals(x.id); }
}
```

**When you see it**: `equals`/`hashCode` on a JPA entity using the surrogate id.

**Ask**: what is the id before persist? Null - so two unsaved entities in a
`HashSet` collide or throw, and an entity's hash changes when it is flushed,
which corrupts any set it is already in. Business keys, or a stable UUID
assigned in the constructor, avoid it.

### A collection field exposed by reference

```java
public List<Item> getItems() { return items; }   // callers can mutate internals
```

**When you see it**: a getter returning a field that is a collection, array or
mutable object; a constructor storing a passed-in collection directly.

**Ask**: is this class still in control of its own state? `List.copyOf` on the
way in and `Collections.unmodifiableList` on the way out are the boundary. Note
that `final` on the field prevents reassignment and nothing else.

### A `ThreadLocal` never removed

```java
private static final ThreadLocal<Context> CTX = new ThreadLocal<>();
CTX.set(ctx);        // no remove() on any path
```

**When you see it**: `ThreadLocal.set` in request-scoped code without a `finally
{ remove(); }`.

**Ask**: is this thread pooled? On a container thread pool the value survives
into the next unrelated request - a correctness and a data-leak problem at once,
and a classic slow memory leak. Same shape applies to MDC in logging.

### Blocking work inside a reactive or virtual-thread-hostile path

```java
Mono.fromCallable(() -> jdbcTemplate.query(sql))   // blocks an event-loop thread
    .subscribe();
```

**When you see it**: JDBC, `Thread.sleep`, or synchronous I/O inside a
`Mono`/`Flux` chain without `subscribeOn(Schedulers.boundedElastic())`; or a
`synchronized` block inside a virtual thread that performs I/O.

**Ask**: which thread runs this? Reactor's event-loop threads are few, so one
blocking call stalls unrelated requests. Under virtual threads, `synchronized`
around I/O pins the carrier thread - the one construct that defeats the model.

### String concatenation building a query

```java
String sql = "SELECT * FROM orders WHERE user = '" + userId + "'";
```

**When you see it**: string concatenation or `String.format` producing SQL, LDAP,
or a shell command from anything not a literal.

**Ask**: where did that value come from? SpotBugs' security detectors catch some
of these, but only with the `find-sec-bugs` plugin, which is a separate
dependency most builds do not have.

### Time handled as `Date` or with an implicit zone

```java
LocalDateTime now = LocalDateTime.now();   // no zone; whatever the host says
```

**When you see it**: `LocalDateTime` for an instant that is stored, compared
across systems, or serialised; `new Date()`; `SimpleDateFormat` (which is also
not thread-safe) held as a field.

**Ask**: is this a point in time or a wall-clock reading? `Instant` is the former,
`LocalDateTime` the latter, and using one for the other is a silent offset that
only appears when the host timezone changes.

## Version-dependent - read the build file before commenting

Read the `maven.compiler.release` / `sourceCompatibility` in `pom.xml` or
`build.gradle`, not the JDK that happens to be installed.

| Feature | Available from | What it changes for the review |
|---|---|---|
| `Stream.toList()` | 16 | Below it, only `Collectors.toList()` exists - do not suggest the immutable form |
| Records, pattern matching for `instanceof` | 16 | Below it, the verbose form is not a style choice |
| Sealed types, exhaustive `switch` on them | 17 (preview 15) | Below it, a `default` branch is the only exhaustiveness tool |
| Virtual threads | 21 | Below it, the `synchronized`-pins-carrier concern does not apply |
| `SequencedCollection` (`getFirst`) | 21 | Below it, `list.get(0)` is not avoidable |

Also read which analysers the build actually applies. In a plain Spring Boot
starter there is no SpotBugs, no ErrorProne and no NullAway - so nullability is
entirely unverified, and `@Nullable` annotations in the code are documentation
that nothing enforces.

## What to say

Anchor the comment to the line, name the condition that triggers the defect, and
say what breaks: "this `ThreadLocal` is set per request and never removed, so on
a pooled container thread the next request sees the previous user's context"
beats "remember to clean up ThreadLocals". If you cannot state the input that
fails, it is a preference, not a defect.

When a whole class of finding exists only because the build has no static
analysis, raise the build once - do not hand-run SpotBugs across the diff.
