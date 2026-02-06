# Spring Batch Advanced Patterns

## Skip & Retry

```java
@Bean
public Step faultTolerantStep(JobRepository jobRepository,
                              PlatformTransactionManager txManager) {
    return new StepBuilder("faultTolerantStep", jobRepository)
        .<Person, Person>chunk(100, txManager)
        .reader(reader())
        .processor(processor())
        .writer(writer())
        .faultTolerant()
        // Skip configuration
        .skipLimit(100)
        .skip(FlatFileParseException.class)
        .skip(ValidationException.class)
        .noSkip(FileNotFoundException.class)
        // Retry configuration
        .retryLimit(3)
        .retry(DeadlockLoserDataAccessException.class)
        .retry(TransientDataAccessException.class)
        .noRetry(IllegalArgumentException.class)
        // Listeners for skip/retry
        .listener(skipListener())
        .listener(retryListener())
        .build();
}

@Component
@Slf4j
public class CustomSkipListener implements SkipListener<Person, Person> {

    @Override
    public void onSkipInRead(Throwable t) {
        log.warn("Skipped during read: {}", t.getMessage());
    }

    @Override
    public void onSkipInProcess(Person item, Throwable t) {
        log.warn("Skipped during process: {} - {}", item, t.getMessage());
    }

    @Override
    public void onSkipInWrite(Person item, Throwable t) {
        log.warn("Skipped during write: {} - {}", item, t.getMessage());
    }
}
```

---

## Partitioning

```java
@Bean
public Step partitionedStep(JobRepository jobRepository,
                            Step workerStep,
                            Partitioner partitioner) {
    return new StepBuilder("partitionedStep", jobRepository)
        .partitioner("workerStep", partitioner)
        .step(workerStep)
        .gridSize(4)
        .taskExecutor(taskExecutor())
        .build();
}

@Bean
public Partitioner rangePartitioner() {
    return gridSize -> {
        Map<String, ExecutionContext> partitions = new HashMap<>();
        int range = 1000 / gridSize;

        for (int i = 0; i < gridSize; i++) {
            ExecutionContext context = new ExecutionContext();
            context.putInt("minId", i * range + 1);
            context.putInt("maxId", (i + 1) * range);
            partitions.put("partition" + i, context);
        }

        return partitions;
    };
}

@Bean
@StepScope
public JdbcPagingItemReader<Person> partitionedReader(
        @Value("#{stepExecutionContext['minId']}") int minId,
        @Value("#{stepExecutionContext['maxId']}") int maxId,
        DataSource dataSource) {

    return new JdbcPagingItemReaderBuilder<Person>()
        .name("partitionedReader")
        .dataSource(dataSource)
        .selectClause("SELECT * FROM persons")
        .whereClause("WHERE id BETWEEN :minId AND :maxId")
        .parameterValues(Map.of("minId", minId, "maxId", maxId))
        .sortKeys(Map.of("id", Order.ASCENDING))
        .rowMapper(new BeanPropertyRowMapper<>(Person.class))
        .pageSize(100)
        .build();
}
```

---

## Listeners

```java
@Component
@Slf4j
public class JobCompletionListener implements JobExecutionListener {

    @Override
    public void beforeJob(JobExecution jobExecution) {
        log.info("Job {} starting", jobExecution.getJobInstance().getJobName());
    }

    @Override
    public void afterJob(JobExecution jobExecution) {
        if (jobExecution.getStatus() == BatchStatus.COMPLETED) {
            log.info("Job completed successfully");
            // Send notification
        } else if (jobExecution.getStatus() == BatchStatus.FAILED) {
            log.error("Job failed: {}",
                jobExecution.getAllFailureExceptions().stream()
                    .map(Throwable::getMessage)
                    .collect(Collectors.joining(", ")));
        }
    }
}

@Component
@Slf4j
public class ItemCountListener implements ItemReadListener<Person>,
        ItemProcessListener<Person, Person>,
        ItemWriteListener<Person> {

    private final AtomicInteger readCount = new AtomicInteger();
    private final AtomicInteger processCount = new AtomicInteger();
    private final AtomicInteger writeCount = new AtomicInteger();

    @Override
    public void afterRead(Person item) {
        readCount.incrementAndGet();
    }

    @Override
    public void afterProcess(Person input, Person output) {
        if (output != null) {
            processCount.incrementAndGet();
        }
    }

    @Override
    public void afterWrite(Chunk<? extends Person> items) {
        writeCount.addAndGet(items.size());
        log.info("Progress - Read: {}, Processed: {}, Written: {}",
            readCount.get(), processCount.get(), writeCount.get());
    }
}
```

---

## Testing

```java
@SpringBatchTest
@SpringBootTest
class BatchJobTest {

    @Autowired
    private JobLauncherTestUtils jobLauncherTestUtils;

    @Autowired
    private JobRepositoryTestUtils jobRepositoryTestUtils;

    @BeforeEach
    void cleanup() {
        jobRepositoryTestUtils.removeJobExecutions();
    }

    @Test
    void testJob() throws Exception {
        JobParameters params = new JobParametersBuilder()
            .addString("inputFile", "classpath:test-data.csv")
            .toJobParameters();

        JobExecution execution = jobLauncherTestUtils.launchJob(params);

        assertThat(execution.getStatus()).isEqualTo(BatchStatus.COMPLETED);
        assertThat(execution.getStepExecutions())
            .extracting(StepExecution::getWriteCount)
            .containsExactly(100);
    }

    @Test
    void testStep() {
        JobExecution execution = jobLauncherTestUtils.launchStep("step1");

        assertThat(execution.getStatus()).isEqualTo(BatchStatus.COMPLETED);
    }
}
```

---

## Composite Writers

```java
@Bean
public CompositeItemWriter<Person> compositeWriter() {
    return new CompositeItemWriterBuilder<Person>()
        .delegates(List.of(
            databaseWriter(),
            fileWriter(),
            notificationWriter()
        ))
        .build();
}

// ClassifierCompositeItemWriter - route to different writers
@Bean
public ClassifierCompositeItemWriter<Person> classifierWriter() {
    ClassifierCompositeItemWriter<Person> writer = new ClassifierCompositeItemWriter<>();
    writer.setClassifier((Classifier<Person, ItemWriter<? super Person>>) person -> {
        if (person.getType() == PersonType.VIP) {
            return vipWriter();
        }
        return standardWriter();
    });
    return writer;
}
```

---

## Async Processing

```java
// Async processor
@Bean
public AsyncItemProcessor<Person, Person> asyncProcessor() {
    AsyncItemProcessor<Person, Person> processor = new AsyncItemProcessor<>();
    processor.setDelegate(personProcessor());
    processor.setTaskExecutor(taskExecutor());
    return processor;
}

// Async writer (must be paired with async processor)
@Bean
public AsyncItemWriter<Person> asyncWriter() {
    AsyncItemWriter<Person> writer = new AsyncItemWriter<>();
    writer.setDelegate(jdbcWriter());
    return writer;
}

@Bean
public TaskExecutor taskExecutor() {
    ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
    executor.setCorePoolSize(4);
    executor.setMaxPoolSize(8);
    executor.setQueueCapacity(100);
    executor.setThreadNamePrefix("batch-");
    return executor;
}
```
