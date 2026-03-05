---
name: azure
description: |
  Azure cloud services SDK integration. Azure Functions, Cosmos DB, Blob Storage,
  Service Bus, Azure AD (Entra ID), and Key Vault. Node.js and .NET SDKs.

  USE WHEN: user mentions "Azure", "Azure Functions", "Cosmos DB", "Blob Storage",
  "Service Bus", "Azure AD", "Entra ID", "Key Vault", "Azure SDK"

  DO NOT USE FOR: AWS services - use `aws`;
  GCP services - use `gcp`; Terraform for Azure - use `terraform`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Azure SDK Integration

## Azure Functions

```typescript
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';

app.http('getProduct', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'products/{id}',
  handler: async (req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const id = req.params.id;
    const product = await getProduct(id);
    return { status: 200, jsonBody: product };
  },
});

// Queue trigger
app.serviceBusQueue('processOrder', {
  connection: 'ServiceBusConnection',
  queueName: 'orders',
  handler: async (message: unknown, context: InvocationContext) => {
    const order = message as Order;
    await processOrder(order);
  },
});

// Timer trigger (cron)
app.timer('dailyCleanup', {
  schedule: '0 0 2 * * *',
  handler: async (timer, context) => {
    await cleanupExpiredSessions();
  },
});
```

## Cosmos DB

```typescript
import { CosmosClient } from '@azure/cosmos';

const client = new CosmosClient(process.env.COSMOS_CONNECTION_STRING!);
const container = client.database('mydb').container('products');

// Create
await container.items.create({ id: '123', name: 'Widget', price: 19.99, category: 'tools' });

// Read
const { resource } = await container.item('123', 'tools').read();

// Query
const { resources } = await container.items
  .query({
    query: 'SELECT * FROM c WHERE c.category = @cat AND c.price < @maxPrice',
    parameters: [
      { name: '@cat', value: 'tools' },
      { name: '@maxPrice', value: 50 },
    ],
  })
  .fetchAll();
```

## Blob Storage

```typescript
import { BlobServiceClient } from '@azure/storage-blob';

const blobService = BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION!);
const container = blobService.getContainerClient('uploads');

// Upload
const blockBlob = container.getBlockBlobClient(`files/${filename}`);
await blockBlob.uploadData(buffer, {
  blobHTTPHeaders: { blobContentType: contentType },
});

// Download
const downloadResponse = await blockBlob.download(0);
const content = await streamToBuffer(downloadResponse.readableStreamBody!);

// Generate SAS URL
import { generateBlobSASQueryParameters, BlobSASPermissions } from '@azure/storage-blob';
const sasUrl = blockBlob.generateSasUrl({
  permissions: BlobSASPermissions.parse('r'),
  expiresOn: new Date(Date.now() + 3600 * 1000),
});
```

## Service Bus

```typescript
import { ServiceBusClient } from '@azure/service-bus';

const sbClient = new ServiceBusClient(process.env.SERVICE_BUS_CONNECTION!);

// Send
const sender = sbClient.createSender('orders');
await sender.sendMessages({ body: { orderId: '123', status: 'created' } });

// Receive
const receiver = sbClient.createReceiver('orders');
const messages = await receiver.receiveMessages(10, { maxWaitTimeInMs: 5000 });
for (const msg of messages) {
  await processOrder(msg.body);
  await receiver.completeMessage(msg);
}
```

## Authentication (DefaultAzureCredential)

```typescript
import { DefaultAzureCredential } from '@azure/identity';

// Works in all environments: local dev, Azure VMs, App Service, AKS
const credential = new DefaultAzureCredential();

// Use with any Azure SDK client
const blobService = new BlobServiceClient(
  `https://${accountName}.blob.core.windows.net`,
  credential,
);
```

## Anti-Patterns

| Anti-Pattern | Fix |
|--------------|-----|
| Connection strings in code | Use `DefaultAzureCredential` + managed identity |
| Not using partition keys (Cosmos DB) | Design partition key for query patterns |
| Polling Service Bus | Use event-driven triggers or `receiveMessages` |
| No retry configuration | Azure SDKs retry automatically — configure `retryOptions` |
| Hardcoded resource names | Use environment variables or App Configuration |

## Production Checklist

- [ ] Managed identity for authentication (no secrets in config)
- [ ] DefaultAzureCredential for local + cloud parity
- [ ] Key Vault for secrets management
- [ ] Application Insights for monitoring
- [ ] Resource tagging for cost management
- [ ] Network security (VNet integration, private endpoints)
