# Healthcare FHIR

> HL7 FHIR R4 resource modeling, SMART on FHIR authorization, CDS Hooks clinical decision support, and interoperable healthcare data exchange.

## Core Principles

1. **Resource-Centric Data Model** — All clinical data is modeled as FHIR resources (Patient, Observation, Condition, MedicationRequest) with standardized JSON representations, enabling interoperability across any FHIR-compliant system without custom mappings.
2. **SMART on FHIR Authorization** — Applications access clinical data through the SMART App Launch framework, which layers OAuth 2.0 scopes mapped to FHIR resources and operations (e.g., `patient/Observation.read`) for granular, patient-consented access control.
3. **Clinical Decision Support Integration** — CDS Hooks provide real-time clinical guidance by triggering decision support services at key workflow events (patient-view, order-select, order-sign) without disrupting clinician workflow.

## Patterns

### Pattern 1: FHIR Resource CRUD with Validation

Create, read, update, and search FHIR resources with schema validation against the R4 specification before persistence and on retrieval.

```typescript
interface FHIRResource {
  resourceType: string;
  id?: string;
  meta?: { versionId: string; lastUpdated: string };
  [key: string]: unknown;
}

class FHIRRepository {
  async create(resource: FHIRResource): Promise<FHIRResource> {
    validateResource(resource);
    const id = crypto.randomUUID();
    const versioned = {
      ...resource,
      id,
      meta: { versionId: "1", lastUpdated: new Date().toISOString() },
    };
    await db.fhirResources.create({
      data: { id, resourceType: resource.resourceType, content: versioned },
    });
    return versioned;
  }

  async search(resourceType: string, params: URLSearchParams): Promise<FHIRBundle> {
    const entries = await db.fhirResources.findMany({
      where: { resourceType, ...buildSearchQuery(params) },
      take: Math.min(Number(params.get("_count") ?? 20), 100),
    });
    return { resourceType: "Bundle", type: "searchset", total: entries.length, entry: entries };
  }
}
```

### Pattern 2: SMART on FHIR App Launch

Implement the SMART App Launch flow to obtain scoped access tokens that grant applications fine-grained permissions to specific FHIR resources for a specific patient context.

```typescript
interface SMARTLaunchContext {
  patient: string;
  encounter?: string;
  fhirServer: string;
  scopes: string[];
}

async function handleSMARTCallback(
  code: string,
  state: string,
): Promise<SMARTLaunchContext & { accessToken: string }> {
  const session = await sessionStore.get(state);
  const tokenResponse = await fetch(session.tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: session.redirectUri,
      client_id: session.clientId,
    }),
  });
  const tokens = await tokenResponse.json();
  return {
    patient: tokens.patient,
    encounter: tokens.encounter,
    fhirServer: session.fhirServer,
    scopes: tokens.scope.split(" "),
    accessToken: tokens.access_token,
  };
}
```

### Pattern 3: CDS Hooks Service

Expose a CDS Hooks service that responds to clinical workflow events with actionable suggestion cards for clinical decision support.

```typescript
interface CDSRequest {
  hook: string;
  hookInstance: string;
  context: { patientId: string; medications?: FHIRResource[] };
  prefetch?: Record<string, FHIRResource>;
}

interface CDSCard {
  summary: string;
  detail: string;
  indicator: "info" | "warning" | "critical";
  source: { label: string; url: string };
  suggestions?: { label: string; actions: unknown[] }[];
}

app.post("/cds-services/drug-interaction-check", async (req, res) => {
  const request: CDSRequest = req.body;
  const medications = request.context.medications ?? [];
  const interactions = await checkDrugInteractions(medications);
  const cards: CDSCard[] = interactions.map((ix) => ({
    summary: `Drug interaction: ${ix.drugA} + ${ix.drugB}`,
    detail: ix.description,
    indicator: ix.severity === "high" ? "critical" : "warning",
    source: { label: "Drug Interaction DB", url: "https://example.com/interactions" },
  }));
  res.json({ cards });
});
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Better Approach |
|-------------|-------------|-----------------|
| Custom data models instead of FHIR resources | Breaks interoperability; every integration requires custom mapping code | Use standard FHIR R4 resource types with extensions for custom fields |
| Broad OAuth scopes (e.g., `user/*.*`) | Violates principle of least privilege; exposes all patient data to every app | Use granular SMART scopes: `patient/Observation.read`, `patient/MedicationRequest.write` |
| Synchronous CDS Hook calls without timeouts | Slow decision support services block clinician workflow and EHR responsiveness | Enforce strict timeouts (500ms); return empty cards on timeout; cache frequent checks |
| Storing PHI without encryption or access logging | HIPAA violations with severe penalties; no audit trail for breach investigation | Encrypt PHI at rest (AES-256), in transit (TLS 1.3); log all access with user context |

## Implementation Checklist

- [ ] FHIR R4 resource validation enforced on create, update, and search responses
- [ ] SMART on FHIR App Launch flow implemented with granular resource-level scopes
- [ ] CDS Hooks endpoint registered with 500ms timeout and graceful fallback on failure
- [ ] PHI encrypted at rest and in transit with access logging for HIPAA audit trail
- [ ] FHIR search parameters support _include, _revinclude, and chained references

## References

- [HL7 FHIR R4 Specification](https://hl7.org/fhir/R4/)
- [SMART App Launch Implementation Guide](https://hl7.org/fhir/smart-app-launch/)
- [CDS Hooks Specification](https://cds-hooks.org/)
