import * as path from 'path';
import { buildClassIndex } from '../../../src/class-index/buildClassIndex';

function fixtureRoot() {
  return path.resolve(__dirname, '..', '..', 'fixtures', 'class-index');
}

describe('buildClassIndex (Step 2)', () => {
  test('indexes classes, injections and tn-api calls', () => {
    const root = fixtureRoot();
    const userFile = path.join(root, 'user.service.ts');
    const auditFile = path.join(root, 'audit.service.ts');
    const serviceCatalog = {
      schemaVersion: 'service-catalog-1',
      services: [
        { key: `${userFile}#UserService`, file: userFile, className: 'UserService' },
        { key: `${auditFile}#AuditService`, file: auditFile, className: 'AuditService' },
      ]
    };
    const result = buildClassIndex({ projectRoot: root, serviceCatalog });
    expect(result.schemaVersion).toBe('class-index-1');
    // Find dashboard component
    const dashboard = result.classes.find(c => c.className === 'DashboardComponent');
    expect(dashboard).toBeTruthy();
    // Injects should include wrapper and user service
    expect(dashboard!.injects.some(k => k.endsWith('#WrapperService'))).toBe(true);
    expect(dashboard!.injects.some(k => k.endsWith('#UserService'))).toBe(true);
    // Calls should include userService.get/delete only
    const calls = dashboard!.tnApiCalls.map(c => `${c.method}`);
    expect(calls.sort()).toEqual(['delete','get']);
    // Wrapper service entry should record userService.get via its refresh method
    const wrapper = result.classes.find(c => c.className === 'WrapperService');
    expect(wrapper).toBeTruthy();
    expect(wrapper!.tnApiCalls.some(c => c.method === 'get')).toBe(true);
    // Deterministic ordering: classes sorted by key ascending
    const sorted = [...result.classes].map(c => c.key).sort();
    expect(result.classes.map(c => c.key)).toEqual(sorted);
  });
});

