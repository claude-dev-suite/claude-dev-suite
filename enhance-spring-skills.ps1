# Script to enhance all Spring-related skills with USE WHEN, DO NOT USE FOR, Anti-Patterns, and Quick Troubleshooting sections

$skillUpdates = @{
    "spring-kafka" = @{
        useWhen = 'user mentions "Kafka", "KafkaTemplate", "@KafkaListener", asks about "message queue", "event streaming", "retry topics", "DLT"'
        doNotUse = 'RabbitMQ (use `spring-amqp`), general messaging patterns (use messaging-expert), Spring Boot basics (use `spring-boot`)'
        antiPatterns = @(
            @("acks=0 in production", "No durability guarantee", "Use acks=all"),
            @("Auto-commit without processing", "Message loss on failure", "Use manual acknowledgment"),
            @("No DLT configuration", "Failed messages lost", "Configure Dead Letter Topic"),
            @("Trust all packages", "Security vulnerability", "Set trusted.packages explicitly"),
            @("Ignore duplicate messages", "Data inconsistency", "Enable idempotence")
        )
        troubleshooting = @(
            @("No messages consumed", "Consumer not started or wrong group", "Check consumer group and bootstrap servers"),
            @("Offset commit fails", "Wrong ack mode", "Use manual ack mode"),
            @("Messages sent but not received", "Topic doesn't exist", "Enable auto.create.topics or create manually"),
            @("Deserialization error", "Wrong deserializer or untrusted package", "Configure JsonDeserializer with trusted packages"),
            @("Rebalancing issues", "Slow consumer or network issues", "Tune max.poll.interval and session.timeout")
        )
    }
    "spring-amqp" = @{
        useWhen = 'user mentions "RabbitMQ", "AMQP", "@RabbitListener", "RabbitTemplate", asks about "message broker", "queues", "exchanges", "bindings"'
        doNotUse = 'Kafka (use `spring-kafka`), general messaging (use messaging-expert), Spring Boot basics (use `spring-boot`)'
        antiPatterns = @(
            @("Auto-ack without processing", "Message loss", "Use manual acknowledgment"),
            @("No DLX configured", "Failed messages lost", "Configure Dead Letter Exchange"),
            @("Unbounded prefetch", "Memory issues", "Set appropriate prefetch count"),
            @("Transient messages for critical data", "Message loss on restart", "Use persistent delivery mode"),
            @("No message TTL", "Queue grows indefinitely", "Set x-message-ttl")
        )
        troubleshooting = @(
            @("Messages not consumed", "Queue binding incorrect", "Verify exchange, queue, and routing key"),
            @("Connection refused", "RabbitMQ not running", "Check RabbitMQ status and port"),
            @("Messages goto DLQ immediately", "TTL=0 or reject on first attempt", "Check TTL and retry configuration"),
            @("Listener not starting", "Missing @EnableRabbitListener", "Add @EnableRabbit to configuration"),
            @("Message conversion error", "Wrong converter", "Configure Jackson2JsonMessageConverter")
        )
    }
    "spring-cloud-config" = @{
        useWhen = 'user mentions "Config Server", "centralized configuration", asks about "environment properties", "refresh scope", "@RefreshScope", "config client"'
        doNotUse = 'Local application.yml only (use `spring-boot`), secrets management (use Vault skill), Spring Cloud other components'
        antiPatterns = @(
            @("Plain text secrets in Git", "Security vulnerability", "Use encryption or Vault backend"),
            @("No fail-fast in production", "Silent config failures", "Enable fail-fast=true"),
            @("Single config server", "Single point of failure", "Use HA with multiple instances"),
            @("No @RefreshScope", "Config changes ignored", "Add @RefreshScope to beans"),
            @("Mix environments in one file", "Configuration errors", "Use profile-specific files")
        )
        troubleshooting = @(
            @("Config not loading", "Config server unreachable", "Check spring.config.import and server URL"),
            @("Refresh not working", "Missing @RefreshScope", "Add @RefreshScope and call /actuator/refresh"),
            @("Git authentication fails", "Wrong credentials", "Check GIT_USERNAME and GIT_TOKEN"),
            @("Encryption fails", "Missing encrypt.key", "Set ENCRYPT_KEY environment variable"),
            @("Config changes not reflected", "No refresh triggered", "POST to /actuator/busrefresh")
        )
    }
}

# Add more skill configurations here...

Write-Host "Spring Skills Enhancement Script Created"
Write-Host "This script contains enhancement templates for all Spring skills"
Write-Host "Apply manually to each SKILL.md file"
