import { Project, SyntaxKind } from 'ts-morph';
import * as path from 'path';
import * as fs from 'fs';

export interface BuildClassIndexOptions {
  projectRoot: string;
  serviceCatalog: { services: Array<{ key: string; file: string; className: string }>; schemaVersion?: string };
  captureTemplates?: boolean;
}

export interface ClassIndexCallEntry { service: string; method: string; }
export interface ClassIndexClassEntry {
  key: string;
  file: string;
  className: string;
  kind: 'component' | 'class' | 'abstract';
  injects: string[];
  tnApiCalls: ClassIndexCallEntry[];
  selector?: string;
  template?: { inline?: string; file?: string };
}

export interface ClassIndexResult {
  schemaVersion: 'class-index-1';
  servicesCatalogVersion?: string;
  classes: ClassIndexClassEntry[];
  diagnostics: string[];
}

interface ImportRecord { local: string; absPath: string; }

function collectTsFiles(root: string): string[] {
  const out: string[] = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    let entries: fs.Dirent[] = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (['node_modules','dist','.git'].includes(e.name)) continue;
        stack.push(abs);
      } else if (e.isFile() && e.name.endsWith('.ts') && !e.name.endsWith('.spec.ts')) {
        out.push(abs);
      }
    }
  }
  return out;
}

function isComponentDecoratorText(txt: string): boolean { return /@Component\s*\(/.test(txt); }

function extractComponentMetadataText(decText: string): { selector?: string; template?: { inline?: string; file?: string } } {
  const selectorMatch = /selector\s*:\s*['"]([^'"]+)['"]/m.exec(decText);
  const templateMatch = /template\s*:\s*(['`])([\s\S]*?)\1/m.exec(decText);
  const templateUrlMatch = /templateUrl\s*:\s*['"]([^'"]+)['"]/m.exec(decText);
  let template: { inline?: string; file?: string } | undefined;
  if (templateMatch) template = { inline: templateMatch[2] };
  else if (templateUrlMatch) template = { file: templateUrlMatch[1] };
  return { selector: selectorMatch?.[1], template };
}

export function buildClassIndex(options: BuildClassIndexOptions): ClassIndexResult {
  const diagnostics: string[] = [];
  const projectRoot = path.resolve(options.projectRoot);
  const serviceCatalog = options.serviceCatalog || { services: [] };
  const serviceKeyByFileAndName = new Map<string,string>();
  const serviceKeyByClassName = new Map<string,string>();
  for (const s of serviceCatalog.services) {
    serviceKeyByFileAndName.set(`${path.resolve(s.file).toLowerCase()}::${s.className}`, s.key);
    const existing = serviceKeyByClassName.get(s.className);
    if (existing && existing !== s.key) {
      // collision -> remove to avoid ambiguity
      serviceKeyByClassName.delete(s.className);
    } else if (!existing) {
      serviceKeyByClassName.set(s.className, s.key);
    }
  }
  const project = new Project({ skipAddingFilesFromTsConfig: true });
  const files = collectTsFiles(projectRoot);
  for (const f of files) project.addSourceFileAtPath(f);

  const classes: ClassIndexClassEntry[] = [];
  const classKeySet = new Set<string>();

  for (const sf of project.getSourceFiles()) {
    const importMap: ImportRecord[] = [];
    for (const imp of sf.getImportDeclarations()) {
      const spec = imp.getModuleSpecifierValue();
      if (!spec.startsWith('.')) continue;
      const absTarget = path.resolve(path.dirname(sf.getFilePath()), spec + (spec.endsWith('.ts') ? '' : '.ts'));
      for (const ni of imp.getNamedImports()) importMap.push({ local: ni.getName(), absPath: absTarget });
      const di = imp.getDefaultImport(); if (di) importMap.push({ local: di.getText(), absPath: absTarget });
    }

    for (const cd of sf.getClasses()) {
      const className = cd.getName() || '(anonymous)';
      const file = sf.getFilePath();
      const key = `${file}#${className}`;
      if (classKeySet.has(key)) { diagnostics.push(`duplicate-class-key:${key}`); continue; }
      classKeySet.add(key);

      let kind: 'component' | 'class' | 'abstract' = cd.isAbstract() ? 'abstract' : 'class';
      let selector: string | undefined; let template: { inline?: string; file?: string } | undefined;
      for (const dec of cd.getDecorators()) {
        const txt = dec.getText();
        if (isComponentDecoratorText(txt)) { kind = 'component'; const meta = extractComponentMetadataText(txt); selector = meta.selector; template = meta.template; break; }
      }

      interface Candidate { memberName: string; typeName: string; }
      const candidates: Candidate[] = [];
      const ctor = cd.getConstructors()[0];
      if (ctor) {
        for (const p of ctor.getParameters()) {
          const tn = p.getTypeNode();
          if (tn && tn.getKind() === SyntaxKind.TypeReference) {
            // @ts-ignore
            candidates.push({ memberName: p.getName(), typeName: tn.getTypeName().getText() });
          }
        }
      }
      for (const prop of cd.getProperties()) {
        const tn = prop.getTypeNode();
        if (tn && tn.getKind() === SyntaxKind.TypeReference) {
          // @ts-ignore
          candidates.push({ memberName: prop.getName(), typeName: tn.getTypeName().getText() });
        }
      }

      const injectsSet = new Set<string>();
      const serviceMemberMap = new Map<string,string>();

      function resolveType(typeName: string): { classKey?: string; serviceKey?: string } {
        for (const other of sf.getClasses()) {
          if (other.getName() === typeName) {
            const k = `${sf.getFilePath()}#${typeName}`;
            const svcKey = serviceKeyByFileAndName.get(`${sf.getFilePath().toLowerCase()}::${typeName}`) || serviceKeyByClassName.get(typeName);
            return { classKey: k, serviceKey: svcKey };
          }
        }
        for (const rec of importMap) {
          if (rec.local === typeName && fs.existsSync(rec.absPath)) {
            try {
              const imported = project.addSourceFileAtPathIfExists(rec.absPath) || project.getSourceFile(rec.absPath);
              if (imported) {
                const target = imported.getClass(typeName);
                if (target) {
                  const k = `${imported.getFilePath()}#${typeName}`;
                  const svcKey = serviceKeyByFileAndName.get(`${imported.getFilePath().toLowerCase()}::${typeName}`) || serviceKeyByClassName.get(typeName);
                  return { classKey: k, serviceKey: svcKey };
                }
              }
            } catch { /* ignore */ }
          }
        }
        return { serviceKey: serviceKeyByClassName.get(typeName) };
      }

      for (const cand of candidates) {
        const resolved = resolveType(cand.typeName);
        if (resolved.classKey) {
          injectsSet.add(resolved.classKey);
          if (resolved.serviceKey) serviceMemberMap.set(cand.memberName, resolved.serviceKey);
        } else {
          diagnostics.push(`unresolved-import:${cand.typeName}:${file}`);
        }
      }

      // textual scan over class body for tn-api calls
      const tnApiCallSet = new Set<string>();
      const classText = cd.getText();
      for (const [memberName, svcKey] of serviceMemberMap.entries()) {
        const re = new RegExp(`this\\.${memberName}\\??\\.([A-Za-z0-9_]+)\\s*\\(`, 'g');
        let m: RegExpExecArray | null;
        while ((m = re.exec(classText))) {
          tnApiCallSet.add(`${svcKey}|${m[1]}`);
        }
      }

      const tnApiCalls: ClassIndexCallEntry[] = Array.from(tnApiCallSet)
        .map(s => { const [service, method] = s.split('|'); return { service, method }; })
        .sort((a,b)=> a.service === b.service ? a.method.localeCompare(b.method) : a.service.localeCompare(b.service));

      const entry: ClassIndexClassEntry = {
        key,
        file,
        className,
        kind,
        injects: Array.from(injectsSet).sort(),
        tnApiCalls
      };
      if (selector) entry.selector = selector;
      if (template && options.captureTemplates !== false) entry.template = template;
      classes.push(entry);

      if (process.env.DEBUG_CLASS_INDEX === '1') {
        diagnostics.push(`debug-class:${className}:injectMembers=${Array.from(serviceMemberMap.keys()).join(',')}`);
      }
    }
  }

  classes.sort((a,b)=> a.key.localeCompare(b.key));
  return { schemaVersion: 'class-index-1', servicesCatalogVersion: serviceCatalog.schemaVersion, classes, diagnostics };
}
