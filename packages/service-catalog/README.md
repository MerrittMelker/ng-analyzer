# @ng-analyzer/service-catalog

Angular Service Catalog Builder - Step 1 of the ng-analyzer toolkit.

## Overview

This package provides functionality to scan Angular projects and build a catalog of all services decorated with `@Injectable`. It's designed as a standalone, reusable component that can be integrated into larger analysis workflows.

## Installation

```bash
npm install @ng-analyzer/service-catalog
```

## Usage

```typescript
import { buildServiceCatalog } from '@ng-analyzer/service-catalog';

const result = buildServiceCatalog({
  projectRoot: '/path/to/angular/project',
  includeGlobs: [
    'src/**/*.service.ts',
    'libs/**/*.service.ts'
  ]
});

console.log(result.services);
```

## API

### `buildServiceCatalog(options: ServiceCatalogOptions): ServiceCatalogResult`

Scans the specified project directory for Angular services.

#### Options

- `projectRoot`: Root directory of the Angular project
- `includeGlobs`: Array of glob patterns to include files

#### Returns

```typescript
{
  schemaVersion: 'service-catalog-1',
  services: ServiceRecord[],
  diagnostics: string[]
}
```

Where `ServiceRecord` contains:
- `key`: Normalized service identifier
- `file`: Relative path to the service file
- `className`: Name of the service class

## Development

```bash
npm install
npm run build
npm test
```
