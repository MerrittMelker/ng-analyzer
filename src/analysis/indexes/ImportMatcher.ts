/*
  ImportMatcher
  -------------
  Collects local identifiers imported from the caller-specified target modules.
  Returns both simple local names (named/default) and namespace aliases.

  Why this exists
  - Later phases rely on knowing which local identifiers in the file correspond to symbols originating
    from target modules. We centralize that logic here to keep analyzers small and testable.
*/

/**
 * Result of scanning a source file's import declarations for matches to targetModules.
 * - importedLocalNames: local identifiers that represent named or default imports from target modules
 * - namespaceLocalNames: local identifiers used by namespace imports (e.g., import * as Api from 'm')
 * - matchedModuleSpecifiers: module specifiers from this file that matched targetModules
 * - importsFromTargetModules: a flat list of the local names we observed (for reporting/debugging)
 */
export interface ImportMatchResult {
  importedLocalNames: Set<string>;
  namespaceLocalNames: Set<string>;
  matchedModuleSpecifiers: string[];
  importsFromTargetModules: string[];
}

/**
 * Scans a ts-morph SourceFile for import declarations whose module specifier is in targetModules,
 * and returns the relevant local identifier information.
 *
 * Matching rules
 * - Named imports: import { Foo } from 'm'; -> 'Foo' (or alias name if present)
 * - Default import: import Foo from 'm'; -> 'Foo'
 * - Namespace import: import * as Api from 'm'; -> namespaceLocalNames includes 'Api'
 */
export function collectTargetImportsForFile(sourceFile: any, targetModules: string[]): ImportMatchResult {
  const importedLocalNames = new Set<string>();
  const namespaceLocalNames = new Set<string>();
  const matchedModuleSpecifiers: string[] = [];
  const importsFromTargetModules: string[] = [];

  const importDecls = sourceFile.getImportDeclarations();
  for (const decl of importDecls) {
    const mod = decl.getModuleSpecifierValue();
    if (!targetModules.includes(mod)) continue;

    matchedModuleSpecifiers.push(mod);

    // Named imports (respect alias if present => use local alias for downstream matching)
    for (const spec of decl.getNamedImports()) {
      const alias = spec.getAliasNode()?.getText();
      const name = alias ?? spec.getName();
      importsFromTargetModules.push(name);
      importedLocalNames.add(name);
    }

    // Default import
    const def = decl.getDefaultImport();
    if (def) {
      const name = def.getText();
      importsFromTargetModules.push(name);
      importedLocalNames.add(name);
    }

    // Namespace import (e.g., `import * as Api from 'mod'`)
    const ns = decl.getNamespaceImport();
    if (ns) {
      const name = ns.getText();
      importsFromTargetModules.push(name);
      namespaceLocalNames.add(name);
    }
  }

  return { importedLocalNames, namespaceLocalNames, matchedModuleSpecifiers, importsFromTargetModules };
}
