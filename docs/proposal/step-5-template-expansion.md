# Step 5 — Template Expansion (Component Child Discovery)

Status: Draft
Depends on: Step 2 (class index), optionally Step 3 (menu roots) & Step 4 (aggregation) for end-to-end usage.
Objective: Enlarge the set of components associated with each menuId by including components referenced via element selectors in templates of already-associated components.

## Scope (Element Selectors Only)
Included:
- Plain element selectors from component `selector` metadata (e.g. `child-comp`, `lib-widget`).
- Multi-selector declarations split on commas (e.g. `selector: 'a-comp, b-comp'`).
Excluded (Deferred):
- Attribute selectors (`[foo]`)
- Structural directive selectors (`*ifSomething`)
- Class selectors (`.someClass`)
- Complex selectors with combinators or attribute conditions (`button[foo]`, etc.)

## Data Required
- classIndex (must contain `selector` and optionally `template.inline` / `template.file` entries for components)
- selectorIndex: built once: `tagName -> Set<classKey>` (only element selectors — exclude any selector with `[`, `*`, `.`, space)

## Algorithm (Per menuId)
1. Start with existing component set S (roots or previously expanded).
2. For each component C in S:
   - Obtain template string (inline or load external file contents).
   - Extract candidate tags via regex: `<([a-zA-Z0-9-]+)\b`.
   - For each tag T:
     - Lookup selectorIndex[T]; for each matched component K not in S, add K to S' (new additions set).
3. Repeat (BFS style) until an iteration adds no new components or safety limit reached.
4. Union tnApiCalls from newly added components into menuId aggregation in a subsequent Step 4 re-run or incremental update.

## Safety Limits
- maxTemplateComponentsPerMenuId (default 500; abort expansion for that menuId if exceeded)
- maxTotalTemplateAdds (global cap; optional)

## Output Adjustments
This step does not change schema versions directly; it influences the component set feeding Step 4.
Optionally emit an auxiliary JSON:
```
{
  "schemaVersion": "template-expansion-1",
  "menuIdComponentAdds": [ { "menuId": 10, "added": ["/abs/path/child.component.ts#ChildComponent"] } ],
  "limitsHit": false,
  "diagnostics": []
}
```

## Diagnostics
- template-missing:<file> (external file not found)
- template-read-error:<file>
- selector-unknown:<tag> (under --trace only)
- expansion-limit-hit:<menuId>

## Testing Strategy
Fixture: parent component template referencing one known and one unknown custom element; ensure only known is added.

## Deferred Enhancements
- Use real HTML / Angular parser for more robust extraction
- Differentiate shadowed / nested <script> or comment blocks
- Caching external template file contents across menuIds

End of Step 5.

