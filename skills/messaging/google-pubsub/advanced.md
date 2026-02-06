# Google Cloud Pub/Sub Advanced Patterns

## Java Producer (google-cloud-pubsub)

```java
@Configuration
public class PubSubConfig {
    @Bean
    public Publisher orderPublisher() throws IOException {
        return Publisher.newBuilder(TopicName.of("my-project", "orders"))
            .setBatchingSettings(BatchingSettings.newBuilder()
                .setElementCountThreshold(100L)
                .setDelayThreshold(Duration.ofMillis(10))
                .build())
            .setEnableMessageOrdering(true)
            .build();
    }
}

@Service
public class OrderProducer {
    @Autowired
    private Publisher publisher;

    public void sendOrder(Order order) throws Exception {
        PubsubMessage message = PubsubMessage.newBuilder()
            .setData(ByteString.copyFrom(objectMapper.writeValueAsBytes(order)))
            .putAttributes("correlation-id", UUID.randomUUID().toString())
            .putAttributes("order-type", order.getType())
            .setOrderingKey(order.getCustomerId())
            .build();

        ApiFuture<String> future = publisher.publish(message);

        ApiFutures.addCallback(future, new ApiFutureCallback<String>() {
            @Override
            public void onSuccess(String messageId) {
                log.info("Published: {}", messageId);
            }

            @Override
            public void onFailure(Throwable t) {
                log.error("Publish failed", t);
            }
        }, MoreExecutors.directExecutor());
    }

    @PreDestroy
    public void shutdown() {
        publisher.shutdown();
    }
}
```

---

## Python Producer (google-cloud-pubsub)

```python
from google.cloud import pubsub_v1
from concurrent import futures
import json

publisher = pubsub_v1.PublisherClient(
    batch_settings=pubsub_v1.types.BatchSettings(
        max_messages=100,
        max_latency=0.01,  # 10ms
    )
)

topic_path = publisher.topic_path('my-project', 'orders')

def callback(future):
    try:
        message_id = future.result()
        print(f"Published: {message_id}")
    except Exception as e:
        print(f"Failed: {e}")

# Publish message
data = json.dumps(order).encode('utf-8')
future = publisher.publish(
    topic_path,
    data,
    correlation_id=correlation_id,
    order_type=order['type']
)
future.add_done_callback(callback)

# Wait for all publishes
futures.wait([future], return_when=futures.ALL_COMPLETED)
```

---

## Go Producer (cloud.google.com/go/pubsub)

```go
package main

import (
    "context"
    "encoding/json"
    "cloud.google.com/go/pubsub"
)

func main() {
    ctx := context.Background()
    client, _ := pubsub.NewClient(ctx, "my-project")
    defer client.Close()

    topic := client.Topic("orders")
    topic.PublishSettings.CountThreshold = 100
    topic.PublishSettings.DelayThreshold = 10 * time.Millisecond

    body, _ := json.Marshal(order)

    result := topic.Publish(ctx, &pubsub.Message{
        Data: body,
        Attributes: map[string]string{
            "correlation-id": correlationID,
            "order-type":     order.Type,
        },
        OrderingKey: order.CustomerID,
    })

    id, err := result.Get(ctx)
    if err != nil {
        log.Printf("Publish failed: %v", err)
    } else {
        log.Printf("Published: %s", id)
    }
}
```

---

## Java Consumer (Spring Cloud GCP)

```java
@Configuration
public class PubSubSubscriberConfig {
    @Bean
    public Subscriber orderSubscriber(
            @Qualifier("orderMessageReceiver") MessageReceiver receiver) throws IOException {

        return Subscriber.newBuilder(
                SubscriptionName.of("my-project", "order-processor"),
                receiver)
            .setFlowControlSettings(FlowControlSettings.newBuilder()
                .setMaxOutstandingElementCount(100L)
                .build())
            .setMaxAckExtensionPeriod(Duration.ofMinutes(10))
            .build();
    }

    @Bean
    public MessageReceiver orderMessageReceiver() {
        return (message, consumer) -> {
            try {
                Order order = objectMapper.readValue(
                    message.getData().toByteArray(), Order.class);
                String correlationId = message.getAttributesMap().get("correlation-id");

                processOrder(order);
                consumer.ack();
            } catch (Exception e) {
                log.error("Processing failed", e);
                consumer.nack();
            }
        };
    }
}

@Service
public class OrderConsumer {
    @Autowired
    private Subscriber subscriber;

    @PostConstruct
    public void start() {
        subscriber.startAsync().awaitRunning();
    }

    @PreDestroy
    public void stop() {
        subscriber.stopAsync().awaitTerminated();
    }
}

// Spring Cloud GCP (simplified)
@Service
public class SpringOrderConsumer {
    @PubSubListener(subscription = "order-processor")
    public void consume(
            @Payload Order order,
            @Header("correlation-id") String correlationId,
            AcknowledgeHandler ack) {

        try {
            processOrder(order);
            ack.ack();
        } catch (Exception e) {
            ack.nack();
        }
    }
}
```

---

## Python Consumer (Pull Subscription)

```python
from google.cloud import pubsub_v1

subscriber = pubsub_v1.SubscriberClient()
subscription_path = subscriber.subscription_path('my-project', 'order-processor')

def callback(message):
    try:
        order = json.loads(message.data.decode('utf-8'))
        correlation_id = message.attributes.get('correlation-id')

        process_order(order)
        message.ack()
    except Exception as e:
        print(f"Processing failed: {e}")
        message.nack()

flow_control = pubsub_v1.types.FlowControl(max_messages=100)

streaming_pull_future = subscriber.subscribe(
    subscription_path,
    callback=callback,
    flow_control=flow_control
)

try:
    streaming_pull_future.result()
except KeyboardInterrupt:
    streaming_pull_future.cancel()
    streaming_pull_future.result()
```

---

## Push Subscription (Cloud Run)

```typescript
// Cloud Run handler
import express from 'express';

const app = express();
app.use(express.json());

app.post('/pubsub', async (req, res) => {
  try {
    const message = req.body.message;
    const order = JSON.parse(Buffer.from(message.data, 'base64').toString());
    const correlationId = message.attributes['correlation-id'];

    await processOrder(order);

    res.status(200).send('OK'); // Ack
  } catch (error) {
    console.error('Processing failed:', error);
    res.status(500).send('Error'); // Nack - will be retried
  }
});

app.listen(8080);
```

```bash
# Create push subscription
gcloud pubsub subscriptions create order-processor-push \
  --topic=orders \
  --push-endpoint=https://my-service-xyz.run.app/pubsub \
  --ack-deadline=60
```

---

## Dead Letter Topics (Terraform)

```hcl
resource "google_pubsub_topic" "orders_dlq" {
  name = "orders-dlq"
}

resource "google_pubsub_subscription" "order_processor" {
  name  = "order-processor"
  topic = google_pubsub_topic.orders.name

  ack_deadline_seconds = 30

  dead_letter_policy {
    dead_letter_topic     = google_pubsub_topic.orders_dlq.id
    max_delivery_attempts = 5
  }

  retry_policy {
    minimum_backoff = "10s"
    maximum_backoff = "600s"
  }
}
```

---

## Security Configuration (Terraform)

```hcl
# IAM
resource "google_pubsub_topic_iam_member" "publisher" {
  topic  = google_pubsub_topic.orders.name
  role   = "roles/pubsub.publisher"
  member = "serviceAccount:publisher@my-project.iam.gserviceaccount.com"
}

resource "google_pubsub_subscription_iam_member" "subscriber" {
  subscription = google_pubsub_subscription.order_processor.name
  role         = "roles/pubsub.subscriber"
  member       = "serviceAccount:consumer@my-project.iam.gserviceaccount.com"
}

# VPC Service Controls
resource "google_access_context_manager_service_perimeter" "pubsub" {
  parent = "accessPolicies/${var.access_policy}"
  name   = "pubsub-perimeter"
  title  = "Pub/Sub Perimeter"

  status {
    restricted_services = ["pubsub.googleapis.com"]
    resources           = ["projects/${var.project_number}"]
  }
}
```

---

## Monitoring Alerts (Terraform)

```hcl
resource "google_monitoring_alert_policy" "unacked_messages" {
  display_name = "Pub/Sub Unacked Messages"

  conditions {
    display_name = "Unacked messages > 10000"
    condition_threshold {
      filter          = "resource.type=\"pubsub_subscription\" AND metric.type=\"pubsub.googleapis.com/subscription/num_undelivered_messages\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = 10000
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]
}

resource "google_monitoring_alert_policy" "oldest_unacked" {
  display_name = "Pub/Sub Message Age"

  conditions {
    display_name = "Oldest unacked > 1 hour"
    condition_threshold {
      filter          = "resource.type=\"pubsub_subscription\" AND metric.type=\"pubsub.googleapis.com/subscription/oldest_unacked_message_age\""
      duration        = "60s"
      comparison      = "COMPARISON_GT"
      threshold_value = 3600
    }
  }
}
```
