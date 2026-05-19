/**
 * Coding Engine — PostgreSQL Storage Adapter
 *
 * Enables horizontal scaling by storing engine state in PostgreSQL.
 * Loaded dynamically to keep the engine dependency-free.
 *
 * Table schema (auto-created on initialize):
 *   CREATE TABLE IF NOT EXISTS coding_engine_kv (
 *     key   TEXT PRIMARY KEY,
 *     value TEXT NOT NULL,
 *     expires_at TIMESTAMPTZ,
 *     created_at TIMESTAMPTZ DEFAULT NOW(),
 *     updated_at TIMESTAMPTZ DEFAULT NOW()
 *   );
 */

import { strict as assert } from "node:assert";
import type { StorageAdapter } from "./storage-adapter";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PostgreSQLAdapterConfig {
  /** PostgreSQL connection string (e.g., postgres://user:pass@host:5432/db) */
  readonly connectionString: string;
  /** Table name for key-value storage (default: "coding_engine_kv") */
  readonly tableName?: string;
  /** Default TTL in milliseconds (0 = no expiry) */
  readonly defaultTtlMs?: number;
  /** Connection pool size (default: 5) */
  readonly poolSize?: number;
}

interface PgClient {
  query: (
    text: string,
    values?: unknown[],
  ) => Promise<{ rows: unknown[]; rowCount: number }>;
  end: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_TABLE = "coding_engine_kv";
const MAX_KEY_LENGTH = 1024;
const MAX_VALUE_LENGTH = 10_000_000; // 10 MB

// ---------------------------------------------------------------------------
// PostgreSQL Storage Adapter
// ---------------------------------------------------------------------------

export class PostgreSQLStorageAdapter implements StorageAdapter {
  readonly name = "postgresql";
  private client: PgClient | null = null;
  private readonly config: Required<
    Pick<PostgreSQLAdapterConfig, "tableName" | "defaultTtlMs" | "poolSize">
  > &
    PostgreSQLAdapterConfig;

  constructor(config: PostgreSQLAdapterConfig) {
    assert(
      config.connectionString.length > 0,
      "connectionString must not be empty",
    );
    this.config = {
      ...config,
      tableName: config.tableName ?? DEFAULT_TABLE,
      defaultTtlMs: config.defaultTtlMs ?? 0,
      poolSize: config.poolSize ?? 5,
    };
  }

  /**
   * Initialize connection pool and ensure table exists.
   * Must be called before any other method.
   */
  async initialize(): Promise<void> {
    try {
      // Dynamic import — pg is an optional peer dependency
      const pgModule = await (Function('return import("pg")')() as Promise<{
        default: { Pool: new (config: Record<string, unknown>) => PgClient };
      }>);
      this.client = new pgModule.default.Pool({
        connectionString: this.config.connectionString,
        max: this.config.poolSize,
      });

      // Create table if not exists
      await this.client.query(`
        CREATE TABLE IF NOT EXISTS ${this.config.tableName} (
          key        TEXT PRIMARY KEY,
          value      TEXT NOT NULL,
          expires_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);

      // Create index for expiration cleanup
      await this.client.query(`
        CREATE INDEX IF NOT EXISTS idx_${this.config.tableName}_expires
        ON ${this.config.tableName} (expires_at)
        WHERE expires_at IS NOT NULL
      `);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(
        `PostgreSQL adapter requires pg package: ${msg}. Install with: npm install pg`,
      );
    }
  }

  async get(key: string): Promise<string | undefined> {
    assert(this.client !== null, "PostgreSQL client not initialized");
    assert(key.length <= MAX_KEY_LENGTH, `Key too long: ${key.length}`);

    const result = await this.client.query(
      `SELECT value FROM ${this.config.tableName}
       WHERE key = $1
       AND (expires_at IS NULL OR expires_at > NOW())`,
      [key],
    );

    const row = result.rows[0] as { value: string } | undefined;
    return row?.value;
  }

  async set(key: string, value: string, ttlMs?: number): Promise<void> {
    assert(this.client !== null, "PostgreSQL client not initialized");
    assert(key.length <= MAX_KEY_LENGTH, `Key too long: ${key.length}`);
    assert(value.length <= MAX_VALUE_LENGTH, `Value too long: ${value.length}`);

    const effectiveTtl = ttlMs ?? this.config.defaultTtlMs;
    const expiresAt =
      effectiveTtl > 0
        ? new Date(Date.now() + effectiveTtl).toISOString()
        : null;

    await this.client.query(
      `INSERT INTO ${this.config.tableName} (key, value, expires_at, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (key) DO UPDATE SET
         value = EXCLUDED.value,
         expires_at = EXCLUDED.expires_at,
         updated_at = NOW()`,
      [key, value, expiresAt],
    );
  }

  async delete(key: string): Promise<boolean> {
    assert(this.client !== null, "PostgreSQL client not initialized");

    const result = await this.client.query(
      `DELETE FROM ${this.config.tableName} WHERE key = $1`,
      [key],
    );
    return result.rowCount > 0;
  }

  async has(key: string): Promise<boolean> {
    assert(this.client !== null, "PostgreSQL client not initialized");

    const result = await this.client.query(
      `SELECT 1 FROM ${this.config.tableName}
       WHERE key = $1
       AND (expires_at IS NULL OR expires_at > NOW())
       LIMIT 1`,
      [key],
    );
    return result.rows.length > 0;
  }

  async listKeys(prefix: string): Promise<string[]> {
    assert(this.client !== null, "PostgreSQL client not initialized");

    const result = await this.client.query(
      `SELECT key FROM ${this.config.tableName}
       WHERE key LIKE $1
       AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY key
       LIMIT 1000`,
      [prefix + "%"],
    );
    return (result.rows as Array<{ key: string }>).map((r) => r.key);
  }

  async healthCheck(): Promise<boolean> {
    try {
      assert(this.client !== null, "PostgreSQL client not initialized");
      const result = await this.client.query("SELECT 1 AS ok");
      return result.rows.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Remove expired entries. Call periodically for cleanup.
   * Returns the number of rows deleted.
   */
  async pruneExpired(): Promise<number> {
    assert(this.client !== null, "PostgreSQL client not initialized");
    const result = await this.client.query(
      `DELETE FROM ${this.config.tableName}
       WHERE expires_at IS NOT NULL AND expires_at <= NOW()`,
    );
    return result.rowCount;
  }

  /**
   * Close the connection pool. Call on shutdown.
   */
  async close(): Promise<void> {
    if (this.client !== null) {
      await this.client.end();
      this.client = null;
    }
  }
}
