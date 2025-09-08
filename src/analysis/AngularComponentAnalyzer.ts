/*
  AngularComponentAnalyzer
  ------------------------
  Purpose: Analyze a single Angular @Component class within a TypeScript file using ts-morph.

  High-level outputs (set on the class instance after analyze()):
  - templateFilePath?: absolute path to the external template if the component uses templateUrl
  - inlineTemplate?: inline template string if the component uses the 'template' property
  - matchedModuleSpecifiers: which import module specifiers matched the provided targetModules
  - importsFromTargetModules: the local names imported from those matched modules (named/default/namespace identifiers)
  - serviceInstancesFromTargetModules: summary of component members (properties) whose types originate from targetModules,
    including the unique set of method names invoked on them anywhere within the component class body
  - allMethodsUsedOnTargetInstances: union of all method names across those instances

  Inputs (AngularComponentAnalyzerInput):
  - sourceFilePath: path to the .ts file to analyze
  - componentClassName: the exact name of the component class (must be decorated with @Component)
  - targetModules?: string[] of module specifiers to inspect (no defaults)

  Notes:
  - Only the specified class is analyzed (even if the source file contains more classes).
  - For targetModules, we capture named imports (and aliases), default imports, and namespace imports.
  - Component members originating from these modules are discovered via constructor parameter properties
    (public/protected/private) and class properties with type annotations.
  - Method discovery is summary-only: unique method names invoked on those member instances; no per-callsite metadata.
  - Optional chaining on instance access (this.prop?.method()) is supported via a tolerant regex on the callee expression text.
  - Standard property access (this.prop.method()) is additionally handled via strict AST checks.
  - We do not analyze across files or follow returned values in this phase.
*/
import { Project } from 'ts-morph';
// Removed unused 'path' import after refactor to ComponentLoader
// import * as path from 'path';
import { getSharedProject } from './ProjectHost';
import { collectTargetImportsForFile } from './indexes/ImportMatcher';
import { getComponentClass, extractTemplateInfo } from './parsing/ComponentLoader';
import { collectTargetInstances, collectCtorOnlyParams, InstanceRecord as ScannerInstanceRecord } from './collectors/ClassMemberScanner';
import { collectInstanceMethodUsages, InstanceRecord as CollectorInstanceRecord } from './collectors/MethodUsageCollector';

export interface AngularComponentAnalyzerInput {
  /** Absolute or relative path to the .ts file containing the component class. */
  sourceFilePath: string;
  /** Exact class name of the component to analyze (must have an @Component decorator). */
  componentClassName: string;
  /**
   * Optional list of module specifiers (e.g., ['@angular/core', 'some-lib']).
   * If empty/omitted, method/member analysis is skipped; template and import scanning still runs.
   */
  targetModules?: string[]; // modules to look for in import declarations
}

/**
 * Orchestrates a single-pass, per-component analysis (Phase 1):
 * - Loads the file/class, validates @Component, and extracts minimal template info.
 * - Finds imports that originate from the caller-provided module specifiers.
 * - Identifies candidate instances (properties/ctor props) whose types match those imports.
 * - Aggregates unique method names invoked on those instances anywhere inside the class body.
 *
 * Outputs are stored on the instance for easy consumption by callers and tests.
 */
export class AngularComponentAnalyzer {
  // --- Configuration (from input) ---
  /** Absolute path to the component source file; relative paths are resolved by the shared Project. */
  sourceFilePath: string;
  /** Exact class name of the target @Component in the file. */
  componentClassName: string;
  /** Caller-provided module specifiers; controls import/member/method discovery. */
  targetModules: string[];

  // --- Primary results ---
  /** Resolved absolute path if templateUrl is used; undefined if inline template or not found. */
  templateFilePath?: string;
  /** Template string if inline template is used; undefined if templateUrl is used or not found. */
  inlineTemplate?: string;
  /** Local names imported from target modules (named import aliases, default names, namespace identifiers). */
  importsFromTargetModules: string[] = [];
  /** Which import module specifiers in this file matched the provided targetModules. */
  matchedModuleSpecifiers: string[] = [];

  // --- Module member usage summary (Phase 1) ---
  /**
   * Per-instance summary for component members originating from targetModules.
   * - propertyName: class property name (e.g., aliasesService)
   * - typeName: local imported type name (or the right side of a namespace-qualified type, e.g., Api.Service -> Service)
   * - methodsUsed: unique, sorted list of method names invoked on this property anywhere in the class
   */
  serviceInstancesFromTargetModules: Array<{ propertyName: string; typeName: string; methodsUsed: string[] }> = [];
  /** Unique, sorted union of all method names across serviceInstancesFromTargetModules. */
  allMethodsUsedOnTargetInstances: string[] = [];

  constructor(input: AngularComponentAnalyzerInput) {
    this.sourceFilePath = input.sourceFilePath;
    this.componentClassName = input.componentClassName;
    // Normalize targetModules to an array; empty array disables member/method analysis.
    this.targetModules = Array.isArray(input.targetModules) ? input.targetModules : [];
  }

  /**
   * Runs the full per-component analysis. Safe to call multiple times; internal state is reset on each run.
   *
   * Steps
   * 1) Load SourceFile via shared Project (adds if missing; refreshes otherwise).
   * 2) Collect imports from the specified modules (named/default/namespace).
   * 3) Resolve the component class and verify it is decorated with @Component.
   * 4) Extract templateUrl/inline template metadata for reference.
   * 5) If targetModules is empty, exit early (template/imports are still populated).
   * 6) Discover candidate instances (ctor param properties and typed class properties) and ctor-only params.
   * 7) Traverse class bodies to aggregate unique method names invoked on those instances.
   * 8) Finalize per-instance and union summaries.
   */
  analyze(): void {
    const project: Project = getSharedProject();
    const sourceFile = this.loadSourceFile(project);
    if (!sourceFile) return; // file missing or unreadable

    this.resetState();

    // 2) Import scan (limited strictly to provided module specifiers)
    const imports = collectTargetImportsForFile(sourceFile as any, this.targetModules);
    const importedLocalNames = imports.importedLocalNames;
    const namespaceLocalNames = imports.namespaceLocalNames;
    this.matchedModuleSpecifiers = imports.matchedModuleSpecifiers;
    this.importsFromTargetModules = imports.importsFromTargetModules;

    // 3) Locate the specific component class
    const cls = getComponentClass(sourceFile as any, this.componentClassName);
    if (!cls) return; // not found or not decorated with @Component

    // 4) Template metadata (inline or external path)
    const tplInfo = extractTemplateInfo(cls, this.sourceFilePath);
    this.templateFilePath = tplInfo.templateFilePath;
    this.inlineTemplate = tplInfo.inlineTemplate;

    // 5) Early exit when there are no target modules specified
    if (!this.targetModules.length) return;

    // 6) Instance discovery (properties + constructor-only params)
    const instancesMap = collectTargetInstances(cls, importedLocalNames, namespaceLocalNames);
    const ctorOnlyParamsMap = collectCtorOnlyParams(cls, importedLocalNames, namespaceLocalNames);

    if (!instancesMap.size && !ctorOnlyParamsMap.size) {
      // No candidates => no methods; still keep template/import data
      this.serviceInstancesFromTargetModules = [];
      this.allMethodsUsedOnTargetInstances = [];
      return;
    }

    // 7) Method aggregation across all class bodies
    collectInstanceMethodUsages(
      cls,
      instancesMap as Map<string, CollectorInstanceRecord>,
      ctorOnlyParamsMap as Map<string, CollectorInstanceRecord>,
    );

    // 8) Finalize and sort for stable output
    this.finalizeSummaries(instancesMap, ctorOnlyParamsMap);
  }

  // --- private helpers ---

  /**
   * Loads and returns the ts-morph SourceFile, adding it to the shared Project if necessary.
   * Refreshes from disk when already present to avoid stale content.
   */
  private loadSourceFile(project: Project) {
    let sourceFile = project.getSourceFile(this.sourceFilePath);
    if (!sourceFile) {
      try {
        sourceFile = project.addSourceFileAtPath(this.sourceFilePath);
      } catch {
        return undefined; // could not load
      }
    } else {
      try {
        sourceFile.refreshFromFileSystemSync();
      } catch {
        /* ignore transient fs errors */
      }
    }
    return sourceFile;
  }

  /** Resets all output fields so repeated calls to analyze() start from a clean slate. */
  private resetState(): void {
    this.templateFilePath = undefined;
    this.inlineTemplate = undefined;
    this.importsFromTargetModules = [];
    this.matchedModuleSpecifiers = [];
    this.serviceInstancesFromTargetModules = [];
    this.allMethodsUsedOnTargetInstances = [];
  }

  /**
   * Converts the working instances map to stable arrays and computes the union of all method names.
   * Sorting is applied to keep outputs deterministic across runs.
   */
  private finalizeSummaries(
    instancesMap: Map<string, ScannerInstanceRecord>,
    ctorOnlyParamsMap?: Map<string, ScannerInstanceRecord>,
  ): void {
    const values = [
      ...Array.from(instancesMap.values()),
      ...(ctorOnlyParamsMap ? Array.from(ctorOnlyParamsMap.values()) : []),
    ];

    // Convert Set<string> -> string[] and sort
    const instances = values.map((i) => ({
      propertyName: i.propertyName,
      typeName: i.typeName,
      methodsUsed: Array.from(i.methods).sort(),
    }));

    const allMethods = new Set<string>();
    for (const i of instances) for (const m of i.methodsUsed) allMethods.add(m);

    this.serviceInstancesFromTargetModules = instances;
    this.allMethodsUsedOnTargetInstances = Array.from(allMethods).sort();
  }
}
