---
name: job-queues
description: |
  Background job queue systems. BullMQ (Node.js), Celery (Python), Sidekiq (Ruby),
  Spring Batch. Job scheduling, retries, priorities, concurrency control,
  and dead letter queues.

  USE WHEN: user mentions "job queue", "background job", "BullMQ", "Bull",
  "Celery", "worker", "async task", "task queue", "Sidekiq"

  DO NOT USE FOR: cron scheduling without queue - use `cron-scheduling`;
  message brokers - use messaging skills (Kafka, RabbitMQ)
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Job Queues

## BullMQ (Node.js — recommended)

```typescript
import { Queue, Worker, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';

const connection = new IORedis(process.env.REDIS_URL);

// Define queue
const emailQueue = new Queue('emails', { connection });

// Add job
await emailQueue.add('send-welcome', {
  userId: '123',
  template: 'welcome',
}, {
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: { age: 24 * 3600 }, // Cleanup after 24h
  removeOnFail: { age: 7 * 24 * 3600 },
});

// Add delayed job
await emailQueue.add('send-reminder', { userId: '123' }, {
  delay: 24 * 60 * 60 * 1000, // 24 hours
});

// Add prioritized job
await emailQueue.add('send-alert', { orderId: '456' }, {
  priority: 1, // Lower number = higher priority
});
```

### Worker

```typescript
const worker = new Worker('emails', async (job) => {
  switch (job.name) {
    case 'send-welcome':
      await sendWelcomeEmail(job.data.userId, job.data.template);
      break;
    case 'send-reminder':
      await sendReminderEmail(job.data.userId);
      break;
  }

  // Report progress
  await job.updateProgress(50);
  await doMoreWork();
  await job.updateProgress(100);
}, {
  connection,
  concurrency: 5,
  limiter: { max: 10, duration: 1000 }, // Rate limit: 10 jobs/sec
});

worker.on('completed', (job) => console.log(`Job ${job.id} completed`));
worker.on('failed', (job, err) => console.error(`Job ${job?.id} failed:`, err.message));
```

## Celery (Python)

```python
from celery import Celery

app = Celery('tasks', broker='redis://localhost:6379/0')

@app.task(bind=True, max_retries=3, default_retry_delay=60)
def send_email(self, user_id: str, template: str):
    try:
        user = get_user(user_id)
        mailer.send(user.email, template)
    except ConnectionError as exc:
        self.retry(exc=exc)

# Dispatch
send_email.delay('user-123', 'welcome')
send_email.apply_async(args=['user-123', 'welcome'], countdown=3600)  # Delay 1h

# Chain tasks
from celery import chain
workflow = chain(
    process_order.s(order_id),
    send_confirmation.s(),
    update_inventory.s(),
)
workflow.apply_async()
```

## Job Patterns

| Pattern | Use Case |
|---------|----------|
| Fire-and-forget | Email sending, notifications |
| Delayed jobs | Reminders, scheduled tasks |
| Job chaining | Multi-step workflows |
| Rate-limited | External API calls |
| Priority queues | Urgent vs batch processing |
| Unique jobs | Prevent duplicate processing |

## Monitoring (BullMQ)

```typescript
const queueEvents = new QueueEvents('emails', { connection });

queueEvents.on('completed', ({ jobId, returnvalue }) => {
  metrics.increment('jobs.completed', { queue: 'emails' });
});

queueEvents.on('failed', ({ jobId, failedReason }) => {
  metrics.increment('jobs.failed', { queue: 'emails' });
});

// Bull Board (dashboard UI)
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';

const serverAdapter = new ExpressAdapter();
createBullBoard({ queues: [new BullMQAdapter(emailQueue)], serverAdapter });
app.use('/admin/queues', serverAdapter.getRouter());
```

## Anti-Patterns

| Anti-Pattern | Fix |
|--------------|-----|
| No retry configuration | Set `attempts` and `backoff` strategy |
| No dead letter handling | Monitor failed jobs, set up alerts |
| Processing in request handler | Offload to queue, return 202 Accepted |
| No concurrency limits | Set worker `concurrency` and `limiter` |
| No job cleanup | Configure `removeOnComplete` and `removeOnFail` |

## Production Checklist

- [ ] Retry with exponential backoff configured
- [ ] Dead letter queue monitoring and alerts
- [ ] Worker concurrency tuned to resource limits
- [ ] Job progress tracking for long-running tasks
- [ ] Dashboard UI for job monitoring (Bull Board)
- [ ] Graceful shutdown: process in-flight jobs before exit
