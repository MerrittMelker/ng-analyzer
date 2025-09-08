/*
  MethodUsageCollector
  --------------------
  Aggregates method names invoked on candidate instance members (and constructor-only params)
  within a component class body.

  Detection strategy (Phase 1)
  - Prefer a quick/robust text match for optional chaining and standard property access:
      this.<prop>?.<method>(...)  |  this.<prop>.<method>(...)
  - In constructor bodies, also match bare identifiers for ctor-only params:
      <id>?.<method>(...)        |  <id>.<method>(...)
  - Fall back to AST checks for strict property access cases to reduce false negatives.

  Limitations (by design, Phase 1)
  - Does not follow aliases (e.g., const s = this.svc) or destructured methods.
  - Only the immediate method on the instance is captured; deeper chains are ignored.
  - Template-driven usage is out of scope.
*/
import { SyntaxKind } from 'ts-morph';

export type InstanceRecord = { propertyName: string; typeName: string; methods: Set<string> };

/**
 * Walks all methods/accessors/constructor in the class and aggregates method names
 * invoked on the discovered instances.
 *
 * Inputs
 * - cls: the component class node
 * - instancesMap: map of candidate instance members (mutated in-place to add methods)
 * - ctorOnlyParamsMap: map of constructor-only identifiers (mutated in-place in constructor scope)
 */
export function collectInstanceMethodUsages(
  cls: any,
  instancesMap: Map<string, InstanceRecord>,
  ctorOnlyParamsMap?: Map<string, InstanceRecord>,
): void {
  const instanceNames = new Set(instancesMap.keys());
  const ctorOnlyNames = new Set(ctorOnlyParamsMap ? ctorOnlyParamsMap.keys() : []);
  const methodContainers = [
    ...cls.getMethods(),
    ...cls.getGetAccessors(),
    ...cls.getSetAccessors(),
    ...cls.getConstructors(),
  ];

  for (const mc of methodContainers) {
    const isCtor = mc.getKind() === SyntaxKind.Constructor;
    mc.forEachDescendant((node: any) => {
      if (node.getKind() !== SyntaxKind.CallExpression) return;
      const callExpr: any = node;
      const expr = callExpr.getExpression();
      const exprText = expr.getText();

      // Fast path via text: this.prop?.method(...)
      const match = /this\.(\w+)\??\.(\w+)\s*\(/.exec(exprText);
      if (match) {
        const propName = match[1];
        const methodName = match[2];
        if (instanceNames.has(propName) && methodName) {
          const rec = instancesMap.get(propName)!;
          rec.methods.add(methodName);
        }
        return; // done with this call expression
      }

      // Constructor-only params: identifier?.method(...)
      if (isCtor) {
        const idMatch = /^(?:\s*)?(\w+)\??\.(\w+)\s*\(/.exec(exprText);
        if (idMatch) {
          const idName = idMatch[1];
          const methodName = idMatch[2];
          if (ctorOnlyNames.has(idName)) {
            const rec = ctorOnlyParamsMap!.get(idName)!;
            rec.methods.add(methodName);
            return;
          }
        }
      }

      // AST fallback for strict property access: this.instance.method()
      if (expr.getKind() === SyntaxKind.PropertyAccessExpression) {
        const pa = expr.asKindOrThrow(SyntaxKind.PropertyAccessExpression);
        const left = pa.getExpression();
        const methodName = pa.getName();

        // this.instance.method()
        if (left.getKind() === SyntaxKind.PropertyAccessExpression) {
          const leftPA = left.asKindOrThrow(SyntaxKind.PropertyAccessExpression);
          const leftObj = leftPA.getExpression();
          const leftName = leftPA.getName();
          if (leftObj.getKind() === SyntaxKind.ThisKeyword && instanceNames.has(leftName)) {
            const rec = instancesMap.get(leftName)!;
            rec.methods.add(methodName);
            return;
          }
        }

        // constructor-only: identifier.method()
        if (isCtor && left.getKind() === SyntaxKind.Identifier) {
          const idName = left.getText();
          if (ctorOnlyNames.has(idName)) {
            const rec = ctorOnlyParamsMap!.get(idName)!;
            rec.methods.add(methodName);
            return;
          }
        }
      }
    });
  }
}
