# Anonymization Techniques for GDPR Compliance

## Overview

Anonymization transforms personal data so that the data subject is **no longer identifiable**, even by the data controller. Truly anonymized data falls outside the scope of GDPR entirely (Recital 26). However, anonymization is difficult to achieve in practice — poorly anonymized data can be re-identified through linkage attacks, inference, or auxiliary data.

This guide covers anonymization techniques, differential privacy, data masking, tokenization, database implementations, and testing anonymization effectiveness.

---

## Anonymization vs Pseudonymization

| Aspect | Anonymization | Pseudonymization |
|--------|--------------|-----------------|
| Reversible | No | Yes (with mapping key) |
| GDPR scope | Outside GDPR | Still personal data |
| Re-identification risk | Negligible | Possible if key is compromised |
| Data utility | Lower (generalized) | Higher (structure preserved) |
| Use case | Public datasets, analytics | Internal processing, research |

---

## K-Anonymity

A dataset satisfies **k-anonymity** if every combination of quasi-identifiers (age, zip code, gender, etc.) appears in at least **k** records. This prevents singling out an individual.

```python
# k_anonymity.py
import pandas as pd
from typing import List

def check_k_anonymity(df: pd.DataFrame, quasi_identifiers: List[str], k: int) -> dict:
    """Check if a dataset satisfies k-anonymity."""
    groups = df.groupby(quasi_identifiers).size().reset_index(name='count')
    violations = groups[groups['count'] < k]

    return {
        'satisfies_k_anonymity': len(violations) == 0,
        'k': k,
        'total_groups': len(groups),
        'violating_groups': len(violations),
        'min_group_size': groups['count'].min(),
        'violations': violations.to_dict('records') if len(violations) > 0 else [],
    }

def generalize_for_k_anonymity(
    df: pd.DataFrame,
    quasi_identifiers: List[str],
    k: int,
    generalization_rules: dict
) -> pd.DataFrame:
    """Apply generalization to achieve k-anonymity."""
    result = df.copy()

    for column, rule in generalization_rules.items():
        if column not in quasi_identifiers:
            continue

        if rule['type'] == 'range':
            # Generalize numeric values into ranges
            bin_size = rule['bin_size']
            result[column] = result[column].apply(
                lambda x: f"{(x // bin_size) * bin_size}-{(x // bin_size) * bin_size + bin_size - 1}"
            )

        elif rule['type'] == 'prefix':
            # Generalize strings by truncation (e.g., zip code 90210 -> 902**)
            length = rule['keep_length']
            result[column] = result[column].astype(str).str[:length] + '*' * (len(str(result[column].iloc[0])) - length)

        elif rule['type'] == 'hierarchy':
            # Use a generalization hierarchy (e.g., city -> state -> country)
            mapping = rule['mapping']
            result[column] = result[column].map(mapping).fillna('Other')

    # Verify k-anonymity after generalization
    check = check_k_anonymity(result, quasi_identifiers, k)
    if not check['satisfies_k_anonymity']:
        raise ValueError(f"Generalization insufficient: min group size = {check['min_group_size']}")

    return result

# Example usage
generalization_rules = {
    'age':      {'type': 'range', 'bin_size': 10},           # 25 -> "20-29"
    'zip_code': {'type': 'prefix', 'keep_length': 3},        # 90210 -> "902**"
    'city':     {'type': 'hierarchy', 'mapping': {
        'San Francisco': 'California', 'Los Angeles': 'California',
        'New York': 'New York State', 'Brooklyn': 'New York State',
    }},
}
```

---

## L-Diversity

K-anonymity is vulnerable to **homogeneity attacks** (all k records have the same sensitive value). **L-diversity** requires that each equivalence class has at least **l** well-represented values for sensitive attributes.

```python
def check_l_diversity(
    df: pd.DataFrame,
    quasi_identifiers: List[str],
    sensitive_attr: str,
    l: int
) -> dict:
    """Check if a dataset satisfies l-diversity."""
    groups = df.groupby(quasi_identifiers)[sensitive_attr].nunique().reset_index(name='distinct_sensitive')
    violations = groups[groups['distinct_sensitive'] < l]

    return {
        'satisfies_l_diversity': len(violations) == 0,
        'l': l,
        'sensitive_attribute': sensitive_attr,
        'total_groups': len(groups),
        'violating_groups': len(violations),
        'min_diversity': groups['distinct_sensitive'].min(),
    }
```

---

## T-Closeness

L-diversity does not prevent **skewness attacks** (sensitive attribute distribution in a group differs significantly from the overall distribution). **T-closeness** requires the distribution of sensitive values in each group to be within distance **t** of the overall distribution.

```python
from scipy.spatial.distance import jensenshannon
import numpy as np

def check_t_closeness(
    df: pd.DataFrame,
    quasi_identifiers: List[str],
    sensitive_attr: str,
    t: float
) -> dict:
    """Check if a dataset satisfies t-closeness using Jensen-Shannon divergence."""
    overall_dist = df[sensitive_attr].value_counts(normalize=True).sort_index()

    violations = []
    for name, group in df.groupby(quasi_identifiers):
        group_dist = group[sensitive_attr].value_counts(normalize=True).reindex(overall_dist.index, fill_value=0)
        distance = jensenshannon(overall_dist.values, group_dist.values)

        if distance > t:
            violations.append({
                'group': name,
                'distance': round(distance, 4),
                'threshold': t,
            })

    return {
        'satisfies_t_closeness': len(violations) == 0,
        't': t,
        'total_groups': df.groupby(quasi_identifiers).ngroups,
        'violating_groups': len(violations),
        'violations': violations[:10],  # Show first 10
    }
```

---

## Differential Privacy

Differential privacy provides a mathematical guarantee that the output of a query does not reveal whether any individual's data is in the dataset. It works by adding calibrated noise.

```python
import numpy as np

class DifferentialPrivacy:
    """Laplace mechanism for differential privacy."""

    def __init__(self, epsilon: float):
        """
        Args:
            epsilon: Privacy budget. Lower = more privacy, less accuracy.
                     Typical values: 0.1 (strong), 1.0 (moderate), 10.0 (weak).
        """
        self.epsilon = epsilon

    def laplace_mechanism(self, true_value: float, sensitivity: float) -> float:
        """Add Laplace noise to a numeric query result.

        Args:
            true_value: The actual query result.
            sensitivity: Maximum change in output from adding/removing one record.
        """
        scale = sensitivity / self.epsilon
        noise = np.random.laplace(0, scale)
        return true_value + noise

    def count_query(self, true_count: int) -> int:
        """Privacy-preserving count query (sensitivity = 1)."""
        return max(0, round(self.laplace_mechanism(true_count, sensitivity=1)))

    def sum_query(self, true_sum: float, value_range: tuple[float, float]) -> float:
        """Privacy-preserving sum query."""
        sensitivity = value_range[1] - value_range[0]
        return self.laplace_mechanism(true_sum, sensitivity)

    def mean_query(self, true_mean: float, n: int, value_range: tuple[float, float]) -> float:
        """Privacy-preserving mean query."""
        sensitivity = (value_range[1] - value_range[0]) / n
        return self.laplace_mechanism(true_mean, sensitivity)

# Example usage
dp = DifferentialPrivacy(epsilon=1.0)

true_count = 1547
private_count = dp.count_query(true_count)
# private_count might be 1549 or 1544 — close but not exact

true_avg_salary = 75000.0
private_avg = dp.mean_query(true_avg_salary, n=1000, value_range=(30000, 200000))
# private_avg might be 75023.17 — utility preserved, privacy guaranteed
```

---

## Data Masking

### Static Masking (For Non-Production Environments)

```typescript
// masking/static-masker.ts
interface MaskingRule {
  column: string;
  strategy: 'HASH' | 'FAKE' | 'REDACT' | 'SHUFFLE' | 'TRUNCATE' | 'NULL';
  options?: Record<string, unknown>;
}

const MASKING_RULES: MaskingRule[] = [
  { column: 'email',      strategy: 'FAKE',     options: { domain: 'example.com' } },
  { column: 'first_name', strategy: 'FAKE'      },
  { column: 'last_name',  strategy: 'FAKE'      },
  { column: 'phone',      strategy: 'REDACT',   options: { keepLast: 4, char: '*' } },
  { column: 'ssn',        strategy: 'HASH'      },
  { column: 'salary',     strategy: 'SHUFFLE'   },
  { column: 'notes',      strategy: 'NULL'      },
  { column: 'zip_code',   strategy: 'TRUNCATE', options: { keepLength: 3 } },
];

function applyMask(value: string, rule: MaskingRule): string {
  switch (rule.strategy) {
    case 'HASH':
      return createHash('sha256').update(value).digest('hex').slice(0, 16);
    case 'REDACT':
      const keep = (rule.options?.keepLast as number) ?? 0;
      const char = (rule.options?.char as string) ?? '*';
      return char.repeat(Math.max(0, value.length - keep)) + value.slice(-keep);
    case 'TRUNCATE':
      const len = (rule.options?.keepLength as number) ?? 3;
      return value.slice(0, len) + '*'.repeat(Math.max(0, value.length - len));
    case 'NULL':
      return '';
    case 'SHUFFLE':
      return value; // Shuffle handled at dataset level
    case 'FAKE':
      return generateFake(rule.column, rule.options);
    default:
      return value;
  }
}
```

### Dynamic Masking (At Query Time)

```sql
-- PostgreSQL: Row-Level Security + Dynamic Masking View
CREATE OR REPLACE VIEW public.customers_masked AS
SELECT
  id,
  CASE
    WHEN current_setting('app.user_role', true) IN ('admin', 'dpo')
    THEN email
    ELSE regexp_replace(email, '(^.{2})(.*)(@.*)', '\1***\3')
  END AS email,
  CASE
    WHEN current_setting('app.user_role', true) IN ('admin', 'dpo')
    THEN full_name
    ELSE substring(full_name from 1 for 1) || '***'
  END AS full_name,
  CASE
    WHEN current_setting('app.user_role', true) IN ('admin', 'dpo', 'support')
    THEN phone
    ELSE '***-***-' || right(phone, 4)
  END AS phone,
  -- Non-PII fields pass through
  account_type,
  created_at,
  last_login
FROM customers;

-- Grant access to masked view only
GRANT SELECT ON public.customers_masked TO app_user;
REVOKE SELECT ON public.customers FROM app_user;
```

---

## Tokenization

Replace sensitive values with non-reversible tokens. Unlike pseudonymization, tokenization does not preserve the format by default (though format-preserving tokenization exists).

```typescript
// tokenization/tokenizer.ts
import { randomBytes, createHash } from 'crypto';

class TokenVault {
  private vault: Map<string, string> = new Map(); // token -> original (secure storage)

  tokenize(value: string): string {
    // Check if already tokenized
    for (const [token, original] of this.vault) {
      if (original === value) return token;
    }

    // Generate random token
    const token = `TOK_${randomBytes(16).toString('hex')}`;
    this.vault.set(token, value);
    return token;
  }

  detokenize(token: string): string | null {
    return this.vault.get(token) ?? null;
  }

  // Format-preserving tokenization for credit cards
  formatPreservingTokenize(ccNumber: string): string {
    const prefix = ccNumber.slice(0, 6);  // BIN preserved for routing
    const suffix = ccNumber.slice(-4);     // Last 4 for display
    const middle = randomBytes(3).toString('hex').slice(0, 6); // Random middle
    return `${prefix}${middle}${suffix}`;
  }
}
```

---

## PostgreSQL Anonymization Implementation

```sql
-- Extension for anonymization functions
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS anon CASCADE;  -- PostgreSQL Anonymizer extension

-- Define masking rules declaratively
SELECT anon.init();

SECURITY LABEL FOR anon ON COLUMN customers.email
  IS 'MASKED WITH FUNCTION anon.fake_email()';

SECURITY LABEL FOR anon ON COLUMN customers.full_name
  IS 'MASKED WITH FUNCTION anon.fake_first_name() || '' '' || anon.fake_last_name()';

SECURITY LABEL FOR anon ON COLUMN customers.phone
  IS 'MASKED WITH FUNCTION anon.partial(phone, 0, ''***-***-'', 4)';

SECURITY LABEL FOR anon ON COLUMN customers.date_of_birth
  IS 'MASKED WITH FUNCTION anon.generalize_daterange(date_of_birth, ''decade'')';

-- Create anonymized export for analytics
CREATE MATERIALIZED VIEW analytics.customers_anon AS
SELECT
  md5(id::text || 'salt_value') AS anon_id,
  EXTRACT(YEAR FROM date_of_birth) / 10 * 10 AS birth_decade,
  LEFT(zip_code, 3) || '**' AS zip_prefix,
  account_type,
  created_at::date AS signup_date,
  CASE
    WHEN total_purchases > 1000 THEN 'high'
    WHEN total_purchases > 100  THEN 'medium'
    ELSE 'low'
  END AS purchase_tier
FROM customers;

-- Refresh periodically
REFRESH MATERIALIZED VIEW analytics.customers_anon;
```

---

## MongoDB Anonymization Implementation

```javascript
// mongodb-anonymize.js
const { MongoClient } = require('mongodb');
const crypto = require('crypto');
const { faker } = require('@faker-js/faker');

async function anonymizeCollection(sourceDb, targetDb, collectionName, rules) {
  const sourceColl = sourceDb.collection(collectionName);
  const targetColl = targetDb.collection(collectionName);

  const cursor = sourceColl.find({});

  const batchSize = 1000;
  let batch = [];

  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    const anonymized = applyRules(doc, rules);
    batch.push(anonymized);

    if (batch.length >= batchSize) {
      await targetColl.insertMany(batch);
      batch = [];
    }
  }

  if (batch.length > 0) {
    await targetColl.insertMany(batch);
  }
}

function applyRules(doc, rules) {
  const result = { ...doc };

  for (const [field, rule] of Object.entries(rules)) {
    if (result[field] === undefined) continue;

    switch (rule.type) {
      case 'hash':
        result[field] = crypto.createHash('sha256')
          .update(String(result[field]) + rule.salt)
          .digest('hex');
        break;

      case 'fake':
        result[field] = faker[rule.category][rule.method]();
        break;

      case 'generalize':
        if (rule.strategy === 'range' && typeof result[field] === 'number') {
          const bin = rule.binSize;
          const lower = Math.floor(result[field] / bin) * bin;
          result[field] = `${lower}-${lower + bin - 1}`;
        }
        break;

      case 'suppress':
        delete result[field];
        break;

      case 'noise':
        if (typeof result[field] === 'number') {
          const noise = (Math.random() - 0.5) * 2 * rule.magnitude;
          result[field] = Math.round(result[field] + noise);
        }
        break;
    }
  }

  // Remove MongoDB _id to avoid conflicts
  delete result._id;
  return result;
}

// Example rules
const customerRules = {
  email:         { type: 'fake', category: 'internet', method: 'email' },
  name:          { type: 'fake', category: 'person', method: 'fullName' },
  phone:         { type: 'fake', category: 'phone', method: 'number' },
  dateOfBirth:   { type: 'generalize', strategy: 'range', binSize: 3650 }, // ~decade
  salary:        { type: 'noise', magnitude: 5000 },
  ssn:           { type: 'suppress' },
  address:       { type: 'suppress' },
};
```

---

## Testing Anonymization Effectiveness

```python
# test_anonymization.py
import pandas as pd
from typing import List

def re_identification_risk(
    anonymized_df: pd.DataFrame,
    original_df: pd.DataFrame,
    quasi_identifiers: List[str]
) -> dict:
    """Estimate re-identification risk by attempting to link records."""
    # Attempt exact match on quasi-identifiers
    merged = anonymized_df.merge(
        original_df,
        on=quasi_identifiers,
        how='inner',
        suffixes=('_anon', '_orig')
    )

    unique_matches = merged.groupby(quasi_identifiers).size()
    unique_individuals = (unique_matches == 1).sum()

    total_records = len(anonymized_df)
    risk = unique_individuals / total_records if total_records > 0 else 0

    return {
        'total_records': total_records,
        'uniquely_identifiable': int(unique_individuals),
        're_identification_risk': round(risk, 4),
        'risk_level': 'HIGH' if risk > 0.05 else 'MEDIUM' if risk > 0.01 else 'LOW',
        'recommendation': 'Further generalization needed' if risk > 0.05 else 'Acceptable',
    }

def information_loss(
    original_df: pd.DataFrame,
    anonymized_df: pd.DataFrame,
    numeric_columns: List[str]
) -> dict:
    """Measure utility loss from anonymization."""
    losses = {}
    for col in numeric_columns:
        if col in original_df.columns and col in anonymized_df.columns:
            orig_mean = original_df[col].mean()
            anon_mean = anonymized_df[col].mean()
            orig_std = original_df[col].std()
            anon_std = anonymized_df[col].std()

            losses[col] = {
                'mean_shift': round(abs(orig_mean - anon_mean) / orig_mean * 100, 2),
                'std_ratio': round(anon_std / orig_std, 2) if orig_std > 0 else None,
            }

    return {
        'column_losses': losses,
        'acceptable': all(
            v['mean_shift'] < 5.0 for v in losses.values()
        ),
    }

# Run the full test suite
def validate_anonymization(original_path: str, anonymized_path: str):
    original = pd.read_csv(original_path)
    anonymized = pd.read_csv(anonymized_path)

    quasi_ids = ['age_range', 'zip_prefix', 'gender']

    results = {
        'k_anonymity': check_k_anonymity(anonymized, quasi_ids, k=5),
        'l_diversity': check_l_diversity(anonymized, quasi_ids, 'diagnosis', l=3),
        't_closeness': check_t_closeness(anonymized, quasi_ids, 'diagnosis', t=0.15),
        're_identification': re_identification_risk(anonymized, original, quasi_ids),
        'information_loss': information_loss(original, anonymized, ['age', 'income']),
    }

    print("=== Anonymization Validation Report ===")
    for test_name, result in results.items():
        status = 'PASS' if result.get('satisfies_k_anonymity', result.get('acceptable', True)) else 'FAIL'
        print(f"  {test_name}: {status}")
        for key, value in result.items():
            print(f"    {key}: {value}")

    return results
```

---

## Anti-Patterns

| Anti-Pattern | Problem | Correct Approach |
|-------------|---------|------------------|
| Removing names only | Quasi-identifiers enable re-identification | Apply k-anonymity on all quasi-identifiers |
| Low k value (k=2) | Too easy to narrow down individuals | Use k >= 5, ideally k >= 10 for sensitive data |
| Ignoring auxiliary data | External datasets can be linked | Test against known auxiliary datasets |
| Anonymizing then adding unique IDs | Unique IDs defeat anonymization | Use group-level identifiers only |
| No post-anonymization testing | Cannot verify effectiveness | Run re-identification risk analysis |
| Keeping original alongside anonymized | Original data negates anonymization | Delete or segregate originals |
| Static masking in production | Masked data may be inconsistent | Use dynamic masking for production access control |

---

## Production Checklist

- [ ] Anonymization technique selected based on data type and use case
- [ ] K-anonymity verified with k >= 5 for all quasi-identifier groups
- [ ] L-diversity verified for sensitive attributes
- [ ] T-closeness verified for skewed distributions
- [ ] Differential privacy epsilon chosen and documented
- [ ] Static masking applied to all non-production environments
- [ ] Dynamic masking configured for role-based access in production
- [ ] Tokenization vault secured with separate access controls
- [ ] Re-identification risk assessed and documented
- [ ] Information loss measured and within acceptable bounds
- [ ] Anonymization process is repeatable and automated
- [ ] Original data access restricted after anonymization
- [ ] Anonymization tested against known linkage attacks
- [ ] Documentation includes technique, parameters, and risk assessment
