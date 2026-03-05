# Data Protection Impact Assessment (DPIA)

## Overview

A Data Protection Impact Assessment (DPIA), mandated by **GDPR Article 35**, is a structured process to identify and minimize data protection risks of a project or processing activity. It must be carried out **before** processing begins when the activity is "likely to result in a high risk to the rights and freedoms of natural persons."

This guide covers when a DPIA is mandatory, the assessment methodology, a reusable template, mitigation strategies, documentation requirements, and a technical implementation checklist.

---

## When DPIA Is Mandatory

Article 35(3) requires a DPIA for:

1. **Systematic and extensive profiling** with significant effects on individuals (e.g., credit scoring, automated hiring decisions)
2. **Large-scale processing of special category data** (Article 9) or criminal offense data (Article 10)
3. **Systematic monitoring of publicly accessible areas** on a large scale (e.g., CCTV, Wi-Fi tracking)

### Additional Triggers (EDPB Guidelines)

A DPIA is generally required when processing meets **two or more** of these criteria:

```typescript
const DPIA_TRIGGERS = [
  'EVALUATION_SCORING',           // Profiling, predicting behavior
  'AUTOMATED_DECISION_MAKING',    // Decisions with legal/significant effect
  'SYSTEMATIC_MONITORING',        // Observation, tracking, surveillance
  'SENSITIVE_DATA',               // Special categories (health, biometric, etc.)
  'LARGE_SCALE',                  // High volume of subjects or data
  'MATCHING_COMBINING',           // Combining datasets from different sources
  'VULNERABLE_SUBJECTS',          // Children, employees, patients
  'INNOVATIVE_TECHNOLOGY',        // New tech (AI/ML, IoT, blockchain for PII)
  'TRANSFER_OUTSIDE_EEA',         // International data transfers
  'BLOCKING_RIGHTS',              // Processing prevents exercising a right or using a service
];

function isDPIARequired(triggers: string[]): { required: boolean; reason: string } {
  const matched = triggers.filter(t => DPIA_TRIGGERS.includes(t));

  // Mandatory per Article 35(3)
  const mandatory = ['AUTOMATED_DECISION_MAKING', 'SENSITIVE_DATA', 'SYSTEMATIC_MONITORING'];
  const hasMandatory = matched.some(t => mandatory.includes(t));

  if (hasMandatory || matched.length >= 2) {
    return {
      required: true,
      reason: `DPIA required: ${matched.join(', ')} (${matched.length} trigger(s) matched)`,
    };
  }

  return {
    required: false,
    reason: `DPIA not required but recommended as good practice (${matched.length} trigger matched)`,
  };
}
```

---

## DPIA Process Methodology

### Step 1: Describe the Processing

Document what data is collected, from whom, how it flows, where it is stored, who accesses it, and how long it is retained.

```yaml
# dpia/processing-description.yml
processing_activity:
  name: "Customer Behavior Analytics Platform"
  description: |
    Collects user interaction data from web and mobile apps,
    combines with purchase history, and generates personalized
    product recommendations using ML models.

  data_subjects:
    - Registered customers (estimated 2M)
    - Website visitors (estimated 10M/month)

  personal_data_categories:
    - Browsing behavior (pages visited, time spent, clicks)
    - Purchase history (products, amounts, dates)
    - Device information (IP, user agent, device ID)
    - Account data (name, email, preferences)
    - Inferred interests (ML-derived categories)

  data_flows:
    - source: "Web/Mobile App"
      destination: "Event Streaming (Kafka)"
      data: "Clickstream events"
      encryption: "TLS 1.3"

    - source: "Kafka"
      destination: "Data Lake (S3)"
      data: "Raw events"
      encryption: "AES-256 at rest"

    - source: "Data Lake"
      destination: "ML Pipeline"
      data: "Pseudonymized events"
      encryption: "AES-256 at rest, TLS in transit"

    - source: "ML Pipeline"
      destination: "Recommendation API"
      data: "User segments, product scores"
      encryption: "TLS 1.3"

  retention:
    raw_events: "90 days"
    aggregated_analytics: "2 years"
    ml_models: "Until replaced"
    user_segments: "Until account deletion"

  recipients:
    internal: ["Product team", "Data science team", "Marketing"]
    external: ["Cloud provider (AWS)", "Analytics vendor (Amplitude)"]

  legal_basis: "Legitimate interest (Recital 47 - direct marketing)"
  consent_fallback: "Consent for profiling beyond basic analytics"
```

### Step 2: Assess Necessity and Proportionality

```typescript
interface NecessityAssessment {
  question: string;
  answer: string;
  compliant: boolean;
}

const NECESSITY_QUESTIONS: NecessityAssessment[] = [
  {
    question: 'Is the processing necessary to achieve the stated purpose?',
    answer: 'Yes — recommendations require behavioral data analysis.',
    compliant: true,
  },
  {
    question: 'Could the same purpose be achieved with less data?',
    answer: 'Partially — we can reduce from 90 to 30 days raw retention.',
    compliant: false, // Action required
  },
  {
    question: 'Is the processing proportionate to the purpose?',
    answer: 'ML profiling goes beyond basic analytics; consent required for profiling.',
    compliant: false, // Action required
  },
  {
    question: 'Are data subjects informed about the processing?',
    answer: 'Privacy notice updated to include ML profiling.',
    compliant: true,
  },
  {
    question: 'Can data subjects exercise their rights effectively?',
    answer: 'Opt-out mechanism available for profiling.',
    compliant: true,
  },
];
```

### Step 3: Identify and Assess Risks

```typescript
interface Risk {
  id: string;
  threat: string;
  description: string;
  affectedRights: string[];
  likelihood: 'LOW' | 'MEDIUM' | 'HIGH';
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  existingControls: string[];
  residualRisk: 'LOW' | 'MEDIUM' | 'HIGH';
}

function calculateRiskLevel(likelihood: string, severity: string): string {
  const matrix: Record<string, Record<string, string>> = {
    LOW:    { LOW: 'LOW',    MEDIUM: 'LOW',      HIGH: 'MEDIUM'   },
    MEDIUM: { LOW: 'LOW',    MEDIUM: 'MEDIUM',   HIGH: 'HIGH'     },
    HIGH:   { LOW: 'MEDIUM', MEDIUM: 'HIGH',     HIGH: 'CRITICAL' },
  };
  return matrix[likelihood][severity];
}

const IDENTIFIED_RISKS: Risk[] = [
  {
    id: 'R001',
    threat: 'Unauthorized access to behavioral profiles',
    description: 'Attacker gains access to detailed user behavior data including browsing patterns and purchase history.',
    affectedRights: ['Right to privacy', 'Right to data protection'],
    likelihood: 'MEDIUM',
    severity: 'HIGH',
    riskLevel: 'HIGH',
    existingControls: ['Encryption at rest', 'Role-based access', 'VPC isolation'],
    residualRisk: 'MEDIUM',
  },
  {
    id: 'R002',
    threat: 'Discriminatory profiling outcomes',
    description: 'ML model creates segments that correlate with protected characteristics.',
    affectedRights: ['Right to non-discrimination', 'Right to fair treatment'],
    likelihood: 'MEDIUM',
    severity: 'HIGH',
    riskLevel: 'HIGH',
    existingControls: ['Bias testing in ML pipeline'],
    residualRisk: 'MEDIUM',
  },
  {
    id: 'R003',
    threat: 'Excessive data retention',
    description: 'Raw behavioral data kept longer than necessary.',
    affectedRights: ['Right to erasure', 'Data minimization'],
    likelihood: 'HIGH',
    severity: 'MEDIUM',
    riskLevel: 'HIGH',
    existingControls: ['Automated retention policies'],
    residualRisk: 'LOW',
  },
  {
    id: 'R004',
    threat: 'Inability to fulfill SARs',
    description: 'Pseudonymized data cannot be linked back for subject access requests.',
    affectedRights: ['Right to access'],
    likelihood: 'LOW',
    severity: 'MEDIUM',
    riskLevel: 'LOW',
    existingControls: ['Pseudonymization mapping maintained'],
    residualRisk: 'LOW',
  },
];
```

### Step 4: Define Mitigation Measures

```typescript
interface Mitigation {
  riskId: string;
  measure: string;
  type: 'TECHNICAL' | 'ORGANIZATIONAL' | 'LEGAL';
  status: 'PLANNED' | 'IN_PROGRESS' | 'IMPLEMENTED';
  owner: string;
  deadline: string;
  effectOnRisk: string;
}

const MITIGATIONS: Mitigation[] = [
  {
    riskId: 'R001',
    measure: 'Implement field-level encryption for behavioral data using customer-managed keys',
    type: 'TECHNICAL',
    status: 'IN_PROGRESS',
    owner: 'Security Engineering',
    deadline: '2024-Q2',
    effectOnRisk: 'Reduces severity: encrypted data useless without keys',
  },
  {
    riskId: 'R001',
    measure: 'Quarterly access reviews for data lake and ML pipeline permissions',
    type: 'ORGANIZATIONAL',
    status: 'IMPLEMENTED',
    owner: 'InfoSec',
    deadline: 'Ongoing',
    effectOnRisk: 'Reduces likelihood: limits who can access data',
  },
  {
    riskId: 'R002',
    measure: 'Automated fairness testing in ML CI/CD pipeline (demographic parity, equalized odds)',
    type: 'TECHNICAL',
    status: 'PLANNED',
    owner: 'ML Engineering',
    deadline: '2024-Q3',
    effectOnRisk: 'Reduces likelihood: catches bias before deployment',
  },
  {
    riskId: 'R002',
    measure: 'Human review of segment definitions before marketing use',
    type: 'ORGANIZATIONAL',
    status: 'IMPLEMENTED',
    owner: 'Data Ethics Committee',
    deadline: 'Ongoing',
    effectOnRisk: 'Reduces severity: prevents discriminatory targeting',
  },
  {
    riskId: 'R003',
    measure: 'Reduce raw event retention from 90 to 30 days; aggregate after 7 days',
    type: 'TECHNICAL',
    status: 'PLANNED',
    owner: 'Data Engineering',
    deadline: '2024-Q2',
    effectOnRisk: 'Reduces likelihood and severity: less data at risk',
  },
];
```

### Step 5: DPO Consultation and Sign-Off

```typescript
interface DPIAApproval {
  dpiaId: string;
  version: string;
  dpoReview: {
    reviewedBy: string;
    reviewDate: string;
    opinion: 'APPROVED' | 'APPROVED_WITH_CONDITIONS' | 'REJECTED';
    conditions?: string[];
    comments: string;
  };
  supervisoryAuthorityConsultation: {
    required: boolean;
    reason: string;      // Required if residual risk remains HIGH after mitigations
    consultedOn?: string;
    response?: string;
  };
  nextReviewDate: string;
}
```

---

## DPIA Document Template

```markdown
# DPIA: [Processing Activity Name]

## 1. Document Control
- **Version:** 1.0
- **Date:** YYYY-MM-DD
- **Author:** [Name, Role]
- **DPO:** [Name]
- **Status:** Draft / Under Review / Approved

## 2. Processing Description
- **Purpose:** [Why this processing is performed]
- **Legal basis:** [Consent / Legitimate interest / Contract / etc.]
- **Data subjects:** [Who]
- **Data categories:** [What personal data]
- **Data flows:** [Diagram or description]
- **Retention periods:** [Per category]
- **Recipients:** [Internal teams, external processors]
- **International transfers:** [Countries, safeguards]

## 3. Necessity and Proportionality
- Is the processing necessary for the purpose?
- Could less data achieve the same result?
- Are data subjects adequately informed?
- Can data subjects exercise their rights?

## 4. Risk Assessment
| Risk ID | Threat | Likelihood | Severity | Risk Level | Existing Controls |
|---------|--------|-----------|----------|------------|-------------------|
| R001    | ...    | ...       | ...      | ...        | ...               |

## 5. Mitigation Measures
| Risk ID | Measure | Type | Owner | Deadline | Status |
|---------|---------|------|-------|----------|--------|
| R001    | ...     | ...  | ...   | ...      | ...    |

## 6. Residual Risk Assessment
[After mitigations, what risk remains?]

## 7. DPO Opinion
[DPO review and approval]

## 8. Supervisory Authority Consultation
[Required if residual risk is HIGH]

## 9. Review Schedule
- **Next review:** [Date]
- **Trigger for re-assessment:** [Material changes to processing]
```

---

## Technical Implementation Checklist

```typescript
const DPIA_TECHNICAL_CHECKLIST = [
  // Data collection
  { category: 'Collection', item: 'Data minimization enforced at API level', status: 'TODO' },
  { category: 'Collection', item: 'Consent collected before processing (if legal basis is consent)', status: 'TODO' },
  { category: 'Collection', item: 'Privacy notice displayed at point of collection', status: 'TODO' },

  // Storage
  { category: 'Storage', item: 'Encryption at rest (AES-256 or equivalent)', status: 'TODO' },
  { category: 'Storage', item: 'PII isolated in separate schema/database', status: 'TODO' },
  { category: 'Storage', item: 'Automated retention enforcement', status: 'TODO' },
  { category: 'Storage', item: 'Backup encryption and access controls', status: 'TODO' },

  // Access
  { category: 'Access', item: 'Role-based access control implemented', status: 'TODO' },
  { category: 'Access', item: 'PII access logged for audit', status: 'TODO' },
  { category: 'Access', item: 'Least-privilege principle enforced', status: 'TODO' },
  { category: 'Access', item: 'Multi-factor authentication for PII access', status: 'TODO' },

  // Transit
  { category: 'Transit', item: 'TLS 1.2+ for all connections', status: 'TODO' },
  { category: 'Transit', item: 'mTLS for internal service communication', status: 'TODO' },
  { category: 'Transit', item: 'API authentication (OAuth2/JWT)', status: 'TODO' },

  // Processing
  { category: 'Processing', item: 'Pseudonymization applied where possible', status: 'TODO' },
  { category: 'Processing', item: 'Purpose limitation enforced programmatically', status: 'TODO' },
  { category: 'Processing', item: 'Automated decision-making has human review option', status: 'TODO' },
  { category: 'Processing', item: 'ML model fairness testing in CI/CD', status: 'TODO' },

  // Subject rights
  { category: 'Rights', item: 'SAR endpoint implemented and tested', status: 'TODO' },
  { category: 'Rights', item: 'Erasure endpoint with cascading deletion', status: 'TODO' },
  { category: 'Rights', item: 'Portability export in machine-readable format', status: 'TODO' },
  { category: 'Rights', item: 'Objection mechanism with processing halt', status: 'TODO' },

  // Incident response
  { category: 'Incident', item: 'Breach detection mechanisms in place', status: 'TODO' },
  { category: 'Incident', item: '72-hour notification process documented', status: 'TODO' },
  { category: 'Incident', item: 'Incident response runbook tested', status: 'TODO' },

  // Monitoring
  { category: 'Monitoring', item: 'PII access anomaly detection', status: 'TODO' },
  { category: 'Monitoring', item: 'Data flow monitoring and alerting', status: 'TODO' },
  { category: 'Monitoring', item: 'Regular vulnerability scanning', status: 'TODO' },
];
```

---

## Anti-Patterns

| Anti-Pattern | Problem | Correct Approach |
|-------------|---------|------------------|
| DPIA after launch | Risks not mitigated before processing starts | Complete DPIA before processing begins |
| One-time DPIA | Risks change as processing evolves | Schedule periodic reviews and trigger re-assessment on changes |
| Only technical risks | GDPR covers rights and freedoms broadly | Assess organizational, legal, and societal risks too |
| No DPO involvement | Missing required consultation | DPO must be consulted on every DPIA (Article 35(2)) |
| Generic risk assessment | Does not address specific processing | Tailor risks to the actual data flows and use cases |
| Skipping supervisory authority consultation | Required when residual risk is high | Consult before processing if mitigations cannot reduce risk |

---

## Production Checklist

- [ ] DPIA triggered assessment completed (two or more criteria matched)
- [ ] Processing activity fully described with data flow diagrams
- [ ] Necessity and proportionality assessed and documented
- [ ] All risks identified with likelihood and severity ratings
- [ ] Mitigation measures defined with owners and deadlines
- [ ] Residual risk assessed after mitigations
- [ ] DPO consulted and opinion recorded
- [ ] Supervisory authority consulted if residual risk remains high
- [ ] DPIA document version-controlled and stored securely
- [ ] Review schedule established (at least annually)
- [ ] Technical checklist items implemented and verified
- [ ] Re-assessment triggers defined (new data source, new purpose, new technology)
