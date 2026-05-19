/**
 * Coding Engine — Storage Adapter Interface
 *
 * Abstracts storage backend so engine modules work with:
 * - Local filesystem (default, standalone mode)
 * - Redis (distributed, multi-instance mode)
 * - SQLite (embedded database mode)
 * - PostgreSQL (enterprise distributed mode)
 * - Custom backends (plugin-provided)
 *
 * Enables horizontal scaling by replacing the default FileStorageAdapter
 * with a distributed adapter (Redis/PostgreSQL) for multi-instance deployments.
 */

import { strict as assert } from "node:assert";
import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// Storage Adapter Interface
// ---------------------------------------------------------------------------

export interface StorageAdapter {
  /** Adapter name for logging/metrics */
  readonly name: string;

  /** Read a value by key. Returns undefined if not found. */
  get(key: string): Promise<string | undefined>;

  /** Write a value by key */
  set(key: string, value: string, ttlMs?: number): Promise<void>;

  /** Delete a key */
  delete(key: string): Promise<boolean>;

  /** Check if key exists */
  has(key: string): Promise<boolean>;

  /** List keys matching a prefix */
  listKeys(prefix: string): Promise<string[]>;

  /** Health check — returns true if storage backend is reachable */
  healthCheck(): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Tenant-Scoped Storage Adapter Wrapper
// ---------------------------------------------------------------------------
// Wraps any StorageAdapter to prefix all keys with tenant:project scope.
// Ensures complete data isolation between tenants.
// Serverless-compatible — stateless, creates new wrapper per request.

export class TenantScopedStorageAdapter implements StorageAdapter {
  readonly name: string;
  private readonly inner: StorageAdapter;
  private readonly prefix: string;

  constructor(
    inner: StorageAdapter,
    tenantId: string,
    projectId: string = "default",
  ) {
    assert(
      inner !== null && inner !== undefined,
      "inner storage adapter must not be null",
    );
    assert(
      typeof tenantId === "string" && tenantId.length > 0,
      "tenantId must be a non-empty string",
    );
    this.inner = inner;
    this.prefix = `t:${tenantId}:p:${projectId}:`;
    this.name = `${inner.name}[tenant:${tenantId}]`;
  }

  async get(key: string): Promise<string | undefined> {
    return this.inner.get(this.prefix + key);
  }

  async set(key: string, value: string, ttlMs?: number): Promise<void> {
    return this.inner.set(this.prefix + key, value, ttlMs);
  }

  async delete(key: string): Promise<boolean> {
    return this.inner.delete(this.prefix + key);
  }

  async has(key: string): Promise<boolean> {
    return this.inner.has(this.prefix + key);
  }

  async listKeys(keyPrefix: string): Promise<string[]> {
    const results = await this.inner.listKeys(this.prefix + keyPrefix);
    return results.map((k) => k.slice(this.prefix.length));
  }

  async healthCheck(): Promise<boolean> {
    return this.inner.healthCheck();
  }

  /** Get the tenant prefix for debugging */
  getPrefix(): string {
    return this.prefix;
  }
}

// ---------------------------------------------------------------------------
// Serverless Storage Adapter (Lambda/Workers — /tmp or memory)
// ---------------------------------------------------------------------------
// Ephemeral adapter for serverless functions. Uses /tmp for filesystem
// or in-memory for pure serverless. State is lost between invocations
// unless persisted to external storage (S3, KV, D1).

export class ServerlessStorageAdapter implements StorageAdapter {
  readonly name = "serverless";
  private readonly inner: StorageAdapter;
  private readonly persistAdapter?: StorageAdapter;

  constructor(options?: {
    stateDir?: string;
    persistAdapter?: StorageAdapter;
  }) {
    const stateDir = options?.stateDir ?? "/tmp/coding-engine-state";
    this.inner = new FileStorageAdapter(stateDir);
    this.persistAdapter = options?.persistAdapter;
  }

  async get(key: string): Promise<string | undefined> {
    // Try local first, then persistent storage
    const local = await this.inner.get(key);
    if (local !== undefined) return local;
    if (this.persistAdapter) {
      const persisted = await this.persistAdapter.get(key);
      if (persisted !== undefined) {
        // Cache locally for this invocation
        await this.inner.set(key, persisted);
        return persisted;
      }
    }
    return undefined;
  }

  async set(key: string, value: string, ttlMs?: number): Promise<void> {
    await this.inner.set(key, value, ttlMs);
    // Also persist if adapter available
    if (this.persistAdapter) {
      await this.persistAdapter.set(key, value, ttlMs);
    }
  }

  async delete(key: string): Promise<boolean> {
    const result = await this.inner.delete(key);
    if (this.persistAdapter) {
      await this.persistAdapter.delete(key);
    }
    return result;
  }

  async has(key: string): Promise<boolean> {
    return (
      (await this.inner.has(key)) ||
      ((this.persistAdapter && (await this.persistAdapter.has(key))) ?? false)
    );
  }

  async listKeys(prefix: string): Promise<string[]> {
    return this.inner.listKeys(prefix);
  }

  async healthCheck(): Promise<boolean> {
    return this.inner.healthCheck();
  }
}

// ---------------------------------------------------------------------------
// File Storage Adapter (Default — Standalone Mode)
// ---------------------------------------------------------------------------

export class FileStorageAdapter implements StorageAdapter {
  readonly name = "file";
  private readonly rootDir: string;

  constructor(rootDir: string) {
    assert(
      typeof rootDir === "string" && rootDir.length > 0,
      "rootDir must be a non-empty string",
    );
    this.rootDir = rootDir;
  }

  async get(key: string): Promise<string | undefined> {
    const filePath = this.keyToPath(key);
    try {
      return fs.readFileSync(filePath, "utf-8");
    } catch {
      return undefined;
    }
  }

  /**
   * Write a value. TTL is not supported by file storage — a warning
   * is logged if ttlMs is provided but the value is still persisted.
   */
  async set(key: string, value: string, ttlMs?: number): Promise<void> {
    if (ttlMs !== undefined && ttlMs > 0) {
      console.warn(
        `[FileStorageAdapter] ttlMs=${ttlMs} ignored — TTL is not supported by file storage`,
      );
    }
    const filePath = this.keyToPath(key);
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, value);
  }

  async delete(key: string): Promise<boolean> {
    const filePath = this.keyToPath(key);
    try {
      fs.unlinkSync(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async has(key: string): Promise<boolean> {
    return fs.existsSync(this.keyToPath(key));
  }

  async listKeys(prefix: string): Promise<string[]> {
    const dir = path.join(this.rootDir, path.dirname(prefix));
    const baseName = path.basename(prefix);
    try {
      const files = fs.readdirSync(dir);
      return files
        .filter((f) => f.startsWith(baseName))
        .map((f) => path.join(path.dirname(prefix), f));
    } catch {
      return [];
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      return fs.existsSync(this.rootDir);
    } catch {
      return false;
    }
  }

  private keyToPath(key: string): string {
    // Sanitize key to prevent path traversal
    const sanitized = key
      .replace(/\.\./g, "_")
      .replace(/[^a-zA-Z0-9_\-./]/g, "_");
    return path.join(this.rootDir, sanitized);
  }
}

// ---------------------------------------------------------------------------
// In-Memory Storage Adapter (Testing / Ephemeral)
// ---------------------------------------------------------------------------

export class InMemoryStorageAdapter implements StorageAdapter {
  readonly name = "in-memory";
  private readonly store: Map<string, { value: string; expiresAt?: number }> =
    new Map();

  async get(key: string): Promise<string | undefined> {
    assert(
      typeof key === "string" && key.length > 0,
      "key must be a non-empty string",
    );
    const entry = this.store.get(key);
    if (entry === undefined) {
      return undefined;
    }
    if (entry.expiresAt !== undefined && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttlMs?: number): Promise<void> {
    assert(
      typeof key === "string" && key.length > 0,
      "key must be a non-empty string",
    );
    assert(typeof value === "string", "value must be a string");
    this.store.set(key, {
      value,
      expiresAt: ttlMs !== undefined ? Date.now() + ttlMs : undefined,
    });
  }

  async delete(key: string): Promise<boolean> {
    assert(
      typeof key === "string" && key.length > 0,
      "key must be a non-empty string",
    );
    return this.store.delete(key);
  }

  async has(key: string): Promise<boolean> {
    assert(
      typeof key === "string" && key.length > 0,
      "key must be a non-empty string",
    );
    return (await this.get(key)) !== undefined;
  }

  async listKeys(prefix: string): Promise<string[]> {
    assert(typeof prefix === "string", "prefix must be a string");
    const result = Array.from(this.store.keys()).filter((k) =>
      k.startsWith(prefix),
    );
    assert(
      result.length <= 1000000,
      "listKeys result must not exceed 1000000 entries",
    );
    return result;
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }
}

// ---------------------------------------------------------------------------
// Redis Storage Adapter Stub (for distributed mode)
// ---------------------------------------------------------------------------

export interface RedisStorageAdapterConfig {
  readonly url: string;
  readonly keyPrefix: string;
  readonly defaultTtlMs: number;
}

/**
 * Redis adapter — requires `ioredis` package at runtime.
 * Loaded dynamically to keep the engine dependency-free.
 */
export class RedisStorageAdapter implements StorageAdapter {
  readonly name = "redis";
  private client: unknown = null;
  private readonly config: RedisStorageAdapterConfig;

  constructor(config: RedisStorageAdapterConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    try {
      // Dynamic import — ioredis is an optional peer dependency
      const ioredisModule = await (Function(
        'return import("ioredis")',
      )() as Promise<{ default: new (url: string) => unknown }>);
      this.client = new ioredisModule.default(this.config.url);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Redis adapter requires ioredis package: ${msg}. Install with: npm install ioredis`,
      );
    }
  }

  async get(key: string): Promise<string | undefined> {
    assert(this.client !== null, "Redis client not initialized");
    const redis = this.client as { get: (k: string) => Promise<string | null> };
    const value = await redis.get(this.prefixKey(key));
    return value ?? undefined;
  }

  async set(key: string, value: string, ttlMs?: number): Promise<void> {
    assert(this.client !== null, "Redis client not initialized");
    const redis = this.client as {
      set: (k: string, v: string, ...args: unknown[]) => Promise<unknown>;
    };
    const effectiveTtl = ttlMs ?? this.config.defaultTtlMs;
    if (effectiveTtl > 0) {
      await redis.set(this.prefixKey(key), value, "PX", effectiveTtl);
    } else {
      await redis.set(this.prefixKey(key), value);
    }
  }

  async delete(key: string): Promise<boolean> {
    assert(this.client !== null, "Redis client not initialized");
    const redis = this.client as { del: (k: string) => Promise<number> };
    const result = await redis.del(this.prefixKey(key));
    return result > 0;
  }

  async has(key: string): Promise<boolean> {
    assert(this.client !== null, "Redis client not initialized");
    const redis = this.client as { exists: (k: string) => Promise<number> };
    return (await redis.exists(this.prefixKey(key))) > 0;
  }

  async listKeys(prefix: string): Promise<string[]> {
    assert(this.client !== null, "Redis client not initialized");
    const redis = this.client as { keys: (p: string) => Promise<string[]> };
    const fullPrefix = this.prefixKey(prefix);
    const keys = await redis.keys(`${fullPrefix}*`);
    return keys.map((k) => k.slice(this.config.keyPrefix.length + 1));
  }

  async healthCheck(): Promise<boolean> {
    try {
      assert(this.client !== null, "Redis client not initialized");
      const redis = this.client as { ping: () => Promise<string> };
      const pong = await redis.ping();
      return pong === "PONG";
    } catch {
      return false;
    }
  }

  private prefixKey(key: string): string {
    return `${this.config.keyPrefix}:${key}`;
  }
}
