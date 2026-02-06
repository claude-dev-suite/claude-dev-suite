---
name: spring-batch
description: |
  Spring Batch for batch processing in Spring Boot 3.x. Covers Job, Step,
  ItemReader/Processor/Writer, chunk processing, job parameters, restart,
  skip/retry, partitioning, and monitoring.

  USE WHEN: user mentions "spring batch", "batch job", "ETL Spring",
  "ItemReader", "ItemWriter", "chunk processing", "job scheduling Spring"

  DO NOT USE FOR: real-time processing - use streaming,
  simple scheduled tasks - use `spring-scheduling` instead
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Spring Batch

> **Full Reference**: See [advanced.md](advanced.md) for skip/retry configuration, partitioning, listeners, testing with JobLauncherTestUtils, composite writers, and async processing.

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `spring-boot` and topic: `batch` for comprehensive documentation.

## Quick Start

```java
@Configuration
@EnableBatchProcessing
public class BatchConfig {

    @Bean
    public Job importJob(JobRepository jobRepository, Step step1) {
        return new JobBuilder("importJob", jobRepository)
            .incrementer(new RunIdIncrementer())
            .start(step1)
            .build();
    }

    @Bean
    public Step step1(JobRepository jobRepository,
                      PlatformTransactionManager transactionManager,
                      ItemReader<InputData> reader,
                      ItemProcessor<InputData, OutputData> processor,
                      ItemWriter<OutputData> writer) {
        return new StepBuilder("step1", jobRepository)
            .<InputData, OutputData>chunk(100, transactionManager)
            .reader(reader)
            .processor(processor)
            .writer(writer)
            .build();
    }
}
```

---

## Core Components

### Job

```java
@Bean
public Job complexJob(JobRepository jobRepository,
                      Step extractStep, Step transformStep, Step loadStep) {
    return new JobBuilder("etlJob", jobRepository)
        .incrementer(new RunIdIncrementer())
        .validator(jobParametersValidator())
        .listener(jobExecutionListener())
        .start(extractStep)
        .next(transformStep)
        .next(loadStep)
        .build();
}

// Job with decision
@Bean
public Job conditionalJob(JobRepository jobRepository,
                          Step step1, Step step2, Step errorStep,
                          JobExecutionDecider decider) {
    return new JobBuilder("conditionalJob", jobRepository)
        .start(step1)
        .next(decider)
        .on("COMPLETED").to(step2)
        .from(decider).on("FAILED").to(errorStep)
        .end()
        .build();
}
```

### Step - Chunk Processing

```java
@Bean
public Step chunkStep(JobRepository jobRepository,
                      PlatformTransactionManager txManager) {
    return new StepBuilder("chunkStep", jobRepository)
        .<Person, Person>chunk(100, txManager)
        .reader(reader())
        .processor(processor())
        .writer(writer())
        .faultTolerant()
        .skipLimit(10)
        .skip(ValidationException.class)
        .retryLimit(3)
        .retry(TransientException.class)
        .build();
}

// Tasklet Step (for simple operations)
@Bean
public Step taskletStep(JobRepository jobRepository,
                        PlatformTransactionManager txManager) {
    return new StepBuilder("taskletStep", jobRepository)
        .tasklet((contribution, chunkContext) -> {
            cleanupService.cleanup();
            return RepeatStatus.FINISHED;
        }, txManager)
        .build();
}
```

---

## ItemReader

### FlatFileItemReader

```java
@Bean
public FlatFileItemReader<Person> csvReader() {
    return new FlatFileItemReaderBuilder<Person>()
        .name("personReader")
        .resource(new ClassPathResource("data/input.csv"))
        .delimited()
        .delimiter(",")
        .names("firstName", "lastName", "email", "age")
        .linesToSkip(1)  // Skip header
        .fieldSetMapper(new BeanWrapperFieldSetMapper<>() {{
            setTargetType(Person.class);
        }})
        .build();
}
```

### JdbcPagingItemReader

```java
@Bean
public JdbcPagingItemReader<Person> pagingReader(DataSource dataSource) {
    Map<String, Order> sortKeys = new HashMap<>();
    sortKeys.put("id", Order.ASCENDING);

    return new JdbcPagingItemReaderBuilder<Person>()
        .name("pagingReader")
        .dataSource(dataSource)
        .selectClause("SELECT id, first_name, last_name, email")
        .fromClause("FROM persons")
        .whereClause("WHERE status = :status")
        .parameterValues(Map.of("status", "ACTIVE"))
        .sortKeys(sortKeys)
        .rowMapper(new BeanPropertyRowMapper<>(Person.class))
        .pageSize(100)
        .build();
}
```

### JpaPagingItemReader

```java
@Bean
public JpaPagingItemReader<Person> jpaReader(EntityManagerFactory emf) {
    return new JpaPagingItemReaderBuilder<Person>()
        .name("jpaReader")
        .entityManagerFactory(emf)
        .queryString("SELECT p FROM Person p WHERE p.status = :status")
        .parameterValues(Map.of("status", Status.ACTIVE))
        .pageSize(100)
        .build();
}
```

---

## ItemProcessor

```java
@Component
public class PersonProcessor implements ItemProcessor<Person, Person> {

    @Override
    public Person process(Person person) throws Exception {
        // Return null to filter out item
        if (!isValid(person)) {
            return null;
        }

        // Transform
        person.setEmail(person.getEmail().toLowerCase());
        person.setFullName(person.getFirstName() + " " + person.getLastName());
        return person;
    }
}

// Composite processor
@Bean
public CompositeItemProcessor<Person, Person> compositeProcessor() {
    return new CompositeItemProcessorBuilder<Person, Person>()
        .delegates(List.of(
            validationProcessor(),
            transformationProcessor(),
            enrichmentProcessor()
        ))
        .build();
}
```

---

## ItemWriter

### JdbcBatchItemWriter

```java
@Bean
public JdbcBatchItemWriter<Person> jdbcWriter(DataSource dataSource) {
    return new JdbcBatchItemWriterBuilder<Person>()
        .dataSource(dataSource)
        .sql("INSERT INTO persons (first_name, last_name, email) VALUES (:firstName, :lastName, :email)")
        .beanMapped()
        .build();
}
```

### JpaItemWriter

```java
@Bean
public JpaItemWriter<Person> jpaWriter(EntityManagerFactory emf) {
    JpaItemWriter<Person> writer = new JpaItemWriter<>();
    writer.setEntityManagerFactory(emf);
    writer.setUsePersist(true);  // false = merge
    return writer;
}
```

### FlatFileItemWriter

```java
@Bean
public FlatFileItemWriter<Person> csvWriter() {
    return new FlatFileItemWriterBuilder<Person>()
        .name("personWriter")
        .resource(new FileSystemResource("output/persons.csv"))
        .delimited()
        .delimiter(",")
        .names("firstName", "lastName", "email")
        .headerCallback(writer -> writer.write("First Name,Last Name,Email"))
        .build();
}
```

---

## Job Parameters

```java
@Bean
@StepScope
public FlatFileItemReader<Person> parameterizedReader(
        @Value("#{jobParameters['inputFile']}") String inputFile) {
    return new FlatFileItemReaderBuilder<Person>()
        .name("reader")
        .resource(new FileSystemResource(inputFile))
        .delimited()
        .names("firstName", "lastName", "email")
        .targetType(Person.class)
        .build();
}

// Running job with parameters
@Service
@RequiredArgsConstructor
public class JobLauncherService {

    private final JobLauncher jobLauncher;
    private final Job importJob;

    public void runJob(String inputFile, LocalDate date) throws Exception {
        JobParameters params = new JobParametersBuilder()
            .addString("inputFile", inputFile)
            .addLocalDate("date", date)
            .addLong("timestamp", System.currentTimeMillis())
            .toJobParameters();

        JobExecution execution = jobLauncher.run(importJob, params);
        log.info("Job status: {}", execution.getStatus());
    }
}
```

---

## When NOT to Use This Skill

- **Real-time processing** - Use streaming (Kafka Streams, Flink)
- **Simple scheduled tasks** - Use `spring-scheduling` instead
- **Microservices data sync** - Consider event-driven with messaging
- **Small data sets** - Batch overhead may not be justified

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| Large chunk size | Memory issues, long transactions | Tune chunk size (100-1000) |
| No skip policy | Single error stops job | Configure skip for expected errors |
| Stateful ItemProcessor | Thread safety issues | Make processor stateless |
| Ignoring job parameters | Can't restart failed jobs | Include identifying params |
| No monitoring | Silent failures | Configure JobExecutionListener |
| Single-threaded for large data | Slow processing | Use partitioning |

## Quick Troubleshooting

| Problem | Diagnostic | Fix |
|---------|------------|-----|
| Job not starting | Check job repository | Verify database schema |
| Job fails on restart | Check job parameters | Add RunIdIncrementer |
| Chunk processing slow | Check commit interval | Tune chunk size |
| Memory issues | Monitor heap usage | Reduce chunk size, stream data |
| Skip not working | Check skip policy | Configure skippable exceptions |

## Best Practices

- ✅ Use chunk processing for large volumes
- ✅ Configure skip/retry for fault tolerance
- ✅ Use partitioning for parallelism
- ✅ Implement listeners for monitoring
- ✅ Test with JobLauncherTestUtils
- ❌ Don't use chunk size too large
- ❌ Don't ignore errors silently
- ❌ Don't forget job parameters for restart

## Reference Documentation

- [Spring Batch](https://docs.spring.io/spring-batch/reference/)
