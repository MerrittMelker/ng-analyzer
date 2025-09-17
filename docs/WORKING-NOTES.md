# WORKING NOTES (Rolling Decision & Action Log)

Purpose: Lightweight, always-current scratchpad for cross-machine continuity. Captures:
- Active step focus & scope boundaries
- Recently made decisions (with timestamps) and rationale
- Immediate next actions (high‑resolution)
- Deferred / parked ideas (pointer to TODO.md / proposal docs)
- Extraction & packaging strategy notes (so we can lift code into tnc-main cleanly)
- Sync workflow (how to update + commit discipline)

This file is intentionally living / mutable (NOT an immutable ADR). When something stabilizes, promote it to a proposal doc or README.

---
## 0. Meta Conventions
- Edit style: Prefer bullet points, terse, one decision per line.
- Add timestamps in UTC ISO (YYYY-MM-DD) when adding a new decision cluster.
- When a decision supersedes another: mark old line with (superseded YYYY-MM-DD) but keep it for traceability.
- Keep < 150 lines; prune or summarize older epochs.
- Reference other docs instead of duplicating spec details (e.g. step-1-service-catalog.md).
- Commit messages touching this file: `notes: <short summary>`.

---
## 1. Current Focus
- Step: Step 1 — Service Catalog (see proposal/step-1-service-catalog.md)
- Goal: Build/export catalog of target data services (class export + glob match) with stable JSON output & CLI.
- Extraction Target: Will be moved into `tnc-main` as a standalone internal package (`packages/service-catalog/`).

### Out of Scope Right Now
- Route parsing, component linkage, method usage, dependency chains.
- `--target-mods` resolution (planned but not implemented).
- Angular @Injectable filtering (pure filename/glob + export heuristic only).

---
## 2. Decisions (Recent)
(2025-09-15) Service key format locked: `<absPath>#<ClassName>` (see Step 1 spec) — enables disambiguation across duplicate class names.
(2025-09-15) Diagnostics minimal initial: allow empty list; no hard fail on zero matches.
(2025-09-15) Sorting: deterministic by `key` ascending before serialization.
(2025-09-15) CLI: only `--include` accepted; `--target-mods` will print a graceful not-implemented message.
(2025-09-15) JSON Schema version string: `service-catalog-1` (string, not numeric) for forward flexibility.
(2025-09-15) Extraction boundary: Provide `buildServiceCatalog()` pure function + thin CLI wrapper.
(2025-09-15) Implementation simplification: Step 1 catalog uses direct filesystem + regex scan (no ts-morph) for exported classes to avoid tsconfig scope issues.
(2025-09-17) Project Structure Strategy: Keep current `src/` and `packages/` structure as-is; migrate completed packages step-by-step to target workspace.
(2025-09-17) Package Development Pattern: `packages/` contains clean, exportable, standalone tools; `src/` remains experimental/development code.
(2025-09-17) Workspace Technology Choice: Using npm workspaces (packages/*), not using Angular workspace (projects); simpler than Lerna, Rush, Nx.
(2025-09-17) Naming Conventions: Package folders in kebab-case, package names in scoped npm style, class names in PascalCase.

---
## 3. Immediate Next Actions (High Resolution)
Checklist (edit live):
- [x] Implement `src/service-catalog/buildServiceCatalog.ts` (pure function per spec)
- [x] Add barrel `src/service-catalog/index.ts`
- [x] Add CLI entry `src/cli/analyze-services.ts` (name tentative) mapping args -> builder
- [x] Add fixture set: `__tests__/fixtures/catalog/{a/phones.service.ts,a/users.service.ts,b/misc.ts}`
- [x] Add tests: happy path, deterministic ordering, empty result
- [x] Update README: brief "Service Catalog (Step 1)" section + usage snippet
- [x] Add script: `analyze-services` in package.json
- [x] Verify typecheck + test pass
- [ ] Prepare extraction notes section below (update with any deviations)
- [ ] Define MenuId API Mapping Tool: propose name, purpose, and functional requirements

---
## 4. Extraction Strategy (to tnc-main)
Target shape in destination:
```
packages/
  service-catalog/
    package.json (private, build script -> tsc)
    src/ ... (same structure) 
```
Integration steps after copy:
- Add workspace reference (if monorepo) or direct dependency path.
- Add `"analyze:services"` npm script in root.
- Store output JSON under `tools-output/service-catalog.json` (git-ignored unless needed).

---
## 5. Open Questions
- Do we need path normalization for Windows vs POSIX before key? (Assume absolute native; later optionally convert to POSIX for portability.)
- Should we optionally include relative path from project root? (Deferred — can derive downstream.)

---
## 6. Deferred Items (Pointers)
See docs/TODO.md for: schema version field for recursive graph, validation tooling with ajv, directive selector support, cycle reporting, etc.

---
## 7. Promotion Rules
When Step 1 is complete & moved:
- Move stable description to README + proposal doc stays as historical spec.
- Trim this file's Step 1 section; start Step 2 decision cluster.

---
## 8. Sync Workflow Across Machines
1. Before starting work: pull latest + skim this file + TODO.md.
2. After completing a logical change: update decisions / checklist, commit.
3. If offline edits made elsewhere: reconcile by appending new decision lines with timestamps (avoid rewriting history).
4. Keep unresolved merges explicit — do not silently discard conflicting decision lines.

---
## 9. Log (Compressed History)
(2025-09-15) Inception: Introduced working notes file.

---
End of working notes.

# Working Notes - ng-analyzer Development

## 2025-09-17: Workspace Structure & Package Strategy

### Key Decisions Made

#### 1. Project Structure Strategy
- **Current repo**: Remains our spike/sandbox workspace with existing structure
- **Migration approach**: Move completed packages step-by-step to target workspace
- **No restructuring**: Keep current `src/` and `packages/` structure as-is

#### 2. Package Development Pattern
- **Packages folder**: `packages/` contains clean, exportable, standalone tools
- **Spike code**: `src/` remains experimental/development code
- **Migration ready**: Each package in `packages/` is ready to copy to target workspace

#### 3. Workspace Technology Choice
- **Using**: npm workspaces (packages/*)
- **Not using**: Angular workspace (projects) - that's for Angular apps, we're building tools
- **Alternative considered**: Lerna, Rush, Nx - npm workspaces is simpler for our use case

#### 4. Naming Conventions
- **Package folders**: kebab-case (e.g., `menuid-api-mapping`)
- **Package names**: scoped npm style (e.g., `@ng-analyzer/menuid-api-mapping`)
- **Class names**: PascalCase (e.g., `MenuIdApiMappingAnalyzer`)
- **Rationale**: Cross-platform compatibility, npm standards, tool utility conventions

### Current Status

#### ✅ Completed: Service Catalog Package
- **Location**: `packages/service-catalog/`
- **Status**: Complete standalone package with tests
- **Ready for**: Migration to target workspace
- **Package name**: `@ng-analyzer/service-catalog`

#### 🔄 Next: Define MenuId API Mapping Tool
- **Proposed name**: `menuid-api-mapping`
- **Purpose**: TBD - need to define functional requirements
- **Question**: What should this tool actually do?

### Development Workflow Established
1. Develop/experiment in `src/` (spike code)
2. Create clean package in `packages/` when ready
3. Test package independently
4. **Manual copy** package to target repository (separate repo)
5. Integrate and continue development in target repo
6. Repeat for next step

#### Cross-Repository Transfer Process
- **Spike repo**: Complete and test each step/package here
- **Target repo**: Separate repository for final `menuid-api-mapping` deliverable
- **Transfer method**: Manual copy of `packages/<step>/` folders from spike to target
- **Rider workflow**: Use two separate Rider windows (File → Open → New Window)
- **Integration**: AI assistant helps with setup/integration once target repo is opened

### Notes for Multi-Machine Development
- **This file**: Use for tracking decisions across machines
- **Copy issue**: Rider agent mode doesn't allow easy text copying
- **Solution**: Reference this markdown file for copying to journal
- **Cross-repo**: Manual copy required since AI tools work within single repository only

---

## Previous Context
- Phase 1 goal: Analyze Angular project for routes with `data.menuId`
- Service catalog: First step completed
- Recursive analysis: Planned for components and services
- Working without ts-morph: Using basic TypeScript parsing
