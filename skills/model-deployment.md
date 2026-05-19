# Model Deployment

> Patterns for serving ML models in production with versioning, A/B testing, GPU inference, and request batching.

## Core Principles

1. **Immutable Artifacts** — Every model version is a versioned, immutable artifact in a registry. Rollbacks are instant because previous versions remain deployed and routable.
2. **Traffic-Shaped Releases** — Never switch 100% traffic to a new model at once. Use canary deployments and A/B splits to validate performance on real traffic before full promotion.
3. **Batch for Throughput, Stream for Latency** — GPU inference is most efficient when requests are batched. Design your serving layer to dynamically batch incoming requests while respecting latency SLAs.

## Patterns

### Pattern 1: Model Registry with Semantic Versioning

Track every model artifact with metadata, metrics, and lineage so any version can be deployed or rolled back deterministically.

```typescript
interface ModelArtifact {
  model_id: string;
  version: string; // semver: major.minor.patch
  framework: "onnx" | "torchscript" | "tensorrt";
  uri: string; // s3://models/sentiment/v2.1.0/model.onnx
  metrics: { accuracy: number; latency_p99_ms: number };
  created_at: string;
}

async function registerModel(artifact: ModelArtifact): Promise<void> {
  assert(artifact.version.match(/^\d+\.\d+\.\d+$/), "Version must be semver");
  assert(artifact.metrics.accuracy > 0, "Metrics required before registration");
  await modelStore.put(artifact.model_id, artifact.version, artifact);
  await notifyDeployPipeline(artifact);
}
```

### Pattern 2: A/B Traffic Splitting

Route a percentage of inference requests to a challenger model while the champion serves the remainder, collecting comparison metrics.

```typescript
interface TrafficSplit {
  champion: { model_version: string; weight: number };
  challenger: { model_version: string; weight: number };
}

function routeRequest(split: TrafficSplit, request_id: string): string {
  const hash = fnv1a(request_id);
  const bucket = (hash % 100) + 1;
  const chosen =
    bucket <= split.champion.weight
      ? split.champion.model_version
      : split.challenger.model_version;
  metrics.increment("inference.routed", { version: chosen });
  return chosen;
}
```

### Pattern 3: Dynamic Request Batching

Accumulate incoming requests into micro-batches to maximize GPU utilization, flushing on batch size or timeout.

```typescript
class InferenceBatcher {
  private queue: InferenceRequest[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly max_batch = 32;
  private readonly flush_ms = 10;

  enqueue(req: InferenceRequest): Promise<InferenceResult> {
    return new Promise((resolve) => {
      this.queue.push({ ...req, resolve });
      if (this.queue.length >= this.max_batch) {
        this.flush();
      } else if (!this.timer) {
        this.timer = setTimeout(() => this.flush(), this.flush_ms);
      }
    });
  }

  private async flush(): Promise<void> {
    const batch = this.queue.splice(0, this.max_batch);
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    const results = await gpuInfer(batch.map((b) => b.input));
    batch.forEach((req, i) => req.resolve(results[i]));
  }
}
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Better Approach |
|---|---|---|
| Deploying models by copying files to servers | No versioning, no rollback, no audit trail | Use a model registry with immutable artifacts and version tags |
| Switching 100% traffic to a new model instantly | Undetected regressions hit all users at once | Canary deploy with 5-10% traffic, monitor, then promote |
| One request per GPU inference call | Massive GPU underutilization and high cost | Dynamic batching with configurable batch size and flush timeout |
| Hardcoding model paths in application code | Tight coupling prevents independent model updates | Resolve model URIs from registry at startup or via feature flags |

## Implementation Checklist

- [ ] Model registry stores artifacts with semver, metrics, and lineage metadata
- [ ] Deployment pipeline supports canary and A/B traffic splits with metric gates
- [ ] Inference server implements dynamic batching with configurable size and timeout
- [ ] Health checks verify model loading, GPU availability, and inference latency
- [ ] Rollback procedure tested: previous version promoted within 60 seconds

## References

- [MLflow Model Registry](https://mlflow.org/docs/latest/model-registry.html)
- [NVIDIA Triton Inference Server](https://developer.nvidia.com/triton-inference-server)
- [Seldon Core Serving](https://docs.seldon.io/projects/seldon-core/en/latest/)
