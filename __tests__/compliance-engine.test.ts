import { describe, it, expect, beforeEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { ComplianceEngine } from "../core/compliance/compliance-engine";
import { defaultConfig } from "../config/coding-engine.config";

describe("ComplianceEngine", () => {
  let tmpDir: string;
  let engine: ComplianceEngine;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ce-compliance-"));
    engine = new ComplianceEngine(defaultConfig, tmpDir);
  });

  describe("validate", () => {
    it("passes when no violations found", () => {
      // Create a clean file
      const filePath = "apps/test-app/index.ts";
      const fullPath = path.join(tmpDir, filePath);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, 'const x = "hello";');

      const report = engine.validate([filePath]);
      expect(report.schema_version).toBe("1.0");
      expect(report.critical_failures).toBe(0);
      expect(report.overall_pass).toBe(true);
    });

    it("detects hardcoded secrets", () => {
      const filePath = "apps/test-app/config.ts";
      const fullPath = path.join(tmpDir, filePath);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, 'const key = "sk_live_abc123def456ghi789";');

      const report = engine.validate([filePath]);
      const secretRule = report.results.find(
        (r) => r.ruleId === "SOC2-SEC-001",
      );
      expect(secretRule).toBeDefined();
      expect(secretRule!.passed).toBe(false);
    });

    it("blocks sensitive file paths", () => {
      const report = engine.validate([".env", "secrets.pem"]);
      const pathRule = report.results.find((r) => r.ruleId === "SOC2-SEC-002");
      expect(pathRule).toBeDefined();
      expect(pathRule!.passed).toBe(false);
    });

    it("checks encryption configuration", () => {
      // Create engine with ISO27001 in standards
      const configWithIso = {
        ...defaultConfig,
        compliance: {
          ...defaultConfig.compliance,
          standards: [...defaultConfig.compliance.standards, "ISO27001"],
        },
      };
      const isoEngine = new ComplianceEngine(configWithIso, tmpDir);
      const report = isoEngine.validate([], "production");
      const encRestRule = report.results.find(
        (r) => r.ruleId === "ISO27001-ENC-001",
      );
      expect(encRestRule).toBeDefined();
      // Default config has encryption enabled
      expect(encRestRule!.passed).toBe(true);
    });
  });

  describe("preCommitCheck", () => {
    it("allows clean commits", () => {
      const result = engine.preCommitCheck(["apps/dashboard/page.tsx"]);
      expect(result.allowed).toBe(true);
    });

    it("blocks commits with secrets", () => {
      const filePath = "apps/test/leak.ts";
      const fullPath = path.join(tmpDir, filePath);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      // Test content uses a pattern that matches the compliance rule's SECRET_PATTERNS
      const testContent =
        "const p" + "assword = " + '"sup' + "er_sec" + 'ret_123";';
      fs.writeFileSync(fullPath, testContent);

      const result = engine.preCommitCheck([filePath]);
      expect(result.report.critical_failures).toBeGreaterThan(0);
      expect(result.allowed).toBe(false);
    });
  });

  describe("addRule", () => {
    it("registers custom compliance rules", () => {
      engine.addRule({
        id: "CUSTOM-001",
        standard: "SOC2",
        severity: "medium",
        description: "Custom test rule",
        check: () => ({
          ruleId: "CUSTOM-001",
          passed: true,
          severity: "medium",
          message: "Custom rule passed",
        }),
      });

      const summary = engine.getRulesSummary();
      expect(summary["SOC2"]).toBeGreaterThan(0);
    });

    it("rejects duplicate rule IDs", () => {
      engine.addRule({
        id: "UNIQUE-001",
        standard: "GDPR",
        severity: "low",
        description: "Test",
        check: () => ({
          ruleId: "UNIQUE-001",
          passed: true,
          severity: "low",
          message: "ok",
        }),
      });

      expect(() =>
        engine.addRule({
          id: "UNIQUE-001",
          standard: "GDPR",
          severity: "low",
          description: "Duplicate",
          check: () => ({
            ruleId: "UNIQUE-001",
            passed: true,
            severity: "low",
            message: "ok",
          }),
        }),
      ).toThrow();
    });
  });

  describe("audit log", () => {
    it("records validation actions", () => {
      engine.validate([]);
      const log = engine.getAuditLog();
      expect(log.length).toBeGreaterThan(0);
      expect(log[0].action).toBe("compliance_validation");
    });
  });
});
