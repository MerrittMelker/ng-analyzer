# Component Service Usages

A TypeScript + Jest toolkit to analyze Angular components and routing configurations using ts-morph.

## Features

### Phase 1: Component Analysis
- **Input**: component class name, its source file path, and an explicit list of target module specifiers.
- **Output**: the set of methods invoked anywhere within the class on instances whose types originate from the target modules.
- Also returns per-instance details and a union of all methods used; minimal template info is captured for reference only.

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

## Notes
- Core analysis lives under src/analysis (AngularComponentAnalyzer plus supporting pieces).
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

## JetBrains Rider
- You can create run/debug configurations for npm scripts (test, test:watch, build, typecheck, analyze, analyze-routes) and share them as needed.
