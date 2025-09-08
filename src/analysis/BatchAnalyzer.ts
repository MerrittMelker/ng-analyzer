import { AngularComponentAnalyzer } from './AngularComponentAnalyzer';

/**
 * Input item describing a single per-component analysis request.
 * - sourceFilePath: absolute or repo-relative path to the component file
 * - componentClassName: exact name of the @Component class to analyze
 * - menuItemId: passthrough correlation id for callers (not used by the analyzer)
 * - targetModules?: explicit list of module specifiers to match import sources
 */
export interface ComponentAnalysisItem {
  sourceFilePath: string;
  componentClassName: string;
  menuItemId: number;
  targetModules?: string[];
}

/**
 * Minimal result for Phase 1 batch runs. Mirrors key fields from AngularComponentAnalyzer
 * so batch consumers don’t need to reference the analyzer instance directly.
 */
export interface ComponentAnalysisResult extends ComponentAnalysisItem {
  templateFilePath?: string;
  inlineTemplate?: string;
  importsFromTargetModules?: string[];
  matchedModuleSpecifiers?: string[];
}

/**
 * Runs per-component analysis across a set of items using the AngularComponentAnalyzer orchestrator.
 *
 * Behavior (Phase 1)
 * - Each item is analyzed independently (no cross-item state).
 * - If an item omits targetModules or passes an empty array, only template/import info is produced.
 * - Returns a shallow result object combining the original item with key analyzer outputs.
 */
export function analyzeComponents(items: ComponentAnalysisItem[]): ComponentAnalysisResult[] {
  return items.map((item) => {
    const analyzer = new AngularComponentAnalyzer({
      sourceFilePath: item.sourceFilePath,
      componentClassName: item.componentClassName,
      targetModules: item.targetModules,
    });
    analyzer.analyze();
    return {
      ...item,
      templateFilePath: analyzer.templateFilePath,
      inlineTemplate: analyzer.inlineTemplate,
      importsFromTargetModules: analyzer.importsFromTargetModules,
      matchedModuleSpecifiers: analyzer.matchedModuleSpecifiers,
    };
  });
}
