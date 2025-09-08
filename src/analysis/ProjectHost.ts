import { Project } from 'ts-morph';
import * as path from 'path';
import * as fs from 'fs';

let sharedProject: Project | undefined;

export function getSharedProject(): Project {
  if (sharedProject) return sharedProject;

  const tsconfigPath = resolveTsConfigPath();

  sharedProject = new Project({
    useInMemoryFileSystem: false,
    skipAddingFilesFromTsConfig: true,
    // Keep it lightweight; we’re not loading the whole TS program here.
    compilerOptions: {
      experimentalDecorators: true,
      // Reasonable defaults; tsconfig will be used if we switch to loading it later.
      target: 2020 as any,
      module: 1 as any, // commonjs
      esModuleInterop: true,
      skipLibCheck: true,
      moduleResolution: 2 as any, // node
    },
    tsConfigFilePath: tsconfigPath ?? undefined,
  });

  return sharedProject;
}

export function resetSharedProject(): void {
  sharedProject = undefined;
}

function resolveTsConfigPath(): string | null {
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, 'tsconfig.json'),
    path.join(cwd, 'tsconfig.build.json'),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      // ignore
    }
  }
  return null;
}

