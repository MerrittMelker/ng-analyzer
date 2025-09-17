import { buildServiceCatalog as shimBuild } from '../../src/service-catalog/buildServiceCatalog';
import { buildServiceCatalog as pkgBuild } from '../../packages/service-catalog/src/buildServiceCatalog';
import * as path from 'path';

describe('service-catalog root shim', () => {
  test('shim and package export refer to the same implementation', () => {
    expect(shimBuild).toBe(pkgBuild);
  });

  test('shim still produces expected minimal diagnostics on empty include', () => {
    const result = shimBuild({ projectRoot: path.resolve(__dirname, '..', 'fixtures', 'catalog'), includeGlobs: [] });
    expect(result.services).toHaveLength(0);
    expect(result.diagnostics.some(d => d.toLowerCase().includes('no include globs'))).toBe(true);
  });
});
