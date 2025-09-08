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

## Performance notes
- Use a shared ts-morph Project for the entire run.
- Short-circuit early when targetModules is empty.
- Cache import analysis per file if needed.

## Diagnostics
- Keep simple string diagnostics for now (e.g., missing file/class, not an @Component, unresolved templateUrl). Later, standardize with codes in diagnostics.ts.

