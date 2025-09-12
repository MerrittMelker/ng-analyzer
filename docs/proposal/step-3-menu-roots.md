# Step 3 — Menu Roots (menuId → Root Components)

Status: Draft
Depends on: Step 2 class index (for component resolution convenience)
Objective: Extract mapping of numeric data.menuId values to directly associated component classes (roots). No inheritance, no template expansion.

## Output (menu-roots-1)
```
{
  "schemaVersion": "menu-roots-1",
  "items": [
    { "menuId": 123, "components": [ { "file": "/abs/path/phones.component.ts", "className": "PhonesComponent" } ] }
  ],
  "diagnostics": []
}
```
Deterministic ordering: items sorted ascending by menuId, components sorted by className then file.

## Scope
Included:
- Route objects with literal numeric data.menuId and component: Identifier.
- Multiple routes with same menuId accumulate.
Excluded:
- Non-literal / computed menuId.
- loadChildren / lazy config.
- Child routes without their own menuId (handled later).

## Algorithm
1. Find candidate routing files (globs provided or default patterns like **/*routing*.ts, **/app.module.ts if configured).
2. Parse each file AST.
3. Locate route arrays/objects (heuristic: variable/const with ArrayLiteralExpression of object literals containing path or data keys).
4. For each object literal:
   - Extract component identifier if present.
   - Extract data.menuId if present as NumericLiteral.
   - Resolve component import to file path.
   - Add to map menuId → Set<{file,className}>.
5. Serialize to JSON.

## Diagnostics (Minimal)
- unresolved-component:<Identifier>:<file>
- duplicate-entry (ignored silently; optional to log under --trace)

## Contract
```
buildMenuRoots({ projectRoot, routeGlobs: string[] }): {
  schemaVersion: 'menu-roots-1';
  items: Array<{ menuId: number; components: Array<{ file: string; className: string }> }>;
  diagnostics: string[];
}
```

## Testing
Fixture with a routing file containing multiple menuIds and a duplicate reference.

End of Step 3.

