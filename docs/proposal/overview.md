# MenuId → Data Service Methods Mapping — Proposal Overview

Status: Draft Overview (Steps 1–8 specs now drafted)
Scope: Defines staged approach to derive `menuId → { tnApiService: [methods...] }` mapping with controlled complexity.

## Goal (End-State)
Produce a stable JSON output:
```
[
  {
    "menuId": 123,
    "services": [
      { "key": "/abs/path/user.service.ts#UserService", "name": "UserService", "methods": ["get","delete"] }
    ]
  }
]
```
Meaning: All *actually invoked* tn-api service methods reachable from the component(s) associated with the specified `menuId` via:
- Direct calls in those components
- Calls in services they inject (recursively)
- (Later) Calls in additional components reachable via templates or child routes (without their own menuId)

## Guiding Principles
- Deterministic, additive phases (earlier JSON remains a subset of later JSON).
- Single-pass indexing per phase (avoid per-service rescans).
- Explicit inputs (glob patterns, target modules). No hidden heuristics unless flagged.
- Over-approximation accepted only when clearly labeled; otherwise prefer under-reporting with diagnostics.

## Phases (Incremental)
| Phase | Name | Core Output | Expansion | Notes |
|-------|------|-------------|-----------|-------|
| 1 | Service Catalog | List of tn-api service classes | None | Whitelist of service symbols |
| 2 | Class & Call Index | Injection adjacency + per-class tn-api calls | None | Basis for traversal |
| 3 | Menu Roots | menuId → root components | Routes only | No child inheritance yet |
| 4 | Aggregation Traversal | menuId → services(methods) | Injection BFS | Structural wrapper traversal |
| 5 | Template Expansion | Add template children components | Selector-based | Optional; extends component set |
| 6 | Child Route Inheritance | Add components from descendant routes w/o menuId | Route tree | Optional |
| 7 | Service Method Enrichment (Optional) | Distinguish direct vs propagated | Propagation labeling | If needed |
| 8 | Diff & Validation (Optional) | Schema + diff tooling | N/A | Hardening |

Specs drafted for all phases (see individual `step-N-*.md` documents).

## Data Structures (Cumulative)
| Name | Shape | Origin Phase | Purpose |
|------|-------|--------------|---------|
| serviceCatalog | Set<serviceKey> + map | 1 | Recognize tn-api calls |
| classIndex | Map<classKey,{injects:Set<classKey>, tnApiCalls:Array<{serviceKey,methodName}>, kind, selector?}> | 2 | Traversal backbone |
| menuRoots | Map<menuId, Set<classKey>> | 3 | Traversal seeds |
| menuAggregation | Map<menuId, Map<serviceKey, Set<methodName>>> | 4 | Build result |
| selectorIndex (optional) | tag -> Set<classKey> | 5 | Template expansion |
| routeTree (optional) | nested structure | 6 | Child route inheritance |
| propagationMeta (optional) | service usage origin tags | 7 | Direct vs propagated |
| diffArtifacts (optional) | prior vs current snapshots | 8 | Change tracking |

## Traversal Logic (Phase 4)
For each `menuId`:
1. Start queue = root components (menuRoots).
2. While queue not empty:
   - Pop `K`.
   - Union `K.tnApiCalls` into aggregation.
   - Enqueue each injected class from `K.injects` unless visited.
3. Serialize aggregated service methods.

Clarification: Step 4 only records methods that are explicitly called in at least one visited class body. Visiting (or injecting) a service without any direct call to one of its methods does NOT cause that service (or any of its methods) to appear. No inferred / propagated usage is added until (and unless) optional Phase 7 is applied.

## Minimal Output Schema (menu-service-map-1) — Future
(Not implemented yet)
```
[
  { "menuId": 10, "services": [ { "key":"/abs/...#UserService", "name":"UserService", "methods":["get"] } ] }
]
```

## Deferred Items (Not in Current Implemented Set)
- Wrapper propagation (implied usage) without explicit method calls (Phase 7 optional).
- Service method usage inside services for non-tn-api classes.
- Attribute / structural directive selectors.
- Dynamic route / lazy module expansion.
- Performance caching across runs.

## Acceptance for Early Milestones
- Phase 1 JSON stable, deterministic ordering.
- Phase 2 index can be built without needing route info (route phase decoupled).
- Clear, minimal diagnostics (only when essential, e.g., unresolved imported type for an injected property if --trace enabled).

## Next Steps
1. Implement Step 1 (service catalog) code + tests.
2. Implement Step 2 (class & call index) code + tests.
3. Draft / implement Step 3 (menu roots) builder.
4. Execute first end-to-end assembly (Step 4) to produce prototype `menu-service-map-1`.

End of overview.
