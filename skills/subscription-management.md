# Subscription Management Skill

> **Enforcement**: suggest
> **Triggers**: subscription, plan, tier, upgrade, downgrade, trial, churn, renewal, cancellation, MRR, ARR

## Overview

Complete subscription lifecycle management for SaaS platforms. Covers plan creation, trial management, upgrades/downgrades, cancellation flows, churn prevention, and revenue metrics.

## Subscription Lifecycle

```
Trial → Active → [Upgrade/Downgrade] → Active → Past Due → Canceled
  │                                                │
  └── Trial Expired ─────────────────────────────→ │
                                                    │
                                              Churned/Expired
```

## Plan Architecture

```typescript
// packages/billing-core/src/plans.ts

interface SubscriptionPlan {
  id: string;
  name: string;
  tier: "free" | "starter" | "professional" | "enterprise";
  pricing: {
    monthly: { amount: number; currency: string; stripePriceId: string };
    yearly: { amount: number; currency: string; stripePriceId: string };
  };
  features: PlanFeature[];
  limits: PlanLimits;
  trialDays: number;
  isPublic: boolean;
}

interface PlanFeature {
  key: string;
  label: string;
  included: boolean;
  limit?: number;
  unit?: string;
}

interface PlanLimits {
  users: number;           // -1 = unlimited
  storage_gb: number;
  api_calls_monthly: number;
  workspaces: number;
  integrations: number;
  custom_domains: number;
  sla_uptime?: number;     // e.g., 99.9
  support_level: "community" | "email" | "priority" | "dedicated";
}
```

## Upgrade/Downgrade Flow

```typescript
// packages/billing-core/src/plan-changes.ts

async function changePlan(params: {
  tenantId: string;
  currentPlanId: string;
  newPlanId: string;
  billingCycle: "monthly" | "yearly";
  proration: "create_prorations" | "none" | "always_invoice";
}): Promise<PlanChangeResult> {
  const currentPlan = await getPlan(params.currentPlanId);
  const newPlan = await getPlan(params.newPlanId);

  assert(currentPlan, "Current plan not found");
  assert(newPlan, "New plan not found");

  const isUpgrade = getPlanRank(newPlan) > getPlanRank(currentPlan);

  // Update Stripe subscription
  const subscription = await stripe.subscriptions.update(subscriptionId, {
    items: [{
      id: currentItemId,
      price: newPlan.pricing[params.billingCycle].stripePriceId,
    }],
    proration_behavior: params.proration,
    metadata: {
      previous_plan: currentPlan.id,
      change_type: isUpgrade ? "upgrade" : "downgrade",
    },
  });

  // Update tenant limits
  await updateTenantLimits(params.tenantId, newPlan.limits);

  // Audit trail
  await auditLog.record({
    action: isUpgrade ? "plan_upgraded" : "plan_downgraded",
    tenantId: params.tenantId,
    from: currentPlan.id,
    to: newPlan.id,
  });

  return { subscription, isUpgrade, effectiveDate: new Date() };
}
```

## Trial Management

```typescript
// packages/billing-core/src/trials.ts

async function startTrial(params: {
  tenantId: string;
  planId: string;
  trialDays: number;
  email: string;
}): Promise<TrialResult> {
  // Create Stripe customer + subscription with trial
  const customer = await stripe.customers.create({
    email: params.email,
    metadata: { tenant_id: params.tenantId },
  });

  const subscription = await stripe.subscriptions.create({
    customer: customer.id,
    items: [{ price: plan.pricing.monthly.stripePriceId }],
    trial_period_days: params.trialDays,
    trial_settings: {
      end_behavior: { missing_payment_method: "cancel" },
    },
  });

  // Schedule trial expiry notifications
  await scheduleNotification(params.tenantId, "trial_expiring_soon", {
    sendAt: addDays(new Date(), params.trialDays - 3),
  });
  await scheduleNotification(params.tenantId, "trial_expired", {
    sendAt: addDays(new Date(), params.trialDays),
  });

  return { customer, subscription, trialEndsAt: addDays(new Date(), params.trialDays) };
}
```

## Cancellation & Churn Prevention

```typescript
// packages/billing-core/src/cancellation.ts

interface CancellationRequest {
  tenantId: string;
  reason: string;
  feedback?: string;
  cancelImmediately: boolean;
}

async function processCancellation(request: CancellationRequest): Promise<void> {
  // 1. Record cancellation reason for analytics
  await recordChurnReason(request.tenantId, request.reason, request.feedback);

  // 2. Cancel subscription
  if (request.cancelImmediately) {
    await stripe.subscriptions.cancel(subscriptionId);
  } else {
    // Cancel at period end (customer keeps access until then)
    await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    });
  }

  // 3. Schedule data retention cleanup
  await scheduleDataRetention(request.tenantId, {
    gracePeriodDays: 30,
    exportDataBefore: true,
  });

  // 4. Send confirmation
  await sendEmail(request.tenantId, "subscription_canceled", {
    reason: request.reason,
    accessUntil: subscription.current_period_end,
  });
}
```

## Revenue Metrics

```typescript
// packages/billing-core/src/metrics.ts

interface RevenueMetrics {
  mrr: number;           // Monthly Recurring Revenue
  arr: number;           // Annual Recurring Revenue
  churnRate: number;     // Monthly churn rate (%)
  ltv: number;           // Customer Lifetime Value
  arpu: number;          // Average Revenue Per User
  netRevenueRetention: number; // NRR (%)
  trialConversionRate: number;
  activeSubscriptions: number;
  trialSubscriptions: number;
  canceledThisMonth: number;
}

async function calculateRevenueMetrics(): Promise<RevenueMetrics> {
  const subscriptions = await stripe.subscriptions.list({
    status: "active",
    limit: 100,
  });

  const mrr = subscriptions.data.reduce((sum, sub) => {
    const item = sub.items.data[0];
    if (!item?.price) return sum;
    const monthlyAmount = item.price.recurring?.interval === "year"
      ? item.price.unit_amount! / 12
      : item.price.unit_amount!;
    return sum + monthlyAmount;
  }, 0) / 100;

  return {
    mrr,
    arr: mrr * 12,
    // ... other metrics calculated similarly
  };
}
```

## Entitlements (Feature Gating)

```typescript
// packages/entitlements-core/src/check.ts

async function checkEntitlement(
  tenantId: string,
  feature: string,
): Promise<{ allowed: boolean; limit?: number; used?: number }> {
  const tenant = await getTenant(tenantId);
  const plan = await getPlan(tenant.planId);
  const featureDef = plan.features.find(f => f.key === feature);

  if (!featureDef || !featureDef.included) {
    return { allowed: false };
  }

  if (featureDef.limit && featureDef.limit > 0) {
    const used = await getUsageCount(tenantId, feature);
    return { allowed: used < featureDef.limit, limit: featureDef.limit, used };
  }

  return { allowed: true };
}
```

## Core Principles

- **Subscriptions are state machines**: Every subscription transition (trial, active, past_due, canceled) must follow a defined state machine with explicit guard conditions
- **Proration is mandatory on plan changes**: Upgrades and downgrades must always calculate and apply proration; silent over/under-charging erodes customer trust
- **Cancellation is not deletion**: Canceled subscriptions retain access until period end by default; data retention and export must be offered before hard deletion
- **Entitlements derive from plan, not subscription status**: Feature gating checks the plan's feature set, not the raw Stripe subscription object
- **Churn data is a product input**: Cancellation reasons and feedback must be captured, stored, and surfaced to product teams for retention improvement

## Patterns

- **Cancel at period end by default**: Use `cancel_at_period_end: true` so customers retain access for the remainder of their paid period
- **Trial expiry notification sequence**: Schedule notifications at trial start (welcome), 3 days before expiry (reminder), and at expiry (convert or lose access)
- **Plan rank comparison for upgrade detection**: Assign numeric ranks to plan tiers so upgrade vs. downgrade logic is a simple integer comparison
- **Entitlement cache with plan-change invalidation**: Cache entitlement lookups in Redis keyed by tenant ID; invalidate on plan change webhooks
- **Revenue metrics from Stripe data**: Calculate MRR by normalizing all subscription amounts to monthly equivalents; annualize for ARR

## Anti-Patterns

- **Immediate cancellation without confirmation**: Canceling a subscription instantly without offering cancel-at-period-end frustrates customers who expected continued access
- **Skipping proration on downgrades**: Not issuing proration credits on downgrades leads to customer complaints and potential chargeback disputes
- **Feature checks against subscription status only**: Checking `subscription.status === "active"` without verifying plan-level entitlements allows access to features above the customer's tier
- **Hardcoded trial durations**: Embedding trial lengths in code prevents A/B testing different trial periods; store in plan configuration
- **Ignoring `customer.subscription.updated` webhooks**: Failing to handle subscription update events causes local state to drift from Stripe's source of truth

## Checklist

- [ ] Subscription state machine documented with all valid transitions
- [ ] Proration applied on all mid-cycle plan changes (upgrade and downgrade)
- [ ] Cancellation flow captures reason, offers cancel-at-period-end, and schedules data retention
- [ ] Trial expiry notifications scheduled at subscription creation
- [ ] Entitlement checks use plan feature definitions, not raw subscription status

## References

- [Stripe Subscription Lifecycle](https://docs.stripe.com/billing/subscriptions/overview)
- [Stripe Proration Behavior](https://docs.stripe.com/billing/subscriptions/prorations)
- [Stripe Customer Portal](https://docs.stripe.com/customer-management)
- [SaaS Metrics — MRR, ARR, Churn](https://baremetrics.com/academy/saas-metrics)
