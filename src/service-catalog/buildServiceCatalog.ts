import * as fs from 'fs';
import * as path from 'path';

export interface ServiceCatalogOptions {
  projectRoot: string;
  includeGlobs: string[];
}

export interface ServiceRecord {
  key: string;
  file: string;
  className: string;
}

export interface ServiceCatalogResult {
  schemaVersion: 'service-catalog-1';
  services: ServiceRecord[];
  diagnostics: string[];
}

// Convert a small subset of glob patterns to RegExp.
// Supports: **, *, and literal path segments. Patterns are matched against POSIX-style relative paths from projectRoot.
function globToRegExp(glob: string): RegExp {
  const escapeRegexChar = (ch: string) => ch.replace(/[-/\\^$+?.()|[\]{}]/g, '\\$&');
  let out = '';
  for (let i = 0; i < glob.length;) {
    const ch = glob[i];
    if (ch === '*') {
      if (glob[i + 1] === '*') { out += '.*'; i += 2; } else { out += '[^/]*'; i += 1; }
    } else { out += escapeRegexChar(ch); i += 1; }
  }
  return new RegExp('^' + out + '$');
}

function listAllFiles(root: string): string[] {
  const out: string[] = [];
  const stack: string[] = [root];
  while (stack.length) {
    const current = stack.pop()!;
    let entries: fs.Dirent[] = [];
    try { entries = fs.readdirSync(current, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const abs = path.join(current, e.name);
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name === '.git' || e.name === 'dist') continue;
        stack.push(abs);
      } else if (e.isFile()) {
        out.push(abs);
      }
    }
  }
  return out;
}

function isServiceFile(relPosix: string, includeMatchers: RegExp[]): boolean {
  return includeMatchers.some((re) => re.test(relPosix));
}

function ensureAbsolute(p: string): string { return path.isAbsolute(p) ? p : path.resolve(process.cwd(), p); }

function extractExportedClasses(fileText: string): string[] {
  const names = new Set<string>();
  const re = /export\s+class\s+([A-Za-z0-9_]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(fileText))) {
    if (m[1]) names.add(m[1]);
  }
  return Array.from(names);
}

export function buildServiceCatalog(options: ServiceCatalogOptions): ServiceCatalogResult {
  const diagnostics: string[] = [];
  const root = ensureAbsolute(options.projectRoot);
  const includeGlobs = options.includeGlobs && options.includeGlobs.length ? options.includeGlobs : [];
  if (!includeGlobs.length) {
    diagnostics.push('No include globs provided');
    return { schemaVersion: 'service-catalog-1', services: [], diagnostics };
  }
  const includeRegexes = includeGlobs.map(globToRegExp);
  const allFiles = listAllFiles(root);
  const servicesMap = new Map<string, ServiceRecord>();

  for (const abs of allFiles) {
    const rel = path.relative(root, abs) || path.basename(abs);
    const relPosix = rel.split(path.sep).join('/');
    if (!isServiceFile(relPosix, includeRegexes)) continue;

    let text: string;
    try { text = fs.readFileSync(abs, 'utf8'); } catch { diagnostics.push(`Failed to read file: ${abs}`); continue; }
    const exported = extractExportedClasses(text);
    if (!exported.length) { diagnostics.push(`no-exported-classes: ${abs}`); continue; }
    for (const className of exported) {
      const key = `${abs}#${className}`;
      if (servicesMap.has(key)) { diagnostics.push(`duplicate-key: ${key}`); continue; }
      servicesMap.set(key, { key, file: abs, className });
    }
  }

  const services = Array.from(servicesMap.values()).sort((a, b) => a.key.localeCompare(b.key));
  return { schemaVersion: 'service-catalog-1', services, diagnostics };
}
