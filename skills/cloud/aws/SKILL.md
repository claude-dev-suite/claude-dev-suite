---
name: aws
description: |
  AWS SDK integration for Node.js (v3) and Python (boto3). Core services:
  S3, Lambda, DynamoDB, SQS, SNS, CloudWatch, IAM. Configuration, credentials,
  and production patterns.

  USE WHEN: user mentions "AWS", "Amazon Web Services", "Lambda", "DynamoDB",
  "SQS", "SNS", "CloudWatch", "IAM", "boto3", "aws-sdk"

  DO NOT USE FOR: S3 file operations - use `cloud-storage`;
  SQS messaging patterns - use `sqs`; Azure/GCP - use respective skills
allowed-tools: Read, Grep, Glob, Write, Edit
---
# AWS SDK Integration

## Node.js (SDK v3)

### Client Setup
```typescript
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({ region: process.env.AWS_REGION });
const ddb = DynamoDBDocumentClient.from(client);
```

### DynamoDB
```typescript
// Put item
await ddb.send(new PutCommand({
  TableName: 'Users',
  Item: { pk: `USER#${id}`, sk: 'PROFILE', name, email, createdAt: Date.now() },
  ConditionExpression: 'attribute_not_exists(pk)', // Prevent overwrite
}));

// Get item
const { Item } = await ddb.send(new GetCommand({
  TableName: 'Users', Key: { pk: `USER#${id}`, sk: 'PROFILE' },
}));

// Query
const { Items } = await ddb.send(new QueryCommand({
  TableName: 'Orders',
  KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
  ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':prefix': 'ORDER#' },
}));
```

### Lambda Invocation
```typescript
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

const lambda = new LambdaClient({});
const { Payload } = await lambda.send(new InvokeCommand({
  FunctionName: 'processOrder',
  InvocationType: 'Event', // async ('RequestResponse' for sync)
  Payload: JSON.stringify({ orderId }),
}));
```

### SNS
```typescript
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';

const sns = new SNSClient({});
await sns.send(new PublishCommand({
  TopicArn: process.env.ORDER_TOPIC_ARN,
  Message: JSON.stringify({ orderId, status: 'completed' }),
  MessageAttributes: {
    eventType: { DataType: 'String', StringValue: 'ORDER_COMPLETED' },
  },
}));
```

### CloudWatch Metrics
```typescript
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';

const cw = new CloudWatchClient({});
await cw.send(new PutMetricDataCommand({
  Namespace: 'MyApp',
  MetricData: [{
    MetricName: 'OrderProcessingTime',
    Value: durationMs,
    Unit: 'Milliseconds',
    Dimensions: [{ Name: 'Service', Value: 'OrderProcessor' }],
  }],
}));
```

## Python (boto3)

```python
import boto3

# DynamoDB
dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table('Users')
table.put_item(Item={'pk': f'USER#{id}', 'sk': 'PROFILE', 'name': name})
response = table.get_item(Key={'pk': f'USER#{id}', 'sk': 'PROFILE'})

# Lambda
lambda_client = boto3.client('lambda')
lambda_client.invoke(FunctionName='processOrder',
    InvocationType='Event', Payload=json.dumps({'orderId': order_id}))

# SNS
sns = boto3.client('sns')
sns.publish(TopicArn=topic_arn, Message=json.dumps(payload))
```

## Credentials (never hardcode)

| Environment | Method |
|-------------|--------|
| Local dev | `~/.aws/credentials` or `AWS_PROFILE` |
| EC2/ECS | Instance/task IAM role (automatic) |
| Lambda | Execution role (automatic) |
| CI/CD | `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` env vars |

## Anti-Patterns

| Anti-Pattern | Fix |
|--------------|-----|
| Hardcoded credentials | Use IAM roles, env vars, or credential chain |
| Single-region architecture | Use multi-AZ, consider multi-region for DR |
| No retries on SDK calls | SDK v3 retries automatically — configure `maxAttempts` |
| Scan instead of Query (DynamoDB) | Design keys for Query access patterns |
| Synchronous Lambda calls in request path | Use async invocation or SQS |

## Production Checklist

- [ ] IAM roles with least privilege
- [ ] No hardcoded credentials
- [ ] SDK retry configuration (`maxAttempts`)
- [ ] CloudWatch alarms on error metrics
- [ ] VPC endpoints for S3/DynamoDB (saves NAT costs)
- [ ] Resource tagging for cost allocation
