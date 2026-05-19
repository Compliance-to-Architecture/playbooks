# Education Technology & Learning Management Platform — Code Engine Example

> Built with the Coding Engine. Full-stack LMS with course management, assessments, certifications, and learning analytics.

## What This Builds

A FERPA-compliant education technology and learning management platform with:

- Course creation with rich content authoring (video, docs, quizzes)
- Assessment engine with auto-grading, rubrics, and plagiarism detection
- Certification and credential management with digital badges
- Student portal with progress tracking and personalized learning paths
- Instructor dashboard with grade book and engagement analytics
- Virtual classroom with live sessions and recording management
- Learning analytics with completion rates, competency mapping, and at-risk detection
- Content marketplace for course sharing and licensing

## Architecture

```
apps/
├── student-portal/          # Student-facing learning experience (Next.js)
├── instructor-portal/       # Course authoring and grade management
├── admin-portal/            # School/institution admin dashboard
├── content-marketplace/     # Course marketplace and licensing
├── parent-portal/           # Parent/guardian access (K-12)
├── billing-dashboard/       # Subscription billing (universal)

packages/
├── course-core/             # Course structure, modules, lessons
├── content-core/            # Rich content: video, docs, SCORM
├── assessment-core/         # Quizzes, exams, rubrics, auto-grading
├── certification-core/      # Certificates, badges, credentials
├── enrollment-core/         # Student enrollment and cohorts
├── gradebook-core/          # Grade management and GPA calculation
├── learning-path-core/      # Personalized learning sequences
├── analytics-core/          # Learning analytics and reporting
├── virtual-classroom-core/  # Live sessions, recordings
├── plagiarism-core/         # Plagiarism detection engine
├── accessibility-core/      # WCAG compliance engine
├── auth-core/               # Authentication (universal)
├── billing-core/            # Stripe billing (universal)
├── tenant-core/             # Multi-tenancy (universal)
├── audit-core/              # Audit trail (universal)

services/
├── course-api/              # Course management service (Hono)
├── assessment-api/          # Assessment and grading service
├── enrollment-api/          # Student enrollment service
├── analytics-api/           # Learning analytics service
├── content-api/             # Content delivery and streaming
├── certification-api/       # Credential issuance service
```

## Compliance Standards

| Standard        | Requirements                                                   |
| --------------- | -------------------------------------------------------------- |
| **FERPA**       | Student record privacy, directory information, parental access |
| **COPPA**       | Children under 13 protections, parental consent                |
| **WCAG 2.1 AA** | Web Content Accessibility Guidelines, screen reader support    |
| **Section 508** | Federal accessibility requirements for educational tools       |
| **SOC2**        | Security controls, access logging, incident response           |
| **GDPR**        | Student data protection (EU institutions)                      |
| **SCORM/xAPI**  | E-learning content interoperability standards                  |

## Multi-Tenancy

Each tenant represents a school, university, or training organization:

- **Database isolation**: Row-level security with `tenant_id` on every table
- **Tenant routing**: Subdomain (`harvard.lmscloud.com`), custom domain, or JWT claim
- **Curriculum scope**: Courses, assessments, and grading scales are tenant-scoped
- **Branding**: Each tenant has custom logo, colors, and domain
- **Compliance config**: FERPA for US schools, GDPR for EU institutions, COPPA for K-12

```typescript
// packages/tenant-core/src/middleware.ts
async function resolveTenant(c: Context): Promise<TenantContext> {
  const tenantId =
    extractFromCustomDomain(c.req.url) ||
    extractFromSubdomain(c.req.url) ||
    c.req.header("X-Tenant-ID") ||
    extractFromJWT(c);

  assert(tenantId !== undefined, "Tenant resolution failed");

  const tenant = await getTenantConfig(tenantId);
  assert(tenant.status === "active", `Tenant ${tenantId} is not active`);

  return {
    tenantId,
    institutionType: tenant.institutionType,
    gradingScale: tenant.gradingScale,
    academicCalendar: tenant.academicCalendar,
    complianceRegime: tenant.complianceRegime,
  };
}
```

## Tech Stack

| Layer         | Technology           | Purpose                                |
| ------------- | -------------------- | -------------------------------------- |
| **Frontend**  | Next.js 15           | Student and instructor portals         |
| **UI**        | Sera UI              | Component library                      |
| **API**       | Hono                 | REST + RPC API services                |
| **Database**  | PostgreSQL 16        | Courses, enrollments, grades           |
| **Cache**     | Redis 7              | Session, rate limiting, progress cache |
| **Search**    | Meilisearch          | Course and content search              |
| **Analytics** | ClickHouse           | Learning analytics, engagement data    |
| **Video**     | Cloudflare Stream    | Video hosting and adaptive streaming   |
| **Storage**   | Cloudflare R2        | Course content and document storage    |
| **Auth**      | Clerk + Cerbos       | RBAC: student, instructor, admin       |
| **Billing**   | Stripe               | Subscription + per-student pricing     |
| **Infra**     | AWS ECS + Cloudflare | Compute + edge content delivery        |

## Observability

| Dimension      | Tool / Pattern             | Details                                         |
| -------------- | -------------------------- | ----------------------------------------------- |
| **Logging**    | Structured JSON (pino)     | Every enrollment, submission, grade change      |
| **Tracing**    | OpenTelemetry + Axiom      | Distributed traces across content pipeline      |
| **Metrics**    | Prometheus + Grafana       | Completion rate, assessment scores, engagement  |
| **Alerting**   | Grafana Alerts + PagerDuty | Content delivery failures, grading errors       |
| **Audit**      | Immutable audit log        | FERPA: who accessed student records, when, why  |
| **Dashboards** | Grafana                    | Student progress, course health, at-risk alerts |

```typescript
// Structured log for student assessment submission
logger.info({
  service: "assessment-api",
  event: "assessment_submitted",
  tenant_id: ctx.tenantId,
  course_id: submission.courseId,
  assessment_id: submission.assessmentId,
  student_id: submission.studentId,
  score: submission.autoGradedScore,
  max_score: submission.maxScore,
  attempt_number: submission.attemptNumber,
  request_id: ctx.requestId,
  trace_id: ctx.traceId,
});
```

## Health & Readiness Endpoints

Every service exposes structured health checks:

```typescript
// services/course-api/src/routes/health.ts
app.get("/health", async (c) => {
  const checks = {
    status: "healthy",
    service: "course-api",
    version: process.env.APP_VERSION,
    uptime_seconds: process.uptime(),
    checks: {
      database: await checkPostgres(),
      cache: await checkRedis(),
      search: await checkMeilisearch(),
      video_streaming: await checkCloudflareStream(),
    },
    timestamp: new Date().toISOString(),
  };

  const isHealthy = Object.values(checks.checks).every(
    (check) => check.status === "ok",
  );

  return c.json(checks, isHealthy ? 200 : 503);
});

app.get("/ready", async (c) => {
  const ready = (await checkPostgres()).status === "ok";
  return c.json({ ready }, ready ? 200 : 503);
});
```

## Failure Fingerprinting & Incident Response

All errors produce structured, fingerprinted JSON for automated triage:

```typescript
interface EdTechFailureEvent {
  fingerprint: string; // SHA256 of service + error_code + stack_signature
  service: "course-api" | "assessment-api" | "enrollment-api" | "content-api";
  severity: "critical" | "high" | "medium" | "low";
  error_code: string; // e.g., "GRADING_ENGINE_FAILED", "VIDEO_TRANSCODE_TIMEOUT", "SCORM_PARSE_ERROR"
  tenant_id: string;
  message: string;
  stack_trace: string;
  context: {
    course_id?: string;
    student_id?: string;
    assessment_id?: string;
    content_id?: string;
  };
  timestamp: string;
}

// Fingerprint generation
function fingerprint(error: EdTechFailureEvent): string {
  const signature = `${error.service}:${error.error_code}:${stackSignature(error.stack_trace)}`;
  return crypto
    .createHash("sha256")
    .update(signature)
    .digest("hex")
    .slice(0, 16);
}
```

**Incident pipeline**: Error detected -> fingerprinted -> deduplicated -> triage (auto or human) -> fix PR -> CI validates -> deploy -> verify -> close.

## Anti-Pattern Prevention & Memory

### Known Anti-Patterns

| Anti-Pattern                            | Prevention                                               |
| --------------------------------------- | -------------------------------------------------------- |
| Exposing student PII in API responses   | FERPA response filter strips PII unless authorized       |
| Assessment answers in client-side code  | Answer keys server-side only, never sent to client       |
| Unbounded video upload size             | Max 2GB per video, validated at upload and content-api   |
| Grade changes without audit trail       | Every grade mutation logged with before/after and reason |
| COPPA violation for under-13 accounts   | Age gate at registration, parental consent flow required |
| Inaccessible content (missing alt text) | WCAG lint on content publish, blocks if alt text missing |

### MEMORY.md Template

```markdown
## EdTech LMS Lessons Learned

### Incident: Student Grades Visible to Other Students (2025-06-10)

- **Root cause**: Grade API endpoint missing student-scoped Cerbos check
- **Fix**: Added Cerbos policy check: students can only view own grades
- **Prevention**: FERPA compliance test suite covers all grade endpoints

### Incident: SCORM Package Failed to Load After Upload (2025-08-15)

- **Root cause**: SCORM manifest parser choked on non-UTF8 encoding
- **Fix**: Encoding detection and conversion before parsing
- **Prevention**: SCORM import includes encoding normalization step
```

## Billing & Monetization

| Tier             | Price          | Features                                              |
| ---------------- | -------------- | ----------------------------------------------------- |
| **Starter**      | $3/student/mo  | 500 students, 20 courses, basic assessments           |
| **Professional** | $6/student/mo  | 5,000 students, unlimited courses, certifications     |
| **Enterprise**   | $10/student/mo | Unlimited students, virtual classroom, API, analytics |
| **Platform**     | Custom         | White-label, LTI integration, dedicated infra, SLA    |

### Usage Metering

```typescript
// Metered dimensions
const meters = {
  active_students: "gauge", // Students with activity in billing period
  courses_published: "gauge", // Active published courses
  assessments_graded: "count", // Auto-graded assessments
  video_streaming_minutes: "count", // Video content streamed
  certificates_issued: "count", // Certificates generated
  api_calls: "count", // External API calls
  storage_gb: "gauge", // Content storage
};
```

### Billing Events

- `subscription.created` — New institution onboarded
- `usage.student_enrolled` — Student enrolled in course (metered)
- `usage.certificate_issued` — Certificate generated (metered overage)
- `usage.video_streamed` — Video minutes consumed (metered overage)
- `subscription.upgraded` — Tier upgrade (student limit increase)

## Getting Started

```bash
# 1. Initialize with coding engine
npx coding-engine init --domain edtech-lms --name "LearnCloud" \
  --compliance "FERPA,COPPA,WCAG,SOC2"

# 2. Create domain packages
pnpm create @code-engine/package course-core
pnpm create @code-engine/package assessment-core
pnpm create @code-engine/package certification-core
pnpm create @code-engine/package enrollment-core
pnpm create @code-engine/package learning-path-core

# 3. Start development
pnpm dev

# 4. Run compliance checks
pnpm test:compliance -- --standard ferpa,wcag
```
