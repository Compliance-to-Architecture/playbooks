/**
 * Coding Engine — Central Configuration
 *
 * This is the SINGLE SOURCE OF TRUTH for all engine behavior.
 * Every script, workflow, hook, and agent reads from this config.
 *
 * To adapt for a new project:
 * 1. Copy this file to your repo root as `coding-engine.config.ts`
 * 2. Update the values below for your project
 * 3. Run `npx coding-engine init` to scaffold remaining files
 */

export interface CodingEngineConfig {
  /** Engine metadata */
  engine: {
    version: string;
    name: string;
    schemaVersion: string;
  };

  /** Repository information */
  repository: {
    owner: string;
    name: string;
    defaultBranch: string;
    branchPrefix: string;
    monorepo: boolean;
    packageManager: "pnpm" | "npm" | "yarn" | "bun";
    language: "typescript" | "python" | "go" | "rust" | "java" | "polyglot";
  };

  /** Cloud providers and infrastructure */
  infrastructure: {
    cloudProviders: Array<"aws" | "cloudflare" | "gcp" | "azure" | "vercel">;
    containerRegistry: "ecr" | "ghcr" | "dockerhub" | "gcr" | "acr";
    compute:
      | "ecs-fargate"
      | "ecs-ec2"
      | "eks"
      | "lambda"
      | "cloudflare-workers"
      | "cloud-run";
    database: "postgresql" | "mysql" | "mongodb" | "dynamodb";
    cache: "redis" | "memcached" | "cloudflare-kv";
    search: "meilisearch" | "elasticsearch" | "algolia" | "typesense";
    cdn: "cloudflare" | "cloudfront" | "fastly";
  };

  /** Service definitions */
  services: Array<{
    name: string;
    port: number;
    healthEndpoint: string;
    deployTarget: string;
  }>;

  /** Frontend applications */
  apps: Array<{
    name: string;
    port: number;
    framework: "nextjs" | "astro" | "vite" | "remix";
    deployTarget: string;
    domain?: string;
  }>;

  /** Compliance and regulatory standards */
  compliance: {
    standards: string[];
    auditTrail: boolean;
    encryptionAtRest: boolean;
    encryptionInTransit: boolean;
    dataClassification: boolean;
    accessControl: "cerbos" | "casbin" | "opa" | "custom";
    incidentResponse: boolean;
  };

  /** Domain-specific configuration */
  domain: {
    name: string;
    description: string;
    guardrailSkills: string[];
    domainAgents: string[];
    domainSkills: string[];
    taxonomyCategories: string[];
  };

  /** Billing and payments */
  billing: {
    provider: "stripe" | "paddle" | "lemonsqueezy" | "none";
    usageMetering: boolean;
    subscriptionTiers: boolean;
    marketplace: boolean;
    invoicing: boolean;
  };

  /** Agent orchestration */
  agents: {
    maxParallelAgents: number;
    maxFixPRsOpen: number;
    circuitBreakerThreshold: number;
    autoMergeEnabled: boolean;
    autoFixEnabled: boolean;
    skillEnforcement: boolean;
  };

  /** Failure pipeline */
  failurePipeline: {
    sources: Array<
      "github-actions" | "aws-ecs" | "cloudflare" | "sentry" | "custom"
    >;
    fingerprintAlgorithm: "sha256" | "md5";
    maxEscalationCount: number;
    deduplicationWindow: string;
  };

  /** Security */
  security: {
    allowedEditPaths: string[];
    deniedEditPaths: string[];
    signedCommits: boolean;
    secretScanning: boolean;
    dependencyScanning: boolean;
    containerScanning: boolean;
  };

  /** Observability */
  observability: {
    logging: "pino" | "winston" | "bunyan" | "console";
    tracing: "opentelemetry" | "datadog" | "none";
    monitoring: "grafana" | "datadog" | "cloudwatch" | "none";
    errorTracking: "sentry" | "bugsnag" | "rollbar" | "none";
    analytics: "clickhouse" | "bigquery" | "none";
  };

  /** Multi-tenancy */
  multiTenancy: {
    enabled: boolean;
    isolation: "row-level" | "schema" | "database";
    resolution: Array<"subdomain" | "header" | "jwt-claim" | "path">;
  };

  /** Feature flags */
  featureFlags: {
    provider: "custom" | "launchdarkly" | "unleash" | "none";
  };

  /** Agent memory (Hindsight) */
  agentMemory: {
    provider: "hindsight" | "file-only";
    hindsight: {
      baseUrl: string;
      bankId: string;
      recallTokenBudget: number;
      autoRetain: boolean;
      autoReflect: boolean;
      reflectIntervalMinutes: number;
    };
  };

  /** Code-mode tool execution optimization (@utcp/code-mode) */
  codeMode: {
    enabled: boolean;
    timeout_ms: number;
    mcpServers: Record<
      string,
      {
        command: string;
        args: string[];
        env?: Record<string, string>;
      }
    >;
  };

  /** Sandbox execution (optional — for isolated code execution) */
  sandbox: {
    provider: "cloudflare-sandbox" | "none";
    defaultLanguage: "typescript" | "python" | "javascript";
    autoStopMinutes: number;
    autoDeleteMinutes: number;
    resources: {
      vcpu: number;
      memoryGb: number;
      diskGb: number;
    };
  };

  /** Serverless execution mode */
  serverless: {
    /** Enable serverless mode (stateless per-request execution) */
    enabled: boolean;
    /** Runtime target */
    runtime: "lambda" | "cloudflare-workers" | "vercel-edge" | "none";
    /** Ephemeral state directory (e.g., /tmp for Lambda) */
    stateDir: string;
    /** Persistent storage for cross-invocation state */
    persistTo: "s3" | "cloudflare-kv" | "cloudflare-d1" | "redis" | "none";
    /** Max invocation duration in ms */
    timeout_ms: number;
    /** Clean up state on function completion */
    cleanupOnExit: boolean;
  };
}

/**
 * Default configuration — override per project
 */
export const defaultConfig: CodingEngineConfig = {
  engine: {
    version: "1.0.0",
    name: "coding-engine",
    schemaVersion: "1.0",
  },
  repository: {
    owner: "",
    name: "",
    defaultBranch: "main",
    branchPrefix: "claude/",
    monorepo: true,
    packageManager: "pnpm",
    language: "typescript",
  },
  infrastructure: {
    cloudProviders: ["aws", "cloudflare"],
    containerRegistry: "ecr",
    compute: "ecs-fargate",
    database: "postgresql",
    cache: "redis",
    search: "meilisearch",
    cdn: "cloudflare",
  },
  services: [],
  apps: [],
  compliance: {
    standards: ["SOC2", "GDPR"],
    auditTrail: true,
    encryptionAtRest: true,
    encryptionInTransit: true,
    dataClassification: true,
    accessControl: "cerbos",
    incidentResponse: true,
  },
  domain: {
    name: "",
    description: "",
    guardrailSkills: [],
    domainAgents: [],
    domainSkills: [],
    taxonomyCategories: [],
  },
  billing: {
    provider: "stripe",
    usageMetering: true,
    subscriptionTiers: true,
    marketplace: false,
    invoicing: true,
  },
  agents: {
    maxParallelAgents: 4,
    maxFixPRsOpen: 3,
    circuitBreakerThreshold: 3,
    autoMergeEnabled: true,
    autoFixEnabled: true,
    skillEnforcement: true,
  },
  failurePipeline: {
    sources: ["github-actions"],
    fingerprintAlgorithm: "sha256",
    maxEscalationCount: 3,
    deduplicationWindow: "24h",
  },
  security: {
    allowedEditPaths: ["apps/*", "packages/*", "services/*", "config/*"],
    deniedEditPaths: [".env*", "*.pem", "*.key", "terraform.tfstate*"],
    signedCommits: true,
    secretScanning: true,
    dependencyScanning: true,
    containerScanning: true,
  },
  observability: {
    logging: "pino",
    tracing: "opentelemetry",
    monitoring: "grafana",
    errorTracking: "sentry",
    analytics: "clickhouse",
  },
  multiTenancy: {
    enabled: true,
    isolation: "row-level",
    resolution: ["subdomain", "header", "jwt-claim"],
  },
  featureFlags: {
    provider: "custom",
  },
  agentMemory: {
    provider: "hindsight",
    hindsight: {
      baseUrl: "http://localhost:8888",
      bankId: "coding-engine",
      recallTokenBudget: 2000,
      autoRetain: true,
      autoReflect: true,
      reflectIntervalMinutes: 60,
    },
  },
  codeMode: {
    enabled: true,
    timeout_ms: 30_000,
    mcpServers: {},
  },
  sandbox: {
    provider: "none",
    defaultLanguage: "typescript",
    autoStopMinutes: 30,
    autoDeleteMinutes: 60,
    resources: {
      vcpu: 2,
      memoryGb: 2,
      diskGb: 5,
    },
  },
  serverless: {
    enabled: false,
    runtime: "none",
    stateDir: "/tmp/coding-engine-state",
    persistTo: "none",
    timeout_ms: 30_000,
    cleanupOnExit: true,
  },
};

/**
 * Load config from project root.
 * Uses dynamic import (ESM-compatible).
 */
export async function loadConfig(
  projectRoot: string,
): Promise<CodingEngineConfig> {
  const configPath = `${projectRoot}/coding-engine.config.ts`;
  try {
    const mod = (await import(configPath)) as {
      default?: CodingEngineConfig;
      config?: CodingEngineConfig;
    };
    return mod.default ?? mod.config ?? defaultConfig;
  } catch {
    console.warn(
      `No coding-engine.config.ts found at ${projectRoot}, using defaults`,
    );
    return defaultConfig;
  }
}
