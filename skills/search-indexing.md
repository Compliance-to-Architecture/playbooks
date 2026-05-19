# Search & Indexing

> Meilisearch, Elasticsearch, full-text search, faceted search, relevance tuning, autocomplete, and typo tolerance for fast, accurate search experiences.

## Core Principles

1. **Search Is a Separate Service** — Never implement full-text search with database LIKE queries or regex. Use a dedicated search engine (Meilisearch, Elasticsearch, Typesense) optimized for relevance ranking and typo tolerance.
2. **Index Asynchronously** — Database writes and search index updates are separate operations. Use event-driven indexing (CDC, outbox pattern) to keep indexes eventually consistent with the source of truth.
3. **Relevance Is Configurable** — Default relevance ranking rarely matches business needs. Tune ranking rules, searchable attributes, and boosting factors based on user behavior data.
4. **Facets Enable Discovery** — Faceted search (filter by category, price range, status) is as important as full-text search. Design index schemas with filterable and sortable attributes from the start.
5. **Search Must Be Fast** — Users expect search results in <100ms. Optimize index size, use pagination with limits, and cache frequent queries at the edge.

## Patterns

### Pattern 1: Meilisearch Index Configuration

```typescript
import { MeiliSearch } from 'meilisearch';

const client = new MeiliSearch({
  host: process.env.MEILISEARCH_HOST,
  apiKey: process.env.MEILISEARCH_API_KEY,
});

async function configureContractIndex(): Promise<void> {
  const index = client.index('contracts');

  await index.updateSettings({
    searchableAttributes: [
      'title',          // Highest priority
      'description',
      'contractType',
      'tenantName',
      'tags',           // Lowest priority
    ],
    filterableAttributes: [
      'tenantId',
      'contractType',
      'status',
      'railCategory',
      'createdAt',
      'value',
    ],
    sortableAttributes: ['createdAt', 'updatedAt', 'value', 'title'],
    rankingRules: [
      'words',
      'typo',
      'proximity',
      'attribute',
      'sort',
      'exactness',
    ],
    typoTolerance: {
      enabled: true,
      minWordSizeForTypos: { oneTypo: 4, twoTypos: 8 },
    },
    pagination: { maxTotalHits: 10000 },
  });
}
```

### Pattern 2: Event-Driven Index Sync

```typescript
// Listen to database changes and sync to search index
async function handleContractEvent(event: ContractEvent): Promise<void> {
  const index = meili.index('contracts');

  switch (event.type) {
    case 'ContractCreated':
    case 'ContractUpdated': {
      const contract = await db.contract.findUniqueOrThrow({
        where: { id: event.contractId },
        include: { tenant: true, rail: true },
      });
      await index.addDocuments([{
        id: contract.id,
        title: contract.title,
        description: contract.description,
        contractType: contract.type,
        status: contract.status,
        tenantId: contract.tenantId,
        tenantName: contract.tenant.name,
        railCategory: contract.rail.category,
        tags: contract.tags,
        value: contract.totalValue,
        createdAt: contract.createdAt.getTime(),
        updatedAt: contract.updatedAt.getTime(),
      }]);
      break;
    }
    case 'ContractDeleted':
      await index.deleteDocument(event.contractId);
      break;
  }
}
```

### Pattern 3: Multi-Tenant Search with Filters

```typescript
app.get('/api/v1/search', async (c) => {
  const tenantId = c.get('tenantId');
  const query = c.req.query('q') ?? '';
  const filters = [];

  // Mandatory tenant isolation
  filters.push(`tenantId = "${tenantId}"`);

  // Optional filters from query params
  const status = c.req.query('status');
  if (status) filters.push(`status = "${status}"`);

  const contractType = c.req.query('type');
  if (contractType) filters.push(`contractType = "${contractType}"`);

  const results = await meili.index('contracts').search(query, {
    filter: filters.join(' AND '),
    facets: ['contractType', 'status', 'railCategory'],
    limit: 20,
    offset: parseInt(c.req.query('offset') ?? '0'),
    sort: c.req.query('sort') ? [c.req.query('sort')!] : undefined,
    attributesToHighlight: ['title', 'description'],
    highlightPreTag: '<mark>',
    highlightPostTag: '</mark>',
  });

  return c.json({
    hits: results.hits,
    totalHits: results.estimatedTotalHits,
    facets: results.facetDistribution,
    processingTimeMs: results.processingTimeMs,
  });
});
```

### Pattern 4: Autocomplete with Debounce

```typescript
// Frontend autocomplete component
async function searchAutocomplete(query: string): Promise<Suggestion[]> {
  if (query.length < 2) return [];

  const results = await meili.index('contracts').search(query, {
    limit: 5,
    attributesToRetrieve: ['id', 'title', 'contractType'],
    attributesToHighlight: ['title'],
    attributesToCrop: ['title'],
    cropLength: 50,
  });

  return results.hits.map(hit => ({
    id: hit.id,
    label: hit._formatted?.title ?? hit.title,
    type: hit.contractType,
  }));
}
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Better Approach |
|---|---|---|
| SQL LIKE '%query%' for search | No relevance ranking, no typo tolerance, full table scan | Dedicated search engine (Meilisearch, ES) |
| Synchronous index updates | Slows write path, coupling between DB and search | Async event-driven indexing |
| No tenant isolation in search | Data leakage across tenants | Mandatory tenant filter on every query |
| Indexing all database columns | Bloated index, slow updates, irrelevant results | Index only searchable/filterable fields |
| No pagination limits | Memory exhaustion on large result sets | Max page size (100), cursor pagination for deep pages |
| Returning full documents from search | Bandwidth waste, slow responses | Return IDs + highlights, fetch full docs separately |

## Implementation Checklist

- [ ] Set up dedicated search engine with appropriate index configuration
- [ ] Configure searchable, filterable, and sortable attributes
- [ ] Implement event-driven index synchronization
- [ ] Add mandatory tenant isolation filter on all queries
- [ ] Tune relevance ranking rules based on user behavior
- [ ] Build autocomplete with debouncing and minimum query length
- [ ] Set up faceted search for key filter dimensions
- [ ] Monitor search latency, index size, and indexing lag

## References

- [Meilisearch Documentation](https://www.meilisearch.com/docs)
- [Elasticsearch Guide](https://www.elastic.co/guide/en/elasticsearch/reference/current/)
- [Typesense Documentation](https://typesense.org/docs/)
- [Search Relevance Engineering](https://opensourceconnections.com/blog/2016/10/19/search-relevance-engineering/)
