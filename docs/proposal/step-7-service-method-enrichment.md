# Step 7 — Service Method Enrichment (Direct vs Propagated Usage)

Status: Draft
Depends on: Steps 1–6 outputs.
Objective: Optionally add tn‑api services that are *structurally reachable* (injected in the chain) but have **no directly observed method calls**, and label each service entry with how it was observed.

## Why This Exists (Plain Explanation)
Up to Step 4 you only see services whose methods are *actually called* in code like:
```
this.userService.get()
```
If a component (or any injected wrapper) never calls a tn-api service method, that service is invisible so far. Sometimes you still care that the service is injected (it is a structural dependency and a potential future caller or risk surface) even if no method call appears in the current snapshot.

Common wrapper / indirection patterns that hide usage:
1. Pure pass‑through storage:
   ```ts
   export class OrderStore {
     constructor(private userService: UserService) {}
     // No direct userService.get() call yet
   }
   ```
2. Deferred / external trigger (runtime side effect elsewhere):
   ```ts
   startStream() { return this.userService.stream$; } // Actual service methods subscribed later
   ```
3. Passing method references (not captured in earlier phases):
   ```ts
   scheduleTask(this.userService.get); // Indirect, we didn't record a call expression
   ```
4. Factory / exposure only:
   ```ts
   get api() { return this.userService; } // Downstream consumer calls it outside analyzed classes
   ```
In all of these, Step 4 output omits UserService (no explicit call). Step 7 lets you *optionally* surface it anyway, clearly labeled so you can distinguish facts (direct calls) from structural possibilities (propagated/injected).

## What This Does (and Does NOT Do)
Does:
- Add tn-api services that were injected anywhere in the traversed class graph but had zero recorded method calls.
- Optionally add a placeholder method token (e.g. `__injected`) if you choose the aggressive mode.
- Tag each service with origin: direct | propagated | mixed.

Does NOT:
- Guess actual method names that were never called.
- Perform deep dataflow or subscribe analysis.
- Inspect runtime Observables or side effects.

## Definitions
Direct Call: At least one explicit call expression captured earlier (e.g. `this.userService.load()`).
Propagated Service: A tn-api service reachable via injection edges from a menuId root but with zero explicit calls recorded in any visited class.
Mixed: A service first added via propagation, later also found to have direct calls (e.g., after code changes or multi-pass updates).

## Modes
- `--propagate none` (default): Keep Step 4 behavior (only direct calls).  (No enrichment.)
- `--propagate inject`: Add structurally present tn-api services with no methods (empty list) marked origin=propagated.
- `--propagate all`: Same as inject, but add a synthetic placeholder method name (e.g. `__injected`) so downstream tooling can count them distinctly.

## Output Augmentation
Each service entry becomes:
```
{
  "key": "...#UserService",
  "name": "UserService",
  "methods": ["get"],
  "origin": "direct" | "propagated" | "mixed"
}
```
Rules:
- Direct only: origin = direct
- Propagated only: origin = propagated (methods [] or ["__injected"] depending on mode)
- Both: origin = mixed

## Algorithm (Applied AFTER Step 4 Aggregation)
For each menuId:
1. Collect visitedClasses from traversal (already available).
2. Build set directServices = keys present from direct calls.
3. For every visited class C:
   - For each injected dependency D that is a tn-api service:
     - If D ∉ directServices and not already added via propagation:
       - inject mode: add entry (methods = [], origin=propagated)
       - all mode: add entry (methods = ["__injected"], origin=propagated)
4. If a service later gains direct methods in a subsequent run: merge methods; update origin to mixed; drop placeholder if present.

## Example
Graph:
```
MenuId 12
RootComponent -> OrderStore -> OrderService -> DataOrderService (tn-api)
```
Code:
```
class OrderService { constructor(private dataOrderService: DataOrderService) {} }
class OrderStore { constructor(private orderService: OrderService) {} }
class RootComponent { constructor(private orderStore: OrderStore) {} }
```
No method calls on dataOrderService anywhere.
- Step 4 output: (services array is empty)
- Step 7 with --propagate inject: DataOrderService appears with methods [] origin=propagated
- Step 7 with --propagate all: DataOrderService appears with methods ["__injected"] origin=propagated

If later someone adds:
```
class OrderService {
  load() { return this.dataOrderService.fetchAll(); }
}
```
Then after re-run:
- Step 4 adds DataOrderService.fetchAll (origin direct)
- Step 7 (any mode) merges: methods ["fetchAll"] origin=direct (placeholder removed if previously present)

## Diagnostics
- `propagation-limit-hit:<menuId>` (optional if a menuId would add more than configured max)

## Flags
- `--propagate <none|inject|all>`
- `--propagate-max <n>` (cap total propagated services per menuId; skip extras)

## Testing Matrix
Case: Wrapper injects tn-api, no call
- none: service absent
- inject: present, methods [] origin=propagated
- all: present, methods ["__injected"] origin=propagated

Case: Wrapper injects tn-api, later a direct call added
- any mode: methods list includes real method(s), origin direct (or mixed if placeholder temporarily persisted within the same run pipeline)

## Deferred Enhancements
- More precise inference (e.g., detect property access `this.userService.someObservable` feeding usage downstream).
- Confidence scoring (direct=1.0, propagated=0.3, etc.).
- Configurable placeholder name (default `__injected`).

End of Step 7.
