# Assistant Context

This document is the source of truth for how automated coding agents should work in this repository. It captures goals, commands, guardrails, and conventions. Keep it concise and up to date.

## Project goals and scope
- Analyze Angular-style component files using ts-morph to extract:
  - Template info (inline vs external path)
  - Imports from specified target modules
  - Instances whose types originate from target modules and the set of methods used on them
- Phase 1 focuses on single-file, single-class analysis (no cross-file graph traversal).

## Tech stack
- Language: TypeScript (TS 5.x)
- Runtime: Node.js (current LTS)
- Tests: Jest + babel-jest (TypeScript via @babel/preset-typescript)
- AST tooling: ts-morph

## Canonical commands
- Install: `npm install`
- Tests: `npm test`
- Watch tests: `npm run test:watch`
- Type-check (no emit): `npm run typecheck`
- Build: `npm run build`
- CLI (local analysis): `npm run analyze` or `ts-node src/cli/analyze.ts`

## Guardrails for automation
- Autonomy: The assistant may edit files and run commands without prompting.
- Safety: Avoid destructive changes (deleting files, rewriting large files) unless explicitly requested; prefer additive edits.
- Secrets: Do not add, read, or exfiltrate secrets. Don’t fetch network resources.
- Scope: Keep changes within the repo; don’t make breaking API changes unless tests/specs are updated accordingly.
- Performance: Keep test runs under ~5s locally; avoid adding heavy deps or long-running steps.

## Coding standards
- TypeScript: prefer explicit types on public APIs; keep strict mode friendly.
- Tests: keep them fast and deterministic; prefer unit tests over integration.
- Imports: use relative paths within repo; no path aliases unless configured.
- Style: follow existing conventions; keep diffs focused and minimal.

## Test expectations
- All Jest tests must pass locally (`npm test`).
- Avoid executing Angular runtime tests; fixtures under `__tests__/fixtures/` are for static analysis only and are excluded via Jest config.
- Add tests when changing public behavior.

## CI and constraints
- Jest config uses babel-jest with TypeScript; decorators in fixtures are parsed only as source text by ts-morph, not executed.
- If CI is added later, replicate `npm ci && npm test && npm run typecheck`.

## Repository layout (partial)
- `src/analysis`: core analyzer and helpers
- `__tests__/src/analysis`: unit tests
- `__tests__/fixtures`: sample component sources used as inputs to analysis (not executed)
- `docs/`: design docs and this context file

## Assumptions
- Inputs to analyzers are well-formed TS files; analyzer should fail softly if the class or decorator isn’t found.
- Target modules are provided explicitly by callers.

## Evolution of this document
- Keep this file short. Update when commands, guardrails, or structure change.

## Automation mode
- Non-interactive by default: the assistant proceeds without confirmations for safe operations (edit, test, typecheck, build).
- Repo signal: `.assistant/agent.json` with `{"autonomy":"full","interaction":"non-interactive"}` communicates this preference to agents.
- Still ask for confirmation only for destructive or security-sensitive actions (publish, release, bulk deletes, secrets).
