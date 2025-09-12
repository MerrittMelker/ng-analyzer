# MenuId → Data Service Method Mapping — Step 1 (Service Catalog Only)

Status: Draft (Focusing strictly on the FIRST agreed step)
Validity: Confirmed (no changes required so far). Proceed to Step 2 once this contract is implemented.

Goal of Step 1: Build a precise catalog of the "data services" (e.g. tn-api services) that later steps will reference. No routing, no components, no method usage yet.

Why this step exists
- Everything downstream (component analysis, route linkage, method aggregation) depends on stable, de‑duplicated service identifiers.
- Prevents churn caused by heuristic creep later.

See also: `step-2-class-index.md` (next planned step).

## Definition (Explicit, Narrow)
A "data service" (for Step 1) is ANY exported class whose source file path matches a user‑provided glob/prefix (e.g. `**/tn-api/**/*.service.ts`) OR whose module specifier appears in an explicit allowlist (e.g. via `--target-mods tn-api,tn-core`). No other heuristics.

No guessing. No @Injectable requirement (can be added later if needed as a filter flag).

## Output Shape (Service Catalog)
```
{
  "schemaVersion": "service-catalog-1",
  "services": [
    { "key": "/abs/path/phones.service.ts#PhonesService", "file": "/abs/path/phones.service.ts", "className": "PhonesService" }
  ],
  "diagnostics": []
}
```
Key = normalizedAbsoluteFilePath + '#' + className (ensures uniqueness even with duplicate class names across files).

## Required Data Collected per Service
| Field | Reason |
|-------|--------|
| key | Stable reference for joins later |
| file | For traceability & future diffing |
| className | Human readable & disambiguation |
| origins? (optional later) | If multiple inclusion rules matched (e.g. path + module) |

## Minimal Algorithm
1. Resolve inclusion rules:
   - Collect file paths matching provided glob(s) (or root directories) OR
   - Collect re-export sources for provided module specifiers (if using module-driven mode) — OPTIONAL for first pass.
2. For each candidate file:
   - Parse with ts-morph once (shared Project).
   - Find all exported class declarations (named or default export).
   - For each: emit service record.
3. Deduplicate (Map keyed by file+className). If duplicate key encountered (should not happen), push diagnostic.
4. Sort services by key for deterministic output.
5. Serialize JSON.

## Diagnostics (Initial Set)
- duplicate-class-in-file (same class exported twice — rare, skip if unsupported now)
- duplicate-key (should not occur; indicates logic error)
- no-exported-classes (file matched pattern but had none — informational)

(Only implement the last one if trivial; otherwise skip diagnostics entirely in first code cut.)

## CLI (Step 1 Only) — Proposed Skeleton
```
Usage: build-service-catalog [options]

Options:
  --project <dir>        Project root (default: cwd)
  --include <globs>      Comma-separated glob(s) for service files (e.g. "**/tn-api/**/*.service.ts")
  --target-mods <mods>   (Optional) Comma-separated module specifiers (future; ignore if absent now)
  --json                 Emit JSON to stdout (default)
  --out <file>           Write JSON to a file
  --trace                Verbose diagnostics (optional)
```

Initial Implementation Scope (MANDATORY)
- Support --include only.
- Ignore --target-mods (plan but not implemented yet) or reject with message if provided.
- Produce service list JSON.

Out of Scope (For Step 1) — DO NOT IMPLEMENT YET
- Route scanning
- Component analysis
- Method usage aggregation
- Service → service dependency chains
- Any recursive traversal

## Contract (Internal Function Proposal)
```
buildServiceCatalog(options: {
  projectRoot: string;
  includeGlobs: string[]; // required
}): {
  schemaVersion: 'service-catalog-1';
  services: Array<{ key: string; file: string; className: string }>;
  diagnostics: string[]; // optional initially
}
```
Error Modes
- If no files match: return empty services[] (do not throw) — caller decides if that's fatal.

## Testing (Step 1 Only)
Create a minimal fixture set:
```
fixtures/catalog/
  a/phones.service.ts (export class PhonesService {})
  a/users.service.ts (export class UsersService {})
  b/misc.ts (export class NotAService {})  // Should not match if glob is **/*.service.ts
```
Test cases:
1. Glob **/*.service.ts returns only PhonesService & UsersService.
2. Deterministic ordering (snapshot of keys array).
3. Empty result when glob matches nothing.

## Example Output (Happy Path)
```
{
  "schemaVersion": "service-catalog-1",
  "services": [
    { "key": "/abs/path/a/phones.service.ts#PhonesService", "file": "/abs/path/a/phones.service.ts", "className": "PhonesService" },
    { "key": "/abs/path/a/users.service.ts#UsersService", "file": "/abs/path/a/users.service.ts", "className": "UsersService" }
  ],
  "diagnostics": []
}
```

## NEXT (Not Documented Here Intentionally)
Only after this step is implemented and validated will we draft / refine Step 2 (route → menuId mapping & class index). This file stays focused until Step 1 is done.

End of Step 1 document.
