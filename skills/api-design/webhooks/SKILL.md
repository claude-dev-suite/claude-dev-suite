---
name: webhooks
description: |
  Webhook patterns for sending and receiving. Signature verification, retry
  logic, idempotency, payload design, and webhook infrastructure. Covers
  Stripe, GitHub, Slack webhook consumption and custom webhook dispatch.

  USE WHEN: user mentions "webhook", "webhook endpoint", "webhook signature",
  "event callback", "HTTP callback", "webhook retry", "webhook dispatch"

  DO NOT USE FOR: WebSocket real-time - use `socket-io` or `sse`;
  message queues - use messaging skills
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Webhooks

## Receiving Webhooks

### Express (with signature verification)

```typescript
app.post('/webhooks/stripe', express.raw({ type: 'application/json' }), (req, res) => {
  const signature = req.headers['stripe-signature']!;
  const event = stripe.webhooks.constructEvent(req.body, signature, WEBHOOK_SECRET);

  // Idempotency: check if already processed
  const existing = await db.webhookEvent.findUnique({ where: { eventId: event.id } });
  if (existing) return res.json({ received: true });

  // Process
  switch (event.type) {
    case 'checkout.session.completed':
      await fulfillOrder(event.data.object);
      break;
  }

  // Mark as processed
  await db.webhookEvent.create({ data: { eventId: event.id, type: event.type } });
  res.json({ received: true });
});
```

### Generic HMAC Verification

```typescript
import { createHmac, timingSafeEqual } from 'crypto';

function verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
  const expected = createHmac('sha256', secret).update(payload).digest('hex');
  return timingSafeEqual(Buffer.from(signature), Buffer.from(`sha256=${expected}`));
}

app.post('/webhooks/github', express.raw({ type: '*/*' }), (req, res) => {
  const sig = req.headers['x-hub-signature-256'] as string;
  if (!verifyWebhookSignature(req.body.toString(), sig, GITHUB_SECRET)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  // Process event...
  res.status(200).json({ received: true });
});
```

## Sending Webhooks

```typescript
class WebhookDispatcher {
  async dispatch(url: string, event: WebhookEvent, secret: string) {
    const payload = JSON.stringify(event);
    const signature = createHmac('sha256', secret).update(payload).digest('hex');

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': `sha256=${signature}`,
        'X-Webhook-Id': event.id,
        'X-Webhook-Timestamp': new Date().toISOString(),
      },
      body: payload,
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) throw new WebhookDeliveryError(response.status);
  }
}
```

### Retry with Exponential Backoff

```typescript
// Use job queue for reliable delivery
await webhookQueue.add('deliver', {
  url: subscription.url,
  event: { id: uuid(), type: 'order.created', data: order },
  secret: subscription.secret,
}, {
  attempts: 5,
  backoff: { type: 'exponential', delay: 60000 }, // 1m, 2m, 4m, 8m, 16m
});
```

## Webhook Event Schema

```typescript
interface WebhookEvent {
  id: string;           // Unique event ID (for idempotency)
  type: string;         // 'order.created', 'user.deleted'
  timestamp: string;    // ISO 8601
  data: unknown;        // Event payload
  version: string;      // API version
}
```

## Anti-Patterns

| Anti-Pattern | Fix |
|--------------|-----|
| No signature verification | Always verify HMAC signature |
| Processing before responding 200 | Respond 200 immediately, process async |
| No idempotency check | Store processed event IDs |
| Using parsed body for verification | Use raw body for signature check |
| No retry on send failures | Use job queue with exponential backoff |
| Synchronous webhook delivery | Dispatch via background job queue |

## Production Checklist

- [ ] HMAC signature verification on receive
- [ ] Raw body parsing (not JSON-parsed) for signature
- [ ] Idempotency: deduplicate by event ID
- [ ] Respond 200 before processing
- [ ] Retry with exponential backoff on send
- [ ] Dead letter queue for failed deliveries
- [ ] Webhook event log for debugging
