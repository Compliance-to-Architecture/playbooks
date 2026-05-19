/**
 * Coding Engine — Webhook & Event Dispatcher
 *
 * Publishes engine events (failure detected, fix applied, PR merged,
 * health status changes) to external systems via webhooks.
 *
 * Features:
 * - Configurable webhook endpoints per event type
 * - HMAC-SHA256 signature for payload verification
 * - Retry with exponential backoff (max 3 attempts)
 * - Event queue with bounded size
 * - Dead letter queue for failed deliveries
 */

import { strict as assert } from "node:assert";
import crypto from "node:crypto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WebhookEventType =
  | "failure.detected"
  | "failure.fixed"
  | "failure.escalated"
  | "pr.created"
  | "pr.merged"
  | "pr.rejected"
  | "health.degraded"
  | "health.unhealthy"
  | "health.recovered"
  | "session.started"
  | "session.completed"
  | "compliance.violation";

export interface WebhookEndpoint {
  /** Unique endpoint name */
  readonly name: string;
  /** Target URL */
  readonly url: string;
  /** Events to subscribe to (empty = all events) */
  readonly events: WebhookEventType[];
  /** HMAC secret for payload signing */
  readonly secret: string;
  /** Whether this endpoint is active */
  readonly enabled: boolean;
  /** Custom headers to include */
  readonly headers?: Record<string, string>;
}

export interface WebhookPayload {
  readonly id: string;
  readonly event: WebhookEventType;
  readonly timestamp: string;
  readonly data: Record<string, unknown>;
}

export interface WebhookDelivery {
  readonly id: string;
  readonly endpointName: string;
  readonly event: WebhookEventType;
  readonly status: "pending" | "delivered" | "failed";
  readonly attempts: number;
  readonly lastAttemptAt: string | null;
  readonly lastError: string | null;
  readonly responseStatus: number | null;
}

export interface WebhookDispatcherConfig {
  /** Maximum retries per delivery (default: 3) */
  readonly maxRetries?: number;
  /** Base delay for exponential backoff in ms (default: 1000) */
  readonly baseDelayMs?: number;
  /** Maximum queue size (default: 1000) */
  readonly maxQueueSize?: number;
  /** Request timeout in ms (default: 10000) */
  readonly timeoutMs?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 1000;
const DEFAULT_MAX_QUEUE_SIZE = 1000;
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_DEAD_LETTER_SIZE = 500;

// ---------------------------------------------------------------------------
// Webhook Dispatcher
// ---------------------------------------------------------------------------

export class WebhookDispatcher {
  private readonly endpoints: Map<string, WebhookEndpoint> = new Map();
  private readonly deliveries: Map<string, WebhookDelivery> = new Map();
  private readonly deadLetterQueue: WebhookDelivery[] = [];
  private readonly config: Required<WebhookDispatcherConfig>;
  private readonly listeners: Array<(delivery: WebhookDelivery) => void> = [];
  private deliveryCounter = 0;

  constructor(config?: WebhookDispatcherConfig) {
    this.config = {
      maxRetries: config?.maxRetries ?? DEFAULT_MAX_RETRIES,
      baseDelayMs: config?.baseDelayMs ?? DEFAULT_BASE_DELAY_MS,
      maxQueueSize: config?.maxQueueSize ?? DEFAULT_MAX_QUEUE_SIZE,
      timeoutMs: config?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    };
  }

  /** Register a webhook endpoint */
  registerEndpoint(endpoint: WebhookEndpoint): void {
    assert(endpoint.url.length > 0, "Endpoint URL must not be empty");
    assert(endpoint.secret.length >= 16, "Secret must be at least 16 chars");
    this.endpoints.set(endpoint.name, endpoint);
  }

  /** Remove a webhook endpoint */
  removeEndpoint(name: string): void {
    this.endpoints.delete(name);
  }

  /** List registered endpoints */
  listEndpoints(): WebhookEndpoint[] {
    return Array.from(this.endpoints.values());
  }

  /** Subscribe to delivery status updates */
  onDelivery(listener: (delivery: WebhookDelivery) => void): void {
    this.listeners.push(listener);
  }

  /**
   * Dispatch an event to all matching endpoints.
   * Returns delivery IDs for tracking.
   */
  async dispatch(
    event: WebhookEventType,
    data: Record<string, unknown>,
  ): Promise<string[]> {
    assert(
      this.deliveries.size < this.config.maxQueueSize,
      `Webhook queue full (max ${this.config.maxQueueSize})`,
    );

    const payload: WebhookPayload = {
      id: this.generateId(),
      event,
      timestamp: new Date().toISOString(),
      data,
    };

    const deliveryIds: string[] = [];

    for (const endpoint of this.endpoints.values()) {
      if (!endpoint.enabled) continue;
      if (endpoint.events.length > 0 && !endpoint.events.includes(event)) {
        continue;
      }

      const deliveryId = this.generateDeliveryId();
      const delivery: WebhookDelivery = {
        id: deliveryId,
        endpointName: endpoint.name,
        event,
        status: "pending",
        attempts: 0,
        lastAttemptAt: null,
        lastError: null,
        responseStatus: null,
      };
      this.deliveries.set(deliveryId, delivery);
      deliveryIds.push(deliveryId);

      // Fire and forget — don't block the caller
      void this.deliverWithRetry(endpoint, payload, deliveryId);
    }

    return deliveryIds;
  }

  /** Get delivery status */
  getDelivery(id: string): WebhookDelivery | undefined {
    return this.deliveries.get(id);
  }

  /** Get dead letter queue contents */
  getDeadLetterQueue(): ReadonlyArray<WebhookDelivery> {
    return this.deadLetterQueue;
  }

  /** Get delivery statistics */
  getStats(): {
    endpoints: number;
    pendingDeliveries: number;
    completedDeliveries: number;
    failedDeliveries: number;
    deadLetterCount: number;
  } {
    const all = Array.from(this.deliveries.values());
    return {
      endpoints: this.endpoints.size,
      pendingDeliveries: all.filter((d) => d.status === "pending").length,
      completedDeliveries: all.filter((d) => d.status === "delivered").length,
      failedDeliveries: all.filter((d) => d.status === "failed").length,
      deadLetterCount: this.deadLetterQueue.length,
    };
  }

  // -----------------------------------------------------------------------
  // Private
  // -----------------------------------------------------------------------

  private async deliverWithRetry(
    endpoint: WebhookEndpoint,
    payload: WebhookPayload,
    deliveryId: string,
  ): Promise<void> {
    const body = JSON.stringify(payload);
    const signature = this.sign(body, endpoint.secret);

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      const delivery = this.deliveries.get(deliveryId);
      assert(delivery !== undefined, `Delivery ${deliveryId} must exist`);

      const updated: WebhookDelivery = {
        ...delivery,
        attempts: attempt,
        lastAttemptAt: new Date().toISOString(),
      };
      this.deliveries.set(deliveryId, updated);

      try {
        const response = await fetch(endpoint.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Engine-Event": payload.event,
            "X-Engine-Delivery": deliveryId,
            "X-Engine-Signature": `sha256=${signature}`,
            ...endpoint.headers,
          },
          body,
          signal: AbortSignal.timeout(this.config.timeoutMs),
        });

        if (response.ok) {
          const success: WebhookDelivery = {
            ...updated,
            status: "delivered",
            responseStatus: response.status,
          };
          this.deliveries.set(deliveryId, success);
          this.notifyListeners(success);
          return;
        }

        // Non-retryable status codes
        if (response.status >= 400 && response.status < 500) {
          const failed: WebhookDelivery = {
            ...updated,
            status: "failed",
            responseStatus: response.status,
            lastError: `HTTP ${response.status}`,
          };
          this.deliveries.set(deliveryId, failed);
          this.addToDeadLetter(failed);
          this.notifyListeners(failed);
          return;
        }

        // Server error — retry with backoff
        const retryUpdated: WebhookDelivery = {
          ...updated,
          lastError: `HTTP ${response.status}`,
          responseStatus: response.status,
        };
        this.deliveries.set(deliveryId, retryUpdated);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        const errUpdated: WebhookDelivery = {
          ...updated,
          lastError: msg,
        };
        this.deliveries.set(deliveryId, errUpdated);
      }

      // Exponential backoff before retry
      if (attempt < this.config.maxRetries) {
        const delay = this.config.baseDelayMs * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    // All retries exhausted
    const finalDelivery = this.deliveries.get(deliveryId);
    assert(finalDelivery !== undefined, "Delivery must exist");
    const failed: WebhookDelivery = {
      ...finalDelivery,
      status: "failed",
    };
    this.deliveries.set(deliveryId, failed);
    this.addToDeadLetter(failed);
    this.notifyListeners(failed);
  }

  private sign(body: string, secret: string): string {
    return crypto.createHmac("sha256", secret).update(body).digest("hex");
  }

  private addToDeadLetter(delivery: WebhookDelivery): void {
    this.deadLetterQueue.push(delivery);
    if (this.deadLetterQueue.length > MAX_DEAD_LETTER_SIZE) {
      this.deadLetterQueue.splice(
        0,
        this.deadLetterQueue.length - MAX_DEAD_LETTER_SIZE,
      );
    }
  }

  private notifyListeners(delivery: WebhookDelivery): void {
    for (const listener of this.listeners) {
      try {
        listener(delivery);
      } catch {
        // Listener errors don't affect dispatcher
      }
    }
  }

  private generateId(): string {
    return `evt_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  }

  private generateDeliveryId(): string {
    this.deliveryCounter++;
    return `dlv_${Date.now()}_${this.deliveryCounter}`;
  }
}
