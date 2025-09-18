import * as path from 'path';
import { buildClassIndex } from './src/class-index/buildClassIndex';

const root = path.resolve(__dirname, '__tests__', 'fixtures', 'class-index');
const userFile = path.join(root, 'user.service.ts');
const auditFile = path.join(root, 'audit.service.ts');
const catalog = { schemaVersion: 'service-catalog-1', services: [
  { key: `${userFile}#UserService`, file: userFile, className: 'UserService' },
  { key: `${auditFile}#AuditService`, file: auditFile, className: 'AuditService' }
]};
const result = buildClassIndex({ projectRoot: root, serviceCatalog: catalog });
for (const c of result.classes) {
  console.log('CLASS', c.className, 'injects', c.injects.length, 'calls', c.tnApiCalls);
}

