# CQRS & Event Sourcing

> Command-query separation, append-only event stores, read-model projections, and saga orchestration for complex domain workflows.

## Core Principles

1. **Command-Query Separation** — Write operations (commands) and read operations (queries) use independent models and data stores optimized for their respective access patterns, enabling each side to scale and evolve independently.
2. **Events as Source of Truth** — All state changes are captured as immutable, ordered domain events in an append-only store; current state is derived by replaying events, providing a complete audit trail and enabling temporal queries.
3. **Eventual Consistency by Design** — Read models (projections) are updated asynchronously from the event stream; the system embraces eventual consistency with explicit consistency boundaries, compensating actions, and saga orchestration for cross-aggregate workflows.

## Patterns

### Pattern 1: Command Handler with Event Emission

Validate commands against business rules, produce domain events, and persist them atomically to the event store before publishing for downstream consumption.

```typescript
interface DomainEvent {
  eventId: string;
  aggregateId: string;
  aggregateType: string;
  eventType: string;
  version: number;
  timestamp: Date;
  payload: Record<string, unknown>;
}

async function handleCreateOrderCommand(cmd: CreateOrderCommand): Promise<DomainEvent[]> {
  const aggregate = await loadAggregate("Order", cmd.orderId);
  if (aggregate.status !== undefined) {
    throw new Error(`Order ${cmd.orderId} already exists`);
  }
  const events: DomainEvent[] = [{
    eventId: crypto.randomUUID(),
    aggregateId: cmd.orderId,
    aggregateType: "Order",
    eventType: "OrderCreated",
    version: 1,
    timestamp: new Date(),
    payload: { customerId: cmd.customerId, items: cmd.items, total: cmd.total },
  }];
  await eventStore.append(cmd.orderId, events, 0);
  await eventBus.publish(events);
  return events;
}
```

### Pattern 2: Projection Builder for Read Models

Subscribe to domain events and maintain denormalized read models optimized for query patterns, rebuilding from scratch when projections drift or schemas change.

```typescript
class OrderProjection {
  async handle(event: DomainEvent): Promise<void> {
    switch (event.eventType) {
      case "OrderCreated":
        await db.orderReadModel.create({
          data: {
            orderId: event.aggregateId,
            customerId: event.payload.customerId as string,
            status: "created",
            total: event.payload.total as number,
            itemCount: (event.payload.items as unknown[]).length,
            createdAt: event.timestamp,
            updatedAt: event.timestamp,
          },
        });
        break;
      case "OrderShipped":
        await db.orderReadModel.update({
          where: { orderId: event.aggregateId },
          data: { status: "shipped", shippedAt: event.timestamp, updatedAt: event.timestamp },
        });
        break;
    }
  }

  async rebuild(): Promise<void> {
    await db.orderReadModel.deleteMany();
    const allEvents = await eventStore.readAll("Order");
    for (const event of allEvents) {
      await this.handle(event);
    }
  }
}
```

### Pattern 3: Saga Orchestrator for Cross-Aggregate Workflows

Coordinate multi-step business processes across aggregate boundaries with compensating actions for failure recovery and guaranteed completion.

```typescript
interface SagaStep {
  name: string;
  execute: (context: SagaContext) => Promise<void>;
  compensate: (context: SagaContext) => Promise<void>;
}

class OrderFulfillmentSaga {
  private steps: SagaStep[] = [
    {
      name: "ReserveInventory",
      execute: async (ctx) => { ctx.reservationId = await inventoryService.reserve(ctx.items); },
      compensate: async (ctx) => { await inventoryService.release(ctx.reservationId); },
    },
    {
      name: "ProcessPayment",
      execute: async (ctx) => { ctx.paymentId = await paymentService.charge(ctx.total); },
      compensate: async (ctx) => { await paymentService.refund(ctx.paymentId); },
    },
    {
      name: "ScheduleShipment",
      execute: async (ctx) => { ctx.shipmentId = await shippingService.schedule(ctx.orderId); },
      compensate: async (ctx) => { await shippingService.cancel(ctx.shipmentId); },
    },
  ];

  async run(context: SagaContext): Promise<void> {
    const completed: SagaStep[] = [];
    for (const step of this.steps) {
      try {
        await step.execute(context);
        completed.push(step);
      } catch (error) {
        for (const s of completed.reverse()) {
          await s.compensate(context);
        }
        throw new SagaFailedError(step.name, error);
      }
    }
  }
}
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Better Approach |
|-------------|-------------|-----------------|
| Querying the event store directly for read operations | Event replay is slow for queries; event store is optimized for append, not search | Build dedicated read-model projections optimized for each query pattern |
| Mutable event records | Changing past events breaks audit trails and corrupts derived state | Events are immutable and append-only; correct errors with compensating events |
| Synchronous projection updates in command handlers | Couples write and read paths; projection failures block command processing | Update projections asynchronously via event subscriptions with retry |
| Sagas without compensating actions | Partial failures leave the system in an inconsistent state with no recovery path | Every saga step must define a compensate function for rollback on failure |

## Implementation Checklist

- [ ] Event store implemented with append-only semantics and optimistic concurrency (version checks)
- [ ] Command handlers validate business rules and emit domain events atomically
- [ ] Read-model projections subscribe to events asynchronously with idempotent handlers
- [ ] Projection rebuild mechanism available for schema migrations and drift correction
- [ ] Saga orchestrator implemented with compensating actions and persistent step tracking

## References

- [Martin Fowler — CQRS](https://martinfowler.com/bliki/CQRS.html)
- [Event Sourcing Pattern (Microsoft)](https://learn.microsoft.com/en-us/azure/architecture/patterns/event-sourcing)
- [Saga Pattern for Distributed Transactions (Microsoft)](https://learn.microsoft.com/en-us/azure/architecture/reference-architectures/saga/saga)
