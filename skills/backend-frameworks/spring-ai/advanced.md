# Spring AI Advanced Patterns

## Image Generation

```java
@Service
@RequiredArgsConstructor
public class ImageService {

    private final ImageModel imageModel;

    public String generateImage(String prompt) {
        ImageResponse response = imageModel.call(
            new ImagePrompt(prompt,
                ImageOptionsBuilder.builder()
                    .withModel("dall-e-3")
                    .withWidth(1024)
                    .withHeight(1024)
                    .withQuality("hd")
                    .build()
            )
        );

        return response.getResult().getOutput().getUrl();
    }
}
```

---

## Multi-Modal (Vision)

```java
@Service
public class VisionService {

    private final ChatClient chatClient;

    public String analyzeImage(Resource imageResource) {
        return chatClient.prompt()
            .user(u -> u
                .text("Describe this image in detail")
                .media(MimeTypeUtils.IMAGE_PNG, imageResource)
            )
            .call()
            .content();
    }

    public String analyzeImageUrl(String imageUrl) {
        return chatClient.prompt()
            .user(u -> u
                .text("What do you see in this image?")
                .media(MimeTypeUtils.IMAGE_JPEG, new URL(imageUrl))
            )
            .call()
            .content();
    }
}
```

---

## Advisors (Middleware)

```java
// Logging advisor
@Component
public class LoggingAdvisor implements RequestResponseAdvisor {

    @Override
    public AdvisedRequest adviseRequest(AdvisedRequest request, Map<String, Object> context) {
        log.info("Request: {}", request.userText());
        return request;
    }

    @Override
    public ChatResponse adviseResponse(ChatResponse response, Map<String, Object> context) {
        log.info("Response: {}", response.getResult().getOutput().getContent());
        return response;
    }
}

// Memory advisor for conversation history
@Bean
public ChatClient chatClientWithMemory(ChatClient.Builder builder) {
    return builder
        .defaultAdvisors(
            new MessageChatMemoryAdvisor(new InMemoryChatMemory()),
            new LoggingAdvisor()
        )
        .build();
}
```

---

## Testing

```java
@SpringBootTest
class ChatServiceTest {

    @Autowired
    private ChatService chatService;

    @MockBean
    private ChatClient chatClient;

    @Test
    void shouldGenerateResponse() {
        // Mock the fluent API
        ChatClient.CallPromptResponseSpec responseSpec = mock(ChatClient.CallPromptResponseSpec.class);
        when(responseSpec.content()).thenReturn("Mocked response");

        ChatClient.CallResponseSpec callSpec = mock(ChatClient.CallResponseSpec.class);
        when(callSpec.call()).thenReturn(responseSpec);

        ChatClient.UserSpec userSpec = mock(ChatClient.UserSpec.class);
        when(userSpec.user(anyString())).thenReturn(callSpec);

        ChatClient.PromptUserSpec promptSpec = mock(ChatClient.PromptUserSpec.class);
        when(promptSpec.user(anyString())).thenReturn(callSpec);

        when(chatClient.prompt()).thenReturn(promptSpec);

        String result = chatService.chat("Hello");

        assertThat(result).isEqualTo("Mocked response");
    }
}
```

---

## Prompt Templates

```java
@Service
public class PromptTemplateService {

    private final ChatClient chatClient;

    @Value("classpath:/prompts/code-review.st")
    private Resource codeReviewPrompt;

    public String reviewCode(String code, String language) {
        PromptTemplate template = new PromptTemplate(codeReviewPrompt);

        Prompt prompt = template.create(Map.of(
            "code", code,
            "language", language
        ));

        return chatClient.prompt(prompt)
            .call()
            .content();
    }
}
```

### code-review.st
```
You are an expert {language} code reviewer.
Review the following code and provide:
1. Bugs or issues
2. Performance improvements
3. Best practices suggestions

Code:
```{language}
{code}
```

Provide structured feedback.
```

---

## Full RAG Query Pattern

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

---

## Document Loading and Storage

```java
@Service
@RequiredArgsConstructor
public class DocumentService {

    private final VectorStore vectorStore;
    private final EmbeddingModel embeddingModel;

    public void loadDocuments(List<Resource> resources) {
        // Load documents
        List<Document> documents = new ArrayList<>();
        for (Resource resource : resources) {
            TextReader reader = new TextReader(resource);
            documents.addAll(reader.get());
        }

        // Split into chunks
        TokenTextSplitter splitter = new TokenTextSplitter();
        List<Document> chunks = splitter.split(documents);

        // Store in vector database
        vectorStore.add(chunks);
    }

    public void addDocument(String content, Map<String, Object> metadata) {
        Document document = new Document(content, metadata);
        vectorStore.add(List.of(document));
    }
}
```
