# Advanced Patterns

## Low-Level WebSocket (without STOMP)

```java
@Configuration
@EnableWebSocket
public class RawWebSocketConfig implements WebSocketConfigurer {

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(gameHandler(), "/game")
            .setAllowedOrigins("*");
    }

    @Bean
    public WebSocketHandler gameHandler() {
        return new GameWebSocketHandler();
    }
}

@Component
@Slf4j
public class GameWebSocketHandler extends TextWebSocketHandler {

    private final Set<WebSocketSession> sessions = ConcurrentHashMap.newKeySet();
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        sessions.add(session);
        log.info("New connection: {}", session.getId());
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        GameMessage gameMessage = objectMapper.readValue(message.getPayload(), GameMessage.class);

        switch (gameMessage.type()) {
            case "MOVE" -> handleMove(session, gameMessage);
            case "ATTACK" -> handleAttack(session, gameMessage);
            case "CHAT" -> broadcastChat(session, gameMessage);
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        sessions.remove(session);
        log.info("Connection closed: {} ({})", session.getId(), status);
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) {
        log.error("Transport error for session {}: {}", session.getId(), exception.getMessage());
        sessions.remove(session);
    }

    private void broadcast(Object message) {
        String json;
        try {
            json = objectMapper.writeValueAsString(message);
        } catch (JsonProcessingException e) {
            log.error("Failed to serialize message", e);
            return;
        }

        TextMessage textMessage = new TextMessage(json);
        sessions.forEach(session -> {
            try {
                if (session.isOpen()) {
                    session.sendMessage(textMessage);
                }
            } catch (IOException e) {
                log.error("Failed to send message to {}", session.getId(), e);
            }
        });
    }

    private void handleMove(WebSocketSession session, GameMessage message) {
        // Game logic...
        broadcast(new GameMessage("MOVE_UPDATE", message.data()));
    }

    private void handleAttack(WebSocketSession session, GameMessage message) {
        // Game logic...
    }

    private void broadcastChat(WebSocketSession session, GameMessage message) {
        broadcast(message);
    }
}

public record GameMessage(String type, Map<String, Object> data) {}
```

---

## JavaScript Client (SockJS + STOMP)

```javascript
import SockJS from 'sockjs-client';
import { Client } from '@stomp/stompjs';

class WebSocketService {
    constructor() {
        this.client = null;
        this.subscriptions = new Map();
    }

    connect(token) {
        return new Promise((resolve, reject) => {
            this.client = new Client({
                webSocketFactory: () => new SockJS('/ws'),
                connectHeaders: {
                    Authorization: `Bearer ${token}`
                },
                reconnectDelay: 5000,
                heartbeatIncoming: 10000,
                heartbeatOutgoing: 10000,

                onConnect: () => {
                    console.log('Connected to WebSocket');
                    resolve();
                },

                onStompError: (frame) => {
                    console.error('STOMP error', frame);
                    reject(new Error(frame.body));
                },

                onWebSocketClose: () => {
                    console.log('WebSocket closed');
                },

                onDisconnect: () => {
                    console.log('Disconnected from WebSocket');
                }
            });

            this.client.activate();
        });
    }

    disconnect() {
        if (this.client) {
            this.client.deactivate();
        }
    }

    subscribe(destination, callback) {
        if (!this.client || !this.client.connected) {
            throw new Error('Not connected');
        }

        const subscription = this.client.subscribe(destination, (message) => {
            const body = JSON.parse(message.body);
            callback(body);
        });

        this.subscriptions.set(destination, subscription);
        return subscription;
    }

    unsubscribe(destination) {
        const subscription = this.subscriptions.get(destination);
        if (subscription) {
            subscription.unsubscribe();
            this.subscriptions.delete(destination);
        }
    }

    send(destination, body) {
        if (!this.client || !this.client.connected) {
            throw new Error('Not connected');
        }

        this.client.publish({
            destination: destination,
            body: JSON.stringify(body)
        });
    }

    // Utility methods
    subscribeToChat(roomId, onMessage) {
        return this.subscribe(`/topic/room/${roomId}`, onMessage);
    }

    subscribeToPrivateMessages(onMessage) {
        return this.subscribe('/user/queue/private', onMessage);
    }

    subscribeToErrors(onError) {
        return this.subscribe('/user/queue/errors', onError);
    }

    sendChatMessage(content) {
        this.send('/app/chat.send', { content, type: 'CHAT' });
    }

    sendPrivateMessage(recipient, content) {
        this.send('/app/chat.private', { recipient, content });
    }
}

export default new WebSocketService();
```

---

## Testing

### Integration Test

```java
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class WebSocketIntegrationTest {

    @LocalServerPort
    private int port;

    private WebSocketStompClient stompClient;
    private BlockingQueue<ChatMessage> messageQueue;

    @BeforeEach
    void setUp() {
        messageQueue = new LinkedBlockingQueue<>();

        stompClient = new WebSocketStompClient(
            new SockJsClient(List.of(new WebSocketTransport(new StandardWebSocketClient())))
        );
        stompClient.setMessageConverter(new MappingJackson2MessageConverter());
    }

    @AfterEach
    void tearDown() {
        if (stompClient != null) {
            stompClient.stop();
        }
    }

    @Test
    void sendMessage_shouldBroadcastToSubscribers() throws Exception {
        String wsUrl = "ws://localhost:" + port + "/ws";

        StompSession session = stompClient
            .connectAsync(wsUrl, new StompSessionHandlerAdapter() {})
            .get(5, TimeUnit.SECONDS);

        session.subscribe("/topic/chat", new StompFrameHandler() {
            @Override
            public Type getPayloadType(StompHeaders headers) {
                return ChatMessage.class;
            }

            @Override
            public void handleFrame(StompHeaders headers, Object payload) {
                messageQueue.offer((ChatMessage) payload);
            }
        });

        // Attendi subscription
        Thread.sleep(500);

        // Invia messaggio
        session.send("/app/chat.send",
            new ChatMessage(null, null, "Hello WebSocket!", null, MessageType.CHAT));

        // Verifica ricezione
        ChatMessage received = messageQueue.poll(5, TimeUnit.SECONDS);
        assertThat(received).isNotNull();
        assertThat(received.content()).isEqualTo("Hello WebSocket!");

        session.disconnect();
    }

    @Test
    void privateMessage_shouldDeliverToRecipient() throws Exception {
        String wsUrl = "ws://localhost:" + port + "/ws";

        // Connetti due client
        StompSession sender = connectWithAuth("sender", "password");
        StompSession recipient = connectWithAuth("recipient", "password");

        BlockingQueue<PrivateMessage> recipientQueue = new LinkedBlockingQueue<>();

        recipient.subscribe("/user/queue/private", new StompFrameHandler() {
            @Override
            public Type getPayloadType(StompHeaders headers) {
                return PrivateMessage.class;
            }

            @Override
            public void handleFrame(StompHeaders headers, Object payload) {
                recipientQueue.offer((PrivateMessage) payload);
            }
        });

        Thread.sleep(500);

        sender.send("/app/chat.private",
            new PrivateMessage(null, "recipient", "Private message", null));

        PrivateMessage received = recipientQueue.poll(5, TimeUnit.SECONDS);
        assertThat(received).isNotNull();
        assertThat(received.content()).isEqualTo("Private message");

        sender.disconnect();
        recipient.disconnect();
    }

    private StompSession connectWithAuth(String username, String password) throws Exception {
        WebSocketHttpHeaders headers = new WebSocketHttpHeaders();
        headers.add("Authorization", "Bearer " + getToken(username, password));

        return stompClient
            .connectAsync("ws://localhost:" + port + "/ws", headers,
                new StompSessionHandlerAdapter() {})
            .get(5, TimeUnit.SECONDS);
    }
}
```

### Unit Test

```java
@ExtendWith(MockitoExtension.class)
class ChatControllerTest {

    @Mock
    private SimpMessagingTemplate messagingTemplate;

    @InjectMocks
    private ChatController chatController;

    @Test
    void sendMessage_shouldReturnMessageWithSender() {
        Principal principal = () -> "testUser";
        ChatMessage input = new ChatMessage(null, null, "Hello", null, MessageType.CHAT);

        ChatMessage result = chatController.sendMessage(input, principal);

        assertThat(result.sender()).isEqualTo("testUser");
        assertThat(result.content()).isEqualTo("Hello");
        assertThat(result.timestamp()).isNotNull();
    }

    @Test
    void sendPrivateMessage_shouldSendToRecipient() {
        Principal principal = () -> "sender";
        PrivateMessage message = new PrivateMessage(null, "recipient", "Hello", null);

        chatController.sendPrivateMessage(message, principal);

        verify(messagingTemplate).convertAndSendToUser(
            eq("recipient"),
            eq("/queue/private"),
            argThat(msg -> ((PrivateMessage) msg).content().equals("Hello"))
        );
    }
}
```
