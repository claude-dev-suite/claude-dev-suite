# Consent Management Under GDPR

## Overview

Consent under GDPR (Article 7) must be **freely given, specific, informed, and unambiguous**. It requires a clear affirmative action and cannot be bundled with other terms. Controllers bear the burden of proving valid consent was obtained for each processing purpose.

This guide covers consent collection, storage, withdrawal, cookie consent (PECR/ePrivacy), and API design patterns.

---

## Requirements for Valid Consent

| Requirement | Meaning | Implementation |
|-------------|---------|----------------|
| **Freely given** | No detriment for refusing; not bundled with contract | Separate consent from T&C acceptance |
| **Specific** | Per-purpose consent, not blanket | Individual toggles per processing activity |
| **Informed** | Clear explanation of what, who, why, how long | Plain-language notice before consent action |
| **Unambiguous** | Clear affirmative action | No pre-ticked boxes, no silence-as-consent |
| **Withdrawable** | As easy to withdraw as to give | Persistent settings page with toggle-off |

---

## Consent Collection Patterns

### Granular Consent UI

```tsx
// components/ConsentForm.tsx
interface ConsentPurpose {
  id: string;
  name: string;
  description: string;
  required: boolean;       // false for all GDPR consent — never required
  legalBasis: 'consent';
  dataCategories: string[];
  retentionPeriod: string;
  thirdParties: string[];
}

const CONSENT_PURPOSES: ConsentPurpose[] = [
  {
    id: 'analytics',
    name: 'Analytics & Performance',
    description: 'We use analytics to understand how you use our service and to improve it.',
    required: false,
    legalBasis: 'consent',
    dataCategories: ['usage data', 'device information'],
    retentionPeriod: '26 months',
    thirdParties: ['Google Analytics'],
  },
  {
    id: 'marketing_email',
    name: 'Email Marketing',
    description: 'We send promotional emails about new features and offers.',
    required: false,
    legalBasis: 'consent',
    dataCategories: ['email address', 'name', 'purchase history'],
    retentionPeriod: 'Until withdrawal',
    thirdParties: ['Mailchimp'],
  },
  {
    id: 'profiling',
    name: 'Personalized Recommendations',
    description: 'We analyze your activity to suggest relevant content.',
    required: false,
    legalBasis: 'consent',
    dataCategories: ['browsing history', 'purchase history', 'preferences'],
    retentionPeriod: '12 months',
    thirdParties: [],
  },
];

function ConsentForm({ onSubmit }: { onSubmit: (consents: ConsentRecord[]) => void }) {
  const [consents, setConsents] = useState<Record<string, boolean>>({});

  return (
    <form onSubmit={() => onSubmit(buildConsentRecords(consents))}>
      <h2>Privacy Preferences</h2>
      <p>Choose which data processing activities you consent to.
         You can change these settings at any time.</p>

      {CONSENT_PURPOSES.map(purpose => (
        <div key={purpose.id} className="consent-toggle">
          <label>
            <input
              type="checkbox"
              checked={consents[purpose.id] ?? false}   // Never pre-ticked
              onChange={e => setConsents(prev => ({
                ...prev,
                [purpose.id]: e.target.checked,
              }))}
            />
            <strong>{purpose.name}</strong>
          </label>
          <p className="text-sm text-gray-600">{purpose.description}</p>
          <details>
            <summary>More details</summary>
            <ul>
              <li>Data collected: {purpose.dataCategories.join(', ')}</li>
              <li>Retained for: {purpose.retentionPeriod}</li>
              {purpose.thirdParties.length > 0 && (
                <li>Shared with: {purpose.thirdParties.join(', ')}</li>
              )}
            </ul>
          </details>
        </div>
      ))}

      <button type="submit">Save Preferences</button>
    </form>
  );
}
```

---

## Consent Storage Schema

```sql
-- Core consent records table
CREATE TABLE consent_records (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id        VARCHAR(255) NOT NULL,
  purpose_id        VARCHAR(100) NOT NULL,
  status            VARCHAR(20) NOT NULL,  -- GIVEN, WITHDRAWN
  consent_version   INTEGER NOT NULL DEFAULT 1,
  privacy_notice_version VARCHAR(20) NOT NULL,

  -- Context of consent collection
  collection_method VARCHAR(50) NOT NULL,  -- WEB_FORM, API, MOBILE_APP, IN_PERSON
  ip_address        INET,
  user_agent        TEXT,
  page_url          TEXT,

  -- Timestamps
  given_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  withdrawn_at      TIMESTAMPTZ,
  expires_at        TIMESTAMPTZ,

  -- Proof
  consent_text      TEXT NOT NULL,         -- Exact text shown to user
  interaction_proof JSONB,                 -- Click coordinates, form state, etc.

  created_at        TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_status CHECK (status IN ('GIVEN', 'WITHDRAWN'))
);

-- History table: immutable log of all consent changes
CREATE TABLE consent_history (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consent_id        UUID NOT NULL REFERENCES consent_records(id),
  action            VARCHAR(20) NOT NULL,  -- GIVEN, WITHDRAWN, EXPIRED, RE_CONSENTED
  performed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  performed_by      VARCHAR(255),          -- system or user
  previous_status   VARCHAR(20),
  new_status        VARCHAR(20) NOT NULL,
  metadata          JSONB
);

-- Indexes for lookup
CREATE INDEX idx_consent_subject   ON consent_records(subject_id);
CREATE INDEX idx_consent_purpose   ON consent_records(subject_id, purpose_id);
CREATE INDEX idx_consent_status    ON consent_records(status);
CREATE INDEX idx_consent_expires   ON consent_records(expires_at) WHERE expires_at IS NOT NULL;

-- Prevent modification of historical records
REVOKE UPDATE, DELETE ON consent_history FROM app_user;
```

---

## Consent API Design

```typescript
// routes/consent.routes.ts
import { z } from 'zod';

const grantConsentSchema = z.object({
  subjectId: z.string().min(1),
  purposes: z.array(z.object({
    purposeId: z.string(),
    granted: z.boolean(),
  })),
  privacyNoticeVersion: z.string(),
  collectionMethod: z.enum(['WEB_FORM', 'API', 'MOBILE_APP', 'IN_PERSON']),
});

// Grant or update consent
router.post('/api/consent', authenticate, async (req, res) => {
  const body = grantConsentSchema.parse(req.body);

  const results = await Promise.all(
    body.purposes.map(async (p) => {
      if (p.granted) {
        return consentService.grantConsent({
          subjectId: body.subjectId,
          purposeId: p.purposeId,
          privacyNoticeVersion: body.privacyNoticeVersion,
          collectionMethod: body.collectionMethod,
          consentText: await consentService.getConsentText(p.purposeId),
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        });
      } else {
        return consentService.withdrawConsent(body.subjectId, p.purposeId);
      }
    })
  );

  res.json({ consents: results });
});

// Get current consent status for a subject
router.get('/api/consent/:subjectId', authenticate, async (req, res) => {
  const consents = await consentService.getConsentStatus(req.params.subjectId);
  res.json({ consents });
});

// Withdraw specific consent
router.delete('/api/consent/:subjectId/:purposeId', authenticate, async (req, res) => {
  await consentService.withdrawConsent(req.params.subjectId, req.params.purposeId);
  res.json({ status: 'withdrawn', effectiveImmediately: true });
});

// Check consent before processing
router.get('/api/consent/:subjectId/check/:purposeId', async (req, res) => {
  const hasConsent = await consentService.hasValidConsent(
    req.params.subjectId,
    req.params.purposeId
  );
  res.json({ hasConsent, checkedAt: new Date().toISOString() });
});
```

---

## Withdrawal Mechanisms

Withdrawal must be **as easy as giving consent**. If consent was given via a web form, withdrawal must be possible via the same type of interface, not by emailing a DPO.

```typescript
// services/consent.service.ts
async function withdrawConsent(subjectId: string, purposeId: string): Promise<void> {
  // 1. Update consent record
  const record = await db.consentRecords.findOne({ subjectId, purposeId, status: 'GIVEN' });
  if (!record) return; // Already withdrawn or never given

  await db.consentRecords.update(record.id, {
    status: 'WITHDRAWN',
    withdrawn_at: new Date(),
  });

  // 2. Record in history
  await db.consentHistory.insert({
    consentId: record.id,
    action: 'WITHDRAWN',
    previousStatus: 'GIVEN',
    newStatus: 'WITHDRAWN',
  });

  // 3. Stop all processing dependent on this consent
  await processingEngine.stopForPurpose(subjectId, purposeId);

  // 4. Notify downstream processors
  await notifyProcessors(subjectId, purposeId, 'CONSENT_WITHDRAWN');

  // 5. Determine if data should be deleted (if consent was the only legal basis)
  const otherBases = await legalBasisService.getAlternativeBases(subjectId, purposeId);
  if (otherBases.length === 0) {
    await erasureService.scheduleErasure(subjectId, purposeId);
  }
}
```

---

## Re-Consent Triggers

Re-consent is required when the original consent is no longer valid due to changed circumstances.

```typescript
const RE_CONSENT_TRIGGERS = [
  {
    trigger: 'PRIVACY_NOTICE_UPDATE',
    description: 'Privacy notice materially changed',
    action: 'Prompt user to review and re-consent on next login',
  },
  {
    trigger: 'NEW_PURPOSE',
    description: 'Processing for a new purpose not covered by original consent',
    action: 'Collect fresh consent for the new purpose',
  },
  {
    trigger: 'NEW_THIRD_PARTY',
    description: 'Sharing data with a new third party',
    action: 'Inform user and obtain specific consent',
  },
  {
    trigger: 'CHILD_TURNS_ADULT',
    description: 'Minor reaches age of consent (16, or lower per member state)',
    action: 'Obtain independent consent from the now-adult',
  },
  {
    trigger: 'SIGNIFICANT_TIME_ELAPSED',
    description: 'Extended period since original consent (e.g., 2+ years)',
    action: 'Refresh consent proactively',
  },
];

// Middleware to check re-consent requirements
async function checkReConsentRequired(req: Request, res: Response, next: NextFunction) {
  const subjectId = req.user?.id;
  if (!subjectId) return next();

  const pendingReConsent = await consentService.getPendingReConsent(subjectId);
  if (pendingReConsent.length > 0) {
    // Do not block — but flag in response headers
    res.setHeader('X-ReConsent-Required', 'true');
    res.setHeader('X-ReConsent-Purposes', pendingReConsent.map(p => p.purposeId).join(','));
  }
  next();
}
```

---

## Cookie Consent (PECR / ePrivacy)

Cookie consent follows the ePrivacy Directive (PECR in the UK), which requires consent before setting non-essential cookies. Strictly necessary cookies (session, CSRF, load balancer) do not require consent.

### Cookie Classification

```typescript
const COOKIE_CATEGORIES = {
  STRICTLY_NECESSARY: {
    consentRequired: false,
    examples: ['session_id', 'csrf_token', 'cookie_consent_status'],
    description: 'Essential for the website to function. Cannot be disabled.',
  },
  FUNCTIONAL: {
    consentRequired: true,
    examples: ['language_preference', 'theme', 'recently_viewed'],
    description: 'Enhance functionality and personalization.',
  },
  ANALYTICS: {
    consentRequired: true,
    examples: ['_ga', '_gid', '_gat', 'mp_mixpanel'],
    description: 'Help us understand how visitors use the website.',
  },
  MARKETING: {
    consentRequired: true,
    examples: ['_fbp', '_gcl_au', 'IDE'],
    description: 'Used to deliver relevant advertisements.',
  },
};

// Server-side cookie consent enforcement
function cookieConsentMiddleware(req: Request, res: Response, next: NextFunction) {
  const consentCookie = req.cookies['cookie_consent'];
  const consents = consentCookie ? JSON.parse(consentCookie) : {};

  // Override res.cookie to enforce consent
  const originalSetCookie = res.cookie.bind(res);
  res.cookie = function(name: string, value: string, options?: CookieOptions) {
    const category = getCookieCategory(name);

    if (category === 'STRICTLY_NECESSARY' || consents[category]) {
      return originalSetCookie(name, value, options);
    }

    // Silently skip — do not set cookies without consent
    return res;
  };

  next();
}
```

---

## Anti-Patterns

| Anti-Pattern | Problem | Correct Approach |
|-------------|---------|------------------|
| Pre-ticked checkboxes | Not a valid affirmative action | All consent boxes unchecked by default |
| "Accept all" prominent, "Reject all" hidden | Not freely given | Equal visual weight for accept and reject |
| Cookie wall (no access without consent) | Not freely given (EDPB guidance) | Allow basic access without consent |
| Bundled consent for multiple purposes | Not specific | Individual toggles per purpose |
| No withdrawal mechanism | Violates Article 7(3) | Settings page with same ease as granting |
| Storing consent without proof | Cannot demonstrate compliance | Store exact text shown, timestamp, method |
| Ignoring consent expiration | Stale consent may not be valid | Implement refresh cycles |

---

## Production Checklist

- [ ] Each processing purpose has its own consent toggle
- [ ] No pre-ticked boxes or implied consent
- [ ] Privacy notice displayed before consent action
- [ ] Consent record stores exact text, timestamp, method, and proof
- [ ] Withdrawal available via the same channel as collection
- [ ] Withdrawal is effective immediately (processing stops)
- [ ] Cookie consent banner blocks non-essential cookies until consent
- [ ] "Reject all" button is equally prominent as "Accept all"
- [ ] Re-consent triggered on privacy notice changes
- [ ] Consent status is queryable per subject and purpose
- [ ] Children's consent handled (age verification, parental consent)
- [ ] Consent records retained for proof even after withdrawal
- [ ] Downstream processors notified on withdrawal
- [ ] Regular audit of consent validity (expiration, changed purposes)
