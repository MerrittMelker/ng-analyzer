# Phase 1 — Per-Component Service Method Usage (Spec)

Purpose
- Given a single Angular component class, summarize which methods are called on instances whose types come from caller-specified modules.
- This is a direct, in-class summary only; no transitive analysis yet.

Inputs
- sourceFilePath: absolute or repo-relative path to the .ts file containing the component class.
- componentClassName: exact class name of the Angular @Component to analyze.
- targetModules: string[] of module specifiers (e.g., ['module-a', '@org/module-b']). Caller must provide these; there is no default.

Interpretation
- Treat anything imported from the specified targetModules as a service type for matching purposes. No additional heuristics.
- The scope is strictly the specified component class (not the entire file).

What to record (Phase 1)
- Instances: component members whose declared types resolve to symbols imported from targetModules.
  - Sources of instances
    - Constructor parameter properties (with access modifiers)
    - Class property declarations with type annotations
  - Matching rules
    - Named/default imports: direct local identifier match
    - Namespace imports: Left.Right where Left is the namespace and Right is the type name
- Methods used on those instances anywhere inside the class body
  - Count calls in constructor, methods, accessors, and property initializers
  - Support optional chaining on receivers (this.svc?.method()) and standard property access (this.svc.method())
- Summaries (no per-callsite records)
  - Per-instance: { propertyName, typeName, methodsUsed[] }
  - Union across all instances: allMethodsUsed[] (unique, sorted)
- Additional metadata
  - matchedModules[]: the subset of targetModules actually observed in this file’s imports
  - Minimal template info: inline template string or resolved templateUrl path (no template parsing yet)

Out of scope (for Phase 1)
- Transitive or project-wide reachability
- Template-driven discovery
- Destructured/extracted method references and deep call-chain following
- Heuristic classification beyond the explicit targetModules list

Success criteria
- If a service instance (as defined above) is used anywhere in the class, all invoked method names on that instance are captured.
- No per-usage records; only the unique set of method names per instance and a union across instances.

API shape (current)
- AngularComponentAnalyzer.analyze({ sourceFilePath, componentClassName, targetModules }) => instance fields populated:
  - matchedModuleSpecifiers: string[]
  - importsFromTargetModules: string[] (local identifiers including namespace aliases)
  - templateFilePath?: string
  - inlineTemplate?: string
  - serviceInstancesFromTargetModules: Array<{ propertyName: string; typeName: string; methodsUsed: string[] }>
  - allMethodsUsedOnTargetInstances: string[]

Notes
- Batch execution is handled by BatchAnalyzer; each item is a per-component request.
- See docs/architecture.md for the broader design, modularization plan, and future phases.

