#!/usr/bin/env ts-node
import * as path from 'path';
import * as fs from 'fs';
import { AngularComponentAnalyzer } from '../analysis/AngularComponentAnalyzer';
import { getSharedProject } from '../analysis/ProjectHost';

// Tiny CLI: usage -> npm run analyze -- <file> [-m <module>[,<module2>...]]

function printUsageAndExit(code = 1): never {
  console.log('Usage: npm run analyze -- <file> [-m <module>[,<module2>...]]');
  process.exit(code);
}

function parseArgs(argv: string[]) {
  const args = { file: '', modules: [] as string[] };
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-m' || a === '--module' || a === '--modules') {
      const next = argv[++i];
      if (!next) printUsageAndExit();
      args.modules = next.split(',').map((s) => s.trim()).filter(Boolean);
    } else if (a === '-h' || a === '--help') {
      printUsageAndExit(0);
    } else if (a.startsWith('--module=')) {
      args.modules = a.slice(9).split(',').map((s) => s.trim()).filter(Boolean);
    } else if (a.startsWith('--modules=')) {
      args.modules = a.slice(10).split(',').map((s) => s.trim()).filter(Boolean);
    } else if (a.startsWith('-')) {
      // unknown flag
      printUsageAndExit();
    } else {
      positional.push(a);
    }
  }
  if (positional.length) args.file = positional[0];
  return args;
}

function findComponentClassName(filePath: string): { name: string | null; candidates: string[] } {
  const project = getSharedProject();
  let sf = project.getSourceFile(filePath);
  if (!sf) {
    try { sf = project.addSourceFileAtPath(filePath); } catch { return { name: null, candidates: [] }; }
  } else {
    try { sf.refreshFromFileSystemSync(); } catch { /* ignore */ }
  }
  const classes = sf.getClasses().filter((c) => !!c.getDecorator('Component'));
  const candidates = classes.map((c) => c.getName()).filter((n): n is string => !!n);
  if (candidates.length === 1) return { name: candidates[0], candidates };
  return { name: null, candidates };
}

async function main() {
  const { file, modules } = parseArgs(process.argv.slice(2));
  if (!file) printUsageAndExit();

  const resolvedFile = path.resolve(process.cwd(), file);
  if (!fs.existsSync(resolvedFile)) {
    console.error(`File not found: ${resolvedFile}`);
    process.exit(1);
  }

  const { name: componentClass, candidates } = findComponentClassName(resolvedFile);
  if (!componentClass) {
    const hint = candidates.length
      ? `Found multiple component classes: ${candidates.join(', ')}`
      : 'Found no component classes (@Component) in the file.';
    console.error(`Cannot determine a single component class. ${hint}`);
    process.exit(1);
  }

  const analyzer = new AngularComponentAnalyzer({
    sourceFilePath: resolvedFile,
    componentClassName: componentClass,
    targetModules: modules,
  });
  analyzer.analyze();

  // Minimal, readable output
  console.log(`File: ${resolvedFile}`);
  console.log(`Component: ${componentClass}`);
  if (analyzer.templateFilePath) {
    console.log(`Template file: ${analyzer.templateFilePath}`);
  } else if (typeof analyzer.inlineTemplate === 'string') {
    const t = analyzer.inlineTemplate;
    const preview = t.length > 200 ? t.slice(0, 200) + ' ...' : t;
    console.log('Inline template:');
    console.log(preview);
  } else {
    console.log('Template: (not found)');
  }
  if (modules.length) {
    console.log(`Target modules: ${modules.join(', ')}`);
    console.log(`Matched specifiers: ${analyzer.matchedModuleSpecifiers.join(', ') || '(none)'}`);
    console.log(`Imports from targets: ${analyzer.importsFromTargetModules.join(', ') || '(none)'}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
