# GraphQL Patterns

> Design performant, secure GraphQL APIs with schema-first design, efficient data loading, and federation.

## Core Principles

1. **Schema-First Design** — Define the schema as a contract before writing resolvers. The schema is the API documentation and the source of truth for client-server communication.
2. **N+1 Prevention** — Every relationship resolver must use DataLoader for batched, deduplicated database access. A single GraphQL query must never produce unbounded SQL queries.
3. **Defense in Depth** — Apply query complexity limits, depth limits, and persisted queries to prevent abuse. Treat every query as potentially adversarial.
4. **Single Graph, Federated Ownership** — Expose one unified graph to clients while allowing teams to own their subgraphs independently via federation.

## Patterns

### Pattern 1: DataLoader for Batched Resolution

Eliminate N+1 queries by batching and caching within a single request lifecycle.

```typescript
import DataLoader from "dataloader";

function createLoaders() {
  return {
    userById: new DataLoader<string, User>(async (ids) => {
      const users = await db.query(
        `SELECT * FROM users WHERE id = ANY($1)`, [ids]
      );
      const userMap = new Map(users.map((u) => [u.id, u]));
      return ids.map((id) => userMap.get(id) ?? new Error(`User ${id} not found`));
    }),
    ordersByUserId: new DataLoader<string, Order[]>(async (userIds) => {
      const orders = await db.query(
        `SELECT * FROM orders WHERE user_id = ANY($1)`, [userIds]
      );
      const grouped = new Map<string, Order[]>();
      for (const order of orders) {
        const list = grouped.get(order.userId) ?? [];
        list.push(order);
        grouped.set(order.userId, list);
      }
      return userIds.map((id) => grouped.get(id) ?? []);
    }),
  };
}

// Create fresh loaders per request
app.use((req, res, next) => {
  req.loaders = createLoaders();
  next();
});
```

### Pattern 2: Query Complexity and Depth Limiting

Protect the server from expensive or deeply nested queries.

```typescript
import { createComplexityLimitRule } from "graphql-validation-complexity";
import depthLimit from "graphql-depth-limit";

const server = new ApolloServer({
  schema,
  validationRules: [
    depthLimit(7),
    createComplexityLimitRule(1000, {
      scalarCost: 1,
      objectCost: 5,
      listFactor: 10,
      onCost: (cost: number) => {
        if (cost > 800) {
          logger.warn({ cost }, "High complexity query detected");
        }
      },
    }),
  ],
  plugins: [
    {
      async requestDidStart() {
        return {
          async didResolveOperation(ctx) {
            if (!isPersistedQuery(ctx.request)) {
              throw new GraphQLError("Only persisted queries allowed in production");
            }
          },
        };
      },
    },
  ],
});
```

### Pattern 3: Federation with Subgraph Entities

Split a monolith graph into team-owned subgraphs with entity resolution.

```typescript
import { buildSubgraphSchema } from "@apollo/subgraph";
import { gql } from "graphql-tag";

// Orders subgraph owns Order, extends User from accounts subgraph
const typeDefs = gql`
  extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@external"])

  type Order @key(fields: "id") {
    id: ID!
    total: Float!
    status: OrderStatus!
    buyer: User!
  }

  type User @key(fields: "id") {
    id: ID! @external
    orders: [Order!]!
  }
`;

const resolvers = {
  User: {
    orders: (user, _, { loaders }) => loaders.ordersByUserId.load(user.id),
  },
  Order: {
    __resolveReference: (ref, { loaders }) => loaders.orderById.load(ref.id),
    buyer: (order) => ({ __typename: "User", id: order.buyerId }),
  },
};

const schema = buildSubgraphSchema({ typeDefs, resolvers });
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Better Approach |
|---|---|---|
| Resolver-per-field SQL queries | N+1 problem tanks performance | Use DataLoader for all relations |
| No query depth/complexity limits | Clients can craft denial-of-service queries | Enforce depth (7) and complexity (1000) limits |
| Exposing database schema as GraphQL | Tight coupling, leaks internals | Design schema for client use cases |
| Mutations without input validation | Invalid data reaches business logic | Validate with Zod before resolving |
| Returning errors as data fields | Inconsistent error handling | Use GraphQL errors with typed extensions |

## Implementation Checklist

- [ ] Define schema with SDL before writing resolvers
- [ ] Create DataLoader instances per request context
- [ ] Set query depth limit (max 7) and complexity limit (max 1000)
- [ ] Implement persisted queries for production clients
- [ ] Add field-level authorization checks in resolvers
- [ ] Set up federation gateway if multiple subgraphs exist
- [ ] Configure response caching with cache-control hints

## References

- [GraphQL Best Practices](https://graphql.org/learn/best-practices/)
- [Apollo Federation](https://www.apollographql.com/docs/federation/)
- [DataLoader GitHub](https://github.com/graphql/dataloader)
- [GraphQL Security Checklist](https://escape.tech/blog/graphql-security-checklist/)
