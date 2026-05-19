# Hackathon as a Service — Code Engine Example

> Built with the Coding Engine. End-to-end hackathon management platform.

## What This Builds

A complete hackathon management platform for organizers, sponsors, and participants:

- Event creation & registration (public, private, internal)
- Team formation & matchmaking (skills-based)
- One-click project sandboxes (E2B-powered dev environments)
- Real-time project submission & demo scheduling
- Judging system (criteria-based, multi-round, blind review)
- Sponsor challenge tracks with dedicated prizes
- Mentorship matching & office hours booking
- Live leaderboards & activity feeds
- Post-event showcase & project gallery
- Prize distribution & certificate generation
- White-label for enterprise internal hackathons

## Architecture

```
apps/
├── organizer-dashboard/    # Event management & analytics
├── participant-portal/     # Registration, team, submissions
├── judging-app/            # Judge scoring & deliberation
├── sponsor-portal/         # Sponsor challenge management
├── showcase-gallery/       # Public project gallery & voting
├── admin-portal/           # Platform admin (universal)

packages/
├── event-core/             # Event CRUD, timeline, milestones
├── registration-core/      # Registration, tickets, waitlists
├── team-core/              # Team formation, invites, skill matching
├── sandbox-core/           # One-click dev environment provisioning
├── submission-core/        # Project submissions, demos, media
├── judging-core/           # Scoring rubrics, rounds, deliberation
├── sponsor-core/           # Sponsor tracks, challenges, prizes
├── mentorship-core/        # Mentor matching, office hours, chat
├── leaderboard-core/       # Real-time scoring & activity feeds
├── certificate-core/       # Certificate & badge generation (PDF/SVG)

services/
├── event-api/              # Event management service
├── registration-api/       # Registration & ticketing service
├── team-api/               # Team management service
├── sandbox-api/            # Dev environment provisioning (E2B)
├── submission-api/         # Submission & demo service
├── judging-api/            # Judging orchestration service
├── notification-api/       # Email, SMS, push notifications
```

## Key Patterns

### Event Lifecycle

```typescript
// packages/event-core/src/event.ts

type EventPhase =
  | "draft"
  | "registration_open"
  | "registration_closed"
  | "team_formation"
  | "hacking"
  | "submission"
  | "judging"
  | "deliberation"
  | "awards"
  | "showcase"
  | "archived";

interface HackathonEvent {
  id: string;
  name: string;
  slug: string;
  type: "public" | "private" | "internal" | "hybrid";
  format: "in_person" | "virtual" | "hybrid";
  phase: EventPhase;
  timeline: {
    registrationOpen: Date;
    registrationClose: Date;
    hackingStart: Date;
    hackingEnd: Date;
    submissionDeadline: Date;
    judgingStart: Date;
    awardsDate: Date;
  };
  config: {
    maxParticipants: number;
    maxTeamSize: number;
    minTeamSize: number;
    allowSoloParticipants: boolean;
    requireGitHub: boolean;
    sandboxEnabled: boolean;
    mentorshipEnabled: boolean;
  };
  tracks: ChallengeTrack[];
  prizes: Prize[];
  sponsors: Sponsor[];
}

interface ChallengeTrack {
  id: string;
  name: string;
  description: string;
  sponsorId?: string;
  prizes: Prize[];
  judgingCriteria: JudgingCriterion[];
  maxSubmissions?: number;
}
```

### Skill-Based Team Matching

```typescript
// packages/team-core/src/matchmaker.ts

interface ParticipantProfile {
  userId: string;
  skills: {
    name: string;
    level: "beginner" | "intermediate" | "advanced" | "expert";
  }[];
  interests: string[];
  lookingForTeam: boolean;
  preferredRole:
    | "frontend"
    | "backend"
    | "design"
    | "data"
    | "devops"
    | "pm"
    | "any";
  timezone: string;
  languages: string[];
}

interface TeamSuggestion {
  members: ParticipantProfile[];
  coverageScore: number; // How well skills complement each other
  diversityScore: number; // Skill diversity
  compatibilityScore: number; // Timezone, language overlap
  overallScore: number;
}

function suggestTeams(
  participants: ParticipantProfile[],
  teamSize: number,
): TeamSuggestion[] {
  const solos = participants.filter((p) => p.lookingForTeam);
  const suggestions: TeamSuggestion[] = [];

  // Greedy matching: maximize skill coverage per team
  const assigned = new Set<string>();

  for (const anchor of solos) {
    if (assigned.has(anchor.userId)) continue;

    const candidates = solos
      .filter((p) => !assigned.has(p.userId) && p.userId !== anchor.userId)
      .map((p) => ({
        profile: p,
        complementarity: calculateComplementarity(anchor, p),
      }))
      .sort((a, b) => b.complementarity - a.complementarity);

    const team = [
      anchor,
      ...candidates.slice(0, teamSize - 1).map((c) => c.profile),
    ];

    if (team.length >= 2) {
      team.forEach((m) => assigned.add(m.userId));
      suggestions.push(scoreTeam(team));
    }
  }

  return suggestions.sort((a, b) => b.overallScore - a.overallScore);
}
```

### Judging System

```typescript
// packages/judging-core/src/scoring.ts

interface JudgingCriterion {
  name: string;
  description: string;
  maxScore: number;
  weight: number; // Relative weight (0-1)
}

interface JudgeScore {
  judgeId: string;
  submissionId: string;
  round: number;
  scores: { criterionName: string; score: number; feedback: string }[];
  overallFeedback: string;
  timestamp: Date;
}

const DEFAULT_CRITERIA: JudgingCriterion[] = [
  {
    name: "Innovation",
    description: "Originality and creativity of the solution",
    maxScore: 10,
    weight: 0.25,
  },
  {
    name: "Technical Complexity",
    description: "Technical depth and implementation quality",
    maxScore: 10,
    weight: 0.25,
  },
  {
    name: "Impact",
    description: "Potential real-world impact and usefulness",
    maxScore: 10,
    weight: 0.2,
  },
  {
    name: "Design",
    description: "UI/UX quality and user experience",
    maxScore: 10,
    weight: 0.15,
  },
  {
    name: "Presentation",
    description: "Demo quality and communication",
    maxScore: 10,
    weight: 0.15,
  },
];

function calculateFinalScore(
  scores: JudgeScore[],
  criteria: JudgingCriterion[],
): number {
  const avgScores = criteria.map((c) => {
    const criterionScores = scores.flatMap((s) =>
      s.scores
        .filter((sc) => sc.criterionName === c.name)
        .map((sc) => sc.score),
    );
    const avg =
      criterionScores.reduce((a, b) => a + b, 0) / criterionScores.length;
    return avg * c.weight;
  });

  return avgScores.reduce((a, b) => a + b, 0);
}
```

### One-Click Dev Sandbox

```typescript
// packages/sandbox-core/src/provisioner.ts

interface HackathonSandbox {
  teamId: string;
  eventId: string;
  environment: {
    runtime: "node" | "python" | "go" | "rust" | "multi";
    preInstalledTools: string[];
    gitRepo: string; // Pre-created GitHub repo
    devServerUrl: string; // Live preview URL
    databaseUrl: string; // Shared team DB
    apiKeys: Record<string, string>; // Sponsor-provided API keys
  };
  resources: {
    cpuCores: number;
    memoryMB: number;
    storageMB: number;
    gpuEnabled: boolean;
  };
  expiresAt: Date; // Auto-cleanup after event
}

async function provisionTeamSandbox(
  teamId: string,
  event: HackathonEvent,
): Promise<HackathonSandbox> {
  // 1. Create E2B sandbox with team's preferred runtime
  const sandbox = await e2b.createSandbox({
    template: `hackathon-${event.id}`,
    timeout: event.timeline.hackingEnd.getTime() - Date.now(),
  });

  // 2. Create GitHub repo from template
  const repo = await createTeamRepo(teamId, event.slug);

  // 3. Inject sponsor API keys
  const apiKeys = await getSponsorAPIKeys(event.id);

  // 4. Start dev server with live preview
  const devUrl = await startDevServer(sandbox.id);

  return {
    teamId,
    eventId: event.id,
    environment: {
      runtime: "multi",
      preInstalledTools: ["node", "python", "docker", "git"],
      gitRepo: repo.url,
      devServerUrl: devUrl,
      databaseUrl: sandbox.databaseUrl,
      apiKeys,
    },
    resources: {
      cpuCores: 2,
      memoryMB: 4096,
      storageMB: 10240,
      gpuEnabled: false,
    },
    expiresAt: event.timeline.hackingEnd,
  };
}
```

## Data Stack

- **PostgreSQL** — Events, teams, submissions, scores
- **Redis** — Real-time leaderboards, activity feeds, WebSocket pub/sub
- **S3/R2** — Submission assets (screenshots, videos, slides)
- **E2B** — Sandboxed development environments
- **ClickHouse** — Event analytics, engagement metrics

## Compliance Standards

| Standard  | Requirements                                   |
| --------- | ---------------------------------------------- |
| **SOC2**  | Data isolation between events, access controls |
| **GDPR**  | Participant data rights, consent management    |
| **COPPA** | Age verification for minor participants        |

## Getting Started

```bash
npx coding-engine init --domain hackathon --name "HackPlatform" --compliance "SOC2,GDPR"
```

## Health & Readiness Endpoints

Every service MUST expose structured health check endpoints:

| Endpoint              | Purpose         | Response                                                                                   |
| --------------------- | --------------- | ------------------------------------------------------------------------------------------ |
| `GET /health`         | Liveness probe  | `{ "status": "ok", "service": "<name>", "version": "<semver>", "timestamp": "<ISO>" }`     |
| `GET /health/ready`   | Readiness probe | `{ "status": "ready", "dependencies": { "database": "connected", "cache": "connected" } }` |
| `GET /health/startup` | Startup probe   | `{ "status": "started", "uptime_seconds": 42 }`                                            |

### Implementation Pattern

```typescript
app.get("/health", (c) => {
  return c.json({
    status: "ok",
    service: config.serviceName,
    version: config.version,
    timestamp: new Date().toISOString(),
  });
});

app.get("/health/ready", async (c) => {
  const db = await checkDatabase();
  const cache = await checkCache();
  const status = db && cache ? "ready" : "degraded";
  return c.json(
    {
      status,
      dependencies: {
        database: db ? "connected" : "disconnected",
        cache: cache ? "connected" : "disconnected",
      },
    },
    status === "ready" ? 200 : 503,
  );
});
```

Health checks are consumed by:

- **Kubernetes**: liveness/readiness/startup probes
- **AWS ECS**: container health checks
- **Load balancers**: target group health checks
- **Monitoring**: uptime dashboards and alerting

## Failure Fingerprinting & Incident Response

All errors produce structured, machine-readable JSON with fingerprints for deduplication:

### Error Schema

```typescript
interface StructuredError {
  fingerprint: string; // SHA-256 hash for deduplication
  severity: "critical" | "high" | "medium" | "low";
  service: string;
  environment: string;
  message: string;
  stack_trace: string;
  timestamp: string;
  request_id: string;
  trace_id: string;
  context: Record<string, unknown>;
  cause_chain: string[];
}
```

### Fingerprint Generation

```typescript
import { createHash } from "crypto";

function generateFingerprint(error: Error, service: string): string {
  const normalized = `${service}:${error.constructor.name}:${error.message.replace(/[0-9a-f-]{36}/g, "<UUID>")}`;
  return createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}
```

### Incident Response Pipeline

1. **Detection**: Error captured by structured logger → fingerprinted
2. **Deduplication**: Same fingerprint within 24h window → increment counter (no duplicate alerts)
3. **Escalation**: 3+ occurrences of same fingerprint → escalate to `critical` severity
4. **Fix PR**: Auto-generated fix branch `fix/<service>/<fingerprint>` with context bundle
5. **Verification**: CI validates fix → auto-merge if tests pass
6. **Resolution**: Fingerprint marked resolved, added to known-issues registry

## Anti-Pattern Prevention & Memory

### Never Repeat Mistakes

Every session MUST check `MEMORY.md` before starting work. Known anti-patterns are engineering defects if repeated:

```bash
# Session start — mandatory
cat .claude/memory/MEMORY.md 2>/dev/null || echo "No memory file — create one"
```

### Known Anti-Patterns Registry

| Anti-Pattern                | Prevention                                      | Detection                                       |
| --------------------------- | ----------------------------------------------- | ----------------------------------------------- |
| Mock data in production     | Zero Mock Data policy — all data from real APIs | `grep -r "mockData\|MOCK_\|fakeName" src/`      |
| Hardcoded secrets           | Environment variables + secret manager          | `grep -r "sk_live\|password.*=.*['\"]" src/`    |
| Missing health endpoints    | Health check middleware on every service        | CI check: every service has `/health` route     |
| Orphan files after refactor | Delete old files in same commit as new          | `codemap refs` — unreferenced files = orphans   |
| Duplicate implementations   | One canonical implementation per feature        | `codemap where <symbol>` — multiple = duplicate |
| Cascading workflow triggers | Max depth 2 for workflow chains                 | Audit `workflow_run` triggers quarterly         |

### Memory File Template

```markdown
# MEMORY.md — Project Memory

## Resolved Issues

<!-- Each resolved issue with root cause and fix -->

## Known Anti-Patterns

<!-- Patterns that caused incidents — NEVER repeat -->

## Architectural Decisions

<!-- Key decisions with rationale (link to ADRs) -->

## Lessons Learned

<!-- Session-by-session learnings -->
```

### Incident Documentation

Every production incident generates a document:

```
docs/incidents/
├── YYYY-MM-DD-<short-description>.md
└── INCIDENT_TEMPLATE.md
```

Each incident includes: root cause analysis, fix applied, prevention steps, fingerprint for future detection.
