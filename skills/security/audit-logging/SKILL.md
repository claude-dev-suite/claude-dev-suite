---
name: audit-logging
description: |
  Audit logging for compliance and security. Structured audit events, immutable
  logs, user action tracking, database change tracking, and regulatory
  compliance (SOC2, HIPAA, GDPR).

  USE WHEN: user mentions "audit log", "audit trail", "activity log",
  "change tracking", "compliance logging", "who changed what", "SOC2 logging"

  DO NOT USE FOR: application logging - use logging skills;
  error tracking - use observability skills
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Audit Logging

## Audit Event Structure

```typescript
interface AuditEvent {
  id: string;
  timestamp: string;          // ISO 8601
  actor: {
    id: string;
    type: 'user' | 'system' | 'api_key';
    ip?: string;
    userAgent?: string;
  };
  action: string;              // 'user.created', 'order.deleted'
  resource: {
    type: string;              // 'user', 'order'
    id: string;
  };
  changes?: {                  // Before/after for updates
    field: string;
    before: unknown;
    after: unknown;
  }[];
  metadata?: Record<string, unknown>;
}
```

## Audit Service

```typescript
class AuditService {
  async log(event: Omit<AuditEvent, 'id' | 'timestamp'>): Promise<void> {
    const auditEntry: AuditEvent = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      ...event,
    };

    // Write to append-only table
    await db.auditLog.create({ data: auditEntry });

    // Optionally stream to external system
    await this.eventStream?.publish('audit', auditEntry);
  }
}

// Usage in service layer
async function updateUser(userId: string, data: UpdateUserDto, actor: Actor) {
  const before = await db.user.findUnique({ where: { id: userId } });
  const after = await db.user.update({ where: { id: userId }, data });

  await audit.log({
    actor: { id: actor.id, type: 'user', ip: actor.ip },
    action: 'user.updated',
    resource: { type: 'user', id: userId },
    changes: diffFields(before, after, ['name', 'email', 'role']),
  });

  return after;
}

function diffFields(before: any, after: any, fields: string[]) {
  return fields
    .filter((f) => before[f] !== after[f])
    .map((f) => ({ field: f, before: before[f], after: after[f] }));
}
```

## Express Middleware

```typescript
function auditMiddleware(action: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      audit.log({
        actor: { id: req.user?.id ?? 'anonymous', type: 'user', ip: req.ip },
        action,
        resource: { type: action.split('.')[0], id: req.params.id ?? body?.id },
      });
      return originalJson(body);
    };
    next();
  };
}

app.delete('/api/users/:id', auditMiddleware('user.deleted'), deleteUserHandler);
```

## Database Schema

```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_id TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_ip INET,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  changes JSONB,
  metadata JSONB
);

-- Append-only: revoke UPDATE and DELETE
REVOKE UPDATE, DELETE ON audit_logs FROM app_user;

-- Indexes for common queries
CREATE INDEX idx_audit_actor ON audit_logs (actor_id, timestamp DESC);
CREATE INDEX idx_audit_resource ON audit_logs (resource_type, resource_id, timestamp DESC);
CREATE INDEX idx_audit_action ON audit_logs (action, timestamp DESC);
```

## Anti-Patterns

| Anti-Pattern | Fix |
|--------------|-----|
| Logging inside transaction (fails = no log) | Log after successful commit |
| Mutable audit table | Revoke UPDATE/DELETE, use append-only |
| Missing actor identity | Always capture who performed the action |
| Logging sensitive field values | Redact PII (email → `j***@example.com`) |
| No retention policy | Partition by month, archive after retention period |

## Production Checklist

- [ ] Append-only audit table (no UPDATE/DELETE)
- [ ] Actor identity captured on all events
- [ ] Before/after values for data changes
- [ ] PII redaction in audit entries
- [ ] Indexed for common query patterns
- [ ] Retention policy and archival
- [ ] Tamper detection (hash chain or external storage)
