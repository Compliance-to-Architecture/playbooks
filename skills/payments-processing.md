# Payment Processing Skill

> **Enforcement**: suggest
> **Triggers**: payment, checkout, transaction, refund, payout, settlement, payment-gateway, PSP

## Overview

Enterprise payment processing patterns covering multi-provider support, payment orchestration, fraud detection, reconciliation, and settlement flows.

## Payment Architecture

```
Customer → Checkout UI → Payment Intent API → Payment Orchestrator
                                                      │
                                    ┌─────────────────┼─────────────────┐
                                    │                 │                 │
                              Stripe PSP        Adyen PSP        PayPal PSP
                                    │                 │                 │
                                    └─────────────────┼─────────────────┘
                                                      │
                                              Payment Result
                                                      │
                                    ┌─────────────────┼─────────────────┐
                                    │                 │                 │
                              Ledger Entry    Webhook Notify    Reconciliation
```

## Payment Orchestrator Pattern

```typescript
// packages/payments-core/src/orchestrator.ts

interface PaymentRequest {
  tenantId: string;
  customerId: string;
  amount: number;
  currency: string;
  paymentMethod: string;
  idempotencyKey: string;
  metadata?: Record<string, string>;
}

interface PaymentResult {
  id: string;
  status: "succeeded" | "pending" | "failed" | "requires_action";
  provider: string;
  providerTransactionId: string;
  amount: number;
  currency: string;
  failureReason?: string;
  redirectUrl?: string;
}

interface PaymentProvider {
  name: string;
  createPayment(request: PaymentRequest): Promise<PaymentResult>;
  capturePayment(paymentId: string): Promise<PaymentResult>;
  refundPayment(paymentId: string, amount?: number): Promise<PaymentResult>;
  getPayment(paymentId: string): Promise<PaymentResult>;
}

class PaymentOrchestrator {
  private providers: Map<string, PaymentProvider> = new Map();
  private routingRules: RoutingRule[] = [];

  registerProvider(provider: PaymentProvider): void {
    this.providers.set(provider.name, provider);
  }

  async processPayment(request: PaymentRequest): Promise<PaymentResult> {
    // 1. Select provider based on routing rules
    const provider = this.selectProvider(request);
    assert(provider, `No provider available for ${request.currency}`);

    // 2. Fraud check
    const fraudResult = await this.checkFraud(request);
    if (fraudResult.blocked) {
      throw new PaymentBlockedError(fraudResult.reason);
    }

    // 3. Process payment
    const result = await provider.createPayment(request);

    // 4. Record in ledger
    await this.recordTransaction(request, result);

    // 5. Emit event
    await this.emitPaymentEvent(request, result);

    return result;
  }

  private selectProvider(request: PaymentRequest): PaymentProvider {
    for (const rule of this.routingRules) {
      if (rule.matches(request)) {
        const provider = this.providers.get(rule.providerName);
        if (provider) return provider;
      }
    }
    // Fallback to default provider
    return this.providers.values().next().value!;
  }
}
```

## Refund Handling

```typescript
// packages/payments-core/src/refunds.ts

interface RefundRequest {
  paymentId: string;
  amount?: number; // Partial refund if specified
  reason: "requested_by_customer" | "duplicate" | "fraudulent" | "other";
  tenantId: string;
  requestedBy: string;
}

async function processRefund(request: RefundRequest): Promise<RefundResult> {
  assert(request.paymentId, "Payment ID required");
  assert(request.reason, "Refund reason required");

  // 1. Validate refund is allowed
  const payment = await getPayment(request.paymentId);
  assert(payment.status === "succeeded", "Can only refund succeeded payments");

  const refundAmount = request.amount ?? payment.amount;
  assert(refundAmount <= payment.amount, "Refund amount exceeds payment");

  // 2. Process with provider
  const provider = getProviderForPayment(payment);
  const result = await provider.refundPayment(payment.providerTransactionId, refundAmount);

  // 3. Reverse ledger entry
  await reverseLedgerEntry(payment, refundAmount);

  // 4. Audit trail
  await auditLog.record({
    action: "refund_processed",
    paymentId: request.paymentId,
    amount: refundAmount,
    reason: request.reason,
    requestedBy: request.requestedBy,
    tenantId: request.tenantId,
  });

  return result;
}
```

## Reconciliation

```typescript
// packages/payments-core/src/reconciliation.ts

interface ReconciliationReport {
  date: string;
  provider: string;
  matched: number;
  unmatched: number;
  discrepancies: Array<{
    transactionId: string;
    ledgerAmount: number;
    providerAmount: number;
    difference: number;
  }>;
}

async function reconcileDaily(
  provider: string,
  date: string,
): Promise<ReconciliationReport> {
  // 1. Get provider settlements
  const providerTransactions = await getProviderSettlement(provider, date);

  // 2. Get internal ledger entries
  const ledgerEntries = await getLedgerEntriesForDate(date, provider);

  // 3. Match and report
  const report = matchTransactions(providerTransactions, ledgerEntries);

  // 4. Alert on discrepancies
  if (report.unmatched > 0 || report.discrepancies.length > 0) {
    await alertOps("reconciliation_discrepancy", report);
  }

  return report;
}
```

## Multi-Currency Support

```typescript
// packages/payments-core/src/currency.ts

const ZERO_DECIMAL_CURRENCIES = new Set([
  "BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW",
  "MGA", "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF",
]);

function toSmallestUnit(amount: number, currency: string): number {
  if (ZERO_DECIMAL_CURRENCIES.has(currency.toUpperCase())) {
    return Math.round(amount);
  }
  return Math.round(amount * 100);
}

function fromSmallestUnit(amount: number, currency: string): number {
  if (ZERO_DECIMAL_CURRENCIES.has(currency.toUpperCase())) {
    return amount;
  }
  return amount / 100;
}
```

## Required Skills Integration

- **stripe-billing.md** — Stripe-specific implementation
- **subscription-management.md** — Subscription lifecycle
- **marketplace-payments.md** — Multi-party payments

## Core Principles

- **Idempotency on every mutation**: All payment creation, capture, and refund operations must accept and enforce idempotency keys
- **Ledger is the source of truth**: Every payment state change must be recorded as a double-entry ledger transaction before returning success
- **Provider abstraction**: Business logic must never depend on a specific PSP; all providers implement the same `PaymentProvider` interface
- **Reconciliation is mandatory**: Daily automated reconciliation between internal ledger and provider settlement reports; discrepancies trigger alerts
- **Amounts in smallest currency unit**: All internal representations use smallest denomination (cents, fils) to avoid floating-point errors

## Patterns

- **Payment orchestrator with routing rules**: Select PSP based on currency, geography, payment method, and cost optimization rules
- **Fraud check before processing**: Run fraud scoring before submitting to the payment provider; block high-risk transactions
- **Webhook-driven state updates**: Never poll for payment status; rely on provider webhooks with signature verification
- **Partial capture and refund support**: Design payment flows to support authorization-then-capture and partial refund from day one
- **Multi-currency with explicit conversion**: Store original currency and converted amount separately; never silently convert currencies

## Anti-Patterns

- **Floating-point currency arithmetic**: Never use `float` or `double` for money; use integer smallest-unit representation
- **Synchronous settlement assumptions**: Do not assume payment succeeds immediately; always handle pending/async states
- **Missing audit trail on refunds**: Every refund must record who requested it, why, and the resulting ledger reversal
- **Single provider dependency**: Never build payment flows that only work with one PSP; always maintain a fallback provider
- **Ignoring zero-decimal currencies**: Failing to account for currencies like JPY and KRW that have no fractional units

## Checklist

- [ ] All payment operations use idempotency keys
- [ ] Ledger entries created for every payment state transition (charge, capture, refund, dispute)
- [ ] Webhook endpoints verify provider signatures before processing
- [ ] Daily reconciliation job runs and alerts on discrepancies
- [ ] Multi-currency conversion uses explicit rates with audit trail

## References

- [Stripe PaymentIntents API](https://docs.stripe.com/api/payment_intents)
- [PCI DSS compliance guide](https://www.pcisecuritystandards.org/)
- [ISO 4217 currency codes](https://www.iso.org/iso-4217-currency-codes.html)
- [Martin Fowler — Patterns of Enterprise Application Architecture (Money pattern)](https://martinfowler.com/eaaCatalog/money.html)
