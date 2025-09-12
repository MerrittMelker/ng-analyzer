# Step 6 — Child Route Inheritance (MenuId Propagation)

Status: Draft
Depends on: Step 3 (menu roots) and Step 2 (class index) if component metadata needed.
Objective: Extend each menuId's component set with components from descendant route entries lacking their own `data.menuId`.

## Rationale
Angular route trees often nest feature routes. A parent route with `data.menuId` may have child routes that conceptually belong to the same menu context unless explicitly overridden by a new `data.menuId`.

## Scope
Included:
- Direct and nested `children` arrays beneath a menuId-bearing ancestor, stopping when encountering a route object with its own `data.menuId`.
Excluded:
- Lazy-loaded routes (loadChildren) in first pass.
- Dynamic runtime modifications to the Router config.
- Non-literal menuId expressions.

## Algorithm
1. Build a route tree structure during Step 3 or re-walk route files capturing parent-child relations.
2. For each root (menuId) route node R:
   - DFS through R.children; for each child C:
     - If C has `data.menuId`: STOP descent on that branch (do not inherit further).
     - Else if C has a `component`: record that component for this menuId.
     - Continue into C.children.
3. Merge inherited components with existing menuId root component set.
4. Feed expanded component set into Step 4 traversal (aggregation) or incremental update.

## Output (Auxiliary Optional)
```
{
  "schemaVersion": "child-route-inheritance-1",
  "menuIdInheritedComponents": [
    { "menuId": 200, "inherited": ["/abs/.../child-a.component.ts#ChildAComponent"] }
  ],
  "diagnostics": []
}
```

## Diagnostics
- unresolved-component:<identifier>:<file>
- route-cycle-detected (unlikely unless malformed data)
- inheritance-depth-limit-hit:<menuId> (if configurable depth cap triggered)

## Safety Limits
- maxInheritedPerMenuId (default 300)
- maxInheritanceDepth (optional; default unlimited)

## Testing
Fixture: parent route with menuId, two levels of children, one child with its own menuId halting deeper inheritance; verify only branches without menuId override are inherited.

## Deferred Enhancements
- Incorporate lazy route (loadChildren) resolution.
- Support merging multiple route trees (feature modules) automatically.

End of Step 6.

