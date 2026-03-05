# Data Subject Rights (GDPR Articles 15-22)

## Overview

GDPR grants individuals (data subjects) a set of enforceable rights over their personal data. Controllers must respond to requests within **one calendar month**, extendable by two months for complex cases. Failure to comply can result in fines up to 4% of global annual turnover or EUR 20 million, whichever is higher.

This guide covers implementation patterns for each right, API design, and audit trail requirements.

---

## Right to Access (Subject Access Request - SAR)

**Article 15** requires controllers to provide a copy of all personal data being processed, along with supplementary information (purposes, categories, recipients, retention periods).

### Implementation Pattern

```typescript
// services/sar.service.ts
interface SARResponse {
  dataSubjectId: string;
  requestDate: string;
  responseDeadline: string;
  personalData: {
    source: string;
    category: string;
    data: Record<string, unknown>;
  }[];
  processingPurposes: string[];
  recipients: string[];
  retentionPeriod: string;
  rightsInformation: string;
}

async function handleSubjectAccessRequest(
  subjectId: string,
  verifiedIdentity: IdentityVerification
): Promise<SARResponse> {
  // 1. Verify identity before disclosing any data
  if (!verifiedIdentity.confirmed) {
    throw new IdentityNotVerifiedError();
  }

  // 2. Collect data from all processing systems
  const dataSources = await registry.getRegisteredSources();
  const personalData = await Promise.all(
    dataSources.map(source => source.extractPersonalData(subjectId))
  );

  // 3. Log the SAR for audit
  await auditLog.record({
    type: 'SUBJECT_ACCESS_REQUEST',
    subjectId,
    timestamp: new Date().toISOString(),
    dataSources: dataSources.map(s => s.name),
    handledBy: verifiedIdentity.handlerId,
  });

  // 4. Return structured response
  return {
    dataSubjectId: subjectId,
    requestDate: new Date().toISOString(),
    responseDeadline: addDays(new Date(), 30).toISOString(),
    personalData: personalData.flat(),
    processingPurposes: await registry.getPurposes(subjectId),
    recipients: await registry.getRecipients(subjectId),
    retentionPeriod: await registry.getRetentionPolicy(subjectId),
    rightsInformation: RIGHTS_NOTICE_TEXT,
  };
}
```

### API Endpoint

```typescript
// routes/gdpr.routes.ts
router.post('/api/gdpr/sar', authenticate, async (req, res) => {
  const { subjectEmail } = req.body;

  // Identity verification is mandatory before processing
  const verification = await identityService.verify(subjectEmail, req.body.proofOfIdentity);

  const sarTicket = await sarService.createTicket({
    subjectEmail,
    verification,
    receivedAt: new Date(),
    deadline: addDays(new Date(), 30),
    status: 'PENDING',
  });

  // Respond with ticket — actual data delivered later
  res.status(202).json({
    ticketId: sarTicket.id,
    estimatedCompletion: sarTicket.deadline,
    message: 'Your request has been received and will be processed within 30 days.',
  });
});
```

---

## Right to Erasure (Right to Be Forgotten)

**Article 17** allows data subjects to request deletion of their personal data when it is no longer necessary, consent is withdrawn, or processing is unlawful.

### Implementation Pattern

```typescript
// services/erasure.service.ts
interface ErasureRequest {
  subjectId: string;
  grounds: 'CONSENT_WITHDRAWN' | 'NO_LONGER_NECESSARY' | 'UNLAWFUL' | 'LEGAL_OBLIGATION' | 'OBJECTION';
  scope: 'ALL' | 'SPECIFIC';
  specificCategories?: string[];
}

interface ErasureResult {
  requestId: string;
  systemsProcessed: { system: string; status: 'DELETED' | 'RETAINED'; reason?: string }[];
  completedAt: string;
}

async function processErasure(request: ErasureRequest): Promise<ErasureResult> {
  const systems = await registry.getRegisteredSystems();
  const results: ErasureResult['systemsProcessed'] = [];

  for (const system of systems) {
    // Check for legal retention obligations before deleting
    const retentionHold = await legalHoldService.check(request.subjectId, system.name);

    if (retentionHold.active) {
      results.push({
        system: system.name,
        status: 'RETAINED',
        reason: `Legal hold: ${retentionHold.basis} (expires ${retentionHold.expiresAt})`,
      });
      continue;
    }

    // Perform deletion
    await system.deletePersonalData(request.subjectId, request.specificCategories);

    // Also notify downstream processors
    await notifyProcessors(system.name, request.subjectId, 'ERASURE');

    results.push({ system: system.name, status: 'DELETED' });
  }

  await auditLog.record({
    type: 'ERASURE_COMPLETED',
    subjectId: request.subjectId,
    grounds: request.grounds,
    results,
    timestamp: new Date().toISOString(),
  });

  return {
    requestId: generateId(),
    systemsProcessed: results,
    completedAt: new Date().toISOString(),
  };
}
```

### Exceptions to Erasure

Erasure does not apply when data is needed for:
- Exercising freedom of expression (journalism)
- Compliance with a legal obligation (tax records, financial regulations)
- Public health purposes
- Archiving in the public interest, scientific/historical research
- Establishment, exercise, or defense of legal claims

```typescript
const ERASURE_EXCEPTIONS: Record<string, { basis: string; retentionYears: number }> = {
  'tax-records':       { basis: 'Legal obligation (tax law)',    retentionYears: 7  },
  'financial-records': { basis: 'Legal obligation (AML)',        retentionYears: 5  },
  'medical-records':   { basis: 'Public health',                retentionYears: 10 },
  'employment-records':{ basis: 'Legal obligation (labor law)',  retentionYears: 6  },
  'legal-disputes':    { basis: 'Defense of legal claims',       retentionYears: 3  },
};
```

---

## Right to Rectification

**Article 16** grants the right to have inaccurate personal data corrected and incomplete data completed.

```typescript
router.patch('/api/gdpr/rectify', authenticate, async (req, res) => {
  const { subjectId, corrections } = req.body;

  // Validate corrections schema
  const validated = rectificationSchema.parse(corrections);

  // Apply corrections across all systems
  const results = await Promise.all(
    registeredSystems.map(async (system) => {
      const before = await system.getPersonalData(subjectId);
      await system.updatePersonalData(subjectId, validated);
      const after = await system.getPersonalData(subjectId);

      return { system: system.name, before, after, status: 'RECTIFIED' };
    })
  );

  // Audit trail captures before/after
  await auditLog.record({
    type: 'RECTIFICATION',
    subjectId,
    corrections: results,
    timestamp: new Date().toISOString(),
  });

  // Notify recipients who received the inaccurate data (Article 19)
  await notifyRecipients(subjectId, 'RECTIFICATION', validated);

  res.json({ status: 'completed', systemsUpdated: results.length });
});
```

---

## Right to Data Portability

**Article 20** gives data subjects the right to receive their data in a structured, commonly used, machine-readable format and to transmit it to another controller.

```typescript
// services/portability.service.ts
async function exportPortableData(
  subjectId: string,
  format: 'JSON' | 'CSV' | 'XML' = 'JSON'
): Promise<{ filename: string; mimeType: string; data: Buffer }> {
  // Only data provided BY the data subject or generated through their use
  // of the service is portable (not inferred or derived data)
  const portableData = await collectPortableData(subjectId);

  const serializers: Record<string, () => Buffer> = {
    JSON: () => Buffer.from(JSON.stringify(portableData, null, 2)),
    CSV:  () => Buffer.from(convertToCSV(portableData)),
    XML:  () => Buffer.from(convertToXML(portableData)),
  };

  return {
    filename: `personal-data-export-${subjectId}.${format.toLowerCase()}`,
    mimeType: MIME_TYPES[format],
    data: serializers[format](),
  };
}

// Direct transfer to another controller
async function transferToController(
  subjectId: string,
  targetControllerEndpoint: string,
  authToken: string
): Promise<TransferResult> {
  const exportData = await exportPortableData(subjectId, 'JSON');

  const response = await fetch(targetControllerEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`,
    },
    body: exportData.data,
  });

  return {
    transferId: generateId(),
    status: response.ok ? 'TRANSFERRED' : 'FAILED',
    targetController: new URL(targetControllerEndpoint).hostname,
    timestamp: new Date().toISOString(),
  };
}
```

---

## Right to Restrict Processing

**Article 18** allows data subjects to request restriction of processing (data is stored but not actively processed) in specific circumstances.

```typescript
// services/restriction.service.ts
type RestrictionGround =
  | 'ACCURACY_CONTESTED'   // Subject contests accuracy — restrict until verified
  | 'UNLAWFUL_PROCESSING'  // Subject opposes erasure, requests restriction instead
  | 'CONTROLLER_NO_LONGER_NEEDS' // Controller no longer needs it, subject needs it for legal claims
  | 'OBJECTION_PENDING';   // Subject objected — restrict while controller evaluates

async function restrictProcessing(
  subjectId: string,
  ground: RestrictionGround
): Promise<void> {
  // Mark data as restricted in all systems
  await Promise.all(
    registeredSystems.map(system =>
      system.setProcessingFlag(subjectId, {
        restricted: true,
        ground,
        restrictedAt: new Date().toISOString(),
      })
    )
  );

  // Restricted data can only be stored — not processed, used, or shared
  // Exception: with consent, for legal claims, for protection of another person,
  // or for important public interest

  await auditLog.record({
    type: 'PROCESSING_RESTRICTED',
    subjectId,
    ground,
    timestamp: new Date().toISOString(),
  });
}
```

---

## Right to Object

**Article 21** gives data subjects the right to object to processing based on legitimate interests or direct marketing at any time.

```typescript
router.post('/api/gdpr/object', authenticate, async (req, res) => {
  const { subjectId, processingActivity, reason } = req.body;

  if (processingActivity === 'DIRECT_MARKETING') {
    // Absolute right — must stop immediately, no balancing test
    await marketingService.suppressContact(subjectId);
    await auditLog.record({ type: 'OBJECTION_MARKETING', subjectId });
    return res.json({ status: 'processing_stopped' });
  }

  // For legitimate-interest processing, controller must demonstrate
  // compelling grounds that override the subject's interests
  const assessment = await balancingTest(subjectId, processingActivity, reason);

  if (assessment.subjectInterestsPrevail) {
    await stopProcessing(subjectId, processingActivity);
    res.json({ status: 'processing_stopped' });
  } else {
    // Document the compelling grounds
    res.json({
      status: 'processing_continues',
      grounds: assessment.compellingGrounds,
      appealProcess: '/api/gdpr/appeal',
    });
  }
});
```

---

## Audit Trail Requirements

Every rights request must produce a complete, tamper-evident audit trail. Supervisory authorities expect controllers to demonstrate compliance.

### Audit Schema

```sql
CREATE TABLE gdpr_audit_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type      VARCHAR(50) NOT NULL,  -- SAR, ERASURE, RECTIFICATION, etc.
  subject_id      VARCHAR(255) NOT NULL,
  handler_id      VARCHAR(255),
  request_received_at TIMESTAMPTZ NOT NULL,
  response_sent_at    TIMESTAMPTZ,
  deadline_at     TIMESTAMPTZ NOT NULL,
  status          VARCHAR(20) NOT NULL,  -- PENDING, IN_PROGRESS, COMPLETED, REFUSED
  refusal_reason  TEXT,
  systems_involved TEXT[],
  details_json    JSONB,
  created_at      TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_status CHECK (status IN ('PENDING','IN_PROGRESS','COMPLETED','REFUSED','EXTENDED'))
);

CREATE INDEX idx_audit_subject ON gdpr_audit_log(subject_id);
CREATE INDEX idx_audit_type    ON gdpr_audit_log(event_type);
CREATE INDEX idx_audit_status  ON gdpr_audit_log(status);

-- Immutable: use INSERT only, no UPDATE/DELETE
REVOKE UPDATE, DELETE ON gdpr_audit_log FROM app_user;
```

### Retention of Audit Records

Audit logs should be retained for a defensible period (typically 3-6 years) to demonstrate compliance during investigations. Store them separately from operational data.

---

## Anti-Patterns

| Anti-Pattern | Problem | Correct Approach |
|-------------|---------|------------------|
| Deleting audit logs on erasure | Destroys compliance evidence | Retain audit metadata, erase personal data content |
| No identity verification | Risk of disclosing data to wrong person | Verify identity before processing any rights request |
| Hardcoded 30-day timer | Ignores extension provisions | Track deadlines with extension support |
| Partial system coverage | Missing data in some systems | Maintain a registry of all systems processing personal data |
| Manual-only process | Does not scale, error-prone | Automate with workflow engine, manual review for edge cases |
| Deleting backups immediately | May break backup integrity | Flag for exclusion from next restore, delete on rotation |

---

## Production Checklist

- [ ] Identity verification flow implemented and tested
- [ ] All data stores registered in the personal data registry
- [ ] SAR response includes all required Article 15 information
- [ ] Erasure respects legal retention holds
- [ ] Rectification propagates to all downstream recipients (Article 19)
- [ ] Portability export supports JSON and at least one other format
- [ ] Processing restriction flags are checked by all data consumers
- [ ] Direct marketing objection stops processing immediately
- [ ] Audit log is append-only and tamper-evident
- [ ] Deadline tracking with automated reminders at 20 and 25 days
- [ ] Extension mechanism documented and tested
- [ ] Refusal responses cite specific legal basis
- [ ] DPO notification on every rights request
- [ ] Response templates reviewed by legal counsel
