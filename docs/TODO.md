# TODO / Roadmap Tracker

Status legend: [ ] pending, [WIP] in progress, [x] done, [parked] deferred

## Recently Completed
- [x] Add minimal JSON schema excerpt for recursive graph output to README
- [x] Add truncated sample JSON output block to README
- [x] Provide experimental recursive CLI (`analyze-recursive`)

## High Priority (Next Up)
- [ ] Add linkable anchor (explicit heading ID) in README for the Recursive Graph JSON section
- [ ] Introduce versioned schema: add `schemaVersion` field to recursive JSON output
- [ ] Create validation script (e.g., `npm run validate-recursive -- <graph.json>`) using `ajv` (add dev dep) and a generated JSON Schema file
- [ ] Separate `docs/json-schema.md` with full (expanded) recursive graph schema and change log
- [ ] Add stability badge(s) in README (e.g., Experimental / Unstable)

## Recursive Analyzer Enhancements
- [ ] Attribute selector support (e.g., `[focusTrap]`, bare attribute usage, `[foo]=""`)
- [ ] Structural directive support (`*ngIf`, `*ngFor`, custom `*myDirective`) mapping to underlying directive selectors
- [ ] Class selector support (e.g., `.someClass`) — optional / opt-in to avoid noise
- [ ] Route-based root component discovery (parse routing configs to auto-seed roots)
- [ ] Enhanced service analysis: gather method usage inside service classes (not only components)
- [ ] Performance: build a persistent selector & class dependency index to avoid repeated per-file scans
- [ ] Option to limit graph traversal by file glob / directory allowlist
- [ ] Option to include external (node_modules) service stubs as lightweight nodes (flagged `external: true`)
- [ ] Add cycle reporting (list strongly connected components separately)
- [ ] Output graph in DOT / GraphML / Mermaid for visualization (`--format dot|mermaid|json`)

## Template Parsing & Accuracy
- [ ] Switch from regex tag extraction to a lightweight HTML/Angular template tokenizer (evaluate Angular compiler parser or a minimal HTML parser)
- [ ] Handle inline multi-line templates more robustly (retain original formatting where feasible)
- [ ] Detect false positives: filter out Web Components / native custom elements if a local Angular component with same tag doesn’t exist

## Quality & Tooling
- [ ] Add unit tests for CLI argument parsing (analyze-recursive)
- [ ] Add snapshot test (or golden file) for a small recursive graph JSON output
- [ ] Add schema validation in CI (when CI pipeline exists) to guard against breaking output format unintentionally
- [ ] Add performance benchmark script (measure traversal time & node count) to watch regressions

## Documentation
- [ ] Expand README with guidance on interpreting edges and node heuristics
- [ ] Add troubleshooting section (empty graph, missing components, truncated traversal)
- [ ] Provide examples of multi-root invocation strategies
- [ ] Provide a migration note when schemaVersion increments

## Nice-to-Have / Future
- [ ] Support incremental graph diff (compare two runs & show added/removed nodes/edges)
- [ ] Add `--filter-method <regex>` to only retain nodes where matching methods are called
- [ ] Provide optional output pruning (remove nodes with zero edges or empty method usage, except roots)
- [ ] Provide plugin hook interface (user-supplied JS file to post-process the result)
- [ ] Emit provenance metadata (timestamp, tool versions, ts-morph version) in JSON output

## Deferred / Parked (Revisit Later)
- [ ] Multi-language / hybrid project scanning
- [ ] Full Angular module resolution + provider scope modeling

## Cross-References
- See `docs/architecture.md` (Phase 2 Prototype & Future Enhancements) for narrative context.
- README contains the current public-facing feature set and examples.

---
Generated initial TODO list; update statuses as work progresses.

