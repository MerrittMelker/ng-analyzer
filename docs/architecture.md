# Architecture and Design

This document captures the detailed design for Phase 1 (direct, per-component analysis) and the planned evolution to recursive, project-wide traversal.

## Scope (Phase 1)
Input is a single Angular component class identified by its source file path and class name, plus an explicit list of module specifiers. The analyzer reports the set of methods invoked on instances whose types come from the specified modules, considering any usage anywhere inside the class. No recursion or template-driven reachability yet.

Key points
- No defaults for target modules; callers must provide them explicitly.
- Treat anything imported from those modules as a service type for matching purposes (no heuristics needed here).
- Count a service method as used if it is invoked anywhere within the class body (constructors, methods, property initializers, etc.).
- Summarize:
  - Per-instance: propertyName, typeName, methodsUsed[]
  - Union: allMethodsUsed[] across all matched instances
  - matchedModules[] actually observed in this class
- Record minimal template info (inline string or resolved templateUrl) for reference only in Phase 1; do not analyze template content yet.

## Contracts
Inputs
- ComponentAnalysisItem
  - sourceFilePath: string
  - componentClassName: string
  - menuItemId: number
  - targetModules?: string[] (must be provided by the caller; no default is assumed)

Outputs (Phase 1 direct result)
- DirectAnalysisResult
  - menuItemId
  - root: { sourceFilePath, componentClassName }
  - matchedModules: string[]
  - direct: {
      instances: Array<{ propertyName: string; typeName: string; methodsUsed: string[] }>
      allMethodsUsed: string[]
      template?: { filePath?: string; inline?: string }
    }
  - diagnostics: string[]

Note: The broader ComponentAnalysisResult with transitive fields is reserved for later phases.

## High-level flow (Phase 1)
1) Load component class from file, verify it is decorated with @Component, and capture minimal template info.
2) Build a map of imported names originating from the specified target modules, including named, aliased, and namespace imports.
3) Identify candidate service instances within the class:
   - constructor parameter properties
   - class property declarations (typed)
4) Scan all class bodies (constructor, methods, property initializers) for call expressions on those instances and collect method names.
5) Produce per-instance and union summaries, plus matchedModules and diagnostics.

## Modular structure (to avoid large classes)
- Orchestrator keeps coordination logic only; parsing and collection live in focused helpers.

Suggested file layout
- src/analysis/
  - AngularComponentAnalyzer.ts (thin orchestrator)
  - BatchAnalyzer.ts (batch coordination; reuses the orchestrator per item)
  - ProjectHost.ts (shared ts-morph Project)
  - model/
    - contracts.ts (shared interfaces)
    - diagnostics.ts (optional well-typed diagnostic codes/messages)
  - indexes/
    - ImportMatcher.ts (resolves local names from target modules)
  - parsing/
    - ComponentLoader.ts (finds the class and basic template info)
  - collectors/
    - ClassMemberScanner.ts (finds candidate service instances)
    - MethodUsageCollector.ts (collects method invocations per instance)
  - utils/
    - ast.ts (small ts-morph helpers)

API boundaries (Phase 1)
- AngularComponentAnalyzer.analyze(item: ComponentAnalysisItem, host: ProjectHost): DirectAnalysisResult
  - Requires item.targetModules to be present; do nothing if empty.
- BatchAnalyzer: orchestrates multiple items with optional defaultTargetModules applied when an item omits targetModules.

## Import matching rules
- Named imports: import { Foo } from 'm';
- Aliased named imports: import { Foo as Bar } from 'm';
- Namespace imports: import * as Api from 'm'; then Api.Foo in types or initializers.
- Track a ServiceImportMap: maps local identifiers (and qualified names under a namespace) to their source module.

## Usage collection rules
- Count these expressions when the receiver is a candidate instance whose type resolves to a target-module symbol:
  - this.svc.method(...)
  - this.svc?.method(...)
- Optional early enhancement: recognize local aliases assigned from this.svc (e.g., const s = this.svc; s.method()). If added, keep it simple and conservative to avoid false positives.
- Exclusions for Phase 1:
  - Template-driven interactions
  - Destructured method extraction
  - Symbol-level cross-file type resolution beyond imports from target modules

## Edge cases to handle now
- Optional chaining on receivers (?.)
- Shadowed variable names inside methods (match by declaration/type, not by name alone)
- Class property initializers invoking methods
- Constructor-only parameter properties (no separate class field declared)

## Testing strategy
Unit tests
- ImportMatcher: named, aliased, and namespace imports; multiple modules; unmatched imports.
- ClassMemberScanner: finds ctor param props and class properties as candidates.
- MethodUsageCollector: recognizes method calls and optional chaining; avoids shadowed locals.

Integration tests
- AngularComponentAnalyzer: end-to-end for a component fixture confirming instances[] and allMethodsUsed[].

## Planned Phase 2+ (non-goals for Phase 1)
- Build a SelectorIndex of all @Component and @Directive selectors in the project.
- Parse templates (inline/external) to discover referenced components/directives by selectors (tags, attributes, structural directives) and analyze them.
- Discover reachable classes from property/parameter types, new expressions, and static calls; recurse with a visited set to avoid cycles.
- Produce a dependency tree annotated with discovery reasons.
- Add a stable CLI entrypoint to analyze a list of root components.

## Phase 2 Prototype (Experimental – Implemented)
This repository now includes an experimental recursive graph analyzer (`RecursiveGraphAnalyzer`). It is intentionally minimal and subject to change.

Current capabilities
- Traverses from one or more root components (file + class name).
- Builds a graph of:
  - Components discovered via element selectors in inline/external templates (e.g. `<child-comp>`)
  - Services (and other classes) injected through constructor parameters or parameter properties (component -> service, service -> service)
- Records edges with reasons: `template-tag` and `injects` (plus `root`).
- Aggregates per-component method usage by reusing Phase 1 `AngularComponentAnalyzer` results.
- Deduplicates nodes and prevents infinite cycles via a visited set.

Limitations / intentionally deferred
- No attribute / structural directive selector parsing yet (e.g. `[focusTrap]`, `*ngIf`).
- No class (`.foo`) or attribute-only selectors processed.
- No route-driven discovery integration.
- Service method usage inside services themselves is not aggregated (only component instance method usage union is summarized).
- Template parsing is regex-based (simple tag extraction) and may produce false negatives in complex HTML.

### CLI Entry (Experimental)
The recursive prototype now exposes a CLI script:
`npm run analyze-recursive -- --root <file:ClassName> [--root <file:ClassName> ...] [--target-mods a,b] [--max-depth N] [--max-nodes N] [--json] [--out graph.json]`

Outputs a summary to stdout. With `--json` it emits full graph JSON (optionally to a file via `--out`).

Data model (simplified)
- Nodes: `{ kind: 'component' | 'service', file, className, selector?, direct? }`
- Edges: `{ from, to, reason }` where reason ∈ {`root`,`template-tag`,`injects`}
- Aggregate: union of `allMethodsUsed` across component nodes.

Traversal algorithm (BFS outline)
1. Seed queue with roots (reason = `root`).
2. For each dequeued class:
   - If component: run Phase 1 analyzer; scan template for element selectors; enqueue matched components.
   - Collect injected class types (constructor params + typed properties); enqueue them as services; add `injects` edges.
3. Stop when queue empty or limits (`maxDepth`, `maxNodes`) reached.

Safety limits
- Default `maxNodes` = 500 (configurable).
- `maxDepth` defaults to Infinity but can be provided.

## Future Enhancements (Marked for Later)
The following are recorded TODOs and are not yet implemented:
1. Attribute & Structural Directive Selector Support
   - Parse attributes (including `*` microsyntax) and match directive selectors (e.g. `[focusTrap]`, `*myIf`).
   - Build a richer selector index (elements, attributes, classes) with normalization: `'[foo]' -> foo`, `'*ngIf' -> ngIf`.
2. Route-based root discovery
   - Derive root components from route configs (component + lazy module entry points).
3. Enhanced service analysis
   - Aggregate method usage for services, not just components (optional toggle).
4. Robust template parsing
   - Optionally leverage Angular compiler parser or an HTML tokenizer to reduce false negatives.

These items will be updated here as they are implemented.
