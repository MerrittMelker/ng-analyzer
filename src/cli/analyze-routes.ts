#!/usr/bin/env ts-node
import * as path from 'path';
import { RouteAnalyzer } from '../analysis/RouteAnalyzer';

// CLI for analyzing Angular routes with data.menuId
// Usage: npm run analyze-routes -- <project-path> [options]

function printUsageAndExit(code = 1): never {
  console.log('Usage: npm run analyze-routes -- <project-path> [options]');
  console.log('');
  console.log('Options:');
  console.log('  --include <patterns>    Comma-separated glob patterns for files to include');
  console.log('  --exclude <patterns>    Comma-separated glob patterns for files to exclude');
  console.log('  --json                  Output results as JSON');
  console.log('  -h, --help             Show this help message');
  console.log('');
  console.log('Examples:');
  console.log('  npm run analyze-routes -- ./my-angular-project');
  console.log('  npm run analyze-routes -- ./src --include "**/*routing*.ts,**/*.module.ts"');
  console.log('  npm run analyze-routes -- ./src --json > routes.json');
  process.exit(code);
}

function parseArgs(argv: string[]) {
  const args = { 
    projectPath: '', 
    includePatterns: [] as string[], 
    excludePatterns: [] as string[], 
    json: false 
  };
  
  const positional: string[] = [];
  
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    
    if (arg === '--include') {
      const next = argv[++i];
      if (!next) printUsageAndExit();
      args.includePatterns = next.split(',').map(s => s.trim()).filter(Boolean);
    } else if (arg === '--exclude') {
      const next = argv[++i];
      if (!next) printUsageAndExit();
      args.excludePatterns = next.split(',').map(s => s.trim()).filter(Boolean);
    } else if (arg === '--json') {
      args.json = true;
    } else if (arg === '-h' || arg === '--help') {
      printUsageAndExit(0);
    } else if (arg.startsWith('--include=')) {
      args.includePatterns = arg.slice(10).split(',').map(s => s.trim()).filter(Boolean);
    } else if (arg.startsWith('--exclude=')) {
      args.excludePatterns = arg.slice(10).split(',').map(s => s.trim()).filter(Boolean);
    } else if (arg.startsWith('-')) {
      console.error(`Unknown option: ${arg}`);
      printUsageAndExit();
    } else {
      positional.push(arg);
    }
  }
  
  if (positional.length) {
    args.projectPath = positional[0];
  }
  
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  
  if (!args.projectPath) {
    console.error('Error: Project path is required');
    printUsageAndExit();
  }

  // Resolve to absolute path
  const projectPath = path.resolve(args.projectPath);
  
  if (!require('fs').existsSync(projectPath)) {
    console.error(`Error: Path does not exist: ${projectPath}`);
    process.exit(1);
  }

  // Create analyzer with optional patterns
  const analyzerInput: any = { projectPath };
  if (args.includePatterns.length > 0) {
    analyzerInput.includePatterns = args.includePatterns;
  }
  if (args.excludePatterns.length > 0) {
    analyzerInput.excludePatterns = args.excludePatterns;
  }

  const analyzer = new RouteAnalyzer(analyzerInput);
  
  try {
    console.error('Analyzing routes for data.menuId...');
    analyzer.analyze();
    
    if (args.json) {
      // Output JSON to stdout
      console.log(JSON.stringify({
        summary: analyzer.getSummary(),
        routes: analyzer.routesWithMenuId
      }, null, 2));
    } else {
      // Human-readable output
      const summary = analyzer.getSummary();
      
      console.log('\n=== Route Analysis Results ===');
      console.log(`Files analyzed: ${summary.totalFiles}`);
      console.log(`Total routes found: ${summary.totalRoutes}`);
      console.log(`Routes with menuId: ${summary.routesWithMenuId}`);
      
      if (analyzer.routesWithMenuId.length > 0) {
        console.log('\n=== Routes with data.menuId ===');
        
        analyzer.routesWithMenuId.forEach((route, index) => {
          console.log(`\n${index + 1}. ${route.filePath}:${route.lineNumber}`);
          console.log(`   Path: ${route.routePath || '(not specified)'}`);
          console.log(`   Menu ID: ${route.menuId}`);
          if (route.componentName) {
            console.log(`   Component: ${route.componentName}`);
          }
          console.log(`   Route Config: ${route.routeConfig.replace(/\n/g, ' ').replace(/\s+/g, ' ')}`);
        });
      } else {
        console.log('\nNo routes with data.menuId found.');
      }
      
      if (summary.totalFiles > 0) {
        console.log('\n=== Files Analyzed ===');
        summary.files.forEach(file => console.log(`  - ${file}`));
      }
    }
    
  } catch (error) {
    console.error('Error during analysis:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
