# Marketplace & Multi-Party Payments Skill

> **Enforcement**: suggest
> **Triggers**: marketplace, connect, platform-fee, split-payment, payout, seller, vendor, commission, escrow

## Overview

Multi-party payment patterns for marketplace platforms using Stripe Connect. Covers platform fees, seller payouts, split payments, escrow, and marketplace compliance.

## Marketplace Architecture

```
Buyer → Platform (your app) → Stripe Connect → Seller
                │                                  │
                ├── Platform fee (your revenue)     │
                └── Remainder ────────────────────→ Seller bank account
```

## Stripe Connect Models

| Model | Use Case | Platform Control |
|-------|----------|-----------------|
| **Standard** | Sellers manage their own Stripe | Low — sellers own their dashboard |
| **Express** | Simplified onboarding | Medium — platform controls UX |
| **Custom** | Full control | High — platform owns everything |

## Account Onboarding (Express)

```typescript
// packages/marketplace-core/src/onboarding.ts

async function createSellerAccount(params: {
  email: string;
  businessType: "individual" | "company";
  country: string;
  platformAccountId: string;
}): Promise<{ accountId: string; onboardingUrl: string }> {
  const account = await stripe.accounts.create({
    type: "express",
    email: params.email,
    business_type: params.businessType,
    country: params.country,
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    metadata: {
      platform_id: params.platformAccountId,
    },
  });

  const accountLink = await stripe.accountLinks.create({
    account: account.id,
    refresh_url: `${BASE_URL}/sellers/onboarding/refresh`,
    return_url: `${BASE_URL}/sellers/onboarding/complete`,
    type: "account_onboarding",
  });

  return { accountId: account.id, onboardingUrl: accountLink.url };
}
```

## Split Payments (PaymentIntents)

```typescript
// packages/marketplace-core/src/payments.ts

async function createMarketplacePayment(params: {
  amount: number;
  currency: string;
  sellerAccountId: string;
  platformFeePercent: number;
  buyerCustomerId: string;
  description: string;
}): Promise<Stripe.PaymentIntent> {
  const platformFee = Math.round(params.amount * params.platformFeePercent / 100);

  return stripe.paymentIntents.create({
    amount: params.amount,
    currency: params.currency,
    customer: params.buyerCustomerId,
    description: params.description,
    application_fee_amount: platformFee,
    transfer_data: {
      destination: params.sellerAccountId,
    },
    metadata: {
      seller_id: params.sellerAccountId,
      platform_fee: String(platformFee),
      fee_percent: String(params.platformFeePercent),
    },
  });
}
```

## Escrow / Delayed Payouts

```typescript
// packages/marketplace-core/src/escrow.ts

async function createEscrowPayment(params: {
  amount: number;
  currency: string;
  sellerAccountId: string;
  platformFee: number;
  releaseCondition: string;
}): Promise<{ paymentIntent: Stripe.PaymentIntent; transferId?: string }> {
  // 1. Charge the buyer (funds held on platform)
  const paymentIntent = await stripe.paymentIntents.create({
    amount: params.amount,
    currency: params.currency,
    capture_method: "manual", // Authorize only, capture later
    metadata: {
      escrow: "true",
      seller_id: params.sellerAccountId,
      release_condition: params.releaseCondition,
    },
  });

  return { paymentIntent };
}

async function releaseEscrow(params: {
  paymentIntentId: string;
  sellerAccountId: string;
  platformFee: number;
}): Promise<Stripe.Transfer> {
  // 1. Capture the payment
  await stripe.paymentIntents.capture(params.paymentIntentId);

  // 2. Transfer to seller (minus platform fee)
  const paymentIntent = await stripe.paymentIntents.retrieve(params.paymentIntentId);
  const transferAmount = paymentIntent.amount - params.platformFee;

  return stripe.transfers.create({
    amount: transferAmount,
    currency: paymentIntent.currency,
    destination: params.sellerAccountId,
    source_transaction: paymentIntent.latest_charge as string,
    metadata: {
      payment_intent: params.paymentIntentId,
      platform_fee: String(params.platformFee),
    },
  });
}
```

## Seller Payouts

```typescript
// packages/marketplace-core/src/payouts.ts

async function getSellerBalance(sellerAccountId: string): Promise<{
  available: number;
  pending: number;
  currency: string;
}> {
  const balance = await stripe.balance.retrieve({
    stripeAccount: sellerAccountId,
  });

  return {
    available: balance.available[0]?.amount ?? 0,
    pending: balance.pending[0]?.amount ?? 0,
    currency: balance.available[0]?.currency ?? "usd",
  };
}

async function createPayout(params: {
  sellerAccountId: string;
  amount: number;
  currency: string;
}): Promise<Stripe.Payout> {
  return stripe.payouts.create(
    {
      amount: params.amount,
      currency: params.currency,
    },
    { stripeAccount: params.sellerAccountId },
  );
}
```

## Commission Structures

```typescript
// packages/marketplace-core/src/commissions.ts

type CommissionModel =
  | { type: "flat"; amount: number }
  | { type: "percentage"; rate: number; min?: number; max?: number }
  | { type: "tiered"; tiers: Array<{ upTo: number; rate: number }> }
  | { type: "category"; rates: Record<string, number> };

function calculateCommission(
  model: CommissionModel,
  transactionAmount: number,
  category?: string,
): number {
  switch (model.type) {
    case "flat":
      return model.amount;
    case "percentage": {
      const fee = Math.round(transactionAmount * model.rate / 100);
      if (model.min && fee < model.min) return model.min;
      if (model.max && fee > model.max) return model.max;
      return fee;
    }
    case "tiered": {
      const tier = model.tiers.find(t => transactionAmount <= t.upTo)
        ?? model.tiers[model.tiers.length - 1];
      return Math.round(transactionAmount * tier!.rate / 100);
    }
    case "category": {
      const rate = category ? model.rates[category] ?? 10 : 10;
      return Math.round(transactionAmount * rate / 100);
    }
  }
}
```

## Marketplace Compliance

- **KYC/AML**: Stripe handles identity verification for Express/Custom accounts
- **Tax Reporting**: Use Stripe Tax for automated tax calculation; 1099 reporting for US sellers
- **Platform Terms**: Sellers must accept platform ToS via Stripe account agreement
- **Dispute Handling**: Platform is liable for disputes on direct charges
- **Refunds**: Platform must handle refund logic (partial refunds, return policies)

## Core Principles

- **Connect Model Selection is Irreversible**: Choose the Stripe Connect model (Standard, Express, Custom) before onboarding any sellers — migrating between models requires sellers to re-onboard. Express is the recommended default for most platforms.
- **Platform Bears Dispute Liability on Direct Charges**: When using direct charges (charge on seller's account), the seller bears dispute liability. When using destination charges (charge on platform, transfer to seller), the platform bears liability. Know which model you operate before going live.
- **Escrow Requires Explicit Capture**: Use `capture_method: "manual"` to authorize funds without capturing. Funds are held for up to 7 days. Capture must be triggered explicitly after the release condition is met (delivery confirmed, service completed).
- **Commission Calculation is Pre-Tax**: Platform fees are calculated on the pre-tax amount. Apply commission logic before Stripe Tax computes the applicable VAT/GST, then pass the total to the PaymentIntent.
- **Payout Schedules Must Match Seller Expectations**: Default Stripe payouts are T+2 for US and T+7 for international. Set explicit payout schedules per seller account and communicate them clearly during onboarding to avoid support escalations.

## Patterns

- **Idempotency Keys on All Transfers**: Pass an `idempotencyKey` on every `stripe.transfers.create()` call using a deterministic identifier (e.g., `order_id + "_transfer"`). This prevents duplicate transfers if the release-escrow function retries after a network failure.
- **Webhook-Driven Payout State Machine**: Drive seller payout status (`pending`, `in_transit`, `paid`, `failed`) from Stripe `payout.*` webhook events rather than polling the API. Store state in your database and expose it in your seller dashboard.
- **Tiered Commission with Category Overrides**: Implement commissions as a pluggable `CommissionModel` so category-specific rates (e.g., electronics 5%, handmade 12%) can be configured per tenant without code changes.
- **Seller Dashboard via Connect Account Balance**: Retrieve live seller balance with `stripe.balance.retrieve({ stripeAccount: sellerAccountId })`. Cache for 60 seconds in Redis to avoid hitting rate limits on high-traffic seller dashboards.
- **Onboarding Completion Webhook**: Listen for `account.updated` events and check `charges_enabled && payouts_enabled` to confirm a seller has completed onboarding. Do not rely solely on the `return_url` redirect, which can be bypassed.

## Anti-Patterns

- **Transferring Before Capture**: Attempting a `stripe.transfers.create()` before the underlying charge is captured results in an insufficient funds error. Always capture the PaymentIntent before initiating the transfer in escrow flows.
- **Storing Stripe Account IDs Without Verification**: Accepting a `stripeAccountId` from the client and using it directly in transfer calls allows a malicious actor to redirect payouts to an attacker-controlled account. Always look up the seller account ID from your own database using the authenticated seller's record.
- **Flat Commission for All Transaction Sizes**: Applying a flat percentage commission on very small transactions often results in a platform fee below Stripe's processing cost floor. Use `min` commission floors to ensure every transaction is at least cost-neutral.
- **Bypassing Stripe's KYC for Express Accounts**: Never attempt to onboard sellers without completing the Stripe-hosted account link flow. Manually creating transfers to accounts with incomplete KYC violates Stripe's ToS and anti-money-laundering regulations.
- **Ignoring `account.application.deauthorized` Webhooks**: If a seller disconnects your platform from their Standard Connect account, you must stop sending transfers immediately. Failing to handle this webhook results in failed transfers and support incidents.

## Checklist

- [ ] Stripe Connect model selected (Standard / Express / Custom) and documented
- [ ] Seller onboarding via `stripe.accountLinks.create()` with `account_onboarding` type
- [ ] `account.updated` webhook handled to confirm `charges_enabled && payouts_enabled`
- [ ] All `stripe.transfers.create()` calls include an idempotency key
- [ ] Escrow flows use `capture_method: "manual"` and capture before transfer
- [ ] Commission model is configurable per tenant/category without code changes
- [ ] Payout schedules communicated to sellers during onboarding
- [ ] `account.application.deauthorized` webhook handled to halt transfers immediately
- [ ] Seller account IDs resolved from database, never trusted from client input

## References

- [Stripe Connect Overview](https://stripe.com/docs/connect)
- [Stripe Connect Account Types](https://stripe.com/docs/connect/accounts)
- [Stripe Destination Charges](https://stripe.com/docs/connect/destination-charges)
- [Stripe Separate Charges and Transfers](https://stripe.com/docs/connect/charges-transfers)
- [Stripe Payouts](https://stripe.com/docs/payouts)
