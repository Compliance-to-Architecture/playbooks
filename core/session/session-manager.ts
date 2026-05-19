/**
 * Coding Engine — Session Manager
 *
 * Tracks active sessions to prevent parallel-universe conflicts.
 * Each session registers its branch, work scope, and files being edited.
 */

import { strict as assert } from "node:assert";
import * as fs from "fs";
import * as path from "path";

export interface SessionInfo {
  session_id: string;
  branch: string;
  description: string;
  work_scope: string[];
  started_at: string;
  status: "active" | "completed" | "abandoned";
  files_claimed: string[];
}

export interface ActiveSessions {
  schema_version: string;
  sessions: SessionInfo[];
}

const SESSIONS_FILE = ".claude/active-sessions.json";

export class SessionManager {
  private projectRoot: string;
  private sessionsPath: string;
  private readonly tenantId: string;

  constructor(projectRoot: string, tenantId: string = "default") {
    assert(
      typeof projectRoot === "string" && projectRoot.length > 0,
      "projectRoot must be a non-empty string",
    );
    assert(
      typeof tenantId === "string" && tenantId.length > 0,
      "tenantId must be a non-empty string",
    );
    this.projectRoot = projectRoot;
    this.tenantId = tenantId;
    // Tenant-scoped sessions file
    this.sessionsPath =
      tenantId === "default"
        ? path.join(projectRoot, SESSIONS_FILE)
        : path.join(
            projectRoot,
            ".claude",
            "tenants",
            tenantId,
            "active-sessions.json",
          );
  }

  /** Get tenant ID */
  getTenantId(): string {
    return this.tenantId;
  }

  /**
   * Create a tenant-scoped session manager (factory for serverless).
   */
  static createForTenant(
    projectRoot: string,
    tenantId: string,
  ): SessionManager {
    assert(
      typeof projectRoot === "string" && projectRoot.length > 0,
      "projectRoot must be a non-empty string",
    );
    assert(
      typeof tenantId === "string" && tenantId.length > 0,
      "tenantId must be a non-empty string",
    );
    return new SessionManager(projectRoot, tenantId);
  }

  /**
   * Initialize the sessions file if it doesn't exist
   */
  initialize(): void {
    const dir = path.dirname(this.sessionsPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (!fs.existsSync(this.sessionsPath)) {
      const empty: ActiveSessions = {
        schema_version: "1.0",
        sessions: [],
      };
      fs.writeFileSync(this.sessionsPath, JSON.stringify(empty, null, 2));
    }
  }

  /**
   * Register a new session
   */
  register(session: Omit<SessionInfo, "started_at" | "status">): void {
    assert(
      typeof session.session_id === "string" && session.session_id.length > 0,
      "session.session_id must be a non-empty string",
    );
    assert(
      typeof session.branch === "string" && session.branch.length > 0,
      "session.branch must be a non-empty string",
    );
    const sessions = this.load();
    const conflicts = this.checkConflicts(session.files_claimed, sessions);

    if (conflicts.length > 0) {
      console.warn(
        `WARNING: File conflicts detected with sessions: ${conflicts.map((c) => c.session_id).join(", ")}`,
      );
    }

    sessions.sessions.push({
      ...session,
      started_at: new Date().toISOString(),
      status: "active",
    });

    this.save(sessions);
  }

  /**
   * Mark a session as completed
   */
  complete(sessionId: string): void {
    assert(
      typeof sessionId === "string" && sessionId.length > 0,
      "sessionId must be a non-empty string",
    );
    const sessions = this.load();
    const session = sessions.sessions.find((s) => s.session_id === sessionId);
    if (session) {
      session.status = "completed";
      this.save(sessions);
    }
  }

  /**
   * Check for file conflicts with active sessions
   */
  checkConflicts(
    filePaths: string[],
    sessions?: ActiveSessions,
  ): SessionInfo[] {
    assert(Array.isArray(filePaths), "filePaths must be an array");
    assert(
      filePaths.length <= 10000,
      "filePaths must not exceed 10000 entries",
    );
    const data = sessions ?? this.load();
    const activeSessions = data.sessions.filter((s) => s.status === "active");

    return activeSessions.filter((session) =>
      session.files_claimed.some((claimed) =>
        filePaths.some(
          (fp) =>
            fp === claimed || fp.startsWith(claimed) || claimed.startsWith(fp),
        ),
      ),
    );
  }

  /**
   * List active sessions
   */
  listActive(): SessionInfo[] {
    const result = this.load().sessions.filter((s) => s.status === "active");
    assert(result.length <= 1000, "active sessions must not exceed 1000");
    return result;
  }

  /**
   * Clean up stale sessions (older than 24 hours)
   */
  cleanupStale(maxAgeHours = 24): number {
    assert(
      typeof maxAgeHours === "number" && maxAgeHours > 0,
      "maxAgeHours must be a positive number",
    );
    const sessions = this.load();
    const cutoff = Date.now() - maxAgeHours * 60 * 60 * 1000;
    const before = sessions.sessions.length;

    sessions.sessions = sessions.sessions.filter((s) => {
      if (s.status !== "active") return true;
      return new Date(s.started_at).getTime() > cutoff;
    });

    const removed = before - sessions.sessions.length;
    if (removed > 0) {
      this.save(sessions);
    }
    return removed;
  }

  private load(): ActiveSessions {
    try {
      return JSON.parse(fs.readFileSync(this.sessionsPath, "utf-8"));
    } catch {
      return { schema_version: "1.0", sessions: [] };
    }
  }

  private save(sessions: ActiveSessions): void {
    fs.writeFileSync(this.sessionsPath, JSON.stringify(sessions, null, 2));
  }
}
