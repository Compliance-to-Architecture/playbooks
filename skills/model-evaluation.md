# Model Evaluation

> Evals, benchmarks, accuracy metrics, bias detection, and regression testing for ML models.

## Core Principles

1. **Eval Before Deploy** — No model reaches production without passing evaluation benchmarks.
2. **Multi-Dimensional Metrics** — Accuracy alone is insufficient; measure fairness, latency, cost, and robustness.
3. **Regression Testing** — Every model update must match or exceed the previous version on a golden test set.

## Patterns

### Pattern 1: Evaluation Pipeline

```typescript
interface EvalResult { model_id: string; dataset: string; metrics: Record<string, number>; passed: boolean; timestamp: string }

async function evaluateModel(modelId: string, testSet: TestCase[]): Promise<EvalResult> {
  const predictions = await Promise.all(testSet.map(tc => model.predict(tc.input)));
  const accuracy = predictions.filter((p, i) => p === testSet[i].expected).length / testSet.length;
  const latencyP95 = percentile(predictions.map(p => p.latency_ms), 95);
  return { model_id: modelId, dataset: "golden-set", metrics: { accuracy, latency_p95: latencyP95 }, passed: accuracy >= 0.95, timestamp: new Date().toISOString() };
}
```

### Pattern 2: Bias Detection

```typescript
async function detectBias(modelId: string, protectedAttribute: string, testSet: TestCase[]): Promise<{ attribute: string; disparate_impact: number; flagged: boolean }> {
  const groups = groupBy(testSet, tc => tc.metadata[protectedAttribute]);
  const rates = Object.entries(groups).map(([group, cases]) => ({ group, rate: cases.filter(c => c.prediction === "positive").length / cases.length }));
  const minRate = Math.min(...rates.map(r => r.rate));
  const maxRate = Math.max(...rates.map(r => r.rate));
  return { attribute: protectedAttribute, disparate_impact: minRate / maxRate, flagged: minRate / maxRate < 0.8 };
}
```

### Pattern 3: A/B Model Comparison

```typescript
async function compareModels(modelA: string, modelB: string, testSet: TestCase[]): Promise<{ winner: string; improvement: number }> {
  const [resultsA, resultsB] = await Promise.all([evaluateModel(modelA, testSet), evaluateModel(modelB, testSet)]);
  const winner = resultsB.metrics.accuracy > resultsA.metrics.accuracy ? modelB : modelA;
  return { winner, improvement: Math.abs(resultsB.metrics.accuracy - resultsA.metrics.accuracy) };
}
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Better Approach |
|-------------|-------------|-----------------|
| Evaluating only on training data | Overfitting goes undetected | Use held-out test and validation sets |
| Single metric evaluation | Misses fairness and latency issues | Multi-dimensional evaluation dashboard |
| No golden test set | Cant detect regressions | Maintain curated, versioned test sets |
| Manual evaluation only | Not scalable, inconsistent | Automated eval pipeline in CI/CD |

## Implementation Checklist

- [ ] Create golden test set with versioning and coverage tracking
- [ ] Build automated evaluation pipeline (accuracy, latency, cost)
- [ ] Implement bias detection for protected attributes
- [ ] Set up regression gates in CI/CD (new model must beat current)
- [ ] Build evaluation dashboard with historical trend tracking

## References

- [ML Model Evaluation Guide](https://scikit-learn.org/stable/modules/model_evaluation.html)
- [Responsible AI Practices](https://ai.google/responsibilities/responsible-ai-practices/)
- [MLflow Model Evaluation](https://mlflow.org/docs/latest/model-evaluation/)
