---
name: spring-ai
description: |
  Spring AI for integrating AI/ML models (OpenAI, Azure, Ollama, etc.) into Spring applications.
  Covers ChatClient, embeddings, RAG, vector stores, and function calling.

  USE WHEN: user mentions "spring ai", "ChatClient", "LLM integration Spring",
  "RAG Spring", "embeddings Java", "vector store Spring", "OpenAI Spring Boot"

  DO NOT USE FOR: raw OpenAI/Anthropic API - use respective SDKs,
  ML model training - use Python frameworks
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Spring AI - Quick Reference

> **Full Reference**: See [advanced.md](advanced.md) for image generation, multi-modal/vision, advisors/middleware, testing patterns, and prompt templates.

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `spring-ai` for comprehensive documentation.

## Dependencies

```xml
<!-- OpenAI -->
<dependency>
    <groupId>org.springframework.ai</groupId>
    <artifactId>spring-ai-openai-spring-boot-starter</artifactId>
</dependency>

<!-- Azure OpenAI -->
<dependency>
    <groupId>org.springframework.ai</groupId>
    <artifactId>spring-ai-azure-openai-spring-boot-starter</artifactId>
</dependency>

<!-- Ollama (local) -->
<dependency>
    <groupId>org.springframework.ai</groupId>
    <artifactId>spring-ai-ollama-spring-boot-starter</artifactId>
</dependency>

<!-- Vector Store - PGVector -->
<dependency>
    <groupId>org.springframework.ai</groupId>
    <artifactId>spring-ai-pgvector-store-spring-boot-starter</artifactId>
</dependency>
```

## Configuration

### OpenAI
```yaml
spring:
  ai:
    openai:
      api-key: ${OPENAI_API_KEY}
      chat:
        options:
          model: gpt-4o
          temperature: 0.7
          max-tokens: 1000
      embedding:
        options:
          model: text-embedding-3-small
```

### Azure OpenAI
```yaml
spring:
  ai:
    azure:
      openai:
        api-key: ${AZURE_OPENAI_KEY}
        endpoint: ${AZURE_OPENAI_ENDPOINT}
        chat:
          options:
            deployment-name: gpt-4o
            temperature: 0.7
```

### Ollama (Local)
```yaml
spring:
  ai:
    ollama:
      base-url: http://localhost:11434
      chat:
        options:
          model: llama3
          temperature: 0.7
```

## Basic Chat

```java
@Service
@RequiredArgsConstructor
public class ChatService {

    private final ChatClient chatClient;

    public String chat(String message) {
        return chatClient.prompt()
            .user(message)
            .call()
            .content();
    }

    // With system prompt
    public String chatWithContext(String message) {
        return chatClient.prompt()
            .system("You are a helpful assistant specialized in Spring Boot.")
            .user(message)
            .call()
            .content();
    }

    // With parameters
    public String chatWithParams(String message, String topic) {
        return chatClient.prompt()
            .system(s -> s.text("You are an expert in {topic}.")
                .param("topic", topic))
            .user(message)
            .call()
            .content();
    }
}
```

### ChatClient Builder
```java
@Configuration
public class ChatClientConfig {

    @Bean
    public ChatClient chatClient(ChatClient.Builder builder) {
        return builder
            .defaultSystem("You are a helpful AI assistant.")
            .defaultOptions(ChatOptionsBuilder.builder()
                .withTemperature(0.7)
                .withMaxTokens(1000)
                .build())
            .build();
    }
}
```

## Structured Output

```java
public record BookRecommendation(
    String title,
    String author,
    String genre,
    String summary,
    int rating
) {}

@Service
public class BookService {

    private final ChatClient chatClient;

    public BookRecommendation getRecommendation(String preferences) {
        return chatClient.prompt()
            .user("Recommend a book based on: " + preferences)
            .call()
            .entity(BookRecommendation.class);
    }

    public List<BookRecommendation> getRecommendations(String preferences, int count) {
        return chatClient.prompt()
            .user("Recommend " + count + " books based on: " + preferences)
            .call()
            .entity(new ParameterizedTypeReference<List<BookRecommendation>>() {});
    }
}
```

## Streaming

```java
@Service
public class StreamingChatService {

    private final ChatClient chatClient;

    public Flux<String> streamChat(String message) {
        return chatClient.prompt()
            .user(message)
            .stream()
            .content();
    }

    // WebFlux controller
    @GetMapping(value = "/chat/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<String> streamResponse(@RequestParam String message) {
        return streamChat(message);
    }
}
```

## Function Calling

```java
@Configuration
public class FunctionConfig {

    @Bean
    @Description("Get current weather for a location")
    public Function<WeatherRequest, WeatherResponse> currentWeather() {
        return request -> weatherService.getWeather(request.location());
    }

    @Bean
    @Description("Search for products by name")
    public Function<ProductSearchRequest, List<Product>> searchProducts() {
        return request -> productService.search(request.query(), request.maxResults());
    }
}

public record WeatherRequest(String location) {}
public record WeatherResponse(String location, double temperature, String conditions) {}

@Service
public class AssistantService {

    private final ChatClient chatClient;

    public String assistWithFunctions(String message) {
        return chatClient.prompt()
            .user(message)
            .functions("currentWeather", "searchProducts")
            .call()
            .content();
    }
}
```

## Embeddings

```java
@Service
@RequiredArgsConstructor
public class EmbeddingService {

    private final EmbeddingModel embeddingModel;

    public float[] getEmbedding(String text) {
        EmbeddingResponse response = embeddingModel.embedForResponse(List.of(text));
        return response.getResult().getOutput();
    }

    public List<float[]> getEmbeddings(List<String> texts) {
        EmbeddingResponse response = embeddingModel.embedForResponse(texts);
        return response.getResults().stream()
            .map(e -> e.getOutput())
            .toList();
    }
}
```

## Vector Store (RAG)

### Configuration
```yaml
spring:
  ai:
    vectorstore:
      pgvector:
        dimensions: 1536
        index-type: HNSW
        distance-type: COSINE_DISTANCE
```

### RAG Query
```java
@Service
@RequiredArgsConstructor
public class RagService {

    private final VectorStore vectorStore;
    private final ChatClient chatClient;

    public String queryWithContext(String question) {
        // Retrieve relevant documents
        List<Document> relevantDocs = vectorStore.similaritySearch(
            SearchRequest.query(question)
                .withTopK(5)
                .withSimilarityThreshold(0.7)
        );

        // Build context
        String context = relevantDocs.stream()
            .map(Document::getContent)
            .collect(Collectors.joining("\n\n"));

        // Generate response with context
        return chatClient.prompt()
            .system("""
                You are a helpful assistant. Answer questions based on the provided context.
                If the answer is not in the context, say "I don't have information about that."

                Context:
                {context}
                """)
            .user(question)
            .call()
            .content();
    }
}
```

### QuestionAnswerAdvisor
```java
@Configuration
public class RagConfig {

    @Bean
    public ChatClient ragChatClient(ChatClient.Builder builder, VectorStore vectorStore) {
        return builder
            .defaultAdvisors(new QuestionAnswerAdvisor(vectorStore))
            .build();
    }
}

// Usage is simple - advisor handles RAG automatically
@Service
public class SimpleRagService {

    private final ChatClient ragChatClient;

    public String answer(String question) {
        return ragChatClient.prompt()
            .user(question)
            .call()
            .content();
    }
}
```

## Best Practices

| Do | Don't |
|----|-------|
| Use structured output for predictable results | Parse free-form text manually |
| Implement proper error handling | Ignore API failures |
| Use streaming for long responses | Block on large generations |
| Cache embeddings when possible | Regenerate embeddings repeatedly |
| Set appropriate token limits | Use unlimited tokens |

## Production Checklist

- [ ] API keys secured (environment variables)
- [ ] Rate limiting implemented
- [ ] Error handling and retries
- [ ] Token usage monitoring
- [ ] Response caching where appropriate
- [ ] Vector store properly indexed
- [ ] Embedding dimension consistency
- [ ] Prompt injection protection
- [ ] Cost monitoring and alerts
- [ ] Fallback models configured

## When NOT to Use This Skill

- **Raw OpenAI/Anthropic API** - Use respective SDKs directly
- **ML model training** - Use Python frameworks (PyTorch, TensorFlow)
- **Non-Spring applications** - Use LangChain or native SDKs
- **Simple text generation** - May be overkill for trivial use cases

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| Hardcoded API keys | Security risk | Use environment variables |
| No token limit | Cost explosion | Set max-tokens appropriately |
| Synchronous for long requests | Thread blocking | Use streaming |
| Ignoring rate limits | API errors, bans | Implement retry with backoff |
| No caching for embeddings | High costs | Cache embeddings locally |
| Prompt injection vulnerability | Security risk | Sanitize user input |

## Quick Troubleshooting

| Problem | Diagnostic | Fix |
|---------|------------|-----|
| API key invalid | Check error message | Verify OPENAI_API_KEY env var |
| Rate limit exceeded | 429 error | Add retry logic, reduce requests |
| Timeout on large prompts | Connection timeout | Use streaming, increase timeout |
| Embeddings dimension mismatch | Vector store error | Match embedding model dimensions |
| Structured output fails | JSON parse error | Simplify schema, add examples |

## Reference Documentation
- [Spring AI Reference](https://docs.spring.io/spring-ai/reference/)
