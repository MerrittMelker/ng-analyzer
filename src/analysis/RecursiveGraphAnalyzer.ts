import { Project, ClassDeclaration, Decorator, SourceFile, SyntaxKind } from 'ts-morph';
import * as path from 'path';
import { AngularComponentAnalyzer } from './AngularComponentAnalyzer';
import { getSharedProject } from './ProjectHost';

// ---- Public experimental interfaces ----
export interface RecursiveAnalysisRoot {
  sourceFilePath: string;
  componentClassName: string;
  targetModules?: string[]; // optional override per root; if omitted global targetModules is used
}

export interface RecursiveAnalysisRequest {
  roots: RecursiveAnalysisRoot[];
  targetModules?: string[]; // default target modules applied when a root omits them
  maxDepth?: number; // safety cap for breadth-first expansion
  maxNodes?: number; // global node count cap
  includeAttributes?: boolean; // future use, currently only element selectors
}

export type DiscoveryReason = 'root' | 'template-tag' | 'injects';

export interface DiscoveryEdge {
  from: { file: string; className: string };
  to: { file: string; className: string };
  reason: DiscoveryReason;
}

export interface GraphInstanceSummary {
  propertyName: string; typeName: string; methodsUsed: string[];
}

export interface GraphNode {
  kind: 'component' | 'service';
  file: string;
  className: string;
  selector?: string; // components only
  direct?: {
    instances: GraphInstanceSummary[];
    allMethodsUsed: string[];
    template?: { inline?: string; filePath?: string };
  };
  serviceHeuristics?: string[]; // services only
  external?: boolean; // true if not in project (placeholder)
  diagnostics?: string[];
}

export interface RecursiveAnalysisResult {
  nodes: GraphNode[];
  edges: DiscoveryEdge[];
  aggregate: {
    allMethodsUsed: string[]; // union of all component methods used
  };
  diagnostics: string[];
  limits: { maxDepth: number; maxNodes: number; truncated: boolean };
}

// ---- Implementation ----
interface QueueItem { file: string; className: string; depth: number; reason: DiscoveryReason; }

export class RecursiveGraphAnalyzer {
  private project: Project;
  private selectorIndexBuilt = false;
  private selectorToComponent: Map<string, { file: string; className: string; selector: string }[]> = new Map();

  constructor(project?: Project) {
    this.project = project || getSharedProject();
  }

  analyze(req: RecursiveAnalysisRequest): RecursiveAnalysisResult {
    const maxDepth = req.maxDepth ?? Infinity;
    const maxNodes = req.maxNodes ?? 500;

    const visited = new Set<string>();
    const nodes: GraphNode[] = [];
    const edges: DiscoveryEdge[] = [];
    const diagnostics: string[] = [];

    // Pre-load root files so they are available for selector indexing.
    for (const r of req.roots) {
      const abs = path.resolve(r.sourceFilePath);
      let sf = this.project.getSourceFile(abs);
      if (!sf) {
        try { sf = this.project.addSourceFileAtPath(abs); } catch { /* ignore */ }
      }
      if (sf) this.preloadRelativeImports(sf, 0, 2); // shallow preload to capture component/service neighbors
    }

    // Additionally, load sibling TypeScript files (components/services) in root directories for selector discovery.
    const rootDirs = Array.from(new Set(req.roots.map(r => path.dirname(path.resolve(r.sourceFilePath)))));
    for (const dir of rootDirs) {
      try {
        // Load *.component.ts and *.service.ts plus any direct .ts files in that directory.
        this.project.addSourceFilesAtPaths([
          path.join(dir, '*.component.ts'),
          path.join(dir, '*.service.ts'),
          path.join(dir, '*.ts')
        ]);
      } catch { /* ignore */ }
    }
    // Build initial selector index.
    this.buildSelectorIndex(true);

    const queue: QueueItem[] = [];
    for (const root of req.roots) {
      queue.push({ file: path.resolve(root.sourceFilePath), className: root.componentClassName, depth: 0, reason: 'root' });
    }

    while (queue.length) {
      const item = queue.shift()!;
      const key = this.nodeKey(item.file, item.className);
      if (visited.has(key)) continue;
      if (nodes.length >= maxNodes) {
        diagnostics.push(`Node limit ${maxNodes} reached; traversal truncated.`);
        break;
      }
      if (item.depth > maxDepth) continue;
      visited.add(key);

      const sourceFile = this.tryLoadFile(item.file);
      if (!sourceFile) {
        diagnostics.push(`File not found: ${item.file}`);
        continue;
      }
      // Re-index this file if new component selectors appear.
      this.buildSelectorIndex(false, sourceFile);

      const cls = sourceFile.getClass(item.className);
      if (!cls) {
        diagnostics.push(`Class ${item.className} not found in ${item.file}`);
        continue;
      }

      const isComponent = this.hasDecorator(cls, 'Component');
      let node: GraphNode;
      if (isComponent) {
        node = this.analyzeComponentNode(cls, item.file, item.className, this.resolveTargetModulesForRoot(req, item));
        const templateText = node.direct?.template?.inline || this.readExternalTemplate(node.direct?.template?.filePath);
        if (templateText) {
          const selectors = this.extractElementSelectorsFromTemplate(templateText);
          for (const sel of selectors) {
            const comps = this.selectorToComponent.get(sel);
            if (comps) {
              for (const comp of comps) {
                const compKey = this.nodeKey(comp.file, comp.className);
                edges.push({ from: { file: item.file, className: item.className }, to: { file: comp.file, className: comp.className }, reason: 'template-tag' });
                if (!visited.has(compKey)) {
                  queue.push({ file: comp.file, className: comp.className, depth: item.depth + 1, reason: 'template-tag' });
                }
              }
            }
          }
        }
        const serviceDeps = this.collectInjectedClassTypes(cls);
        for (const dep of serviceDeps) {
          const depKey = this.nodeKey(dep.file, dep.className);
            edges.push({ from: { file: item.file, className: item.className }, to: { file: dep.file, className: dep.className }, reason: 'injects' });
            if (!visited.has(depKey)) {
              queue.push({ file: dep.file, className: dep.className, depth: item.depth + 1, reason: 'injects' });
            }
        }
      } else {
        node = this.analyzeServiceNode(cls, item.file, item.className);
        const serviceDeps = this.collectInjectedClassTypes(cls);
        for (const dep of serviceDeps) {
          const depKey = this.nodeKey(dep.file, dep.className);
          edges.push({ from: { file: item.file, className: item.className }, to: { file: dep.file, className: dep.className }, reason: 'injects' });
          if (!visited.has(depKey)) {
            queue.push({ file: dep.file, className: dep.className, depth: item.depth + 1, reason: 'injects' });
          }
        }
      }

      nodes.push(node);
    }

    const methodUnion = new Set<string>();
    for (const n of nodes) {
      if (n.kind === 'component' && n.direct) {
        for (const m of n.direct.allMethodsUsed) methodUnion.add(m);
      }
    }

    return {
      nodes,
      edges,
      aggregate: { allMethodsUsed: Array.from(methodUnion).sort() },
      diagnostics,
      limits: { maxDepth, maxNodes, truncated: diagnostics.some(d => d.includes('Node limit')) }
    };
  }

  // ---- Component analysis wrapper ----
  private analyzeComponentNode(cls: ClassDeclaration, file: string, className: string, targetModules: string[]): GraphNode {
    const analyzer = new AngularComponentAnalyzer({ sourceFilePath: file, componentClassName: className, targetModules });
    analyzer.analyze();
    const selector = this.getComponentSelector(cls);
    return {
      kind: 'component',
      file,
      className,
      selector: selector || undefined,
      direct: {
        instances: analyzer.serviceInstancesFromTargetModules.map(i => ({ ...i })),
        allMethodsUsed: analyzer.allMethodsUsedOnTargetInstances.slice(),
        template: analyzer.inlineTemplate || analyzer.templateFilePath ? {
          inline: analyzer.inlineTemplate,
          filePath: analyzer.templateFilePath
        } : undefined
      },
      diagnostics: []
    };
  }

  private analyzeServiceNode(cls: ClassDeclaration, file: string, className: string): GraphNode {
    const heuristics: string[] = [];
    if (this.hasDecorator(cls, 'Injectable')) heuristics.push('decorator');
    if (file.endsWith('.service.ts')) heuristics.push('filename');
    if (!heuristics.length) heuristics.push('generic');
    return {
      kind: 'service',
      file,
      className,
      serviceHeuristics: heuristics,
      diagnostics: []
    };
  }

  // ---- Helpers ----
  private resolveTargetModulesForRoot(req: RecursiveAnalysisRequest, item: QueueItem): string[] {
    // Find root record to see if it overrides targetModules
    const root = req.roots.find(r => path.resolve(r.sourceFilePath) === path.resolve(item.file) && r.componentClassName === item.className);
    if (root && root.targetModules) return root.targetModules;
    return req.targetModules || [];
  }

  private nodeKey(file: string, className: string): string { return `${path.resolve(file)}::${className}`; }

  private tryLoadFile(file: string): SourceFile | undefined {
    let sf = this.project.getSourceFile(file);
    if (!sf) {
      try { sf = this.project.addSourceFileAtPath(file); } catch { return undefined; }
    }
    return sf;
  }

  private hasDecorator(cls: ClassDeclaration, name: string): boolean {
    return cls.getDecorators().some(d => d.getName() === name);
  }

  private getComponentSelector(cls: ClassDeclaration): string | undefined {
    const deco = cls.getDecorators().find(d => d.getName() === 'Component');
    if (!deco) return undefined;
    const arg = deco.getArguments()[0];
    if (!arg || !arg.compilerNode) return undefined;
    if (arg.getKind() !== SyntaxKind.ObjectLiteralExpression) return undefined;
    const obj: any = arg;
    const prop = obj.getProperty('selector');
    if (!prop || prop.getKind() !== SyntaxKind.PropertyAssignment) return undefined;
    const initializer: any = (prop as any).getInitializer();
    if (!initializer) return undefined;
    const text = initializer.getText().trim();
    if (text.startsWith('`') || text.startsWith('"') || text.startsWith("'")) {
      return text.slice(1, -1);
    }
    return undefined;
  }

  private readExternalTemplate(filePath?: string): string | undefined {
    if (!filePath) return undefined;
    try {
      const sf = this.tryLoadFile(filePath);
      return sf?.getFullText();
    } catch { return undefined; }
  }

  private extractElementSelectorsFromTemplate(template: string): Set<string> {
    const set = new Set<string>();
    const regex = /<([a-zA-Z][\w-]*)\b/g; // naive element tag capture
    let m: RegExpExecArray | null;
    while ((m = regex.exec(template))) {
      const tag = m[1];
      if (this.isLikelyHtmlTag(tag)) continue;
      set.add(tag);
    }
    return set;
  }

  private isLikelyHtmlTag(tag: string): boolean {
    // Small allowlist of common HTML tags to reduce false positives.
    const html = new Set(['div','span','h1','h2','h3','h4','h5','h6','p','ul','li','ol','header','footer','section','article','main','nav','a','img','button','input','select','option','textarea','form','label','table','thead','tbody','tr','td','th','pre','code']);
    return html.has(tag.toLowerCase());
  }

  private collectInjectedClassTypes(cls: ClassDeclaration): Array<{ file: string; className: string }> {
    const results: Array<{ file: string; className: string }> = [];
    // Constructor params (parameter properties or regular params with explicit type)
    const ctor = cls.getConstructors()[0];
    if (ctor) {
      for (const p of ctor.getParameters()) {
        const typeNode = p.getTypeNode();
        if (!typeNode) continue;
        const type = p.getType();
        const sym = type.getSymbol();
        if (!sym) continue;
        const decl = sym.getDeclarations().find(d => d.getKind() === SyntaxKind.ClassDeclaration);
        if (!decl) continue;
        const classDecl = decl as ClassDeclaration;
        const file = classDecl.getSourceFile().getFilePath();
        const className = classDecl.getName();
        if (className) results.push({ file, className });
      }
    }
    // Class properties with explicit type
    for (const prop of cls.getProperties()) {
      const typeNode = prop.getTypeNode();
      if (!typeNode) continue;
      const type = prop.getType();
      const sym = type.getSymbol();
      if (!sym) continue;
      const decl = sym.getDeclarations().find(d => d.getKind() === SyntaxKind.ClassDeclaration);
      if (!decl) continue;
      const classDecl = decl as ClassDeclaration;
      const file = classDecl.getSourceFile().getFilePath();
      const className = classDecl.getName();
      if (className) results.push({ file, className });
    }
    // Deduplicate
    const uniq = new Map<string, { file: string; className: string }>();
    for (const r of results) uniq.set(this.nodeKey(r.file, r.className), r);
    return Array.from(uniq.values());
  }

  private buildSelectorIndex(initial: boolean, specificFile?: SourceFile): void {
    if (initial) {
      this.selectorToComponent.clear();
    }
    const files = specificFile ? [specificFile] : this.project.getSourceFiles();
    for (const sf of files) {
      for (const cls of sf.getClasses()) {
        if (!this.hasDecorator(cls, 'Component')) continue;
        const selector = this.getComponentSelector(cls);
        if (!selector) continue;
        const parts = selector.split(',').map(s => s.trim()).filter(Boolean);
        for (const part of parts) {
          if (part.startsWith('[') || part.startsWith('.')) continue;
          const key = part;
          const arr = this.selectorToComponent.get(key) || [];
          const exists = arr.some(e => e.file === sf.getFilePath() && e.className === (cls.getName() || 'default'));
          if (!exists) {
            arr.push({ file: sf.getFilePath(), className: cls.getName() || 'default', selector: part });
            this.selectorToComponent.set(key, arr);
          }
        }
      }
    }
    this.selectorIndexBuilt = true;
  }

  private preloadRelativeImports(sf: SourceFile, depth: number, maxDepth: number) {
    if (depth > maxDepth) return;
    for (const imp of sf.getImportDeclarations()) {
      const spec = imp.getModuleSpecifierValue();
      if (!spec.startsWith('.')) continue;
      const baseDir = path.dirname(sf.getFilePath());
      const fullNoExt = path.resolve(baseDir, spec);
      const candidates = [
        fullNoExt + '.ts',
        path.join(fullNoExt, 'index.ts'),
        fullNoExt // maybe already has .ts
      ];
      for (const candidate of candidates) {
        if (this.project.getSourceFile(candidate)) { continue; }
        try {
          const added = this.project.addSourceFileAtPath(candidate);
          if (added) this.preloadRelativeImports(added, depth + 1, maxDepth);
          break; // stop after first successful
        } catch { /* ignore */ }
      }
    }
  }
}
