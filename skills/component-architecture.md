# Component Architecture

> Atomic design, compound components, render props, hooks patterns, and accessibility-first development.

## Core Principles

1. **Composition Over Inheritance** — Build complex UIs by composing small, focused components.
2. **Single Responsibility** — One component = one visual/behavioral responsibility.
3. **Accessibility First** — Every component meets WCAG 2.1 AA. Use semantic HTML and ARIA attributes.

## Patterns

### Pattern 1: Compound Component

```typescript
function Select({ children, value, onChange }: SelectProps) {
  return <SelectContext.Provider value={{ value, onChange }}>{children}</SelectContext.Provider>;
}
Select.Trigger = function Trigger({ children }: { children: React.ReactNode }) {
  const { value } = useSelectContext();
  return <button role="combobox" aria-expanded={false}>{children ?? value}</button>;
};
Select.Option = function Option({ value, children }: OptionProps) {
  const { onChange } = useSelectContext();
  return <li role="option" onClick={() => onChange(value)}>{children}</li>;
};
```

### Pattern 2: Polymorphic Component

```typescript
type ButtonProps<T extends React.ElementType = "button"> = { as?: T; variant: "primary" | "secondary" } & React.ComponentPropsWithoutRef<T>;

function Button<T extends React.ElementType = "button">({ as, variant, ...props }: ButtonProps<T>) {
  const Component = as || "button";
  return <Component className={`btn btn-${variant}`} {...props} />;
}
// Usage: <Button as="a" href="/link" variant="primary">Click</Button>
```

### Pattern 3: Custom Hook Extraction

```typescript
function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => { const timer = setTimeout(() => setDebounced(value), delay); return () => clearTimeout(timer); }, [value, delay]);
  return debounced;
}

function SearchInput() {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 300);
  useEffect(() => { if (debouncedQuery) search(debouncedQuery); }, [debouncedQuery]);
  return <input value={query} onChange={e => setQuery(e.target.value)} />;
}
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Better Approach |
|-------------|-------------|-----------------|
| God components (500+ lines) | Unmaintainable, untestable | Break into composed sub-components |
| Prop drilling 5+ levels | Fragile, verbose | Context or state management library |
| div soup without semantics | Screen readers cant navigate | Use semantic HTML (nav, main, section) |
| Inline styles for theming | Inconsistent, no dark mode | CSS variables or design tokens |

## Implementation Checklist

- [ ] Establish component taxonomy (atoms, molecules, organisms, templates)
- [ ] Build compound components for complex interactive elements
- [ ] Extract reusable hooks for shared behavior
- [ ] Add ARIA attributes and keyboard navigation to all interactive components
- [ ] Create Storybook stories for visual documentation and testing

## References

- [Atomic Design (Brad Frost)](https://atomicdesign.bradfrost.com/)
- [React Patterns](https://reactpatterns.com/)
- [WAI-ARIA Practices](https://www.w3.org/WAI/ARIA/apg/)
