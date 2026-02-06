---
name: java-profiling
description: |
  JVM performance profiling with Java Flight Recorder (JFR), jcmd,
  and GC analysis. Use for identifying bottlenecks and memory issues.

  USE WHEN: user mentions "Java profiling", "JFR", "JVM performance", asks about "Java Flight Recorder", "jcmd", "heap dump", "GC tuning", "thread dump", "Java memory leak"

  DO NOT USE FOR: Node.js/Python profiling - use respective skills instead
allowed-tools: Read, Grep, Glob, Bash, mcp__performance_profiler__*
---

# Java/JVM Performance Profiling

## When NOT to Use This Skill

- **Node.js/JavaScript profiling** - Use the `nodejs-profiling` skill for V8 profiler and heap analysis
- **Python profiling** - Use the `python-profiling` skill for cProfile and tracemalloc
- **Application-level optimization** - This is for JVM-level profiling, not algorithm optimization
- **Database query tuning** - Use database-specific profiling tools
- **Frontend performance** - Use browser DevTools for client-side profiling

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `java` for comprehensive JFR configuration, GC tuning, and JVM diagnostics.

## Java Flight Recorder (JFR)

### Starting JFR

```bash
# Start recording with application
java -XX:+FlightRecorder \
     -XX:StartFlightRecording=duration=60s,filename=recording.jfr \
     -jar app.jar

# Start recording on running JVM
jcmd <pid> JFR.start duration=60s filename=recording.jfr

# Continuous recording (always-on)
java -XX:+FlightRecorder \
     -XX:FlightRecorderOptions=stackdepth=256 \
     -XX:StartFlightRecording=disk=true,maxsize=500m,maxage=1d \
     -jar app.jar

# Dump current recording
jcmd <pid> JFR.dump filename=dump.jfr
```

### JFR Configuration

```
# custom.jfc
<?xml version="1.0" encoding="UTF-8"?>
<configuration version="2.0">
  <event name="jdk.CPULoad">
    <setting name="enabled">true</setting>
    <setting name="period">1 s</setting>
  </event>
  <event name="jdk.GCHeapSummary">
    <setting name="enabled">true</setting>
  </event>
  <event name="jdk.ObjectAllocationInNewTLAB">
    <setting name="enabled">true</setting>
    <setting name="stackTrace">true</setting>
  </event>
</configuration>
```

### Analyzing JFR Files

```bash
# Print JFR summary
jfr summary recording.jfr

# Print specific events
jfr print --events jdk.CPULoad recording.jfr
jfr print --events jdk.ExecutionSample --json recording.jfr

# Export to JSON
jfr print --json recording.jfr > recording.json
```

## jcmd Diagnostics

### Process Information

```bash
# List all Java processes
jcmd

# VM info
jcmd <pid> VM.version
jcmd <pid> VM.flags
jcmd <pid> VM.system_properties
jcmd <pid> VM.command_line

# Thread dump
jcmd <pid> Thread.print

# Heap info
jcmd <pid> GC.heap_info

# Class histogram
jcmd <pid> GC.class_histogram
```

### Memory Analysis

```bash
# Native memory tracking (requires -XX:NativeMemoryTracking=summary)
jcmd <pid> VM.native_memory summary

# Heap dump
jcmd <pid> GC.heap_dump /path/to/dump.hprof

# Force GC
jcmd <pid> GC.run
```

## GC Tuning

### GC Selection

```bash
# G1GC (default in JDK 9+, recommended for heap > 4GB)
java -XX:+UseG1GC -jar app.jar

# ZGC (low latency, JDK 15+)
java -XX:+UseZGC -jar app.jar

# Shenandoah (low latency, OpenJDK)
java -XX:+UseShenandoahGC -jar app.jar

# Parallel GC (throughput)
java -XX:+UseParallelGC -jar app.jar
```

### GC Logging

```bash
# JDK 9+ unified logging
java -Xlog:gc*:file=gc.log:time,uptime,level,tags:filecount=5,filesize=10m \
     -jar app.jar

# Common GC flags
java -XX:+PrintGCDetails \
     -XX:+PrintGCDateStamps \
     -XX:+PrintTenuringDistribution \
     -Xloggc:gc.log \
     -jar app.jar
```

### G1GC Tuning

```bash
java -XX:+UseG1GC \
     -XX:MaxGCPauseMillis=200 \        # Target pause time
     -XX:G1HeapRegionSize=16m \        # Region size
     -XX:InitiatingHeapOccupancyPercent=45 \  # Start marking at 45%
     -XX:G1ReservePercent=10 \         # Reserve for promotions
     -XX:ConcGCThreads=4 \             # Concurrent GC threads
     -XX:ParallelGCThreads=8 \         # Parallel GC threads
     -jar app.jar
```

## Memory Optimization

### Heap Sizing

```bash
# Set heap size
java -Xms4g -Xmx4g -jar app.jar  # Fixed heap (recommended for production)

# Metaspace sizing
java -XX:MetaspaceSize=256m -XX:MaxMetaspaceSize=512m -jar app.jar

# Direct memory
java -XX:MaxDirectMemorySize=256m -jar app.jar
```

### Memory Leak Detection

```java
// Common leak patterns

// ❌ Bad: Static collections that grow
private static List<Object> cache = new ArrayList<>();
public void process(Object obj) {
    cache.add(obj);  // Never removed
}

// ✅ Good: Bounded cache with eviction
private static final Cache<String, Object> cache = Caffeine.newBuilder()
    .maximumSize(10_000)
    .expireAfterWrite(Duration.ofMinutes(10))
    .build();

// ❌ Bad: Unclosed resources
public void readFile(String path) {
    InputStream is = new FileInputStream(path);
    // Missing is.close()
}

// ✅ Good: Try-with-resources
public void readFile(String path) {
    try (InputStream is = new FileInputStream(path)) {
        // Process
    }
}

// ❌ Bad: ThreadLocal not cleaned
private static ThreadLocal<Connection> connHolder = new ThreadLocal<>();
public void process() {
    connHolder.set(getConnection());
    // Missing connHolder.remove()
}

// ✅ Good: Always clean ThreadLocal
public void process() {
    try {
        connHolder.set(getConnection());
        // Process
    } finally {
        connHolder.remove();
    }
}
```

## CPU Profiling

### async-profiler (recommended)

```bash
# Profile CPU
./profiler.sh -d 30 -f profile.html <pid>

# Profile allocations
./profiler.sh -d 30 -e alloc -f alloc.html <pid>

# Profile locks
./profiler.sh -d 30 -e lock -f lock.html <pid>

# Flame graph output
./profiler.sh -d 30 -f flamegraph.html -o flamegraph <pid>
```

### JMC (Java Mission Control)

```bash
# Open JFR recording in JMC
jmc recording.jfr
```

## Common Bottleneck Patterns

### Synchronization Issues

```java
// ❌ Bad: Coarse-grained locking
public synchronized void process(String key, Object value) {
    cache.put(key, value);
    compute(value);
}

// ✅ Good: Fine-grained locking
private final ConcurrentHashMap<String, Object> cache = new ConcurrentHashMap<>();
public void process(String key, Object value) {
    cache.put(key, value);  // Lock-free for different keys
    compute(value);
}

// ✅ Good: Read-write lock
private final ReadWriteLock lock = new ReentrantReadWriteLock();
public Object get(String key) {
    lock.readLock().lock();
    try { return cache.get(key); }
    finally { lock.readLock().unlock(); }
}
```

### String Operations

```java
// ❌ Bad: String concatenation in loop
String result = "";
for (String s : list) {
    result += s;  // Creates new String each iteration
}

// ✅ Good: StringBuilder
StringBuilder sb = new StringBuilder();
for (String s : list) {
    sb.append(s);
}
String result = sb.toString();

// ✅ Good: String.join for simple cases
String result = String.join("", list);
```

### Collection Optimization

```java
// ❌ Bad: ArrayList when size known
List<String> list = new ArrayList<>();
for (int i = 0; i < 10000; i++) {
    list.add(getData(i));  // Multiple resizes
}

// ✅ Good: Pre-size collections
List<String> list = new ArrayList<>(10000);

// ✅ Good: Use primitive collections for performance
// Use Eclipse Collections, Trove, or fastutil
IntList list = new IntArrayList(10000);
```

### Boxing/Unboxing

```java
// ❌ Bad: Autoboxing in hot path
public long sum(List<Long> numbers) {
    long sum = 0;
    for (Long n : numbers) {
        sum += n;  // Unboxing each iteration
    }
    return sum;
}

// ✅ Good: Use primitive streams
public long sum(List<Long> numbers) {
    return numbers.stream().mapToLong(Long::longValue).sum();
}

// ✅ Good: Primitive arrays when possible
public long sum(long[] numbers) {
    return Arrays.stream(numbers).sum();
}
```

## JIT Optimization

### Warm-up

```java
// Warm-up critical paths before measuring
public static void main(String[] args) {
    // Warm-up phase
    for (int i = 0; i < 10_000; i++) {
        criticalMethod(i);
    }

    // Measurement phase
    long start = System.nanoTime();
    for (int i = 0; i < 100_000; i++) {
        criticalMethod(i);
    }
    long duration = System.nanoTime() - start;
}
```

### JIT Logging

```bash
# Print JIT compilation
java -XX:+PrintCompilation -jar app.jar

# Print inlining decisions
java -XX:+UnlockDiagnosticVMOptions -XX:+PrintInlining -jar app.jar

# Disable specific optimizations for debugging
java -XX:+UnlockDiagnosticVMOptions -XX:DisableIntrinsic=_hashCode -jar app.jar
```

## Profiling Checklist

| Check | Tool | Command |
|-------|------|---------|
| CPU hotspots | JFR | `jcmd <pid> JFR.start` |
| Memory usage | jcmd | `jcmd <pid> GC.heap_info` |
| GC behavior | GC logs | `-Xlog:gc*` |
| Thread contention | JFR | `jdk.JavaMonitorWait` events |
| Memory leaks | Heap dump | `jcmd <pid> GC.heap_dump` |
| Class loading | jcmd | `jcmd <pid> VM.classloaders` |

## Production Flags

```bash
java \
  -server \
  -Xms4g -Xmx4g \
  -XX:+UseG1GC \
  -XX:MaxGCPauseMillis=200 \
  -XX:+UseStringDeduplication \
  -XX:+AlwaysPreTouch \
  -XX:+DisableExplicitGC \
  -XX:+HeapDumpOnOutOfMemoryError \
  -XX:HeapDumpPath=/var/log/heap.hprof \
  -Xlog:gc*:file=/var/log/gc.log:time,uptime:filecount=5,filesize=10m \
  -jar app.jar
```

## Anti-Patterns

| Anti-Pattern | Why It's Wrong | Correct Approach |
|-------------|----------------|------------------|
| `System.out.println()` in hot paths | Extremely slow, synchronous I/O | Use SLF4J with async appenders |
| Creating many short-lived objects | GC pressure, allocation overhead | Reuse objects, use object pools |
| `synchronized` on hot paths | Thread contention, poor scalability | Use `ConcurrentHashMap`, `ReentrantLock`, or lock-free structures |
| String concatenation with `+` in loops | Creates many intermediate strings | Use `StringBuilder` |
| Autoboxing in loops | Creates wrapper objects | Use primitive types |
| Not sizing collections | Frequent resizing, memory churn | Pre-size with `new ArrayList<>(expectedSize)` |
| `finalize()` for cleanup | Unpredictable, deprecated | Use try-with-resources or explicit cleanup |
| Ignoring GC logs | Miss performance degradation | Always enable GC logging in production |
| One-size-fits-all heap | Wrong GC pauses for workload | Tune heap based on app behavior |
| Not using connection pooling | Connection creation overhead | Use HikariCP or similar |

## Quick Troubleshooting

| Issue | Diagnosis | Solution |
|-------|-----------|----------|
| Long GC pauses | Heap too large or wrong GC | Use ZGC/Shenandoah or tune G1GC pause targets |
| `OutOfMemoryError: Java heap space` | Memory leak or undersized heap | Analyze heap dump, increase `-Xmx` if needed |
| `OutOfMemoryError: Metaspace` | Too many classes loaded | Increase `-XX:MaxMetaspaceSize` or fix classloader leak |
| High CPU usage | Hot loop, inefficient algorithm | CPU profile with JFR or async-profiler |
| Thread contention | Lock competition | Thread dump analysis, reduce lock scope |
| Slow startup | Class loading, initialization | Use AppCDS, lazy initialization |
| Memory leak | Unclosed resources, static collections | Heap dump comparison, find growing objects |
| GC overhead limit exceeded | GC taking > 98% of time | Fix memory leak or increase heap |
| Full GC too frequent | Old gen filling up | Tune heap ratio, fix object tenure issues |
| Application unresponsive | Deadlock or long GC | Thread dump to find deadlock, GC logs |

## Related Skills

- [Spring Boot](../../backend-frameworks/spring-boot/SKILL.md)
- [Performance Profiling MCP](../../../mcp-servers/performance-profiler/)
