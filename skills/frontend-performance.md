# Frontend Performance

> Core Web Vitals optimization, code splitting, lazy loading, bundle analysis, and SSR/SSG strategies.

## Core Principles

1. **Measure First** — Profile before optimizing. Use Lighthouse, Web Vitals, and bundle analyzers.
2. **Ship Less JavaScript** — Every KB of JS costs ~1ms parse time on mobile. Code-split aggressively.
3. **Prioritize Above-the-Fold** — Load critical content first; defer everything else.

## Patterns

### Pattern 1: Route-Based Code Splitting

```typescript
import { lazy, Suspense } from "react";
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Settings = lazy(() => import("./pages/Settings"));

function App() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </Suspense>
  );
}
```

### Pattern 2: Image Optimization

```typescript
import Image from "next/image";
function HeroImage() {
  return <Image src="/hero.jpg" alt="Hero" width={1200} height={600} priority sizes="(max-width: 768px) 100vw, 1200px" />;
}
```

### Pattern 3: Bundle Analysis

```typescript
// next.config.js
const withBundleAnalyzer = require("@next/bundle-analyzer")({ enabled: process.env.ANALYZE === "true" });
module.exports = withBundleAnalyzer({ /* config */ });
// Run: ANALYZE=true next build
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Better Approach |
|-------------|-------------|-----------------|
| Importing entire libraries | Bloats bundle (lodash = 72KB) | Import specific functions or use tree-shaking |
| No image optimization | Largest Contentful Paint suffers | Use next/image or CDN transforms |
| Client-side rendering everything | Slow FCP, poor SEO | SSR for initial load, hydrate interactivity |
| No performance budget | Bundle grows unchecked | Set max bundle size in CI |

## Implementation Checklist

- [ ] Set up Core Web Vitals monitoring (LCP, FID, CLS)
- [ ] Implement route-based code splitting with lazy loading
- [ ] Optimize images with next/image or CDN transforms
- [ ] Run bundle analyzer and set performance budgets in CI
- [ ] Configure SSR/SSG strategy per route based on data freshness needs

## References

- [Web Vitals (Google)](https://web.dev/vitals/)
- [Next.js Performance](https://nextjs.org/docs/advanced-features/measuring-performance)
- [Lighthouse Documentation](https://developer.chrome.com/docs/lighthouse/)
