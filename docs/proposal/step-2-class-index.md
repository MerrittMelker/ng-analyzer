# MenuId → Data Service Method Mapping — Step 2 (Class & Injection / Call Index)

Status: Draft (Depends on Step 1 service catalog)
Prerequisite: Step 1 JSON (service-catalog-1) or in-memory equivalent must exist.
Objective: Build a project-wide index of classes, their injected dependencies (adjacency), and per-class direct tn-api service method calls. No route usage or aggregation yet.

---
## Purpose
Provide the structural and usage backbone so later phases (menu root traversal, aggregation) can run without repeated AST scans. We capture only factual (direct) method calls inside class bodies — no inferred/propagated usage.

---
## Output (Proposed JSON Shape)
SchemaVersion: `class-index-1`
```
{
  "schemaVersion": "class-index-1",
  "servicesCatalogVersion": "service-catalog-1",
  "classes": [
    {
      "key": "/abs/path/foo.component.ts#FooComponent",
      "file": "/abs/path/foo.component.ts",
      "className": "FooComponent",
      "kind": "component",              // component | class | abstract
      "injects": ["/abs/path/user.service.ts#UserService"],
      "tnApiCalls": [                     // Only tn-api (catalog) service calls
        { "service": "/abs/path/user.service.ts#UserService", "method": "get" },
        { "service": "/abs/path/user.service.ts#UserService", "method": "delete" }
      ],
      "selector": "foo-comp",            // components only
      "template": {                       // optional, no parsing besides load
        "inline": "<div></div>"           // or
        // "file": "/abs/path/foo.component.html"
      }
    }
  ],
  "diagnostics": []
}
```
Deterministic ordering: classes sorted by key; inside each class `injects` sorted, `tnApiCalls` sorted by (service, method).

---
## Definitions
Class: Any `ClassDeclaration` in scanned TS source files.
Component Class: Class with an @Component decorator (textual match, not type-checked).
Injected Dependency (edge): A class referenced by a constructor parameter property (visibility modifier) or an explicitly typed class property.
Service Instance Member: A constructor param property or class property whose declared type resolves to a service in the Step 1 catalog.
Direct tn-api Call: A `CallExpression` with callee pattern `this.<member>.<method>()` (optionally with `?.`) where `<member>` maps to a service instance member; `<method>` is the property access name (identifier). ElementAccess (`this.svc["x"]()`) excluded in v1.

---
## Scope (Included)
- All classes in included source roots (default: entire project minus excludes).
- Constructor parameter properties (public/protected/private/readonly) recorded for injection edges.
- Class property declarations with explicit type annotations.
- Optional chaining on the service property allowed (`this.svc?.load()`).
- Inline vs external template string capture (no parsing beyond plain load).

---
## Explicit Exclusions (v1)
- Inferring injections from constructor params without access modifiers (not class properties).
- Destructured / aliased service references: `const x = this.svc; x.load()`.
- Destructured method extraction: `const { load } = this.svc; load()`.
- ElementAccess calls: `this.svc['load']()`.
- Calls through intermediate variables: `let s = this.svc; s.load()`.
- Static method calls on service classes themselves (only instance usage tracked).
- Provider scope / module resolution / InjectionToken modeling.
- Template component discovery or selector graph expansion.

Rationale: Keeps matching fast and unambiguous; deferred patterns can be incrementally added behind flags.

---
## Algorithm (Single Pass Outline)
1. Initialize project (ts-morph) with glob/exclude filters.
2. Pre-load service catalog into: `serviceByName: Map<className, Set<filePath>>` and `serviceKeys: Set<serviceKey>`.
3. For each source file:
   a. Collect all class declarations.
   b. For each class:
      - Determine kind (component if decorator includes `@Component` string; abstract if `abstract` keyword).
      - Extract selector & template:
        * If @Component decorator has `selector: '...'` capture raw string.
        * If inline `template: '...'` capture raw; if `templateUrl: '...'` resolve path.
      - Scan members for injection candidates:
        * Constructor parameter properties → record type identifier(s).
        * Typed class properties.
      - Resolve each candidate type identifier to a class key if the target file contains a class with that name (best-effort import resolution):
        * Use import declarations of the file (named / aliased / namespace) to map local identifiers to source files.
        * If resolved file exports a class with matching identifier, add edge current → dep.
      - Build service instance member map: memberName → serviceKey (only if resolved type matches a service in catalog).
      - Walk descendants for CallExpressions:
        * If callee is PropertyAccessExpression (or preceded by optional chain) and left is `ThisExpression.property`:
          - If property name in service instance member map, record tnApiCall { serviceKey, methodName }.
   c. Deduplicate per-class tnApiCalls (Set by serviceKey+method).
4. Accumulate class objects; sort fields.
5. Serialize JSON.

---
## Data Structures (In Memory)
```
serviceCatalog: Set<serviceKey>
classIndex: Map<classKey, {
  file: string;
  className: string;
  kind: 'component' | 'class' | 'abstract';
  injects: Set<classKey>;
  tnApiCalls: Set<{ serviceKey: string; method: string }>;
  selector?: string;
  template?: { inline?: string; file?: string };
}>
```
Helper indexes:
- fileImportMap: per-file map of local identifier → resolved file path.
- namespaceImportMap: namespace → module specifier (then enumerate exports lazily if needed; or skip in v1 if complexity is high).

---
## Contract (Internal API)
```
buildClassIndex(options: {
  projectRoot: string;
  includeGlobs?: string[];        // default: ['**/*.ts'] excluding spec/test & node_modules
  excludeGlobs?: string[];        // default: ['**/*.spec.ts','**/node_modules/**','**/dist/**']
  serviceCatalog: { services: Array<{ key: string; file: string; className: string }> };
  captureTemplates?: boolean;     // default true
}): {
  schemaVersion: 'class-index-1';
  classes: Array<SerializedClassEntry>;
  diagnostics: string[];
}
```
`SerializedClassEntry` matches JSON shape above.

Error Modes:
- Non-fatal: unresolved type for an injected dependency (skip + optionally diagnostic under flag).
- Fatal: service catalog empty (return empty index but log diagnostic unless allowEmpty flag provided).

---
## Diagnostics (Initial Set)
Codes (string messages acceptable initially):
- `unresolved-import:<identifier>:<file>` — could not resolve injected type to class.
- `duplicate-class-key:<classKey>` — unlikely; signals internal logic issue.
- `template-file-missing:<path>` — external template path not found (optional; skip by default).

Show diagnostics only with `--trace` flag in CLI to keep default output clean.

---
## CLI (Optional Early) `build-class-index`
```
Usage: build-class-index [options]

Options:
  --project <dir>
  --include <globs>
  --exclude <globs>
  --catalog <file>         Path to Step 1 JSON (service-catalog-1)
  --json                   Emit JSON to stdout
  --out <file>             Write JSON
  --trace                  Include diagnostics
```
Validation: Ensure catalog.schemaVersion === 'service-catalog-1'.

---
## Performance Considerations
- Single traversal per file; no per-service passes.
- Use Sets internally; convert to sorted arrays at serialization time.
- Avoid TypeChecker where possible; rely on import resolution + identifier text (fast path). Add TypeChecker fallback behind future flag if needed.

---
## Testing Strategy
Fixtures (add under `__tests__/fixtures/class-index/`):
1. `user.service.ts`, `audit.service.ts` (catalog members)
2. `wrapper.service.ts` injecting `UserService` & calling userService.get()
3. `dashboard.component.ts` injecting `WrapperService` & calling wrapperService.refresh() (non-catalog) and userService.get()/delete()
4. `orphan.component.ts` injecting nothing

Tests:
- Builds index without errors.
- dashboard.component.ts tnApiCalls contains userService.get/delete only (wrapperService.refresh ignored if wrapper not in catalog).
- Injection edges: dashboard.component → wrapper.service, wrapper.service → user.service.
- Deterministic ordering snapshot.

Edge test: optional chaining call `this.userService?.get()` captured.

---
## Future / Deferred (Not in Step 2)
- Namespace import resolution for service types (if absent in current codebase) — can add.
- Handling of alias-based re-export cascades (barrel files) — future enhancement.
- ElementAccess calls, alias tracking, method extraction patterns.
- Distinction of “direct vs indirect” calls (all are direct in current model).
- Filtering out abstract classes from injects set (optional).

---
## Acceptance Criteria
- Running builder over fixture yields stable JSON with expected edges & calls.
- No runtime exceptions on unresolved types (graceful skips).
- All tn-api method calls present, none extraneous (no non-catalog service methods captured).

---
## Next Step After Step 2
Draft Step 3 spec: Menu roots (menuId → component seeds) using existing or new route analyzer; then combine Step 1 + Step 2 + Step 3 for aggregation (Step 4).

End of Step 2 document.

