/**
 * Coding Engine — Runtime Compliance Engine
 *
 * Enforces compliance standards at runtime — not just config declarations.
 * Validates code changes, deployments, and operations against configured
 * compliance rules before they proceed.
 *
 * Enforcement points:
 * - PreCommit: File path restrictions, secret scanning, audit trail
 * - PreDeploy: Health checks, encryption verification, access control
 * - OnDemand: Full compliance audit with evidence generation
 */

import { strict as assert } from "node:assert";
import * as fs from "fs";
import * as path from "path";
import type { CodingEngineConfig } from "../../config/coding-engine.config";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ComplianceRuleId = string;
export type ComplianceSeverity = "critical" | "high" | "medium" | "low";
export type ComplianceStandard =
  | "SOC2"
  | "GDPR"
  | "PSD2"
  | "HIPAA"
  | "ISO27001"
  | "ISO20022"
  | "AAOIFI"
  | "IFSB"
  | "PCI-DSS";

export interface ComplianceRule {
  readonly id: ComplianceRuleId;
  readonly standard: ComplianceStandard;
  readonly severity: ComplianceSeverity;
  readonly description: string;
  readonly check: (context: ComplianceContext) => ComplianceResult;
}

export interface ComplianceContext {
  /** Files being committed/deployed */
  readonly changedFiles: string[];
  /** File contents (path → content) for content inspection */
  readonly fileContents: ReadonlyMap<string, string>;
  /** Engine configuration */
  readonly config: CodingEngineConfig;
  /** Project root directory */
  readonly projectRoot: string;
  /** Current environment */
  readonly environment: string;
}

export interface ComplianceResult {
  readonly ruleId: ComplianceRuleId;
  readonly passed: boolean;
  readonly severity: ComplianceSeverity;
  readonly message: string;
  readonly evidence?: string;
  readonly remediation?: string;
}

export interface ComplianceReport {
  readonly schema_version: string;
  readonly generated_at: string;
  readonly standards_checked: ComplianceStandard[];
  readonly total_rules: number;
  readonly passed: number;
  readonly failed: number;
  readonly critical_failures: number;
  readonly results: ComplianceResult[];
  readonly overall_pass: boolean;
}

// ---------------------------------------------------------------------------
// Built-in Compliance Rules
// ---------------------------------------------------------------------------

const SECRET_PATTERNS = [
  /(?:password|passwd|pwd)\s*[:=]\s*["'][^"']+["']/i,
  /(?:secret|api[_-]?key|token)\s*[:=]\s*["'][^"']+["']/i,
  /sk_live_[a-zA-Z0-9]+/,
  /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/,
  /(?:AWS_SECRET_ACCESS_KEY|aws_secret_access_key)\s*[:=]\s*["']?[A-Za-z0-9/+=]{40}/,
  /ghp_[a-zA-Z0-9]{36}/,
  /glpat-[a-zA-Z0-9\-_]{20}/,
];

const DENIED_FILE_PATTERNS = [
  /\.env$/,
  /\.env\..+$/,
  /\.pem$/,
  /\.key$/,
  /credentials\.json$/,
  /terraform\.tfstate$/,
  /terraform\.tfstate\.backup$/,
];

function createBuiltinRules(): ComplianceRule[] {
  return [
    // SOC2: No secrets in code
    {
      id: "SOC2-SEC-001",
      standard: "SOC2",
      severity: "critical",
      description:
        "No hardcoded secrets, API keys, or credentials in source code",
      check: (ctx) => {
        const violations: string[] = [];
        for (const [filePath, content] of ctx.fileContents) {
          for (const pattern of SECRET_PATTERNS) {
            if (pattern.test(content)) {
              violations.push(
                `${filePath}: matches ${pattern.source.slice(0, 30)}...`,
              );
            }
          }
        }
        return {
          ruleId: "SOC2-SEC-001",
          passed: violations.length === 0,
          severity: "critical",
          message:
            violations.length === 0
              ? "No hardcoded secrets detected"
              : `Found ${violations.length} potential secrets: ${violations.slice(0, 3).join("; ")}`,
          remediation:
            "Use environment variables or secret manager (AWS SSM, Vault)",
        };
      },
    },

    // SOC2: Denied file paths
    {
      id: "SOC2-SEC-002",
      standard: "SOC2",
      severity: "critical",
      description:
        "Sensitive files (.env, .pem, .key, tfstate) must not be committed",
      check: (ctx) => {
        const blocked = ctx.changedFiles.filter((f) =>
          DENIED_FILE_PATTERNS.some((p) => p.test(f)),
        );
        return {
          ruleId: "SOC2-SEC-002",
          passed: blocked.length === 0,
          severity: "critical",
          message:
            blocked.length === 0
              ? "No sensitive files in changeset"
              : `Blocked files: ${blocked.join(", ")}`,
          remediation:
            "Add these files to .gitignore and use secret management",
        };
      },
    },

    // SOC2: Edit path restrictions
    {
      id: "SOC2-SEC-003",
      standard: "SOC2",
      severity: "high",
      description: "Changes must be within allowed edit paths",
      check: (ctx) => {
        const allowed = ctx.config.security.allowedEditPaths;
        const denied = ctx.config.security.deniedEditPaths;

        const violations = ctx.changedFiles.filter((f) => {
          const isAllowed = allowed.some((pattern) => matchGlob(f, pattern));
          const isDenied = denied.some((pattern) => matchGlob(f, pattern));
          return isDenied || !isAllowed;
        });

        return {
          ruleId: "SOC2-SEC-003",
          passed: violations.length === 0,
          severity: "high",
          message:
            violations.length === 0
              ? "All changes within allowed paths"
              : `Files outside allowed paths: ${violations.slice(0, 5).join(", ")}`,
          remediation: "Update security.allowedEditPaths in engine config",
        };
      },
    },

    // SOC2: Audit trail — structured logging check
    {
      id: "SOC2-AUD-001",
      standard: "SOC2",
      severity: "medium",
      description: "All API route files must import structured logging",
      check: (ctx) => {
        const routeFiles = ctx.changedFiles.filter(
          (f) =>
            f.includes("/routes/") && (f.endsWith(".ts") || f.endsWith(".js")),
        );
        const missing: string[] = [];
        for (const f of routeFiles) {
          const content = ctx.fileContents.get(f);
          if (
            content &&
            !content.includes("logger") &&
            !content.includes("log")
          ) {
            missing.push(f);
          }
        }
        return {
          ruleId: "SOC2-AUD-001",
          passed: missing.length === 0,
          severity: "medium",
          message:
            missing.length === 0
              ? "All route files have logging"
              : `Route files without logging: ${missing.join(", ")}`,
          remediation: "Import and use structured logger in all route handlers",
        };
      },
    },

    // GDPR: No PII in logs
    {
      id: "GDPR-PII-001",
      standard: "GDPR",
      severity: "high",
      description: "No PII (email, phone, SSN) in log statements",
      check: (ctx) => {
        const piiInLogs: string[] = [];
        const logPatterns = [
          /console\.log\(.*email/i,
          /logger\.\w+\(.*phone/i,
          /log\.\w+\(.*ssn/i,
        ];
        for (const [filePath, content] of ctx.fileContents) {
          for (const pattern of logPatterns) {
            if (pattern.test(content)) {
              piiInLogs.push(filePath);
              break;
            }
          }
        }
        return {
          ruleId: "GDPR-PII-001",
          passed: piiInLogs.length === 0,
          severity: "high",
          message:
            piiInLogs.length === 0
              ? "No PII detected in log statements"
              : `Potential PII in logs: ${piiInLogs.join(", ")}`,
          remediation:
            "Use data masking utilities for PII fields in log output",
        };
      },
    },

    // PSD2: Health endpoints
    {
      id: "PSD2-AVL-001",
      standard: "PSD2",
      severity: "medium",
      description: "All services must have /health endpoint",
      check: (ctx) => {
        const services = ctx.config.services;
        const missingHealth = services.filter(
          (s) => !s.healthEndpoint || s.healthEndpoint.length === 0,
        );
        return {
          ruleId: "PSD2-AVL-001",
          passed: missingHealth.length === 0,
          severity: "medium",
          message:
            missingHealth.length === 0
              ? "All services have health endpoints configured"
              : `Services without health endpoints: ${missingHealth.map((s) => s.name).join(", ")}`,
          remediation:
            "Add healthEndpoint to all service definitions in config",
        };
      },
    },

    // ISO27001: Encryption at rest
    {
      id: "ISO27001-ENC-001",
      standard: "ISO27001",
      severity: "high",
      description: "Encryption at rest must be enabled",
      check: (ctx) => ({
        ruleId: "ISO27001-ENC-001",
        passed: ctx.config.compliance.encryptionAtRest,
        severity: "high",
        message: ctx.config.compliance.encryptionAtRest
          ? "Encryption at rest is enabled"
          : "Encryption at rest is DISABLED",
        remediation: "Set compliance.encryptionAtRest: true in engine config",
      }),
    },

    // ISO27001: Encryption in transit
    {
      id: "ISO27001-ENC-002",
      standard: "ISO27001",
      severity: "high",
      description: "Encryption in transit (TLS) must be enabled",
      check: (ctx) => ({
        ruleId: "ISO27001-ENC-002",
        passed: ctx.config.compliance.encryptionInTransit,
        severity: "high",
        message: ctx.config.compliance.encryptionInTransit
          ? "Encryption in transit is enabled"
          : "Encryption in transit is DISABLED",
        remediation:
          "Set compliance.encryptionInTransit: true in engine config",
      }),
    },

    // AAOIFI: Shariah compliance structure check
    {
      id: "AAOIFI-SHR-001",
      standard: "AAOIFI",
      severity: "high",
      description:
        "Islamic contract schemas must include shariahStructure fields",
      check: (ctx) => {
        const contractFiles = ctx.changedFiles.filter(
          (f) =>
            (f.includes("contract") ||
              f.includes("sukuk") ||
              f.includes("takaful")) &&
            f.endsWith(".ts"),
        );
        const missing: string[] = [];
        for (const f of contractFiles) {
          const content = ctx.fileContents.get(f);
          if (
            content &&
            content.includes("interface") &&
            !content.includes("shariahStructure") &&
            !content.includes("shariah_structure")
          ) {
            missing.push(f);
          }
        }
        return {
          ruleId: "AAOIFI-SHR-001",
          passed: missing.length === 0,
          severity: "high",
          message:
            missing.length === 0
              ? "All contract schemas include Shariah structure"
              : `Contract schemas missing shariahStructure: ${missing.join(", ")}`,
          remediation:
            "Add shariahStructure field with boardApproval, fatwahReference, annualAudit",
        };
      },
    },
  ];
}

// ---------------------------------------------------------------------------
// Compliance Engine
// ---------------------------------------------------------------------------

export class ComplianceEngine {
  private readonly rules: ComplianceRule[];
  private readonly config: CodingEngineConfig;
  private readonly projectRoot: string;
  private readonly auditLog: Array<{
    timestamp: string;
    action: string;
    result: string;
    details: string;
  }> = [];

  constructor(config: CodingEngineConfig, projectRoot: string) {
    this.config = config;
    this.projectRoot = projectRoot;
    this.rules = createBuiltinRules();
  }

  /** Register a custom compliance rule */
  addRule(rule: ComplianceRule): void {
    assert(
      !this.rules.some((r) => r.id === rule.id),
      `Rule ${rule.id} already registered`,
    );
    this.rules.push(rule);
  }

  /** Run all rules for configured standards against given changes */
  validate(
    changedFiles: string[],
    environment = "development",
  ): ComplianceReport {
    const configuredStandards = this.config.compliance.standards.map(
      (s) => s as ComplianceStandard,
    );
    const applicableRules = this.rules.filter((r) =>
      configuredStandards.includes(r.standard),
    );

    const fileContents = this.buildFileContentsMap(changedFiles);
    const context: ComplianceContext = {
      changedFiles,
      fileContents,
      config: this.config,
      projectRoot: this.projectRoot,
      environment,
    };

    const results = this.executeRules(applicableRules, context);
    const report = this.buildReport(
      configuredStandards,
      applicableRules,
      results,
    );
    this.recordAudit(report, applicableRules.length);
    return report;
  }

  /** TigerStyle: extracted to keep validate() under 70 lines */
  private buildFileContentsMap(changedFiles: string[]): Map<string, string> {
    const fileContents = new Map<string, string>();
    for (const f of changedFiles) {
      const fullPath = path.join(this.projectRoot, f);
      try {
        if (fs.existsSync(fullPath)) {
          fileContents.set(f, fs.readFileSync(fullPath, "utf-8"));
        }
      } catch {
        // Skip unreadable files — permission errors, broken symlinks
      }
    }
    return fileContents;
  }

  private executeRules(
    rules: ComplianceRule[],
    context: ComplianceContext,
  ): ComplianceResult[] {
    const results: ComplianceResult[] = [];
    for (const rule of rules) {
      try {
        results.push(rule.check(context));
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        results.push({
          ruleId: rule.id,
          passed: false,
          severity: rule.severity,
          message: `Rule execution error: ${msg}`,
          remediation: "Fix the compliance rule implementation",
        });
      }
    }
    return results;
  }

  private buildReport(
    standards: ComplianceStandard[],
    rules: ComplianceRule[],
    results: ComplianceResult[],
  ): ComplianceReport {
    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => !r.passed).length;
    const criticalFailures = results.filter(
      (r) => !r.passed && r.severity === "critical",
    ).length;
    return {
      schema_version: "1.0",
      generated_at: new Date().toISOString(),
      standards_checked: standards,
      total_rules: rules.length,
      passed,
      failed,
      critical_failures: criticalFailures,
      results,
      overall_pass: criticalFailures === 0,
    };
  }

  /** TigerStyle: bounded audit log — max 5000 entries */
  private static readonly MAX_AUDIT_LOG_ENTRIES = 5000;

  private recordAudit(report: ComplianceReport, totalRules: number): void {
    this.auditLog.push({
      timestamp: new Date().toISOString(),
      action: "compliance_validation",
      result: report.overall_pass ? "PASS" : "FAIL",
      details: `${report.passed}/${totalRules} rules passed, ${report.critical_failures} critical failures`,
    });
    // TigerStyle: put a limit on everything — prune oldest entries
    if (this.auditLog.length > ComplianceEngine.MAX_AUDIT_LOG_ENTRIES) {
      this.auditLog.splice(0, 1000);
    }
  }

  /** PreCommit check — validates staged files */
  preCommitCheck(stagedFiles: string[]): {
    allowed: boolean;
    report: ComplianceReport;
  } {
    const report = this.validate(stagedFiles, "commit");
    return {
      allowed: report.overall_pass,
      report,
    };
  }

  /** PreDeploy check — validates deployment readiness */
  preDeployCheck(environment: string): {
    allowed: boolean;
    report: ComplianceReport;
  } {
    // For deploy, check all service configs
    const serviceFiles = this.config.services.map((s) => `services/${s.name}/`);
    const report = this.validate(serviceFiles, environment);
    return {
      allowed: report.overall_pass,
      report,
    };
  }

  /** Get the audit log */
  getAuditLog(): ReadonlyArray<{
    timestamp: string;
    action: string;
    result: string;
    details: string;
  }> {
    return this.auditLog;
  }

  /** Get registered rules count by standard */
  getRulesSummary(): Record<string, number> {
    const summary: Record<string, number> = {};
    for (const rule of this.rules) {
      summary[rule.standard] = (summary[rule.standard] ?? 0) + 1;
    }
    return summary;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function matchGlob(filePath: string, pattern: string): boolean {
  if (pattern.endsWith("*")) {
    return filePath.startsWith(pattern.slice(0, -1));
  }
  if (pattern.startsWith("*")) {
    return filePath.endsWith(pattern.slice(1));
  }
  return filePath === pattern || filePath.startsWith(pattern);
}
