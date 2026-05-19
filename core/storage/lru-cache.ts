/**
 * Coding Engine — Bounded LRU Cache
 *
 * Time-aware LRU cache with configurable max entries and TTL eviction.
 * Prevents unbounded memory growth in long-running processes.
 *
 * Used by: FailurePipeline (fingerprint dedup), SessionManager, MetricsCollector.
 */

import { strict as assert } from "node:assert";

export interface LRUCacheOptions {
  /** Maximum number of entries (default: 10_000) */
  readonly maxEntries: number;
  /** Time-to-live in milliseconds (default: 86_400_000 = 24h) */
  readonly ttlMs: number;
}

interface CacheEntry<V> {
  value: V;
  createdAt: number;
  lastAccessedAt: number;
}

const DEFAULT_MAX_ENTRIES = 10_000;
const DEFAULT_TTL_MS = 86_400_000; // 24 hours

export class LRUCache<K, V> {
  private readonly cache: Map<K, CacheEntry<V>> = new Map();
  private readonly maxEntries: number;
  private readonly ttlMs: number;

  constructor(options?: Partial<LRUCacheOptions>) {
    this.maxEntries = options?.maxEntries ?? DEFAULT_MAX_ENTRIES;
    this.ttlMs = options?.ttlMs ?? DEFAULT_TTL_MS;
    assert(this.maxEntries > 0, "maxEntries must be positive");
    assert(this.ttlMs > 0, "ttlMs must be positive");
  }

  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    if (entry === undefined) {
      return undefined;
    }

    // TTL check
    if (Date.now() - entry.createdAt > this.ttlMs) {
      this.cache.delete(key);
      return undefined;
    }

    // Move to end (most recently used)
    entry.lastAccessedAt = Date.now();
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  set(key: K, value: V): void {
    // If key exists, delete first to reorder
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    // Evict oldest if at capacity
    while (this.cache.size >= this.maxEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, {
      value,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
    });
  }

  has(key: K): boolean {
    const entry = this.cache.get(key);
    if (entry === undefined) {
      return false;
    }
    if (Date.now() - entry.createdAt > this.ttlMs) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  /** Remove all expired entries */
  prune(): number {
    const now = Date.now();
    let pruned = 0;
    for (const [key, entry] of this.cache) {
      if (now - entry.createdAt > this.ttlMs) {
        this.cache.delete(key);
        pruned++;
      }
    }
    return pruned;
  }

  get size(): number {
    return this.cache.size;
  }

  clear(): void {
    this.cache.clear();
  }

  /** Get cache statistics for observability */
  stats(): {
    size: number;
    maxEntries: number;
    ttlMs: number;
    oldestEntryAgeMs: number | null;
  } {
    let oldestAge: number | null = null;
    const firstEntry = this.cache.values().next().value;
    if (firstEntry !== undefined) {
      oldestAge = Date.now() - firstEntry.createdAt;
    }
    return {
      size: this.cache.size,
      maxEntries: this.maxEntries,
      ttlMs: this.ttlMs,
      oldestEntryAgeMs: oldestAge,
    };
  }
}
