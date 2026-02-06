# Amazon SQS Advanced Patterns

## Producer Patterns

### Java (AWS SDK v2)

```java
@Configuration
public class SqsConfig {
    @Bean
    public SqsClient sqsClient() {
        return SqsClient.builder()
            .region(Region.US_EAST_1)
            .credentialsProvider(DefaultCredentialsProvider.create())
            .build();
    }
}

@Service
public class OrderProducer {
    @Autowired
    private SqsClient sqsClient;

    @Value("${sqs.queue.url}")
    private String queueUrl;

    public void sendOrder(Order order) {
        sqsClient.sendMessage(SendMessageRequest.builder()
            .queueUrl(queueUrl)
            .messageBody(objectMapper.writeValueAsString(order))
            .messageAttributes(Map.of(
                "OrderType", MessageAttributeValue.builder()
                    .dataType("String")
                    .stringValue(order.getType())
                    .build(),
                "CorrelationId", MessageAttributeValue.builder()
                    .dataType("String")
                    .stringValue(UUID.randomUUID().toString())
                    .build()
            ))
            .build());
    }

    public void sendBatch(List<Order> orders) {
        List<SendMessageBatchRequestEntry> entries = IntStream.range(0, orders.size())
            .mapToObj(i -> SendMessageBatchRequestEntry.builder()
                .id("msg-" + i)
                .messageBody(objectMapper.writeValueAsString(orders.get(i)))
                .build())
            .toList();

        sqsClient.sendMessageBatch(SendMessageBatchRequest.builder()
            .queueUrl(queueUrl)
            .entries(entries)
            .build());
    }
}
```

### Python (boto3)

```python
import boto3
import json

sqs = boto3.client('sqs', region_name='us-east-1')
queue_url = 'https://sqs.us-east-1.amazonaws.com/123456789/orders-queue'

# Send message
response = sqs.send_message(
    QueueUrl=queue_url,
    MessageBody=json.dumps(order),
    MessageAttributes={
        'OrderType': {
            'DataType': 'String',
            'StringValue': order['type']
        },
        'CorrelationId': {
            'DataType': 'String',
            'StringValue': correlation_id
        }
    },
    DelaySeconds=0
)

# Batch send
entries = [
    {
        'Id': f'msg-{i}',
        'MessageBody': json.dumps(order),
        'MessageAttributes': {
            'OrderType': {'DataType': 'String', 'StringValue': order['type']}
        }
    }
    for i, order in enumerate(orders)
]

response = sqs.send_message_batch(
    QueueUrl=queue_url,
    Entries=entries
)
```

### Go (AWS SDK v2)

```go
package main

import (
    "context"
    "encoding/json"
    "github.com/aws/aws-sdk-go-v2/aws"
    "github.com/aws/aws-sdk-go-v2/config"
    "github.com/aws/aws-sdk-go-v2/service/sqs"
    "github.com/aws/aws-sdk-go-v2/service/sqs/types"
)

func main() {
    cfg, _ := config.LoadDefaultConfig(context.TODO(), config.WithRegion("us-east-1"))
    client := sqs.NewFromConfig(cfg)

    queueUrl := "https://sqs.us-east-1.amazonaws.com/123456789/orders-queue"

    body, _ := json.Marshal(order)

    _, err := client.SendMessage(context.TODO(), &sqs.SendMessageInput{
        QueueUrl:    aws.String(queueUrl),
        MessageBody: aws.String(string(body)),
        MessageAttributes: map[string]types.MessageAttributeValue{
            "OrderType": {
                DataType:    aws.String("String"),
                StringValue: aws.String(order.Type),
            },
        },
    })
}
```

---

## Consumer Patterns

### Java (Spring Cloud AWS)

```java
@Configuration
public class SqsListenerConfig {
    @Bean
    public SqsMessageListenerContainerFactory<Object> defaultSqsListenerContainerFactory() {
        return SqsMessageListenerContainerFactory.builder()
            .sqsAsyncClient(sqsAsyncClient())
            .configure(options -> options
                .maxConcurrentMessages(10)
                .maxMessagesPerPoll(10)
                .pollTimeout(Duration.ofSeconds(20))
            )
            .build();
    }
}

@Service
public class OrderConsumer {
    @SqsListener("orders-queue")
    public void consume(
            @Payload Order order,
            @Header("OrderType") String orderType,
            @Header("CorrelationId") String correlationId,
            Acknowledgement ack) {

        try {
            processOrder(order);
            ack.acknowledge();
        } catch (Exception e) {
            // Don't acknowledge - message returns to queue
            throw e;
        }
    }
}

// Manual polling
@Service
public class OrderPoller {
    @Autowired
    private SqsClient sqsClient;

    @Scheduled(fixedDelay = 100)
    public void poll() {
        ReceiveMessageResponse response = sqsClient.receiveMessage(
            ReceiveMessageRequest.builder()
                .queueUrl(queueUrl)
                .maxNumberOfMessages(10)
                .waitTimeSeconds(20)
                .visibilityTimeout(30)
                .messageAttributeNames("All")
                .build());

        for (Message message : response.messages()) {
            try {
                Order order = objectMapper.readValue(message.body(), Order.class);
                processOrder(order);

                sqsClient.deleteMessage(DeleteMessageRequest.builder()
                    .queueUrl(queueUrl)
                    .receiptHandle(message.receiptHandle())
                    .build());
            } catch (Exception e) {
                log.error("Failed to process message", e);
            }
        }
    }
}
```

### Python Consumer

```python
import boto3
import json

sqs = boto3.client('sqs', region_name='us-east-1')

def poll_messages():
    while True:
        response = sqs.receive_message(
            QueueUrl=queue_url,
            MaxNumberOfMessages=10,
            WaitTimeSeconds=20,
            VisibilityTimeout=30,
            MessageAttributeNames=['All'],
            AttributeNames=['All']
        )

        messages = response.get('Messages', [])

        for message in messages:
            try:
                order = json.loads(message['Body'])
                process_order(order)

                sqs.delete_message(
                    QueueUrl=queue_url,
                    ReceiptHandle=message['ReceiptHandle']
                )
            except Exception as e:
                print(f"Processing failed: {e}")
```

### Lambda Integration

```typescript
// Lambda handler
export const handler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  const batchItemFailures: SQSBatchItemFailure[] = [];

  for (const record of event.Records) {
    try {
      const order = JSON.parse(record.body);
      await processOrder(order);
    } catch (error) {
      // Report partial batch failure
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures };
};
```

```yaml
# serverless.yml
functions:
  orderProcessor:
    handler: handler.handler
    events:
      - sqs:
          arn: !GetAtt OrdersQueue.Arn
          batchSize: 10
          functionResponseType: ReportBatchItemFailures
```

---

## Production Security

### IAM Policies (Terraform)

```hcl
# IAM Policy
resource "aws_iam_policy" "sqs_producer" {
  name = "sqs-producer-policy"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "sqs:SendMessage",
          "sqs:SendMessageBatch"
        ]
        Resource = aws_sqs_queue.orders.arn
      }
    ]
  })
}

resource "aws_iam_policy" "sqs_consumer" {
  name = "sqs-consumer-policy"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:DeleteMessageBatch",
          "sqs:GetQueueAttributes",
          "sqs:ChangeMessageVisibility"
        ]
        Resource = aws_sqs_queue.orders.arn
      }
    ]
  })
}

# Queue policy (resource-based)
resource "aws_sqs_queue_policy" "orders" {
  queue_url = aws_sqs_queue.orders.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = { AWS = "arn:aws:iam::123456789:role/producer-role" }
        Action = "sqs:SendMessage"
        Resource = aws_sqs_queue.orders.arn
      }
    ]
  })
}

# Encryption
resource "aws_sqs_queue" "orders_encrypted" {
  name = "orders-queue"
  sqs_managed_sse_enabled = true
  # Or use CMK
  # kms_master_key_id = aws_kms_key.sqs.arn
}
```

---

## Monitoring (CloudWatch)

```hcl
# CloudWatch Alarms
resource "aws_cloudwatch_metric_alarm" "queue_depth" {
  alarm_name          = "sqs-orders-queue-depth"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 300
  statistic           = "Average"
  threshold           = 10000
  dimensions = {
    QueueName = aws_sqs_queue.orders.name
  }
}

resource "aws_cloudwatch_metric_alarm" "dlq_messages" {
  alarm_name          = "sqs-orders-dlq-messages"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 60
  statistic           = "Sum"
  threshold           = 0
  dimensions = {
    QueueName = aws_sqs_queue.orders_dlq.name
  }
}
```

### Key Metrics

| Metric | Alert Threshold |
|--------|-----------------|
| ApproximateNumberOfMessagesVisible | > 10000 |
| ApproximateAgeOfOldestMessage | > 3600s |
| NumberOfMessagesReceived | Anomaly |
| NumberOfMessagesSent | Anomaly |
| ApproximateNumberOfMessagesNotVisible | > expected |

---

## Dead Letter Queue (Terraform)

```hcl
resource "aws_sqs_queue" "orders_dlq" {
  name = "orders-dlq"
  message_retention_seconds = 1209600
}

resource "aws_sqs_queue" "orders" {
  name = "orders-queue"
  visibility_timeout_seconds = 30
  message_retention_seconds = 1209600

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.orders_dlq.arn
    maxReceiveCount     = 3
  })
}
```
