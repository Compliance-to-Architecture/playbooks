/**
 * Coding Engine — Universal Failure Types
 *
 * Domain-agnostic failure types for the failure pipeline.
 * These types work for any project, any language, any cloud provider.
 */

import crypto from "crypto";

export type FailureSeverity = "critical" | "high" | "medium" | "low";
export type FailureSource =
  | "github-actions"
  | "aws-ecs"
  | "cloudflare"
  | "sentry"
  | "kubernetes"
  | "custom";
export type FailureStatus =
  | "new"
  | "triaged"
  | "fixing"
  | "merged"
  | "released"
  | "ignored";
export type BlobKind =
  | "logs"
  | "stack"
  | "diff"
  | "artifact"
  | "trace"
  | "config"
  | "screenshot";

export interface BaseFailure {
  id: string;
  timestamp: string;
  source: FailureSource;
  severity: FailureSeverity;
  fingerprint: string;
  service: string;
  environment: string;
  message: string;
  stackTrace?: string;
  context?: Record<string, unknown>;
}

export interface FailureEvent extends BaseFailure {
  status: FailureStatus;
  commitSha: string;
  workflowRunId?: string;
  link?: string;
  resolvedByPr?: string;
  blobs: FailureContextBlob[];
}

export interface FailureContextBlob {
  id: string;
  kind: BlobKind;
  uri: string;
  content?: string;
}

export interface FailureBundle {
  error_summary: string;
  stack_trace: string;
  logs_excerpt: string;
  changed_files: string[];
  workflow_name: string;
  failing_step: string;
  recent_similar_failures: FailureEvent[];
  service_ownership: string;
  reproduction_command?: string;
  expected_behavior?: string;
  full_logs_link: string;
  artifact_links: string[];
}

export interface AgentFailureContext {
  schema_version: string;
  generated_at: string;
  repository: string;
  failures: FailureEvent[];
  open_fix_prs: Array<{
    number: number;
    title: string;
    fingerprint: string;
    url: string;
  }>;
  action_items: string[];
}

export interface UnifiedFailureReport {
  schema_version: string;
  generated_at: string;
  repository: string;
  source_count: Record<FailureSource, number>;
  total_failures: number;
  critical_count: number;
  failures: FailureEvent[];
  recommendations: string[];
}

/**
 * Generate a fingerprint for failure deduplication
 */
export function generateFingerprint(failure: BaseFailure): string {
  // crypto imported at top level
  const payload = [
    failure.source,
    failure.service,
    failure.message.replace(/\d+/g, "N").replace(/[a-f0-9]{7,}/gi, "HASH"),
  ].join("|");
  return crypto.createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

/**
 * Compare severity levels for prioritization
 */
export function compareSeverity(
  a: FailureSeverity,
  b: FailureSeverity,
): number {
  const order: Record<FailureSeverity, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };
  return order[a] - order[b];
}
