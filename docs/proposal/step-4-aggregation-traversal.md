# Step 4 — Aggregation Traversal (menuId → Services & Methods)

Status: Draft
Depends on: Step 1 (service catalog), Step 2 (class index), Step 3 (menu roots)
Objective: Produce first end-to-end mapping: each menuId → tn-api services + actually called methods, using only root components and their injected dependency chain.

## Output (menu-service-map-1)
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
Ordering:
- Top array sorted ascending by menuId.
- services array sorted by service name (className) case-insensitive.
- methods sorted alphabetically unique.

## Inputs
- serviceCatalog: Set / array of services
- classIndex: classes with injects + tnApiCalls
- menuRoots: menuId → root component keys

## Traversal (Per menuId)
1. frontier = queue(root components)
2. visitedClasses = Set
3. while frontier not empty:
   - pop class K
   - mark visited
   - for each tnApiCall in K.tnApiCalls: add method to aggregation[serviceKey]
   - enqueue each dependency D in K.injects if not visited
4. After BFS, build services list from aggregation map.

## Data Structures
```
menuAggregation: Map<number, Map<serviceKey, Set<methodName>>> // ephemeral per run
```

## Exclusions (Still Deferred)
- Template child components (Phase 5)
- Child route inheritance (Phase 6)
- Propagated/wrapper implied usage (Phase 7)

## Edge Handling
- Cycles: visitedClasses prevents infinite loops.
- Missing class in classIndex (should not happen) → skip silently (diagnostic optional).
- Service with zero methods (no direct calls) omitted by default unless `--include-empty` flag chosen later.

## CLI Sketch (Later)
```
menu-service-map --catalog service-catalog.json --classes class-index.json --menu-roots menu-roots.json --json --out map.json
```

## Testing
Fixture:
- root component → WrapperService → UserService
- WrapperService calls UserService.get only.
Expect menuId mapping shows UserService.get only.

End of Step 4.

