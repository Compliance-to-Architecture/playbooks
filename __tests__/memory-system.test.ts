import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { MemorySystem } from "../core/memory/memory-system";

describe("MemorySystem", () => {
  let tmpDir: string;
  let memory: MemorySystem;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ce-test-"));
    memory = new MemorySystem(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("initialize", () => {
    it("creates all required directories", () => {
      memory.initialize();

      expect(fs.existsSync(path.join(tmpDir, ".claude/memory"))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, "docs/incidents"))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, "docs/adr"))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, "docs/fixes"))).toBe(true);
    });

    it("creates MEMORY.md template", () => {
      memory.initialize();

      const memoryPath = path.join(tmpDir, ".claude/memory/MEMORY.md");
      expect(fs.existsSync(memoryPath)).toBe(true);

      const content = fs.readFileSync(memoryPath, "utf-8");
      expect(content).toContain("# MEMORY.md");
      expect(content).toContain("## Resolved Issues");
      expect(content).toContain("## Known Anti-Patterns");
      expect(content).toContain("## Lessons Learned");
      expect(content).toContain("## Architectural Decisions");
    });

    it("creates anti-patterns.json", () => {
      memory.initialize();

      const apPath = path.join(tmpDir, ".claude/memory/anti-patterns.json");
      expect(fs.existsSync(apPath)).toBe(true);
      expect(JSON.parse(fs.readFileSync(apPath, "utf-8"))).toEqual([]);
    });

    it("creates incident template", () => {
      memory.initialize();

      const templatePath = path.join(
        tmpDir,
        "docs/incidents/INCIDENT_TEMPLATE.md",
      );
      expect(fs.existsSync(templatePath)).toBe(true);

      const content = fs.readFileSync(templatePath, "utf-8");
      expect(content).toContain("Root Cause");
      expect(content).toContain("Prevention Steps");
      expect(content).toContain("Fingerprint");
    });

    it("creates ADR template", () => {
      memory.initialize();

      const templatePath = path.join(tmpDir, "docs/adr/ADR_TEMPLATE.md");
      expect(fs.existsSync(templatePath)).toBe(true);

      const content = fs.readFileSync(templatePath, "utf-8");
      expect(content).toContain("Context");
      expect(content).toContain("Decision");
      expect(content).toContain("Consequences");
    });

    it("is idempotent — running twice doesn't overwrite", () => {
      memory.initialize();

      const memoryPath = path.join(tmpDir, ".claude/memory/MEMORY.md");
      fs.writeFileSync(memoryPath, "custom content");

      memory.initialize();

      expect(fs.readFileSync(memoryPath, "utf-8")).toBe("custom content");
    });
  });

  describe("hot memory", () => {
    it("adds and retrieves hot memory entries", () => {
      memory.addHot({
        id: "test-1",
        category: "lesson-learned",
        title: "Test lesson",
        content: "Learned something",
        tags: ["test"],
      });

      const entries = memory.getHotMemory();
      expect(entries).toHaveLength(1);
      expect(entries[0].tier).toBe("hot");
      expect(entries[0].title).toBe("Test lesson");
    });
  });

  describe("warm memory", () => {
    it("adds entries to MEMORY.md", () => {
      memory.initialize();

      memory.addWarm({
        id: "warm-1",
        category: "resolved-issue",
        title: "Fixed deploy bug",
        content: "Root cause was missing env var",
        tags: ["deploy"],
      });

      const content = memory.readWarmMemory();
      expect(content).toContain("Fixed deploy bug");
      expect(content).toContain("Root cause was missing env var");
    });
  });

  describe("cold memory", () => {
    it("writes incident documents", () => {
      memory.initialize();

      memory.addCold({
        title: "Database connection timeout",
        rootCause: "Connection pool exhausted",
        fix: "Increased pool size from 10 to 50",
        prevention: "Add connection pool monitoring alert",
        fingerprint: "abc123def456",
        severity: "high",
      });

      const incidents = memory.listIncidents();
      expect(incidents.length).toBeGreaterThanOrEqual(1);

      const incidentContent = fs.readFileSync(
        path.join(tmpDir, "docs/incidents", incidents[0]),
        "utf-8",
      );
      expect(incidentContent).toContain("Database connection timeout");
      expect(incidentContent).toContain("Connection pool exhausted");
      expect(incidentContent).toContain("abc123def456");
    });
  });

  describe("anti-pattern registry", () => {
    it("registers and retrieves anti-patterns", () => {
      memory.initialize();

      memory.registerAntiPattern({
        pattern: "Mock data in production",
        prevention: "Zero Mock Data policy",
        detection_command: 'grep -r "mockData" src/',
        incident_date: "2024-01-15",
        severity: "critical",
      });

      const patterns = memory.checkAntiPatterns();
      expect(patterns).toHaveLength(1);
      expect(patterns[0].pattern).toBe("Mock data in production");
    });

    it("deduplicates anti-patterns", () => {
      memory.initialize();

      const ap = {
        pattern: "Hardcoded secrets",
        prevention: "Use env vars",
        detection_command: 'grep -r "sk_live" src/',
        incident_date: "2024-01-15",
        severity: "critical" as const,
      };

      memory.registerAntiPattern(ap);
      memory.registerAntiPattern(ap);

      expect(memory.checkAntiPatterns()).toHaveLength(1);
    });
  });

  describe("flush hot to warm", () => {
    it("promotes all hot entries to warm memory", () => {
      memory.initialize();

      memory.addHot({
        id: "h1",
        category: "lesson-learned",
        title: "Lesson 1",
        content: "Content 1",
        tags: [],
      });

      memory.addHot({
        id: "h2",
        category: "anti-pattern",
        title: "Pattern 1",
        content: "Bad thing",
        tags: [],
      });

      memory.flushHotToWarm();

      expect(memory.getHotMemory()).toHaveLength(0);

      const warmContent = memory.readWarmMemory();
      expect(warmContent).toContain("Lesson 1");
      expect(warmContent).toContain("Pattern 1");
    });
  });
});
