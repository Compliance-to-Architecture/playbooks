# UX/UI Design System Skill

**Type:** guardrail
**Enforcement:** suggest
**Source:** Adapted from [plugin87/ux-ui-agent-skills](https://github.com/plugin87/ux-ui-agent-skills)

---

## Purpose

Transform the coding agent into a Senior Design Architect for frontend app auditing, component design, accessibility compliance, and design-to-code consistency.

---

## Decision Framework (Priority Order)

1. **User Needs** — Does this serve the user's goal?
2. **Accessibility** — WCAG 2.2 AA minimum (POUR principles)
3. **Consistency** — Follows Sera UI design tokens and patterns
4. **Aesthetics** — Visually balanced and intentional
5. **Developer Experience** — Implementable, maintainable, composable

---

## Design System: Sera UI

All IOF frontend apps MUST use [Sera UI](https://github.com/seraui/seraui) components.

Install components via:

```bash
npx shadcn@latest add "https://seraui.com/registry/<component>.json"
```

### Token Architecture (3-Tier)

```
Component Tokens   button-bg-primary ──> Semantic Tokens   action.primary ──> Primitive Tokens   blue.600
(use in code)                            (use in design)                      (raw palette)
```

- **Primitive** — Raw color/size values (never referenced directly in components)
- **Semantic** — Purpose-based aliases (`action.primary`, `text.secondary`, `surface.card`)
- **Component** — Scoped to specific components (`button.primary-bg`, `input.border-focus`)

---

## Frontend App Audit Checklist

When auditing IOF frontend apps, check each dimension:

### 1. Component Consistency (20%)

- [ ] All interactive elements use Sera UI components
- [ ] No custom implementations of standard components (Button, Input, Card, Dialog)
- [ ] Consistent use of design tokens (no hardcoded colors/sizes)
- [ ] Component variants used correctly (primary, secondary, ghost, destructive)

### 2. Accessibility (20%)

- [ ] All interactive elements keyboard-navigable (Tab, Enter, Space, Escape)
- [ ] Focus indicators visible (3:1 contrast ratio)
- [ ] Color contrast: 4.5:1 (text), 3:1 (UI components)
- [ ] Touch targets minimum 24x24px (WCAG 2.5.8)
- [ ] No color-only information conveyance
- [ ] ARIA roles and labels on dynamic content
- [ ] `alt` text on all images
- [ ] Form error messages explain what AND how to fix

### 3. Visual Hierarchy (20%)

- [ ] Clear heading hierarchy (h1 once per page, no skipped levels)
- [ ] Primary actions visually prominent
- [ ] Related items grouped with consistent spacing
- [ ] Empty states guide users to first action

### 4. Responsiveness (10%)

- [ ] Mobile-first breakpoint strategy
- [ ] No horizontal scroll on mobile
- [ ] Navigation adapts to screen size
- [ ] Data tables responsive (card view on mobile or horizontal scroll)

### 5. Performance (10%)

- [ ] Images use `next/image` with proper sizing
- [ ] Fonts use `next/font` (no FOUT)
- [ ] Client components minimized (Server Components by default)
- [ ] No unnecessary re-renders

### 6. Legal Pages (Required)

- [ ] `/legal/terms` — Terms of Service
- [ ] `/legal/privacy` — Privacy Policy
- [ ] `/legal/dpa` — Data Processing Agreement
- [ ] Legal pages use consistent styling

---

## Audit Scoring

| Dimension | Weight | Score |
|---|---|---|
| Component Consistency | 20% | ?/10 |
| Accessibility | 20% | ?/10 |
| Visual Hierarchy | 20% | ?/10 |
| Usability | 20% | ?/10 |
| Responsiveness | 10% | ?/10 |
| Performance | 10% | ?/10 |
| **Overall** | **100%** | **?/10** |

### Finding Severity

- **Critical** — Must fix before launch (accessibility blockers, broken interactions)
- **Major** — Fix this sprint (inconsistent components, missing states)
- **Minor** — Fix when convenient (spacing inconsistencies, minor alignment)
- **Enhancement** — Backlog (animation polish, micro-interactions)

---

## Component State Requirements

All interactive components MUST handle these states:

| # | State | Required | Token Pattern |
|---|---|---|---|
| 1 | Default | Always | Base tokens |
| 2 | Hover | Always | `-hover` suffix |
| 3 | Focus | Always | Focus ring (3:1 contrast) |
| 4 | Active/Pressed | Always | `-active` suffix |
| 5 | Disabled | Always | `opacity: 0.5` + no pointer events |
| 6 | Loading | If async | Spinner + `aria-busy` |
| 7 | Error | If input | Error border + error message |
| 8 | Selected | If selectable | Selected background |

---

## Typography Rules

- One font family for UI (Inter or system-ui)
- Heading hierarchy: h1 once per page, never skip levels
- Line length: 45-75 characters (65ch optimal)
- Font weight: Regular (400) body, Medium (500) labels, Semibold (600) headings

---

## Color Usage Rules

1. Never use color as the only indicator — pair with icon, text, or pattern
2. Feedback colors: success (green), warning (amber), error (red), info (blue)
3. Interactive elements use `action.primary` or `text.link`
4. Limit palette: 1 primary + 1 destructive + neutrals

---

## Dark Mode

- All apps must support dark mode via semantic token swapping
- Test both modes for every component state
- Implementation: CSS custom properties via `[data-theme="dark"]` or `prefers-color-scheme`

---

## IOF-Specific Requirements

1. **No mock data in UI** — All data from real APIs
2. **No tech references** — Never show "PostgreSQL", "Redis", "Meilisearch" to users
3. **Islamic Open Finance branding** — Trademark symbol on public-facing content
4. **Legal pages** — Built inside each app at `/legal/*` routes
5. **Sera UI only** — No custom component implementations for standard patterns
