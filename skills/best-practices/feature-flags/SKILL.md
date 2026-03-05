---
name: feature-flags
description: |
  Feature flag management. LaunchDarkly, Unleash, Flagsmith, and custom
  implementations. Gradual rollouts, A/B testing, kill switches,
  and flag lifecycle management.

  USE WHEN: user mentions "feature flag", "feature toggle", "LaunchDarkly",
  "Unleash", "Flagsmith", "gradual rollout", "A/B test", "canary release",
  "kill switch"

  DO NOT USE FOR: CI/CD deployment strategies - use `github-actions`;
  environment config - use environment variable patterns
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Feature Flags

## LaunchDarkly

```typescript
import * as LaunchDarkly from '@launchdarkly/node-server-sdk';

const client = LaunchDarkly.init(process.env.LD_SDK_KEY!);
await client.waitForInitialization();

// Evaluate flag
const showNewUI = await client.variation('new-dashboard-ui', {
  key: user.id,
  email: user.email,
  custom: { plan: user.plan },
}, false); // default value

if (showNewUI) {
  renderNewDashboard();
} else {
  renderLegacyDashboard();
}
```

### React SDK

```tsx
import { useFlags, withLDProvider } from 'launchdarkly-react-client-sdk';

function Dashboard() {
  const { newDashboardUi, maxUploadSize } = useFlags();

  return newDashboardUi ? <NewDashboard maxUpload={maxUploadSize} /> : <LegacyDashboard />;
}

// Wrap app
export default withLDProvider({
  clientSideID: process.env.NEXT_PUBLIC_LD_CLIENT_ID!,
  context: { kind: 'user', key: user.id, email: user.email },
})(App);
```

## Unleash (self-hosted)

```typescript
import { initialize } from 'unleash-client';

const unleash = initialize({
  url: 'https://unleash.example.com/api',
  appName: 'my-app',
  customHeaders: { Authorization: process.env.UNLEASH_API_KEY! },
});

if (unleash.isEnabled('new-checkout', { userId: user.id })) {
  // New checkout flow
}
```

## Custom Implementation (simple)

```typescript
interface FeatureFlags {
  [key: string]: {
    enabled: boolean;
    rolloutPercentage?: number;
    allowedUsers?: string[];
  };
}

class FlagService {
  constructor(private flags: FeatureFlags) {}

  isEnabled(flag: string, userId?: string): boolean {
    const config = this.flags[flag];
    if (!config?.enabled) return false;
    if (config.allowedUsers?.includes(userId!)) return true;
    if (config.rolloutPercentage != null && userId) {
      const hash = simpleHash(userId + flag) % 100;
      return hash < config.rolloutPercentage;
    }
    return config.enabled;
  }
}
```

## Flag Types

| Type | Purpose | Example |
|------|---------|---------|
| Boolean | On/off toggle | `new-ui-enabled` |
| Percentage rollout | Gradual release | 10% → 50% → 100% |
| User targeting | Specific users | Beta testers, internal |
| Multivariate | A/B/C testing | `checkout-variant: "A"` |
| Kill switch | Emergency disable | `payments-enabled` |

## Anti-Patterns

| Anti-Pattern | Fix |
|--------------|-----|
| Flags that live forever | Set expiration, clean up after full rollout |
| Flag checks deep in code | Check at entry points, pass result down |
| No default values | Always provide sensible defaults |
| Testing only flagged-on path | Test both paths in CI |
| Flags in tight loops | Cache flag evaluation result |

## Production Checklist

- [ ] Default values for all flags (graceful degradation)
- [ ] Flag naming convention (`feature-name-action`)
- [ ] Cleanup process for fully-rolled-out flags
- [ ] Monitoring: flag evaluation metrics
- [ ] Testing both flag states in CI
- [ ] Audit log of flag changes
