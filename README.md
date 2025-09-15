# Component Service Usages

A TypeScript + Jest toolkit to analyze Angular components and routing configurations using ts-morph.

## Features

### Service Catalog (Step 1)
Build a stable list of exported service classes matching inclusion globs.
- Input: project root (default cwd) + one or more include globs (e.g. `**/*.service.ts`)
- Output JSON: `{ schemaVersion: 'service-catalog-1', services: [{ key, file, className }], diagnostics: [] }`
- Key format: `<absoluteFilePath>#<ClassName>` ensures uniqueness.

Usage:
```bash
npm run analyze-services -- --include "**/*.service.ts"
# Specify a project root
npm run analyze-services -- --project ./__tests__/fixtures/catalog --include "**/*.service.ts"
# Write JSON to file
npm run analyze-services -- --include "**/*.service.ts" --out catalog.json
```
Currently only `--include` is implemented. Passing `--target-mods` will exit with a not-implemented message.

### Phase 1: Component Analysis
- **Input**: component class name, its source file path, and an explicit list of target module specifiers.
- **Output**: the set of methods invoked anywhere within the class on instances whose types originate from the target modules.
- Also returns per-instance details and a union of all methods used; minimal template info is captured for reference only.

### Phase 2 (Experimental): Recursive Component & Service Graph
- **Status**: prototype (API/output unstable).
- **What it does**: starting from one or more root components, recursively discovers:
  - Child components referenced via element selectors in inline/external templates (e.g. `<child-comp>`)
  - Injected services (constructor parameter/parameter property types) and their own injected service dependencies
- **Graph output**: nodes (kind: component | service) + edges with reasons `root`, `template-tag`, `injects`.
- **Aggregate**: union of all service method names used in each analyzed component (reuses Phase 1 analyzer internally).
- **Current limits**: no attribute or structural directive selectors (`[x]`, `*ngIf`), no route-derived roots yet, regex-based template scanning only.
- See docs/architecture.md (Phase 2 Prototype section) for details and future enhancement roadmap.

### Route Analysis
- **Input**: Angular project path with optional file patterns for routing files.
- **Output**: all route definitions that contain `data.menuId` properties, including:
  - File path and line number
  - Route path and component information
  - Menu ID values
  - Support for nested children routes

For the full design, contracts, and roadmap, see docs/architecture.md.
For the focused Phase 1 per-component spec, see docs/phase-1-spec.md.
For automation guidelines and guardrails, see docs/assistant-context.md.

## Quick start
```bash
# Install deps
npm install

# Run tests
npm test

# Type-check src only (no emit)
npm run typecheck

# Build to dist/
npm run build

# Analyze a component for service usage
npm run analyze -- <component-file> -m <module1,module2>

# Analyze routes with data.menuId
npm run analyze-routes -- <project-path>
npm run analyze-routes -- <project-path> --json
npm run analyze-routes -- <project-path> --include "**/*routing*.ts"

# Recursive component + service graph (experimental)
# Root format: <file:ClassName>
npm run analyze-recursive -- --root ./__tests__/fixtures/recursive/root.component.ts:RootComponent

# With target modules, depth/node limits and JSON output written to file
npm run analyze-recursive -- --root ./__tests__/fixtures/recursive/root.component.ts:RootComponent \
  --target-mods target-module --max-depth 5 --max-nodes 100 --json --out graph.json

# Service catalog (Step 1)
npm run analyze-services -- --include "**/*.service.ts"
```

## Usage Examples

### Component Analysis
```bash
# Analyze a component for Angular core service usage
npm run analyze -- ./src/components/user.component.ts -m @angular/core

# Analyze for custom service usage
npm run analyze -- ./src/components/dashboard.component.ts -m ./services,@mylib/services
```

### Route Analysis
```bash
# Analyze entire project for routes with menuId
npm run analyze-routes -- ./src

# Get JSON output for programmatic use
npm run analyze-routes -- ./src --json > routes-with-menu-id.json

# Analyze specific routing files
npm run analyze-routes -- ./src --include "**/*routing*.ts,**/app.module.ts"

# Exclude certain directories
npm run analyze-routes -- ./src --exclude "**/node_modules/**,**/dist/**"
```

### Recursive Graph (Experimental)
```bash
# Basic traversal from a single root component
npm run analyze-recursive -- --root ./__tests__/fixtures/recursive/root.component.ts:RootComponent

# Multiple roots
npm run analyze-recursive -- \
  --root ./path/to/feature-a/root-a.component.ts:FeatureARootComponent \
  --root ./path/to/feature-b/root-b.component.ts:FeatureBRootComponent

# Include target modules for Phase 1 method usage inside each component
npm run analyze-recursive -- --root ./root.component.ts:AppComponent --target-mods target-module,@angular/core

# Limit traversal depth and total nodes
npm run analyze-recursive -- --root ./root.component.ts:AppComponent --max-depth 4 --max-nodes 250

# Emit JSON graph to stdout
npm run analyze-recursive -- --root ./root.component.ts:AppComponent --json

# Emit JSON graph to file
npm run analyze-recursive -- --root ./root.component.ts:AppComponent --json --out graph.json
```

#### Recursive Graph JSON (Experimental)
Minimal schema excerpt (fields may evolve):
```json
{
  "nodes": [
    {
      "kind": "component | service",
      "file": "string (absolute path)",
      "className": "string",
      "selector": "string? (components only)",
      "direct": {
        "instances": [
          { "propertyName": "string", "typeName": "string", "methodsUsed": ["string", "..."] }
        ],
        "allMethodsUsed": ["string", "..."],
        "template": { "inline": "string?", "filePath": "string?" }
      },
      "serviceHeuristics": ["decorator" | "filename" | "generic"],
      "diagnostics": ["string", "..."]
    }
  ],
  "edges": [
    { "from": { "file": "string", "className": "string" }, "to": { "file": "string", "className": "string" }, "reason": "root | template-tag | injects" }
  ],
  "aggregate": { "allMethodsUsed": ["string", "..."] },
  "diagnostics": ["string", "..."],
  "limits": { "maxDepth": 0, "maxNodes": 0, "truncated": false }
}
```

Truncated sample output:
```json
{
  "nodes": [
    {
      "kind": "component",
      "file": "/abs/path/root.component.ts",
      "className": "RootComponent",
      "selector": "root-comp",
      "direct": {
        "instances": [],
        "allMethodsUsed": [],
        "template": { "inline": "<child-comp></child-comp>" }
      }
    },
    {
      "kind": "component",
      "file": "/abs/path/child.component.ts",
      "className": "ChildComponent"
    },
    { "kind": "service", "file": "/abs/path/service-a.service.ts", "className": "ServiceA" },
    { "kind": "service", "file": "/abs/path/service-b.service.ts", "className": "ServiceB" }
  ],
  "edges": [
    { "from": { "file": "/abs/path/root.component.ts", "className": "RootComponent" }, "to": { "file": "/abs/path/child.component.ts", "className": "ChildComponent" }, "reason": "template-tag" },
    { "from": { "file": "/abs/path/root.component.ts", "className": "RootComponent" }, "to": { "file": "/abs/path/service-a.service.ts", "className": "ServiceA" }, "reason": "injects" },
    { "from": { "file": "/abs/path/service-a.service.ts", "className": "ServiceA" }, "to": { "file": "/abs/path/service-b.service.ts", "className": "ServiceB" }, "reason": "injects" }
  ],
  "aggregate": { "allMethodsUsed": [] },
  "diagnostics": [],
  "limits": { "maxDepth": 5, "maxNodes": 500, "truncated": false }
}
```

## Notes
- Core analysis lives under src/analysis (AngularComponentAnalyzer plus supporting pieces).
- Recursive graph prototype: src/analysis/RecursiveGraphAnalyzer.ts (experimental; subject to change).
- Route analysis: src/analysis/RouteAnalyzer.ts
- Batch: src/analysis/BatchAnalyzer.ts
- Shared project host: src/analysis/ProjectHost.ts
- CLI tools: src/cli/

## Configuration
- TypeScript config split
  - tsconfig.json: base config for editor and tests.
  - tsconfig.build.json: extends the base for builds/type-checking src only and emits to dist/.

## NPM scripts
- **test**: runs Jest for the test suite.
- **test:watch**: runs Jest in watch mode.
- **build**: compiles src to dist using tsconfig.build.json.
- **typecheck**: runs TypeScript type-checking (no emit) against src.
- **analyze**: analyze Angular components for service usage patterns.
- **analyze-routes**: find Angular routes with data.menuId properties.
- **analyze-recursive**: experimental recursive component + service graph.
- **analyze-services**: build service catalog (Step 1).

## JetBrains Rider
- You can create run/debug configurations for npm scripts (test, test:watch, build, typecheck, analyze, analyze-routes) and share them as needed.
