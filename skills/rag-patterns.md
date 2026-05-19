# RAG Patterns

> Retrieval-augmented generation, chunking strategies, embedding models, vector stores, and reranking.

## Core Principles

1. **Retrieve Then Generate** — Ground LLM responses in retrieved context to reduce hallucinations.
2. **Chunk Size Matters** — Too large loses precision; too small loses context. Optimize for your use case.
3. **Hybrid Search** — Combine vector similarity with keyword search for best retrieval quality.

## Patterns

### Pattern 1: Document Ingestion Pipeline

```typescript
async function ingestDocument(doc: { content: string; metadata: Record<string, string> }): Promise<void> {
  const chunks = splitIntoChunks(doc.content, { maxTokens: 512, overlap: 50 });
  const embeddings = await embeddingModel.embedBatch(chunks.map(c => c.text));
  await vectorStore.upsert(chunks.map((chunk, i) => ({
    id: `${doc.metadata.id}-${i}`, vector: embeddings[i], metadata: { ...doc.metadata, chunk_index: i }, text: chunk.text,
  })));
}
```

### Pattern 2: Hybrid Retrieval with Reranking

```typescript
async function retrieve(query: string, topK: number = 10): Promise<RetrievedChunk[]> {
  const queryEmbedding = await embeddingModel.embed(query);
  const vectorResults = await vectorStore.search(queryEmbedding, topK * 2);
  const keywordResults = await fullTextSearch(query, topK * 2);
  const merged = reciprocalRankFusion(vectorResults, keywordResults);
  return await reranker.rerank(query, merged, topK);
}
```

### Pattern 3: Context-Augmented Generation

```typescript
async function generateAnswer(query: string): Promise<{ answer: string; sources: string[] }> {
  const chunks = await retrieve(query, 5);
  const context = chunks.map(c => c.text).join("\n\n");
  const response = await llm.generate({ system: "Answer based on the provided context.", messages: [{ role: "user", content: `Context:\n${context}\n\nQuestion: ${query}` }] });
  return { answer: response.text, sources: chunks.map(c => c.metadata.source) };
}
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Better Approach |
|-------------|-------------|-----------------|
| Fixed chunk sizes for all content | Tables and code need different chunking | Content-aware chunking strategies |
| Vector search only | Misses exact keyword matches | Hybrid vector + BM25 search |
| No source attribution | Users cant verify answers | Always return source references |
| Stuffing entire documents | Exceeds context window, dilutes relevance | Retrieve top-K relevant chunks only |

## Implementation Checklist

- [ ] Set up document ingestion with content-aware chunking
- [ ] Deploy embedding model and vector store (Qdrant, Pinecone, pgvector)
- [ ] Implement hybrid retrieval (vector + keyword) with reranking
- [ ] Build RAG pipeline with source attribution
- [ ] Add evaluation metrics (retrieval precision, answer faithfulness)

## References

- [RAG Paper (Lewis et al.)](https://arxiv.org/abs/2005.11401)
- [LangChain RAG Documentation](https://python.langchain.com/docs/tutorials/rag/)
- [LlamaIndex Documentation](https://docs.llamaindex.ai/)
