---
name: serverless
description: |
  Serverless computing patterns. AWS Lambda, Azure Functions, GCP Cloud Functions.
  Deployment frameworks: Serverless Framework, AWS SAM, SST. Cold starts,
  event sources, and production optimization.

  USE WHEN: user mentions "serverless", "Lambda", "cloud function", "Azure Functions",
  "SAM", "SST", "Serverless Framework", "cold start", "FaaS"

  DO NOT USE FOR: container orchestration - use `kubernetes` or `docker`;
  always-on servers - use backend framework skills
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Serverless Computing

## AWS Lambda (Node.js)

```typescript
import { APIGatewayProxyHandlerV2 } from 'aws-lambda';

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const body = JSON.parse(event.body || '{}');

  // Initialize clients OUTSIDE handler (reused across warm invocations)
  const result = await processRequest(body);

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(result),
  };
};

// DB connections, SDK clients — init outside handler
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
```

### Common Event Sources

```typescript
// SQS handler
import { SQSHandler } from 'aws-lambda';
export const sqsHandler: SQSHandler = async (event) => {
  for (const record of event.Records) {
    const body = JSON.parse(record.body);
    await processMessage(body);
  }
  // Failed messages: use partial batch response
};

// Scheduled (cron)
import { ScheduledHandler } from 'aws-lambda';
export const cronHandler: ScheduledHandler = async () => {
  await dailyCleanup();
};
```

## SST (recommended framework for AWS)

```typescript
// sst.config.ts
export default $config({
  app(input) { return { name: 'my-app', home: 'aws' }; },
  async run() {
    const api = new sst.aws.ApiGatewayV2('Api');
    api.route('POST /orders', 'src/functions/orders.handler');

    const table = new sst.aws.Dynamo('Orders', {
      fields: { pk: 'string', sk: 'string' },
      primaryIndex: { hashKey: 'pk', rangeKey: 'sk' },
    });

    // Link resources (auto-grants IAM permissions)
    api.route('GET /orders/{id}', {
      handler: 'src/functions/get-order.handler',
      link: [table],
    });
  },
});
```

## Serverless Framework

```yaml
# serverless.yml
service: my-service
provider:
  name: aws
  runtime: nodejs20.x
  environment:
    TABLE_NAME: !Ref OrdersTable

functions:
  createOrder:
    handler: src/handlers/orders.create
    events:
      - httpApi: 'POST /orders'
  processQueue:
    handler: src/handlers/queue.process
    events:
      - sqs:
          arn: !GetAtt OrderQueue.Arn
          batchSize: 10

resources:
  Resources:
    OrdersTable:
      Type: AWS::DynamoDB::Table
      Properties:
        TableName: ${self:service}-orders
        BillingMode: PAY_PER_REQUEST
        AttributeDefinitions:
          - { AttributeName: pk, AttributeType: S }
        KeySchema:
          - { AttributeName: pk, KeyType: HASH }
```

## Cold Start Optimization

| Technique | Impact |
|-----------|--------|
| Minimize bundle size (tree-shake, no large SDKs) | High |
| Initialize clients outside handler | High |
| Use ARM64 (`arm64` architecture) | Medium |
| Provisioned concurrency for critical paths | High (costs more) |
| Avoid VPC unless required | Medium |

```typescript
// Bundle optimization: import only what you need
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'; // Not all of aws-sdk
```

## Anti-Patterns

| Anti-Pattern | Fix |
|--------------|-----|
| Init DB/SDK inside handler | Move to module scope (reused across warm calls) |
| Monolithic function (does everything) | One function per concern |
| No timeout configuration | Set function timeout (default 3s is often too low) |
| Large deployment package | Tree-shake, exclude dev deps, use layers |
| Synchronous chaining (Lambda → Lambda) | Use SQS/SNS/Step Functions |
| No dead letter queue | Configure DLQ for async invocations |

## Production Checklist

- [ ] Timeout configured per function
- [ ] Dead letter queue for async events
- [ ] CloudWatch alarms on errors and throttles
- [ ] Structured logging (JSON format)
- [ ] X-Ray tracing enabled
- [ ] Minimum IAM permissions per function
- [ ] Environment variables for config (not hardcoded)
- [ ] Provisioned concurrency for latency-critical functions
