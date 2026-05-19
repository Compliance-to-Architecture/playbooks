# Stripe Billing & Payments Skill

> **Enforcement**: suggest
> **Triggers**: stripe, billing, payment, invoice, subscription, charge, refund, payout, pricing

## Overview

Complete Stripe integration patterns for enterprise SaaS platforms. Covers subscriptions, usage-based billing, invoicing, marketplace payments, and revenue operations.

## Stripe Architecture Patterns

### 1. Subscription Management

```typescript
// packages/billing-core/src/subscriptions.ts
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

interface CreateSubscriptionParams {
  customerId: string;
  priceId: string;
  tenantId: string;
  trialDays?: number;
  metadata?: Record<string, string>;
}

async function createSubscription(params: CreateSubscriptionParams): Promise<Stripe.Subscription> {
  assert(params.customerId, "Customer ID required");
  assert(params.priceId, "Price ID required");

  return stripe.subscriptions.create({
    customer: params.customerId,
    items: [{ price: params.priceId }],
    trial_period_days: params.trialDays,
    metadata: {
      tenant_id: params.tenantId,
      ...params.metadata,
    },
    payment_behavior: "default_incomplete",
    payment_settings: {
      save_default_payment_method: "on_subscription",
    },
    expand: ["latest_invoice.payment_intent"],
  });
}
```

### 2. Usage-Based Metering

```typescript
// packages/stripe-metering/src/meter.ts
interface UsageEvent {
  customerId: string;
  meterId: string;
  value: number;
  timestamp?: number;
  idempotencyKey: string;
}

async function reportUsage(event: UsageEvent): Promise<void> {
  assert(event.value > 0, "Usage value must be positive");
  assert(event.idempotencyKey, "Idempotency key required for dedup");

  await stripe.billing.meterEvents.create({
    event_name: event.meterId,
    payload: {
      stripe_customer_id: event.customerId,
      value: String(event.value),
    },
    timestamp: event.timestamp ?? Math.floor(Date.now() / 1000),
  }, {
    idempotencyKey: event.idempotencyKey,
  });
}
```

### 3. Multi-Tier Pricing

```typescript
// config/stripe/pricing-tiers.ts
export const pricingTiers = {
  starter: {
    name: "Starter",
    annualPriceId: "price_starter_annual",
    features: ["5 users", "10GB storage", "Email support"],
    limits: { users: 5, storage_gb: 10, api_calls_monthly: 10_000 },
  },
  professional: {
    name: "Professional",
    annualPriceId: "price_pro_annual",
    features: ["25 users", "100GB storage", "Priority support", "API access"],
    limits: { users: 25, storage_gb: 100, api_calls_monthly: 100_000 },
  },
  enterprise: {
    name: "Enterprise",
    annualPriceId: "price_ent_annual",
    features: ["Unlimited users", "1TB storage", "24/7 support", "SLA", "SSO"],
    limits: { users: -1, storage_gb: 1000, api_calls_monthly: -1 },
  },
};
```

### 4. Webhook Handling

```typescript
// services/*/src/routes/webhooks/stripe.ts
import { Hono } from "hono";

const webhookRoutes = new Hono();

webhookRoutes.post("/api/v1/webhooks/stripe", async (c) => {
  const sig = c.req.header("stripe-signature");
  assert(sig, "Missing Stripe signature");

  const body = await c.req.text();
  const event = stripe.webhooks.constructEvent(
    body,
    sig,
    process.env.STRIPE_WEBHOOK_SECRET!,
  );

  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await handleSubscriptionChange(event.data.object as Stripe.Subscription);
      break;
    case "invoice.paid":
      await handleInvoicePaid(event.data.object as Stripe.Invoice);
      break;
    case "invoice.payment_failed":
      await handlePaymentFailed(event.data.object as Stripe.Invoice);
      break;
    case "billing.meter.usage_reported":
      await handleUsageReported(event.data.object);
      break;
    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  return c.json({ received: true });
});
```

### 5. Invoicing

```typescript
// packages/billing-core/src/invoices.ts
async function createInvoice(params: {
  customerId: string;
  items: Array<{ description: string; amount: number; currency: string }>;
  dueDate: Date;
  metadata?: Record<string, string>;
}): Promise<Stripe.Invoice> {
  for (const item of params.items) {
    await stripe.invoiceItems.create({
      customer: params.customerId,
      amount: item.amount,
      currency: item.currency,
      description: item.description,
    });
  }

  return stripe.invoices.create({
    customer: params.customerId,
    collection_method: "send_invoice",
    days_until_due: Math.ceil(
      (params.dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    ),
    metadata: params.metadata,
    auto_advance: true,
  });
}
```

## Stripe CLI Commands

```bash
# Listen for webhooks locally
stripe listen --forward-to localhost:3000/api/v1/webhooks/stripe

# List customers
stripe customers list --limit 10

# Create a test subscription
stripe subscriptions create --customer cus_xxx --price price_xxx

# View recent invoices
stripe invoices list --limit 10 --status open

# Trigger test events
stripe trigger invoice.payment_succeeded
stripe trigger customer.subscription.created

# Manage products/prices
stripe products list
stripe prices list --product prod_xxx
```

## Required Environment Variables

| Variable | Purpose |
|----------|---------|
| `STRIPE_SECRET_KEY` | Server-side API key |
| `STRIPE_PUBLISHABLE_KEY` | Client-side API key |
| `STRIPE_WEBHOOK_SECRET` | Webhook signature verification |
| `STRIPE_CONNECT_ACCOUNT_ID` | For marketplace (Connect) |

## Compliance Considerations

- **PCI DSS**: Never log full card numbers. Use Stripe Elements/Checkout for card collection.
- **SCA/PSD2**: Use `payment_behavior: "default_incomplete"` for 3D Secure support.
- **Invoicing**: Include tax IDs, billing addresses for EU VAT compliance.
- **Data Retention**: Stripe retains data per their DPA. Configure retention policies.
- **Audit Trail**: Log all billing events with tenant_id, amount, currency, status.

## Core Principles

- **Webhook-first architecture**: Drive all billing state changes from Stripe webhooks, not API polling; webhooks are the source of truth for subscription and invoice status
- **Idempotency on every write**: All Stripe API calls that create or mutate resources must include an idempotency key to prevent duplicate charges on retries
- **PCI scope minimization**: Never handle raw card data server-side; use Stripe Elements or Checkout to keep your systems out of PCI DSS scope
- **Metering before billing**: Usage events must be recorded with idempotency keys and batched before reporting to Stripe; lost usage events are lost revenue
- **Test mode parity**: All billing flows must be developed and tested against Stripe test mode with test clocks before touching live mode

## Patterns

- **Signature-verified webhook handler**: Always verify the `stripe-signature` header using `stripe.webhooks.constructEvent()` before processing any event
- **Expand related objects**: Use Stripe's `expand` parameter (e.g., `latest_invoice.payment_intent`) to reduce API round-trips when creating subscriptions
- **Stripe test clocks for time-dependent flows**: Use Stripe test clocks to simulate trial expiration, renewal, and dunning without waiting real calendar time
- **Metadata for cross-referencing**: Store `tenant_id`, `plan_id`, and internal identifiers in Stripe metadata to correlate Stripe objects with your database
- **Price-based plan changes**: Model upgrades/downgrades as Stripe subscription item price changes with explicit proration behavior

## Anti-Patterns

- **Storing card details server-side**: Never accept, transmit, or store raw card numbers; this violates PCI DSS and Stripe's Terms of Service
- **Relying on return URLs for state**: Do not use Checkout Session `success_url` redirects as confirmation of payment; use the `checkout.session.completed` webhook instead
- **Hardcoding Stripe Price IDs**: Do not embed `price_xxx` identifiers in application code; store them in configuration or database keyed by plan tier
- **Ignoring webhook event ordering**: Stripe does not guarantee webhook delivery order; design handlers to be idempotent and tolerate out-of-order events
- **Skipping webhook signature verification**: Processing unverified webhook payloads allows attackers to forge billing events and grant unauthorized access

## Checklist

- [ ] All Stripe API calls include idempotency keys for create/update operations
- [ ] Webhook endpoint verifies `stripe-signature` before processing
- [ ] Subscription creation uses `payment_behavior: "default_incomplete"` for SCA compliance
- [ ] Usage metering reports events with idempotency keys and batches appropriately
- [ ] Stripe metadata includes `tenant_id` on all customer, subscription, and invoice objects

## References

- [Stripe API Reference](https://docs.stripe.com/api)
- [Stripe Webhooks Best Practices](https://docs.stripe.com/webhooks/best-practices)
- [Stripe Billing Subscriptions](https://docs.stripe.com/billing/subscriptions/overview)
- [Stripe Test Clocks](https://docs.stripe.com/billing/testing/test-clocks)
- [Stripe PCI Compliance Guide](https://stripe.com/docs/security/guide)

