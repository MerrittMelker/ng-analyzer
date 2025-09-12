# Service-First Indexing Strategy (Proposed Enhancement)

Status: Draft / Proposal
Related Areas: Recursive Graph Analyzer, Route Analysis, Phase 1 Component Analyzer

## 1. Overview
This document proposes inverting the current component/menuId → services traversal by starting from the service layer and building a global, queryable index of service usage across the project. The goal is to enable fast answers to questions like:
- Which components (and thereby which `menuId`s) depend on a given service or service method?
- Which services (or methods) are unused by any reachable menu-driven UI entry point?
- What is the blast radius of changing or removing a service?

## 2. Motivation
The existing approach starts at known UI entry points (components tied to a `menuId`) and expands outward. This can miss:
- Services indirectly used by other services not connected to the chosen root set.
- Unreferenced (dead) services or methods.
- Transitive dependency impact when starting points are incomplete.

A service-first pass improves:
- Completeness: Every service is considered exactly once.
- Cost model: One full-project pass builds indices; subsequent queries become simple lookups.
- Risk assessment: Identifies unused or low-impact services early.
- Extensibility: Natural foundation for method-level heatmaps, provenance, or deprecation tooling.

## 3. Comparison (Direction Inversion)
Current (component-first):
`menuId → component → injected services (+ template → child components → their services ...)`

Proposed (service-first):
`service → consumers (components or services) → components → routes → menuIds`

Both graphs can coexist; the latter supplies a global backbone while the former provides focused, reachability-driven subgraphs.

## 4. High-Level Pipeline
1. Discover candidate services.
2. Build a project-wide symbol & class index (components, services, other classes).
3. Record injection edges (consumer → service) by scanning constructors & parameter properties.
4. (Optional Phase) Collect method invocation sets per injected instance inside each consumer.
5. Map components to routes and aggregate `menuId`s.
6. Derive inverses/aggregates: service → components, service → menuIds, menuId → services, service.method → menuIds.
7. (Optional) Compute transitive closure for service → service chains.
8. Emit a structured JSON artifact (versioned schema) for downstream tooling and validation.

## 5. Service Discovery Strategies
Priority order (apply sequentially; tag heuristics):
- Explicit: Imported from caller-specified target module specifiers (`--target-mods`).
- Decorator: Class decorated with `@Injectable` or `@Directive` (if treated as provider), flagged `decorator`.
- Naming: File or class ends with `.service.ts` or `Service` suffix, flagged `filename`.
- Generic/Utility: Optional heuristic for classes injected frequently but lacking conventional naming, flagged `generic`.

Each discovered service is keyed by `{ absFilePath, className }` plus `originTags: string[]`.

## 6. Data Model Sketch (Initial JSON)
```
{
  "schemaVersion": "service-index-1",
  "services": [
    { "file": "...", "className": "FooService", "origins": ["target-module","decorator"] }
  ],
  "consumers": [
    { "file": "...", "className": "UserComponent", "kind": "component", "selector": "user-comp", "menuIds": [101,102] }
  ],
  "injections": [
    { "consumer": {"file": "...", "className": "UserComponent"}, "service": {"file": "...", "className": "FooService"} }
  ],
  "methodUsages": [
    { "service": {"file": "...", "className": "FooService"}, "consumer": {"file": "...", "className": "UserComponent"}, "methods": ["load","save"] }
  ],
  "aggregates": {
    "serviceToMenuIds": { "<file#class>": [101] },
    "menuIdToServices": { "101": ["<file#class>"] },
    "serviceMethodToMenuIds": { "<file#class>.load": [101] }
  },
  "diagnostics": ["..."],
  "meta": { "generatedAt": "ISO-8601", "analyzerVersion": "x.y.z" }
}
```
Key construction suggestion: `serviceKey = file + '#' + className` (stable, collision-free under rename detection).

## 7. Query Examples Enabled
- Unused services: services with zero inbound injection edges from any component mapped to a `menuId`.
- Unused methods: methods in `services` not present in any `methodUsages.methods` union.
- Impact analysis: given `serviceKey`, union `aggregates.serviceToMenuIds[serviceKey]`.
- Cross-service chains: via transitive closure, find all downstream services of a candidate low-level service.

## 8. Detailed Algorithm Steps
1. Project Scan: Single ts-morph walk; cache all `ClassDeclaration`s with lightweight metadata.
2. Decorator Classification: Inspect decorators (textual match on `@Injectable`, avoid requiring Angular types present).
3. Heuristic Tagging: Filename / suffix tests, store origin tags.
4. Injection Graph: For each class, parse constructor parameter properties & parameters with visibility modifiers (public/private/protected) plus typed class properties; resolve their type identifiers; if identifier resolves to discovered service symbol, record injection edge.
5. Method Usage (optional, controlled by flag): Reuse existing `MethodUsageCollector` logic but generalized for any class (not just components) by scanning body for `this.<prop>.method()` and optional chaining.
6. Route Mapping: Reuse existing `RouteAnalyzer` to get component → `menuId[]`; join onto consumer objects with `kind === 'component'`.
7. Aggregation: Build reverse indices in O(E) time (E = injection edges + method usages).
8. Serialization: Emit stable ordering (lexicographically sorted arrays) to enhance diff friendliness and test determinism.

## 9. Transitive Dependencies (Optional Phase)
Compute transitive closure of service dependency graph when a service injects another service. Approaches:
- BFS per service (O(S * (S + E))) acceptable for modest S.
- Or single multi-source topological layering if acyclic; cycle detection required anyway.
Include an optional `transitive` section: `{ serviceToServices: { key: [depKey,...] } }` and cycle sets if found.

## 10. Integration With Recursive Graph Analyzer
- Shared Symbol Cache: Reuse the same `ProjectHost` and class index to avoid duplicate AST parsing.
- Node Augmentation: Enrich existing graph nodes with precomputed injection & method usage info (avoid recomputation during traversal). 
- Hybrid Queries: Intersect service-first index with traversal-induced reachability for filtered graphs (e.g., only show services actually on a given root path, plus note unused ones).

## 11. Incremental Adoption Plan
Phase A (Foundational):
- Implement `ServiceUsageIndexer` (no method usage, no transitive closure).
- Provide CLI: `analyze-services` with `--target-mods`, `--json`, `--out <file>`.
- Add Jest snapshot test for small fixture set.

Phase B (Method Detail):
- Add method invocation collection; extend schema to include `methodUsages` and method-level aggregates.
- Introduce `schemaVersion` bump (e.g. `service-index-2`).

Phase C (Transitive & Pruning):
- Add optional transitive closure + cycle detection.
- Add flags: `--include-transitive`, `--only-menu-linked`, `--prune-unused`.

Phase D (Performance & Validation):
- Benchmarks comparing cold vs repeated runs (index reuse scenario).
- JSON Schema + validation script (`npm run validate-service-index`).

## 12. Edge Cases & Considerations
- Aliased Imports: Preserve resolved local name mapping for injection detection.
- Namespace Imports: Support `import * as Api from '...'` and references `Api.FooService`.
- Duplicate Class Names: Disambiguate by absolute file path; key includes file.
- Conditional / Lazy Modules: Static analysis may over-approximate; mark uncertain providers if future context added.
- External Services (node_modules): Optionally surface as lightweight nodes with `external: true` (future flag; currently skipped unless explicitly targeted).
- False Positives: Classes matching heuristics but never injected; harmless—can be pruned with `--prune-unused` later.

## 13. Future Enhancements
- Dead Code Confidence: Cross-check absence from any import graph to flag probable removal candidates.
- Method-Level Call Graph: Track service-to-service method invocation chains (requires deeper AST walk).
- Heatmap: Count frequency of method usage across distinct components / menuIds.
- Diff Tooling: Compare two service index JSON files to surface added/removed services & methods.
- Provenance: Embed git commit hash (optional, via flag) for traceability.

## 14. Open Questions
- Should method usage inside services be always-on or gated by a flag for performance? (Likely flag: `--with-methods`).
- How to treat abstract classes and interfaces injected via tokens? (Initial pass: skip; future: map InjectionToken ↔ concrete provider if resolvable.)
- Need dedicated normalization for Windows vs POSIX path outputs? (Suggestion: always emit POSIX-style forward slashes for portability.)

## 15. CLI Sketch
```
Usage: analyze-services [options]

Options:
  --project <dir>        Project root (default: cwd)
  --target-mods <list>   Comma-separated module specifiers to treat as explicit services
  --with-methods         Collect method invocations per injected instance
  --json                 Emit JSON index to stdout
  --out <file>           Write JSON to file
  --max-files <n>        (Optional) Hard cap on files scanned (safety)
  -h, --help             Show help
```

## 16. Testing Strategy
- Unit: Service discovery heuristics (decorator, filename), injection edge detection, method usage extraction.
- Integration: Full run over fixture set producing stable snapshot.
- Schema Validation: JSON Schema enforced in CI once schema stabilizes.

## 17. Risks & Mitigations
| Risk | Mitigation |
|------|------------|
| Performance on large codebases | Single-pass index; optional file caps; lazy enabling of method usage | 
| Schema churn | Introduce `schemaVersion`; maintain `docs/json-schema.md` change log | 
| Over-approximation of unused services | Provide explicit reason codes and allow pruning flags | 
| Windows path instability in snapshots | Normalize path separators before serialization |

## 18. Next Immediate Steps (If Approved)
1. Add TODO entry: "Implement service-first indexer (CLI + JSON output)".
2. Scaffold `src/analysis/ServiceUsageIndexer.ts` with contract.
3. Add CLI `src/cli/analyze-services.ts`.
4. Introduce initial test fixture with 2 services, 2 components, 1 route file.
5. Snapshot test for JSON output (methods disabled initially).

---
This proposal complements (not replaces) the existing recursive graph analyzer by supplying a global, service-centric perspective.

