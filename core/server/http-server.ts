/**
 * Coding Engine — HTTP Server
 *
 * Lightweight HTTP API wrapper exposing engine capabilities as REST endpoints.
 * Uses Node.js built-in http module (zero dependencies).
 *
 * Endpoints:
 *   GET  /health              — Health check report
 *   GET  /metrics             — Engine metrics
 *   POST /failures            — Ingest failure events
 *   GET  /failures            — List failures (paginated)
 *   POST /webhooks/endpoints  — Register webhook endpoint
 *   GET  /webhooks/stats      — Webhook delivery stats
 *   POST /recall              — Memory recall
 *   GET  /sessions            — List active sessions
 *   GET  /compliance/check    — Run compliance check
 */

import { strict as assert } from "node:assert";
import * as http from "node:http";
import type { HealthMonitor } from "../watchdog/health-monitor";
import type { MetricsCollector } from "../engine-metrics/metrics";
import type { FailurePipeline } from "../failure-pipeline/pipeline";
import type { WebhookDispatcher } from "../webhook/webhook-dispatcher";
import type { AuthManager, AuthContext } from "../auth/auth-middleware";
import type { SessionManager } from "../session/session-manager";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EngineServerConfig {
  /** Port to listen on (default: 3100) */
  readonly port: number;
  /** Hostname to bind to (default: "0.0.0.0") */
  readonly hostname: string;
  /** Whether auth is required (default: true) */
  readonly requireAuth: boolean;
}

export interface EngineServerDeps {
  healthMonitor?: HealthMonitor;
  metricsCollector?: MetricsCollector;
  failurePipeline?: FailurePipeline;
  webhookDispatcher?: WebhookDispatcher;
  authManager?: AuthManager;
  sessionManager?: SessionManager;
}

type RouteHandler = (
  req: http.IncomingMessage,
  body: string,
  auth: AuthContext | null,
) => Promise<{ status: number; body: unknown }>;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_BODY_SIZE = 1_000_000; // 1 MB
const DEFAULT_PORT = 3100;
const DEFAULT_HOSTNAME = "0.0.0.0";

// ---------------------------------------------------------------------------
// Engine HTTP Server
// ---------------------------------------------------------------------------

export class EngineHttpServer {
  private server: http.Server | null = null;
  private readonly config: EngineServerConfig;
  private readonly deps: EngineServerDeps;
  private readonly routes: Map<string, Map<string, RouteHandler>> = new Map();

  constructor(deps: EngineServerDeps, config?: Partial<EngineServerConfig>) {
    this.config = {
      port: config?.port ?? DEFAULT_PORT,
      hostname: config?.hostname ?? DEFAULT_HOSTNAME,
      requireAuth: config?.requireAuth ?? true,
    };
    this.deps = deps;
    this.registerRoutes();
  }

  /** Start listening */
  async start(): Promise<void> {
    assert(this.server === null, "Server already running");

    this.server = http.createServer((req, res) => {
      void this.handleRequest(req, res);
    });

    return new Promise((resolve) => {
      assert(this.server !== null, "Server must be created");
      this.server.listen(this.config.port, this.config.hostname, () => {
        console.log(
          `Engine server listening on ${this.config.hostname}:${this.config.port}`,
        );
        resolve();
      });
    });
  }

  /** Stop the server gracefully */
  async stop(): Promise<void> {
    if (this.server === null) return;

    return new Promise((resolve) => {
      assert(this.server !== null, "Server must exist for stop");
      this.server.close(() => {
        this.server = null;
        resolve();
      });
    });
  }

  /** Check if server is running */
  isRunning(): boolean {
    return this.server !== null;
  }

  // -----------------------------------------------------------------------
  // Route Registration
  // -----------------------------------------------------------------------

  private registerRoutes(): void {
    this.route("GET", "/health", async () => {
      if (this.deps.healthMonitor) {
        const report = await this.deps.healthMonitor.checkAll();
        return { status: 200, body: report };
      }
      return {
        status: 200,
        body: { status: "healthy", message: "No health monitor configured" },
      };
    });

    this.route("GET", "/metrics", async () => {
      if (this.deps.metricsCollector) {
        return { status: 200, body: this.deps.metricsCollector.getMetrics() };
      }
      return { status: 200, body: { message: "No metrics collector" } };
    });

    this.route("POST", "/failures", async (_req, body) => {
      if (!this.deps.failurePipeline) {
        return { status: 503, body: { error: "Pipeline not configured" } };
      }
      const events = JSON.parse(body);
      assert(Array.isArray(events), "Body must be an array of failure events");
      const deduped = this.deps.failurePipeline.deduplicate(events);
      const prioritized = this.deps.failurePipeline.prioritize(deduped);

      // Dispatch webhook events for new failures
      if (this.deps.webhookDispatcher) {
        for (const f of prioritized) {
          void this.deps.webhookDispatcher.dispatch("failure.detected", {
            failure: f,
          });
        }
      }

      return {
        status: 201,
        body: {
          ingested: events.length,
          after_dedup: deduped.length,
          prioritized: prioritized.length,
        },
      };
    });

    this.route("GET", "/failures", async () => {
      if (!this.deps.failurePipeline) {
        return { status: 503, body: { error: "Pipeline not configured" } };
      }
      const result = await this.deps.failurePipeline.collectPaginated({
        limit: 50,
        offset: 0,
      });
      return { status: 200, body: result };
    });

    this.route("GET", "/webhooks/stats", async () => {
      if (!this.deps.webhookDispatcher) {
        return { status: 503, body: { error: "Webhooks not configured" } };
      }
      return { status: 200, body: this.deps.webhookDispatcher.getStats() };
    });

    this.route("GET", "/sessions", async () => {
      if (!this.deps.sessionManager) {
        return {
          status: 503,
          body: { error: "Session manager not configured" },
        };
      }
      return { status: 200, body: this.deps.sessionManager.listActive() };
    });
  }

  private route(method: string, path: string, handler: RouteHandler): void {
    if (!this.routes.has(path)) {
      this.routes.set(path, new Map());
    }
    const methodMap = this.routes.get(path);
    assert(methodMap !== undefined, "Route map must exist");
    methodMap.set(method, handler);
  }

  // -----------------------------------------------------------------------
  // Request Handling
  // -----------------------------------------------------------------------

  private async handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    const method = req.method ?? "GET";
    const url = new URL(
      req.url ?? "/",
      `http://${req.headers.host ?? "localhost"}`,
    );
    const path = url.pathname;

    // CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization",
    );

    if (method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // Auth check (skip for /health)
    let authContext: AuthContext | null = null;
    if (this.config.requireAuth && path !== "/health") {
      if (!this.deps.authManager) {
        this.sendJson(res, 500, {
          error: "Auth required but no auth manager configured",
        });
        return;
      }
      const result = this.deps.authManager.authenticate(
        req.headers.authorization,
      );
      if (!result.authenticated) {
        this.sendJson(res, 401, { error: result.error });
        return;
      }
      authContext = result.context ?? null;
    }

    // Route matching
    const methodMap = this.routes.get(path);
    if (methodMap === undefined) {
      this.sendJson(res, 404, { error: `Not found: ${path}` });
      return;
    }

    const handler = methodMap.get(method);
    if (handler === undefined) {
      this.sendJson(res, 405, { error: `Method not allowed: ${method}` });
      return;
    }

    // Read body
    const body = await this.readBody(req);

    try {
      const result = await handler(req, body, authContext);
      this.sendJson(res, result.status, result.body);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.sendJson(res, 500, { error: msg });
    }
  }

  private readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let size = 0;

      req.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_BODY_SIZE) {
          req.destroy();
          reject(new Error(`Body too large (max ${MAX_BODY_SIZE} bytes)`));
          return;
        }
        chunks.push(chunk);
      });

      req.on("end", () => {
        resolve(Buffer.concat(chunks).toString("utf-8"));
      });

      req.on("error", reject);
    });
  }

  private sendJson(
    res: http.ServerResponse,
    status: number,
    body: unknown,
  ): void {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  }
}
