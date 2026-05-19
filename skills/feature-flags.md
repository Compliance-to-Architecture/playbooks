# Feature Flags

> LaunchDarkly, Unleash, custom flags, A/B testing, gradual rollout, kill switches, and experiment design for controlled feature delivery.

## Core Principles

1. **Flags Are Temporary by Default** — Every feature flag has a planned removal date. Permanent flags (kill switches, entitlements) are explicitly marked as such. Stale flags are technical debt.
2. **Flags Decouple Deploy from Release** — Deploy code continuously. Release features independently. This enables trunk-based development, reduces merge conflicts, and allows instant rollback without redeployment.
3. **Evaluate Server-Side for Security** — Sensitive flags (billing tiers, compliance features, admin access) must be evaluated server-side. Client-side evaluation exposes flag logic and can be manipulated.
4. **Context-Aware Targeting** — Flags evaluate against context (user, tenant, environment, percentage). Design flag evaluation to accept rich context objects, not just boolean toggles.
5. **Measure Everything** — Every flag should have associated metrics. If you cannot measure whether a flag improves outcomes, you cannot make data-driven release decisions.

## Patterns

### Pattern 1: Type-Safe Flag System

```typescript
import { z } from 'zod';

// Define all flags with types and defaults
const FlagDefinitions = {
  'new-contract-wizard': {
    type: z.boolean(),
    default: false,
    description: 'New multi-step contract creation wizard',
    owner: 'contracts-team',
    removeBy: '2025-06-01',
  },
  'sukuk-rail-v2': {
    type: z.boolean(),
    default: false,
    description: 'Sukuk rail v2 with enhanced compliance',
    owner: 'rails-team',
    removeBy: '2025-07-01',
  },
  'pricing-tier-display': {
    type: z.enum(['simple', 'detailed', 'comparison']),
    default: 'simple' as const,
    description: 'Pricing page layout variant',
    owner: 'growth-team',
    removeBy: '2025-05-15',
  },
  'max-contracts-per-tenant': {
    type: z.number(),
    default: 100,
    description: 'Per-tenant contract limit',
    owner: 'platform-team',
    permanent: true,
  },
} as const;

type FlagName = keyof typeof FlagDefinitions;

interface EvaluationContext {
  tenantId: string;
  userId: string;
  plan: 'free' | 'standard' | 'enterprise';
  environment: 'dev' | 'staging' | 'production';
}

async function getFlag<K extends FlagName>(
  name: K,
  context: EvaluationContext,
): Promise<z.infer<typeof FlagDefinitions[K]['type']>> {
  const definition = FlagDefinitions[name];
  const override = await flagStore.evaluate(name, context);
  if (override !== undefined) {
    return definition.type.parse(override);
  }
  return definition.default;
}
```

### Pattern 2: Percentage-Based Rollout

```typescript
function isInRolloutPercentage(
  flagName: string,
  identifier: string, // tenantId or userId
  percentage: number,
): boolean {
  assert(percentage >= 0 && percentage <= 100, 'Percentage must be 0-100');

  // Deterministic hash — same user always gets same result
  const hash = createHash('sha256')
    .update(`${flagName}:${identifier}`)
    .digest();
  const value = hash.readUInt32BE(0) % 100;

  return value < percentage;
}

// Usage: Gradual rollout
async function evaluateGradualRollout(
  flagName: string,
  context: EvaluationContext,
): Promise<boolean> {
  const rolloutConfig = await db.flagRollout.findUnique({
    where: { flagName },
  });

  if (!rolloutConfig) return false;

  // Check explicit overrides first (specific tenants)
  if (rolloutConfig.enabledTenants.includes(context.tenantId)) return true;
  if (rolloutConfig.disabledTenants.includes(context.tenantId)) return false;

  // Percentage rollout
  return isInRolloutPercentage(flagName, context.tenantId, rolloutConfig.percentage);
}
```

### Pattern 3: Kill Switch Pattern

```typescript
// Kill switches are permanent flags for instant feature disabling
const KILL_SWITCHES = {
  'disable-external-payments': {
    description: 'Immediately halt all external payment processing',
    severity: 'critical',
    notifyOnActivation: ['oncall-payments@iof.com'],
  },
  'disable-contract-creation': {
    description: 'Halt new contract creation across all tenants',
    severity: 'high',
    notifyOnActivation: ['oncall-contracts@iof.com'],
  },
} as const;

async function isKilled(switch_name: keyof typeof KILL_SWITCHES): Promise<boolean> {
  // Kill switches use Redis for sub-millisecond reads
  const value = await redis.get(`kill:${switch_name}`);
  return value === '1';
}

// API to activate kill switch
app.post('/api/v1/admin/kill-switch/:name', requireRole('super_admin'), async (c) => {
  const name = c.req.param('name');
  assert(name in KILL_SWITCHES, `Unknown kill switch: ${name}`);

  await redis.set(`kill:${name}`, '1');
  await auditLog.record({
    action: 'kill_switch_activated',
    actor: c.get('userId'),
    target: name,
    reason: await c.req.json().then(b => b.reason),
  });

  // Notify immediately
  const config = KILL_SWITCHES[name as keyof typeof KILL_SWITCHES];
  await notify(config.notifyOnActivation, `Kill switch activated: ${name}`);

  return c.json({ activated: true });
});
```

### Pattern 4: A/B Test with Metrics

```typescript
interface Experiment {
  name: string;
  variants: { name: string; weight: number }[];
  metrics: string[];
  startDate: Date;
  endDate: Date;
}

async function assignVariant(
  experiment: Experiment,
  userId: string,
): Promise<string> {
  // Check existing assignment for consistency
  const existing = await db.experimentAssignment.findUnique({
    where: { experimentName_userId: { experimentName: experiment.name, userId } },
  });
  if (existing) return existing.variant;

  // Assign deterministically
  const hash = createHash('sha256').update(`${experiment.name}:${userId}`).digest();
  const value = (hash.readUInt32BE(0) % 1000) / 1000;

  let cumulative = 0;
  let assignedVariant = experiment.variants[0].name;
  for (const variant of experiment.variants) {
    cumulative += variant.weight;
    if (value < cumulative) {
      assignedVariant = variant.name;
      break;
    }
  }

  await db.experimentAssignment.create({
    data: { experimentName: experiment.name, userId, variant: assignedVariant },
  });

  return assignedVariant;
}
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Better Approach |
|---|---|---|
| Flags that never get removed | Exponential code path complexity | Set removeBy date, audit stale flags monthly |
| Client-side evaluation of security flags | Users can manipulate flag values | Server-side evaluation for security-sensitive flags |
| Nested flag conditions | Impossible to reason about behavior | Flatten flag logic, one flag per decision point |
| No default values | Crash when flag service unavailable | Always define safe defaults that degrade gracefully |
| Hardcoded percentage rollouts | Cannot adjust without deploy | Store rollout config in database or flag service |
| Testing only with flags on | Missing test coverage for flag-off paths | Test both flag states in CI |

## Implementation Checklist

- [ ] Define type-safe flag registry with owners and removal dates
- [ ] Implement server-side evaluation with rich context objects
- [ ] Set up percentage-based rollout with deterministic hashing
- [ ] Create kill switch mechanism with Redis-backed reads
- [ ] Build A/B testing framework with variant assignment and metrics
- [ ] Add flag audit logging (who changed what, when)
- [ ] Configure stale flag detection and alerts
- [ ] Test both flag-on and flag-off paths in CI

## References

- [LaunchDarkly Documentation](https://docs.launchdarkly.com/)
- [Unleash Feature Toggles](https://docs.getunleash.io/)
- [Martin Fowler: Feature Toggles](https://martinfowler.com/articles/feature-toggles.html)
- [Statsig Experimentation](https://docs.statsig.com/)
