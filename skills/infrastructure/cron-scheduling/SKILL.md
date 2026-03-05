---
name: cron-scheduling
description: |
  Cron and scheduled task management. node-cron, cron expressions, Spring
  @Scheduled, APScheduler (Python), and distributed scheduling patterns.

  USE WHEN: user mentions "cron", "scheduled task", "cron job", "node-cron",
  "@Scheduled", "APScheduler", "periodic task", "crontab"

  DO NOT USE FOR: job queues with workers - use `job-queues`;
  one-off delayed tasks - use `job-queues`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Cron Scheduling

## Cron Expression Syntax

```
┌─────── minute (0-59)
│ ┌────── hour (0-23)
│ │ ┌───── day of month (1-31)
│ │ │ ┌──── month (1-12)
│ │ │ │ ┌─── day of week (0-7, 0 and 7 = Sunday)
│ │ │ │ │
* * * * *
```

| Expression | Schedule |
|------------|----------|
| `0 * * * *` | Every hour |
| `*/15 * * * *` | Every 15 minutes |
| `0 9 * * 1-5` | Weekdays at 9:00 AM |
| `0 0 1 * *` | First day of month, midnight |
| `0 */6 * * *` | Every 6 hours |

## Node.js (node-cron)

```typescript
import cron from 'node-cron';

// Run every day at 2:00 AM
cron.schedule('0 2 * * *', async () => {
  console.log('Running daily cleanup...');
  await cleanupExpiredSessions();
}, {
  timezone: 'America/New_York',
});

// Run every 5 minutes
cron.schedule('*/5 * * * *', async () => {
  await syncExternalData();
});
```

### With Distributed Locking (prevent duplicate runs)

```typescript
import { Redlock } from 'redlock';

const redlock = new Redlock([redis]);

cron.schedule('0 * * * *', async () => {
  let lock;
  try {
    lock = await redlock.acquire(['cron:hourly-report'], 60000);
    await generateHourlyReport();
  } catch (err) {
    if (err instanceof Redlock.LockError) return; // Another instance has the lock
    throw err;
  } finally {
    await lock?.release();
  }
});
```

## Spring @Scheduled (Java)

```java
@Component
@EnableScheduling
public class ScheduledTasks {

    @Scheduled(cron = "0 0 2 * * *") // Daily at 2 AM
    public void dailyCleanup() {
        sessionRepo.deleteExpired();
    }

    @Scheduled(fixedRate = 300000) // Every 5 minutes
    public void syncData() {
        externalService.sync();
    }

    @Scheduled(fixedDelay = 60000) // 60s after last completion
    public void processQueue() {
        queueService.processNext();
    }
}
```

### Distributed Scheduling (ShedLock)

```java
@Scheduled(cron = "0 */10 * * * *")
@SchedulerLock(name = "syncInventory", lockAtLeastFor = "5m", lockAtMostFor = "10m")
public void syncInventory() {
    inventoryService.syncAll();
}
```

## Python (APScheduler)

```python
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

scheduler = AsyncIOScheduler()

@scheduler.scheduled_job(CronTrigger(hour=2, minute=0))
async def daily_cleanup():
    await cleanup_expired_sessions()

@scheduler.scheduled_job('interval', minutes=5)
async def sync_data():
    await sync_external_data()

scheduler.start()
```

## Anti-Patterns

| Anti-Pattern | Fix |
|--------------|-----|
| Cron on multiple instances without locking | Use distributed lock (Redlock, ShedLock) |
| Long-running cron blocks next run | Use job queue for heavy work |
| No error handling in cron | Wrap in try-catch, log errors, alert |
| Hardcoded schedule | Use environment variable or config |
| No monitoring of cron execution | Log start/end times, track failures |

## Production Checklist

- [ ] Distributed locking for multi-instance deployments
- [ ] Error handling with alerting
- [ ] Execution time monitoring
- [ ] Timezone explicitly set
- [ ] Graceful shutdown (finish current job)
- [ ] Cron expressions documented
