/*
  ClassMemberScanner
  ------------------
  Finds candidate service instances in a component class based on declared types
  originating from caller-specified modules.

  What we consider a candidate in Phase 1
  - Constructor parameter properties (have a scope modifier -> become class fields)
  - Class property declarations with explicit type annotations

  Matching rules
  - Direct name match: the type text equals a local imported identifier (named/default imports)
  - Namespace-qualifed: Left.Right where Left is a namespace alias imported from a target module

  Output shape
  - Map keyed by property/identifier name -> { propertyName, typeName, methods: Set<string> }
  - methods Set is mutated by the MethodUsageCollector during aggregation
*/

export type InstanceRecord = { propertyName: string; typeName: string; methods: Set<string> };

/**
 * Scans for constructor parameter properties and class properties whose declared types
 * match a symbol imported from the caller-provided target modules.
 */
export function collectTargetInstances(
  cls: any,
  importedLocalNames: Set<string>,
  namespaceLocalNames: Set<string>,
): Map<string, InstanceRecord> {
  const instancesMap = new Map<string, InstanceRecord>();

  // 1) Constructor parameter properties become class members when they have a scope
  const ctor = cls.getConstructors()[0];
  if (ctor) {
    for (const p of ctor.getParameters()) {
      if (!p.getScope()) continue; // only parameter properties
      const typeNode = p.getTypeNode();
      const typeText = typeNode?.getText() ?? p.getType().getText();
      if (!typeText) continue;

      const match = matchType(typeText, importedLocalNames, namespaceLocalNames);
      if (!match) continue;

      const propName = p.getName();
      if (!instancesMap.has(propName)) {
        instancesMap.set(propName, { propertyName: propName, typeName: match, methods: new Set<string>() });
      }
    }
  }

  // 2) Class property declarations with type annotations
  for (const prop of cls.getProperties()) {
    const typeNode = prop.getTypeNode();
    const typeText = typeNode?.getText();
    if (!typeText) continue;

    const match = matchType(typeText, importedLocalNames, namespaceLocalNames);
    if (!match) continue;

    const propName = prop.getName();
    if (!instancesMap.has(propName)) {
      instancesMap.set(propName, { propertyName: propName, typeName: match, methods: new Set<string>() });
    }
  }

  return instancesMap;
}

/**
 * Collects constructor parameters that are NOT parameter properties but whose types
 * come from target modules. These exist only inside the constructor body scope.
 */
export function collectCtorOnlyParams(
  cls: any,
  importedLocalNames: Set<string>,
  namespaceLocalNames: Set<string>,
): Map<string, InstanceRecord> {
  const map = new Map<string, InstanceRecord>();
  const ctor = cls.getConstructors()[0];
  if (!ctor) return map;

  for (const p of ctor.getParameters()) {
    if (p.getScope()) continue; // skip parameter properties
    const typeNode = p.getTypeNode();
    const typeText = typeNode?.getText() ?? p.getType().getText();
    if (!typeText) continue;

    const match = matchType(typeText, importedLocalNames, namespaceLocalNames);
    if (!match) continue;

    const name = p.getName();
    if (!map.has(name)) {
      map.set(name, { propertyName: name, typeName: match, methods: new Set<string>() });
    }
  }

  return map;
}

/**
 * Determines whether the given type text corresponds to either a direct imported local name
 * or a namespace-qualified name where the left side is an imported namespace alias.
 */
function matchType(
  typeText: string,
  importedLocalNames: Set<string>,
  namespaceLocalNames: Set<string>,
): string | null {
  if (importedLocalNames.has(typeText)) return typeText;
  const parts = typeText.split('.');
  if (parts.length === 2 && namespaceLocalNames.has(parts[0])) return parts[1];
  return null;
}
