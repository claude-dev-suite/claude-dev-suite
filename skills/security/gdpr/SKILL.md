---
name: gdpr
description: |
  GDPR compliance implementation. Data subject rights (access, deletion,
  portability), consent management, data processing records, PII handling,
  and privacy by design patterns.

  USE WHEN: user mentions "GDPR", "data privacy", "right to be forgotten",
  "data deletion", "consent management", "PII", "data subject request",
  "privacy policy", "cookie consent"

  DO NOT USE FOR: authentication - use auth skills;
  encryption - use `cryptography`; audit logging - use `audit-logging`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# GDPR Compliance

## Data Subject Rights Implementation

### Right to Access (Data Export)

```typescript
app.get('/api/privacy/my-data', auth, async (req, res) => {
  const userId = req.user.id;

  const data = {
    profile: await db.user.findUnique({ where: { id: userId }, select: exportableFields }),
    orders: await db.order.findMany({ where: { userId }, select: orderExportFields }),
    preferences: await db.preference.findMany({ where: { userId } }),
    consents: await db.consent.findMany({ where: { userId } }),
  };

  res.json(data);
  // Or: generate downloadable file
  // res.attachment('my-data.json').json(data);
});
```

### Right to Erasure (Deletion)

```typescript
async function deleteUserData(userId: string): Promise<void> {
  // Anonymize where deletion would break referential integrity
  await db.order.updateMany({
    where: { userId },
    data: { customerName: '[deleted]', email: '[deleted]' },
  });

  // Delete personal data
  await db.preference.deleteMany({ where: { userId } });
  await db.consent.deleteMany({ where: { userId } });
  await db.session.deleteMany({ where: { userId } });

  // Anonymize the user record (keep for accounting if legally required)
  await db.user.update({
    where: { id: userId },
    data: {
      email: `deleted-${userId}@anonymized.local`,
      name: '[deleted]',
      phone: null,
      deletedAt: new Date(),
    },
  });

  // Log the deletion (audit requirement)
  await auditLog.record({
    action: 'user.data_deleted',
    resource: { type: 'user', id: userId },
    actor: { id: userId, type: 'user' },
  });
}
```

## Consent Management

```typescript
interface ConsentRecord {
  userId: string;
  purpose: string;         // 'marketing', 'analytics', 'essential'
  granted: boolean;
  grantedAt: Date;
  ipAddress: string;
  version: string;          // Policy version at time of consent
}

app.post('/api/consent', auth, async (req, res) => {
  const { purposes } = req.body; // { marketing: true, analytics: false }

  for (const [purpose, granted] of Object.entries(purposes)) {
    await db.consent.upsert({
      where: { userId_purpose: { userId: req.user.id, purpose } },
      create: {
        userId: req.user.id,
        purpose,
        granted: granted as boolean,
        grantedAt: new Date(),
        ipAddress: req.ip,
        version: CURRENT_PRIVACY_POLICY_VERSION,
      },
      update: {
        granted: granted as boolean,
        grantedAt: new Date(),
        ipAddress: req.ip,
        version: CURRENT_PRIVACY_POLICY_VERSION,
      },
    });
  }

  res.json({ updated: true });
});

// Check consent before processing
async function hasConsent(userId: string, purpose: string): Promise<boolean> {
  const consent = await db.consent.findUnique({
    where: { userId_purpose: { userId, purpose } },
  });
  return consent?.granted === true;
}
```

## PII Field Handling

```typescript
// Mark PII fields in schema
const PII_FIELDS = {
  user: ['email', 'name', 'phone', 'address', 'dateOfBirth'],
  order: ['customerName', 'shippingAddress', 'email'],
} as const;

// Encrypt PII at rest
const encryptedFields = ['dateOfBirth', 'phone', 'address'];

// Pseudonymization for analytics
function pseudonymize(userId: string): string {
  return createHmac('sha256', PSEUDONYM_KEY).update(userId).digest('hex');
}
```

## Cookie Consent Banner

```typescript
// Express middleware — block non-essential cookies without consent
function cookieConsentMiddleware(req: Request, res: Response, next: NextFunction) {
  const consent = req.cookies['cookie-consent'];
  if (!consent) {
    // Only set essential cookies
    req.analyticsEnabled = false;
    req.marketingEnabled = false;
  } else {
    const prefs = JSON.parse(consent);
    req.analyticsEnabled = prefs.analytics === true;
    req.marketingEnabled = prefs.marketing === true;
  }
  next();
}
```

## Anti-Patterns

| Anti-Pattern | Fix |
|--------------|-----|
| Hard-deleting all data | Anonymize where referential integrity needed |
| No consent versioning | Track which policy version user consented to |
| PII in log files | Redact or pseudonymize PII before logging |
| Consent as one checkbox | Granular consent per purpose (marketing, analytics) |
| No data processing records | Maintain Article 30 records of processing activities |
| Ignoring third-party data sharing | Document and control all data processors |

## Production Checklist

- [ ] Data subject access request endpoint
- [ ] Data deletion/anonymization endpoint
- [ ] Consent management with purpose granularity
- [ ] Consent versioning (tracks policy version)
- [ ] PII inventory documented
- [ ] Data retention policies implemented
- [ ] Cookie consent banner (EU users)
- [ ] Data Processing Agreement with third parties
- [ ] Article 30 records of processing activities
