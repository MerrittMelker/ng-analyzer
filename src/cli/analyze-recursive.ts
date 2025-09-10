#!/usr/bin/env ts-node
import * as path from 'path';
import * as fs from 'fs';
import { RecursiveGraphAnalyzer, RecursiveAnalysisRequest } from '../analysis/RecursiveGraphAnalyzer';

interface ParsedArgs {
  roots: Array<{ sourceFilePath: string; componentClassName: string }>;
  targetMods: string[];
  maxDepth?: number;
  maxNodes?: number;
  json: boolean;
  out?: string;
}

function printUsage() {
  console.log(`Recursive Angular Component & Service Graph (Experimental)\n\n` +
    `Usage: npm run analyze-recursive -- --root <file:ClassName> [--root <file:ClassName> ...] [options]\n\n` +
    `Options:\n` +
    `  --root <path:Class>     Root component (repeatable)\n` +
    `  --target-mods <list>    Comma-separated target module specifiers (applied to component Phase 1 scans)\n` +
    `  --max-depth <n>         Limit traversal depth (default: Infinity)\n` +
    `  --max-nodes <n>         Limit total nodes (default: 500)\n` +
    `  --json                  Emit full JSON graph to stdout (or file if --out provided)\n` +
    `  --out <file>            Write JSON output to file\n` +
    `  -h, --help              Show this help\n`);
}

function parseArgs(argv: string[]): ParsedArgs | undefined {
  const args: ParsedArgs = { roots: [], targetMods: [], json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--root': {
        const v = argv[++i]; if (!v) return undefined;
        const parts = v.split(':');
        if (parts.length !== 2) { console.error(`Invalid --root value: ${v}`); return undefined; }
        args.roots.push({ sourceFilePath: parts[0], componentClassName: parts[1] });
        break;
      }
      case '--target-mods': {
        const v = argv[++i]; if (!v) return undefined;
        args.targetMods = v.split(',').map(s => s.trim()).filter(Boolean);
        break;
      }
      case '--max-depth': {
        const v = argv[++i]; if (!v) return undefined;
        const n = Number(v); if (!Number.isFinite(n)) { console.error('Invalid --max-depth'); return undefined; }
        args.maxDepth = n; break;
      }
      case '--max-nodes': {
        const v = argv[++i]; if (!v) return undefined;
        const n = Number(v); if (!Number.isFinite(n)) { console.error('Invalid --max-nodes'); return undefined; }
        args.maxNodes = n; break;
      }
      case '--json': args.json = true; break;
      case '--out': {
        const v = argv[++i]; if (!v) return undefined; args.out = v; break;
      }
      case '-h': case '--help': return undefined;
      default:
        console.error(`Unknown argument: ${a}`);
        return undefined;
    }
  }
  if (!args.roots.length) { console.error('At least one --root is required.'); return undefined; }
  return args;
}

function main() {
  const sliced = process.argv.slice(2);
  const parsed = parseArgs(sliced);
  if (!parsed) { printUsage(); process.exit(1); }

  const req: RecursiveAnalysisRequest = {
    roots: parsed.roots.map(r => ({ sourceFilePath: path.resolve(r.sourceFilePath), componentClassName: r.componentClassName })),
    targetModules: parsed.targetMods,
    maxDepth: parsed.maxDepth,
    maxNodes: parsed.maxNodes
  };

  const analyzer = new RecursiveGraphAnalyzer();
  const result = analyzer.analyze(req);

  const components = result.nodes.filter(n => n.kind === 'component').length;
  const services = result.nodes.filter(n => n.kind === 'service').length;
  const edgeCounts = result.edges.reduce<Record<string, number>>((acc, e) => { acc[e.reason] = (acc[e.reason] || 0) + 1; return acc; }, {});

  console.log(`Nodes: ${result.nodes.length} (components: ${components}, services: ${services})`);
  console.log(`Edges: ${result.edges.length} (reasons: ${Object.entries(edgeCounts).map(([k,v]) => `${k}=${v}`).join(', ')})`);
  if (result.diagnostics.length) {
    console.log('Diagnostics:');
    for (const d of result.diagnostics) console.log(`  - ${d}`);
  }
  console.log(`Limits: depth=${result.limits.maxDepth} nodes=${result.limits.maxNodes} truncated=${result.limits.truncated}`);

  if (parsed.json) {
    const json = JSON.stringify(result, null, 2);
    if (parsed.out) {
      fs.writeFileSync(parsed.out, json, 'utf8');
      console.log(`JSON written to ${parsed.out}`);
    } else {
      console.log(json);
    }
  }
}

main();

