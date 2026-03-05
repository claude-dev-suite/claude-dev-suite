---
name: gcp
description: |
  Google Cloud Platform SDK integration. Cloud Functions, Firestore, Cloud Storage,
  Pub/Sub, BigQuery, and Cloud Run. Node.js and Python client libraries.

  USE WHEN: user mentions "GCP", "Google Cloud", "Cloud Functions", "Firestore",
  "Cloud Storage", "Pub/Sub", "BigQuery", "Cloud Run", "Firebase"

  DO NOT USE FOR: AWS services - use `aws`;
  Azure services - use `azure`; Firebase Auth - use auth skills
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Google Cloud Platform

## Cloud Functions

```typescript
import { HttpFunction, CloudEvent } from '@google-cloud/functions-framework';

// HTTP trigger
export const getProduct: HttpFunction = async (req, res) => {
  const product = await getProductById(req.query.id as string);
  res.json(product);
};

// Pub/Sub trigger
export const processOrder = async (cloudEvent: CloudEvent<{ message: { data: string } }>) => {
  const data = JSON.parse(Buffer.from(cloudEvent.data!.message.data, 'base64').toString());
  await handleOrder(data);
};

// Cloud Storage trigger
export const onFileUpload = async (cloudEvent: CloudEvent<{ bucket: string; name: string }>) => {
  const { bucket, name } = cloudEvent.data!;
  await processUploadedFile(bucket, name);
};
```

## Firestore

```typescript
import { Firestore, FieldValue } from '@google-cloud/firestore';

const db = new Firestore();

// Create/Update
await db.collection('users').doc(userId).set({
  name, email, createdAt: FieldValue.serverTimestamp(),
});

// Read
const doc = await db.collection('users').doc(userId).get();
const user = doc.data();

// Query
const snapshot = await db.collection('orders')
  .where('userId', '==', userId)
  .where('status', '==', 'active')
  .orderBy('createdAt', 'desc')
  .limit(10)
  .get();

const orders = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

// Real-time listener
db.collection('messages')
  .where('roomId', '==', roomId)
  .onSnapshot((snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') handleNewMessage(change.doc.data());
    });
  });
```

## Cloud Storage

```typescript
import { Storage } from '@google-cloud/storage';

const storage = new Storage();
const bucket = storage.bucket(process.env.GCS_BUCKET!);

// Upload
await bucket.file(`uploads/${filename}`).save(buffer, {
  metadata: { contentType },
});

// Download
const [content] = await bucket.file(path).download();

// Signed URL
const [url] = await bucket.file(path).getSignedUrl({
  version: 'v4',
  action: 'read',
  expires: Date.now() + 3600 * 1000,
});
```

## Pub/Sub

```typescript
import { PubSub } from '@google-cloud/pubsub';

const pubsub = new PubSub();

// Publish
const topic = pubsub.topic('order-events');
await topic.publishMessage({
  json: { orderId: '123', status: 'completed' },
  attributes: { eventType: 'ORDER_COMPLETED' },
});

// Subscribe
const subscription = pubsub.subscription('order-processor');
subscription.on('message', async (message) => {
  const data = JSON.parse(message.data.toString());
  await processOrder(data);
  message.ack();
});
```

## BigQuery

```typescript
import { BigQuery } from '@google-cloud/bigquery';

const bq = new BigQuery();

const [rows] = await bq.query({
  query: `SELECT product_id, SUM(quantity) as total
          FROM \`project.dataset.orders\`
          WHERE DATE(created_at) = @date
          GROUP BY product_id
          ORDER BY total DESC
          LIMIT 10`,
  params: { date: '2026-03-05' },
});
```

## Authentication

```typescript
// Application Default Credentials (works everywhere)
// Local: gcloud auth application-default login
// GCE/Cloud Run/GKE: automatic via metadata server
// CI/CD: GOOGLE_APPLICATION_CREDENTIALS env var

import { GoogleAuth } from 'google-auth-library';
const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
```

## Anti-Patterns

| Anti-Pattern | Fix |
|--------------|-----|
| Service account key files in repo | Use Application Default Credentials |
| Not using composite indexes (Firestore) | Define indexes for multi-field queries |
| Synchronous Pub/Sub publish | Batch messages, use `topic.publishMessage` |
| Full table scans in BigQuery | Use partitioned/clustered tables |
| No IAM least privilege | Grant minimum required roles per service |

## Production Checklist

- [ ] Application Default Credentials (no key files)
- [ ] IAM roles with least privilege
- [ ] VPC Service Controls for sensitive data
- [ ] Cloud Monitoring and alerting configured
- [ ] Resource labels for cost tracking
- [ ] Firestore composite indexes deployed
