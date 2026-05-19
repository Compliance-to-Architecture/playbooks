# State Management

> Zustand, Jotai, TanStack Query, server vs client state, optimistic updates, and cache synchronization.

## Core Principles

1. **Server State != Client State** — Use TanStack Query for server state (API data), Zustand/Jotai for client state (UI).
2. **Minimal Client State** — Derive what you can. Store only what the server doesnt own.
3. **Optimistic by Default** — Show the expected result immediately, reconcile when the server responds.

## Patterns

### Pattern 1: Server State with TanStack Query

```typescript
function useContracts(tenantId: string) {
  return useQuery({ queryKey: ["contracts", tenantId], queryFn: () => api.contracts.list(tenantId), staleTime: 30_000 });
}

function useCreateContract() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.contracts.create,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["contracts"] }),
  });
}
```

### Pattern 2: Client State with Zustand

```typescript
interface UIStore { sidebarOpen: boolean; theme: "light" | "dark"; toggleSidebar: () => void; setTheme: (t: "light" | "dark") => void }

const useUIStore = create<UIStore>((set) => ({
  sidebarOpen: true, theme: "light",
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setTheme: (theme) => set({ theme }),
}));
```

### Pattern 3: Optimistic Updates

```typescript
const useUpdateStatus = () => useMutation({
  mutationFn: api.contracts.updateStatus,
  onMutate: async (vars) => {
    await queryClient.cancelQueries({ queryKey: ["contracts", vars.id] });
    const previous = queryClient.getQueryData(["contracts", vars.id]);
    queryClient.setQueryData(["contracts", vars.id], (old: Contract) => ({ ...old, status: vars.status }));
    return { previous };
  },
  onError: (_err, vars, context) => queryClient.setQueryData(["contracts", vars.id], context?.previous),
  onSettled: (_d, _e, vars) => queryClient.invalidateQueries({ queryKey: ["contracts", vars.id] }),
});
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Better Approach |
|-------------|-------------|-----------------|
| Global state for everything | Unnecessary re-renders, complexity | Colocate state near where its used |
| Caching API data in Redux | Reinventing TanStack Query poorly | Use TanStack Query for server state |
| No loading/error states | Blank screens, confusing UX | Handle loading, error, empty states |
| Direct state mutation | Breaks reactivity | Always use immutable updates |

## Implementation Checklist

- [ ] Set up TanStack Query for all API data fetching
- [ ] Use Zustand or Jotai for client-only UI state
- [ ] Implement optimistic updates for common mutations
- [ ] Add loading skeletons and error boundaries
- [ ] Configure stale times and cache invalidation strategy

## References

- [TanStack Query Documentation](https://tanstack.com/query/latest)
- [Zustand Documentation](https://docs.pmnd.rs/zustand)
- [Jotai Documentation](https://jotai.org/)
