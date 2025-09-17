// Package-scoped authoritative tests for buildServiceCatalog
import * as path from 'path';
import { buildServiceCatalog } from '../src/buildServiceCatalog';

function fixtureRoot() {
  return path.resolve(__dirname, 'fixtures', 'catalog');
}

describe('buildServiceCatalog (package authoritative tests)', () => {
  test('collects exported classes from matching service files', () => {
    const root = fixtureRoot();
    const result = buildServiceCatalog({ projectRoot: root, includeGlobs: ['**/*.service.ts'] });
    expect(result.schemaVersion).toBe('service-catalog-1');
    const names = result.services.map(s => s.className);
    expect(names).toEqual(['PhonesService', 'UsersService']);
    expect(result.services.every(s => s.key.endsWith(`#${s.className}`))).toBe(true);
    expect([...names]).toEqual([...names].sort());
    expect(result.diagnostics.filter(d => d.includes('no-exported-classes'))).toHaveLength(0);
  });

  test('empty result when no files match glob', () => {
    const root = fixtureRoot();
    const result = buildServiceCatalog({ projectRoot: root, includeGlobs: ['**/*.data.ts'] });
    expect(result.services).toHaveLength(0);
  });

  test('diagnostic when include globs missing', () => {
    const root = fixtureRoot();
    const result = buildServiceCatalog({ projectRoot: root, includeGlobs: [] });
    expect(result.services).toHaveLength(0);
    expect(result.diagnostics.some(d => d.toLowerCase().includes('no include globs'))).toBe(true);
  });
});

