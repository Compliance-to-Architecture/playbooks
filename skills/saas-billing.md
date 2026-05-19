# SaaS Billing & Revenue Operations Skill

> **Enforcement**: suggest
> **Triggers**: billing, revenue, pricing, quota, usage, metering, overage, dunning, tax, coupon, discount

## Overview

End-to-end SaaS billing patterns covering pricing models, usage tracking, quota enforcement, dunning management, tax compliance, and revenue recognition.

## Pricing Models

| Model | Description | Best For |
|-------|-------------|----------|
| **Flat Rate** | Fixed monthly/yearly price | Simple products |
| **Per Seat** | Price × number of users | Collaboration tools |
| **Usage-Based** | Pay for what you use | API platforms, infrastructure |
| **Tiered** | Volume discounts at thresholds | Storage, data processing |
| **Freemium** | Free tier + paid upgrades | Consumer SaaS, developer tools |
| **Hybrid** | Base fee + usage overage | Enterprise platforms |

## Usage Tracking & Metering

```typescript
// packages/billing-core/src/usage-tracking.ts

interface UsageRecord {
  tenantId: string;
  metricKey: string;
  value: number;
  timestamp: Date;
  idempotencyKey: string;
  metadata?: Record<string, string>;
}

const USAGE_METRICS = {
  api_calls: { unit: "request", aggregation: "sum" },
  storage_bytes: { unit: "byte", aggregation: "max" },
  compute_seconds: { unit: "second", aggregation: "sum" },
  active_users: { unit: "user", aggregation: "max" },
  data_transfer_bytes: { unit: "byte", aggregation: "sum" },
  documents_generated: { unit: "document", aggregation: "sum" },
} as const;

class UsageTracker {
  async record(record: UsageRecord): Promise<void> {
    // 1. Validate metric exists
    assert(record.metricKey in USAGE_METRICS, `Unknown metric: ${record.metricKey}`);
    assert(record.value >= 0, "Usage value must be non-negative");

    // 2. Store in time-series database (ClickHouse)
    await this.store.insert("usage_events", {
      tenant_id: record.tenantId,
      metric_key: record.metricKey,
      value: record.value,
      timestamp: record.timestamp,
      idempotency_key: record.idempotencyKey,
    });

    // 3. Update running total in cache (Redis)
    await this.cache.incrBy(
      `usage:${record.tenantId}:${record.metricKey}:${currentPeriod()}`,
      record.value,
    );

    // 4. Check quota limits
    await this.checkQuota(record.tenantId, record.metricKey);

    // 5. Report to Stripe for billing
    if (this.config.billing.provider === "stripe") {
      await this.reportToStripe(record);
    }
  }

  async checkQuota(tenantId: string, metricKey: string): Promise<void> {
    const current = await this.getCurrentUsage(tenantId, metricKey);
    const limit = await this.getLimit(tenantId, metricKey);

    if (limit > 0 && current >= limit * 0.8) {
      await this.notify(tenantId, "usage_warning", { metricKey, current, limit });
    }
    if (limit > 0 && current >= limit) {
      await this.notify(tenantId, "usage_limit_reached", { metricKey, current, limit });
      await this.enforceLimit(tenantId, metricKey);
    }
  }
}
```

## Quota Enforcement

```typescript
// packages/billing-core/src/quota.ts

type EnforcementAction = "block" | "throttle" | "allow_overage" | "notify_only";

interface QuotaPolicy {
  metricKey: string;
  warningThreshold: number;  // 0.8 = 80%
  enforcementAction: EnforcementAction;
  overageRate?: number;      // Cost per unit over limit
  gracePeriodHours?: number;
}

async function enforceQuota(
  tenantId: string,
  metricKey: string,
  policy: QuotaPolicy,
): Promise<{ allowed: boolean; message?: string }> {
  const usage = await getCurrentUsage(tenantId, metricKey);
  const limit = await getLimit(tenantId, metricKey);

  if (limit <= 0) return { allowed: true }; // Unlimited

  const utilization = usage / limit;

  if (utilization < policy.warningThreshold) {
    return { allowed: true };
  }

  if (utilization >= 1.0) {
    switch (policy.enforcementAction) {
      case "block":
        return { allowed: false, message: `${metricKey} quota exceeded (${usage}/${limit})` };
      case "throttle":
        await applyRateLimit(tenantId, metricKey);
        return { allowed: true, message: "Rate limited due to quota" };
      case "allow_overage":
        await recordOverage(tenantId, metricKey, usage - limit, policy.overageRate!);
        return { allowed: true, message: "Overage charges apply" };
      case "notify_only":
        return { allowed: true, message: "Quota exceeded — notification sent" };
    }
  }

  return { allowed: true };
}
```

## Dunning (Failed Payment Recovery)

```typescript
// packages/billing-core/src/dunning.ts

const DUNNING_SCHEDULE = [
  { day: 0, action: "retry_payment", email: "payment_failed" },
  { day: 3, action: "retry_payment", email: "payment_retry_1" },
  { day: 7, action: "retry_payment", email: "payment_retry_2" },
  { day: 14, action: "retry_payment", email: "payment_final_warning" },
  { day: 21, action: "cancel_subscription", email: "subscription_canceled" },
];

async function processDunning(invoice: StripeInvoice): Promise<void> {
  const daysSinceFailure = daysBetween(invoice.created, Date.now());
  const step = DUNNING_SCHEDULE.find(s => s.day === daysSinceFailure);

  if (!step) return;

  if (step.action === "retry_payment") {
    await stripe.invoices.pay(invoice.id);
  } else if (step.action === "cancel_subscription") {
    await stripe.subscriptions.cancel(invoice.subscription as string);
  }

  await sendEmail(invoice.customer as string, step.email, {
    invoiceUrl: invoice.hosted_invoice_url,
    amount: invoice.amount_due,
  });
}
```

## Tax Compliance

```typescript
// packages/billing-core/src/tax.ts

// Use Stripe Tax for automatic tax calculation
async function createTaxAwarePayment(params: {
  amount: number;
  currency: string;
  customerCountry: string;
  customerId: string;
}): Promise<Stripe.PaymentIntent> {
  return stripe.paymentIntents.create({
    amount: params.amount,
    currency: params.currency,
    customer: params.customerId,
    automatic_payment_methods: { enabled: true },
    // Stripe Tax calculates VAT/GST/Sales tax automatically
    metadata: {
      customer_country: params.customerCountry,
    },
  });
}
```

## Revenue Recognition

```typescript
// packages/billing-core/src/revenue.ts

interface RevenueEntry {
  tenantId: string;
  amount: number;
  currency: string;
  recognitionDate: Date;
  source: "subscription" | "usage" | "one_time" | "marketplace_fee";
  deferred: boolean;
}

// ASC 606 / IFRS 15 revenue recognition
async function recognizeRevenue(entry: RevenueEntry): Promise<void> {
  if (entry.deferred) {
    // Defer recognition to service delivery period
    await ledger.createEntry({
      debit: "deferred_revenue",
      credit: "cash",
      amount: entry.amount,
      date: entry.recognitionDate,
    });
  } else {
    // Immediate recognition
    await ledger.createEntry({
      debit: "cash",
      credit: "revenue",
      amount: entry.amount,
      date: entry.recognitionDate,
    });
  }
}
```

## Coupons & Discounts

```typescript
// packages/billing-core/src/coupons.ts

async function createCoupon(params: {
  name: string;
  type: "percent_off" | "amount_off";
  value: number;
  currency?: string;
  maxRedemptions?: number;
  expiresAt?: Date;
  appliesTo?: string[];  // Plan IDs
}): Promise<Stripe.Coupon> {
  return stripe.coupons.create({
    name: params.name,
    percent_off: params.type === "percent_off" ? params.value : undefined,
    amount_off: params.type === "amount_off" ? params.value : undefined,
    currency: params.currency,
    max_redemptions: params.maxRedemptions,
    redeem_by: params.expiresAt ? Math.floor(params.expiresAt.getTime() / 1000) : undefined,
    metadata: {
      applies_to: params.appliesTo?.join(",") ?? "all",
    },
  });
}
```

## Core Principles

- **Usage metering is append-only**: Usage records are immutable events; corrections are new records with negative values, never mutations
- **Quota enforcement at the edge**: Check quotas before processing requests, not after; over-limit detection must be low-latency
- **Revenue recognition follows delivery**: Recognize revenue when the service is delivered (ASC 606 / IFRS 15), not when payment is received
- **Dunning is graduated**: Failed payment recovery follows a time-based escalation schedule with increasing urgency
- **Tax compliance is automated**: Use provider-native tax calculation (Stripe Tax) rather than building custom tax logic

## Patterns

- **Hybrid pricing model**: Combine a base subscription fee with usage-based overage charges for predictable revenue with upside
- **Running totals in cache**: Maintain real-time usage counters in Redis alongside durable storage in ClickHouse for fast quota checks
- **Coupon stacking rules**: Define clear precedence when multiple discounts apply (percentage before fixed, max one per category)
- **Grace period on limit enforcement**: Allow a configurable grace period after quota is reached before hard-blocking
- **Billing cycle alignment**: Align all usage metering windows to the subscription billing cycle, not calendar months

## Anti-Patterns

- **Mutable usage records**: Never update or delete usage events; this breaks audit trails and reconciliation
- **Synchronous metering in hot paths**: Do not make blocking calls to the billing provider on every API request; batch and async-report usage
- **Hardcoded pricing**: Never embed prices, tier thresholds, or discount values in application code; store in configuration or Stripe
- **Ignoring proration on plan changes**: Always calculate and apply proration credits/charges when customers upgrade or downgrade mid-cycle
- **Tax logic in application code**: Do not build custom VAT/GST/sales tax calculations; use Stripe Tax or a dedicated tax service

## Checklist

- [ ] Usage events are idempotent (deduplicated by idempotency key)
- [ ] Quota checks execute in under 10ms using cached running totals
- [ ] Dunning schedule is configured with retry attempts and notification emails
- [ ] Revenue entries distinguish between immediate and deferred recognition
- [ ] Coupon redemption limits and expiry dates are enforced at creation and application time

## References

- [Stripe Billing documentation](https://docs.stripe.com/billing)
- [Stripe Usage-Based Billing](https://docs.stripe.com/billing/subscriptions/usage-based)
- [ASC 606 Revenue Recognition standard](https://asc.fasb.org/606)
- [Stripe Tax documentation](https://docs.stripe.com/tax)
