# Azure Service Bus Advanced Patterns

## Java Producer (azure-messaging-servicebus)

```java
@Configuration
public class ServiceBusConfig {
    @Value("${azure.servicebus.connection-string}")
    private String connectionString;

    @Bean
    public ServiceBusSenderClient orderSender() {
        return new ServiceBusClientBuilder()
            .connectionString(connectionString)
            .sender()
            .queueName("orders")
            .buildClient();
    }

    @Bean
    public ServiceBusSenderClient eventSender() {
        return new ServiceBusClientBuilder()
            .connectionString(connectionString)
            .sender()
            .topicName("events")
            .buildClient();
    }
}

@Service
public class OrderProducer {
    @Autowired
    private ServiceBusSenderClient sender;

    public void sendOrder(Order order) {
        ServiceBusMessage message = new ServiceBusMessage(
            objectMapper.writeValueAsBytes(order))
            .setMessageId(order.getId())
            .setCorrelationId(UUID.randomUUID().toString())
            .setContentType("application/json");

        message.getApplicationProperties().put("orderType", order.getType());
        message.getApplicationProperties().put("priority", order.getPriority());

        sender.sendMessage(message);
    }

    public void sendBatch(List<Order> orders) {
        ServiceBusMessageBatch batch = sender.createMessageBatch();

        for (Order order : orders) {
            ServiceBusMessage message = new ServiceBusMessage(
                objectMapper.writeValueAsBytes(order));

            if (!batch.tryAddMessage(message)) {
                sender.sendMessages(batch);
                batch = sender.createMessageBatch();
                batch.tryAddMessage(message);
            }
        }

        if (batch.getCount() > 0) {
            sender.sendMessages(batch);
        }
    }
}
```

---

## Python Producer (azure-servicebus)

```python
from azure.servicebus import ServiceBusClient, ServiceBusMessage
import json

client = ServiceBusClient.from_connection_string(connection_string)

with client:
    sender = client.get_queue_sender(queue_name="orders")

    with sender:
        # Single message
        message = ServiceBusMessage(
            json.dumps(order),
            content_type="application/json",
            message_id=order["id"],
            correlation_id=correlation_id,
            application_properties={
                "orderType": order["type"],
                "priority": order["priority"]
            }
        )
        sender.send_messages(message)

        # Batch
        batch = sender.create_message_batch()
        for order in orders:
            try:
                batch.add_message(ServiceBusMessage(json.dumps(order)))
            except ValueError:
                sender.send_messages(batch)
                batch = sender.create_message_batch()
                batch.add_message(ServiceBusMessage(json.dumps(order)))

        sender.send_messages(batch)
```

---

## C# (.NET) Producer

```csharp
public class OrderProducer
{
    private readonly ServiceBusSender _sender;

    public OrderProducer(ServiceBusClient client)
    {
        _sender = client.CreateSender("orders");
    }

    public async Task SendOrderAsync(Order order)
    {
        var message = new ServiceBusMessage(JsonSerializer.SerializeToUtf8Bytes(order))
        {
            MessageId = order.Id,
            CorrelationId = Guid.NewGuid().ToString(),
            ContentType = "application/json",
            ApplicationProperties =
            {
                ["orderType"] = order.Type,
                ["priority"] = order.Priority
            }
        };

        await _sender.SendMessageAsync(message);
    }

    public async Task SendBatchAsync(IEnumerable<Order> orders)
    {
        using var batch = await _sender.CreateMessageBatchAsync();

        foreach (var order in orders)
        {
            var message = new ServiceBusMessage(JsonSerializer.SerializeToUtf8Bytes(order));

            if (!batch.TryAddMessage(message))
            {
                await _sender.SendMessagesAsync(batch);
                batch = await _sender.CreateMessageBatchAsync();
                batch.TryAddMessage(message);
            }
        }

        await _sender.SendMessagesAsync(batch);
    }
}
```

---

## Java Processor Consumer

```java
@Configuration
public class ServiceBusListenerConfig {
    @Bean
    public ServiceBusProcessorClient orderProcessor(
            @Value("${azure.servicebus.connection-string}") String connectionString) {

        return new ServiceBusClientBuilder()
            .connectionString(connectionString)
            .processor()
            .queueName("orders")
            .receiveMode(ServiceBusReceiveMode.PEEK_LOCK)
            .maxAutoLockRenewDuration(Duration.ofMinutes(5))
            .processMessage(this::processMessage)
            .processError(this::processError)
            .buildProcessorClient();
    }

    private void processMessage(ServiceBusReceivedMessageContext context) {
        ServiceBusReceivedMessage message = context.getMessage();
        try {
            Order order = objectMapper.readValue(
                message.getBody().toBytes(), Order.class);
            processOrder(order);
            context.complete();
        } catch (Exception e) {
            if (message.getDeliveryCount() >= 3) {
                context.deadLetter(new DeadLetterOptions()
                    .setDeadLetterReason("MaxRetriesExceeded")
                    .setDeadLetterErrorDescription(e.getMessage()));
            } else {
                context.abandon();
            }
        }
    }

    private void processError(ServiceBusErrorContext context) {
        log.error("Error: {}", context.getException().getMessage());
    }
}

@Service
public class OrderConsumer {
    @Autowired
    private ServiceBusProcessorClient processor;

    @PostConstruct
    public void start() {
        processor.start();
    }

    @PreDestroy
    public void stop() {
        processor.close();
    }
}
```

---

## Session Consumer (Java)

```java
@Service
public class SessionOrderConsumer {
    public void processSession(String sessionId) {
        ServiceBusSessionReceiverClient receiver = new ServiceBusClientBuilder()
            .connectionString(connectionString)
            .sessionReceiver()
            .queueName("orders")
            .receiveMode(ServiceBusReceiveMode.PEEK_LOCK)
            .buildClient();

        ServiceBusReceiverClient sessionReceiver = receiver.acceptSession(sessionId);

        IterableStream<ServiceBusReceivedMessage> messages =
            sessionReceiver.receiveMessages(10, Duration.ofSeconds(30));

        for (ServiceBusReceivedMessage message : messages) {
            processMessage(message);
            sessionReceiver.complete(message);
        }
    }
}
```

---

## Python Consumer

```python
from azure.servicebus import ServiceBusClient

client = ServiceBusClient.from_connection_string(connection_string)

with client:
    receiver = client.get_queue_receiver(
        queue_name="orders",
        max_wait_time=30
    )

    with receiver:
        for message in receiver:
            try:
                order = json.loads(str(message))
                process_order(order)
                receiver.complete_message(message)
            except Exception as e:
                if message.delivery_count >= 3:
                    receiver.dead_letter_message(
                        message,
                        reason="MaxRetriesExceeded",
                        error_description=str(e)
                    )
                else:
                    receiver.abandon_message(message)
```

---

## Production Security (Terraform)

```hcl
# RBAC
resource "azurerm_role_assignment" "sender" {
  scope                = azurerm_servicebus_queue.orders.id
  role_definition_name = "Azure Service Bus Data Sender"
  principal_id         = azurerm_user_assigned_identity.sender.principal_id
}

resource "azurerm_role_assignment" "receiver" {
  scope                = azurerm_servicebus_queue.orders.id
  role_definition_name = "Azure Service Bus Data Receiver"
  principal_id         = azurerm_user_assigned_identity.receiver.principal_id
}

# Private endpoint
resource "azurerm_private_endpoint" "servicebus" {
  name                = "servicebus-pe"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  subnet_id           = azurerm_subnet.private.id

  private_service_connection {
    name                           = "servicebus-connection"
    private_connection_resource_id = azurerm_servicebus_namespace.main.id
    subresource_names              = ["namespace"]
    is_manual_connection           = false
  }
}
```

---

## Monitoring Alerts (Terraform)

```hcl
resource "azurerm_monitor_metric_alert" "dead_letter" {
  name                = "servicebus-deadletter-alert"
  resource_group_name = azurerm_resource_group.main.name
  scopes              = [azurerm_servicebus_queue.orders.id]

  criteria {
    metric_namespace = "Microsoft.ServiceBus/namespaces"
    metric_name      = "DeadletteredMessages"
    aggregation      = "Total"
    operator         = "GreaterThan"
    threshold        = 0
  }
}

resource "azurerm_monitor_metric_alert" "queue_depth" {
  name                = "servicebus-queue-depth-alert"
  resource_group_name = azurerm_resource_group.main.name
  scopes              = [azurerm_servicebus_namespace.main.id]

  criteria {
    metric_namespace = "Microsoft.ServiceBus/namespaces"
    metric_name      = "ActiveMessages"
    aggregation      = "Average"
    operator         = "GreaterThan"
    threshold        = 10000
  }
}
```
