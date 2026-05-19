import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { SessionManager } from "../core/session/session-manager";

describe("SessionManager", () => {
  let tmpDir: string;
  let manager: SessionManager;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ce-session-"));
    manager = new SessionManager(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("initialize", () => {
    it("creates active-sessions.json", () => {
      manager.initialize();

      const sessionsPath = path.join(tmpDir, ".claude/active-sessions.json");
      expect(fs.existsSync(sessionsPath)).toBe(true);

      const data = JSON.parse(fs.readFileSync(sessionsPath, "utf-8"));
      expect(data.schema_version).toBe("1.0");
      expect(data.sessions).toEqual([]);
    });

    it("is idempotent", () => {
      manager.initialize();
      manager.register({
        session_id: "test-1",
        branch: "claude/test",
        description: "Test session",
        work_scope: ["apps/"],
        files_claimed: ["apps/dashboard/page.tsx"],
      });

      manager.initialize(); // Should NOT overwrite

      const active = manager.listActive();
      expect(active).toHaveLength(1);
    });
  });

  describe("register", () => {
    it("registers a new session", () => {
      manager.initialize();

      manager.register({
        session_id: "s1",
        branch: "claude/feat-1",
        description: "Add feature",
        work_scope: ["packages/auth/"],
        files_claimed: ["packages/auth/src/index.ts"],
      });

      const active = manager.listActive();
      expect(active).toHaveLength(1);
      expect(active[0].session_id).toBe("s1");
      expect(active[0].status).toBe("active");
    });
  });

  describe("checkConflicts", () => {
    it("detects file conflicts", () => {
      manager.initialize();

      manager.register({
        session_id: "s1",
        branch: "claude/feat-1",
        description: "Working on auth",
        work_scope: ["packages/auth/"],
        files_claimed: ["packages/auth/src/index.ts"],
      });

      const conflicts = manager.checkConflicts(["packages/auth/src/index.ts"]);
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].session_id).toBe("s1");
    });

    it("detects directory-level conflicts", () => {
      manager.initialize();

      manager.register({
        session_id: "s1",
        branch: "claude/feat-1",
        description: "Working on auth",
        work_scope: ["packages/auth/"],
        files_claimed: ["packages/auth/"],
      });

      const conflicts = manager.checkConflicts([
        "packages/auth/src/deep/file.ts",
      ]);
      expect(conflicts).toHaveLength(1);
    });

    it("returns empty for no conflicts", () => {
      manager.initialize();

      manager.register({
        session_id: "s1",
        branch: "claude/feat-1",
        description: "Working on auth",
        work_scope: ["packages/auth/"],
        files_claimed: ["packages/auth/src/index.ts"],
      });

      const conflicts = manager.checkConflicts([
        "packages/billing/src/index.ts",
      ]);
      expect(conflicts).toHaveLength(0);
    });
  });

  describe("complete", () => {
    it("marks session as completed", () => {
      manager.initialize();

      manager.register({
        session_id: "s1",
        branch: "claude/feat-1",
        description: "Done",
        work_scope: [],
        files_claimed: [],
      });

      manager.complete("s1");

      const active = manager.listActive();
      expect(active).toHaveLength(0);
    });
  });

  describe("cleanupStale", () => {
    it("removes sessions older than max age", () => {
      manager.initialize();

      // Manually inject a stale session
      const sessionsPath = path.join(tmpDir, ".claude/active-sessions.json");
      const data = JSON.parse(fs.readFileSync(sessionsPath, "utf-8"));
      data.sessions.push({
        session_id: "stale-1",
        branch: "claude/old",
        description: "Old session",
        work_scope: [],
        files_claimed: [],
        started_at: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
        status: "active",
      });
      fs.writeFileSync(sessionsPath, JSON.stringify(data, null, 2));

      const removed = manager.cleanupStale(24);
      expect(removed).toBe(1);
      expect(manager.listActive()).toHaveLength(0);
    });
  });
});
