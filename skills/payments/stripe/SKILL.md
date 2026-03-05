---
name: stripe
description: |
  Stripe payment processing. Covers Checkout Sessions, Payment Intents,
  Subscriptions, Webhooks, idempotency, and Stripe.js frontend integration.

  USE WHEN: user mentions "stripe", "payment", "checkout", "subscription billing",
  "payment intent", "payment gateway", "credit card", "invoice", "Stripe.js"

  DO NOT USE FOR: PayPal-only integration; cryptocurrency payments;
  accounting software
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Stripe Payment Processing

## Setup
```typescript
import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
```

## Checkout Session (simplest integration)

```typescript
app.post('/api/checkout', async (req, res) => {
  const session = await stripe.checkout.sessions.create({
    mode: 'payment', // or 'subscription'
    line_items: [{ price: req.body.priceId, quantity: 1 }],
    success_url: `${process.env.APP_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.APP_URL}/cancel`,
    metadata: { userId: req.user.id },
  });
  res.json({ url: session.url });
});
```

## Payment Intents (custom UI)

```typescript
// Server: create intent
app.post('/api/payment-intent', async (req, res) => {
  const intent = await stripe.paymentIntents.create({
    amount: Math.round(req.body.amount * 100), // cents
    currency: 'usd',
    automatic_payment_methods: { enabled: true },
    metadata: { orderId: req.body.orderId },
  }, { idempotencyKey: `order_${req.body.orderId}` });
  res.json({ clientSecret: intent.client_secret });
});
```

```tsx
// Client: React + Stripe.js
import { useStripe, useElements, PaymentElement } from '@stripe/react-stripe-js';

function CheckoutForm() {
  const stripe = useStripe();
  const elements = useElements();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await stripe!.confirmPayment({
      elements: elements!,
      confirmParams: { return_url: `${window.location.origin}/success` },
    });
    if (error) setError(error.message!);
  };

  return (
    <form onSubmit={handleSubmit}>
      <PaymentElement />
      <button disabled={!stripe}>Pay</button>
    </form>
  );
}
```

## Subscriptions

```typescript
app.post('/api/subscribe', async (req, res) => {
  const subscription = await stripe.subscriptions.create({
    customer: customerId,
    items: [{ price: req.body.priceId }],
    payment_behavior: 'default_incomplete',
    expand: ['latest_invoice.payment_intent'],
  });
  const invoice = subscription.latest_invoice as Stripe.Invoice;
  const pi = invoice.payment_intent as Stripe.PaymentIntent;
  res.json({ subscriptionId: subscription.id, clientSecret: pi.client_secret });
});

// Cancel at period end (not immediately)
await stripe.subscriptions.update(subId, { cancel_at_period_end: true });
```

## Webhooks (critical)

```typescript
app.post('/webhooks/stripe', express.raw({ type: 'application/json' }), (req, res) => {
  const event = stripe.webhooks.constructEvent(
    req.body, req.headers['stripe-signature']!, process.env.STRIPE_WEBHOOK_SECRET!
  );

  switch (event.type) {
    case 'checkout.session.completed':
      await fulfillOrder(event.data.object as Stripe.Checkout.Session);
      break;
    case 'invoice.paid':
      await activateSubscription(event.data.object as Stripe.Invoice);
      break;
    case 'invoice.payment_failed':
      await handleFailedPayment(event.data.object as Stripe.Invoice);
      break;
    case 'customer.subscription.deleted':
      await deactivateSubscription(event.data.object as Stripe.Subscription);
      break;
  }
  res.json({ received: true });
});
```

**Critical:** Use `express.raw()` — parsed body breaks signature verification.

## Anti-Patterns

| Anti-Pattern | Fix |
|--------------|-----|
| Trust client-side amount | Calculate amount server-side only |
| No webhook handling | Always use webhooks for fulfillment |
| Storing card numbers | Use Stripe.js — never touch card data |
| No idempotency keys | Add to all create operations |
| Fulfilling before payment confirms | Wait for webhook confirmation |
| No error handling on client | Show `error.message` from Stripe |

## Quick Troubleshooting

| Issue | Fix |
|-------|-----|
| Webhook 400 | Use raw body, verify STRIPE_WEBHOOK_SECRET |
| "No such price" | Check test/live mode matches API key |
| Double charges | Add idempotency key |
| CORS on redirect | Ensure HTTPS everywhere |

## Production Checklist

- [ ] Webhook endpoint registered and verified
- [ ] Idempotency keys on all creates
- [ ] Amount calculated server-side
- [ ] Test mode for dev/staging, live for prod
- [ ] PCI compliance (never handle raw card data)
- [ ] Customer portal for subscription management
- [ ] Refund flow implemented
