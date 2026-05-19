/**
 * Coding Engine — Authentication & Authorization Middleware
 *
 * Provides API key validation, tenant isolation, and role-based
 * access control for the engine when exposed as an HTTP service.
 *
 * Features:
 * - API key validation with SHA-256 hashed storage
 * - Tenant isolation (requests scoped to tenant_id)
 * - Role-based access (admin, operator, viewer)
 * - Rate limiting per API key
 * - Request context extraction
 */

import { strict as assert } from "node:assert";
import crypto from "node:crypto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AuthRole = "admin" | "operator" | "viewer";

export interface ApiKeyRecord {
  /** Hashed API key (SHA-256) */
  readonly keyHash: string;
  /** Display name for the key */
  readonly name: string;
  /** Tenant this key belongs to */
  readonly tenantId: string;
  /** Role assigned to this key */
  readonly role: AuthRole;
  /** Whether the key is active */
  readonly active: boolean;
  /** Rate limit (requests per minute, 0 = unlimited) */
  readonly rateLimitRpm: number;
  /** Creation timestamp */
  readonly createdAt: string;
  /** Expiration timestamp (null = never) */
  readonly expiresAt: string | null;
}

export interface AuthContext {
  readonly tenantId: string;
  readonly role: AuthRole;
  readonly keyName: string;
  readonly keyHash: string;
}

export interface AuthResult {
  readonly authenticated: boolean;
  readonly context?: AuthContext;
  readonly error?: string;
}

export interface RateLimitEntry {
  count: number;
  windowStart: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const MAX_KEYS = 10_000;
const API_KEY_PREFIX = "ce_"; // coding-engine key prefix

// ---------------------------------------------------------------------------
// Auth Manager
// ---------------------------------------------------------------------------

export class AuthManager {
  private readonly keys: Map<string, ApiKeyRecord> = new Map();
  private readonly rateLimits: Map<string, RateLimitEntry> = new Map();

  /**
   * Register an API key. The raw key is hashed before storage.
   * Returns the raw key (only shown once).
   */
  createKey(params: {
    name: string;
    tenantId: string;
    role: AuthRole;
    rateLimitRpm?: number;
    expiresAt?: string | null;
  }): string {
    assert(this.keys.size < MAX_KEYS, `Maximum API keys reached (${MAX_KEYS})`);
    assert(params.name.length > 0, "Key name must not be empty");
    assert(params.tenantId.length > 0, "tenantId must not be empty");

    const rawKey = `${API_KEY_PREFIX}${crypto.randomBytes(32).toString("hex")}`;
    const keyHash = this.hashKey(rawKey);

    const record: ApiKeyRecord = {
      keyHash,
      name: params.name,
      tenantId: params.tenantId,
      role: params.role,
      active: true,
      rateLimitRpm: params.rateLimitRpm ?? 60,
      createdAt: new Date().toISOString(),
      expiresAt: params.expiresAt ?? null,
    };

    this.keys.set(keyHash, record);
    return rawKey;
  }

  /** Revoke an API key by its hash */
  revokeKey(keyHash: string): boolean {
    const record = this.keys.get(keyHash);
    if (record === undefined) return false;
    this.keys.set(keyHash, { ...record, active: false });
    return true;
  }

  /** List all keys (without exposing raw keys) */
  listKeys(): Array<Omit<ApiKeyRecord, "keyHash"> & { keyHash: string }> {
    return Array.from(this.keys.values()).map((k) => ({
      ...k,
      keyHash: k.keyHash.slice(0, 8) + "...",
    }));
  }

  /**
   * Authenticate a request using the Authorization header.
   * Expected format: "Bearer ce_<hex>"
   */
  authenticate(authorizationHeader: string | undefined): AuthResult {
    if (authorizationHeader === undefined || authorizationHeader.length === 0) {
      return { authenticated: false, error: "Missing Authorization header" };
    }

    const parts = authorizationHeader.split(" ");
    if (parts.length !== 2 || parts[0] !== "Bearer") {
      return {
        authenticated: false,
        error: "Invalid Authorization format. Expected: Bearer <api_key>",
      };
    }

    const rawKey = parts[1];
    assert(rawKey !== undefined, "API key must be present after Bearer");
    if (!rawKey.startsWith(API_KEY_PREFIX)) {
      return { authenticated: false, error: "Invalid API key format" };
    }

    const keyHash = this.hashKey(rawKey);
    const record = this.keys.get(keyHash);

    if (record === undefined) {
      return { authenticated: false, error: "Invalid API key" };
    }

    if (!record.active) {
      return { authenticated: false, error: "API key revoked" };
    }

    if (record.expiresAt !== null && new Date(record.expiresAt) < new Date()) {
      return { authenticated: false, error: "API key expired" };
    }

    // Rate limiting
    if (record.rateLimitRpm > 0) {
      const limited = this.checkRateLimit(keyHash, record.rateLimitRpm);
      if (limited) {
        return { authenticated: false, error: "Rate limit exceeded" };
      }
    }

    return {
      authenticated: true,
      context: {
        tenantId: record.tenantId,
        role: record.role,
        keyName: record.name,
        keyHash,
      },
    };
  }

  /**
   * Check if a role has permission for an action.
   * admin > operator > viewer
   */
  authorize(role: AuthRole, requiredRole: AuthRole): boolean {
    const hierarchy: Record<AuthRole, number> = {
      admin: 3,
      operator: 2,
      viewer: 1,
    };
    return hierarchy[role] >= hierarchy[requiredRole];
  }

  // -----------------------------------------------------------------------
  // Private
  // -----------------------------------------------------------------------

  private hashKey(rawKey: string): string {
    return crypto.createHash("sha256").update(rawKey).digest("hex");
  }

  private checkRateLimit(keyHash: string, limitRpm: number): boolean {
    const now = Date.now();
    const entry = this.rateLimits.get(keyHash);

    if (entry === undefined || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
      this.rateLimits.set(keyHash, { count: 1, windowStart: now });
      return false;
    }

    entry.count++;
    return entry.count > limitRpm;
  }
}
