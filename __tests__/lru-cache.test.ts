import { describe, it, expect, vi, afterEach } from "vitest";
import { LRUCache } from "../core/storage/lru-cache";

describe("LRUCache", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("stores and retrieves values", () => {
    const cache = new LRUCache<string, number>({
      maxEntries: 10,
      ttlMs: 60_000,
    });
    cache.set("a", 1);
    cache.set("b", 2);
    expect(cache.get("a")).toBe(1);
    expect(cache.get("b")).toBe(2);
  });

  it("returns undefined for missing keys", () => {
    const cache = new LRUCache<string, number>({
      maxEntries: 10,
      ttlMs: 60_000,
    });
    expect(cache.get("missing")).toBeUndefined();
  });

  it("evicts oldest entry when at capacity", () => {
    const cache = new LRUCache<string, number>({
      maxEntries: 2,
      ttlMs: 60_000,
    });
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3); // Should evict "a"
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBe(2);
    expect(cache.get("c")).toBe(3);
  });

  it("respects TTL expiration", () => {
    vi.useFakeTimers();
    const cache = new LRUCache<string, number>({ maxEntries: 10, ttlMs: 1000 });
    cache.set("a", 1);
    expect(cache.get("a")).toBe(1);

    vi.advanceTimersByTime(1001);
    expect(cache.get("a")).toBeUndefined();
    vi.useRealTimers();
  });

  it("prunes expired entries", () => {
    vi.useFakeTimers();
    const cache = new LRUCache<string, number>({ maxEntries: 10, ttlMs: 1000 });
    cache.set("a", 1);
    cache.set("b", 2);

    vi.advanceTimersByTime(1001);
    const pruned = cache.prune();
    expect(pruned).toBe(2);
    expect(cache.size).toBe(0);
    vi.useRealTimers();
  });

  it("reports accurate stats", () => {
    const cache = new LRUCache<string, number>({
      maxEntries: 100,
      ttlMs: 5000,
    });
    cache.set("x", 42);
    const stats = cache.stats();
    expect(stats.size).toBe(1);
    expect(stats.maxEntries).toBe(100);
    expect(stats.ttlMs).toBe(5000);
    expect(stats.oldestEntryAgeMs).toBeGreaterThanOrEqual(0);
  });

  it("has() returns false for expired entries", () => {
    vi.useFakeTimers();
    const cache = new LRUCache<string, number>({ maxEntries: 10, ttlMs: 500 });
    cache.set("a", 1);
    expect(cache.has("a")).toBe(true);
    vi.advanceTimersByTime(501);
    expect(cache.has("a")).toBe(false);
    vi.useRealTimers();
  });

  it("delete removes entries", () => {
    const cache = new LRUCache<string, number>({
      maxEntries: 10,
      ttlMs: 60_000,
    });
    cache.set("a", 1);
    expect(cache.delete("a")).toBe(true);
    expect(cache.get("a")).toBeUndefined();
    expect(cache.delete("a")).toBe(false);
  });

  it("clear removes all entries", () => {
    const cache = new LRUCache<string, number>({
      maxEntries: 10,
      ttlMs: 60_000,
    });
    cache.set("a", 1);
    cache.set("b", 2);
    cache.clear();
    expect(cache.size).toBe(0);
  });

  it("rejects invalid options", () => {
    expect(() => new LRUCache({ maxEntries: 0, ttlMs: 1000 })).toThrow();
    expect(() => new LRUCache({ maxEntries: 10, ttlMs: 0 })).toThrow();
  });
});
