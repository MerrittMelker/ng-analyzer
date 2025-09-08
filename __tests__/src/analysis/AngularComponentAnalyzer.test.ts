import * as path from 'path';
import { AngularComponentAnalyzer, AngularComponentAnalyzerInput } from '../../../src/analysis/AngularComponentAnalyzer';

describe('AngularComponentAnalyzer', () => {
  describe('construction', () => {
    it('stores sourceFilePath and componentClassName as provided', () => {
      const input: AngularComponentAnalyzerInput = {
        sourceFilePath: 'src/components/Button.tsx',
        componentClassName: 'ButtonComponent',
      };
      const info = new AngularComponentAnalyzer(input);
      expect(info.sourceFilePath).toBe(input.sourceFilePath);
      expect(info.componentClassName).toBe(input.componentClassName);
    });
  });

  describe('imports collection', () => {
    it('defaults to no target modules (collects none)', () => {
      const tsPath = path.resolve(__dirname, '../../fixtures', 'imports', 'imports.component.ts');
      const analyzer = new AngularComponentAnalyzer({
        sourceFilePath: tsPath,
        componentClassName: 'ImportsComponent',
      });
      analyzer.analyze();
      expect(analyzer.matchedModuleSpecifiers).toEqual([]);
      expect(analyzer.importsFromTargetModules).toEqual([]);
    });

    it('collects imported local names when targetModules includes sample-api', () => {
      const tsPath = path.resolve(__dirname, '../../fixtures', 'imports', 'imports.component.ts');
      const analyzer = new AngularComponentAnalyzer({
        sourceFilePath: tsPath,
        componentClassName: 'ImportsComponent',
        targetModules: ['sample-api'],
      });
      analyzer.analyze();
      expect(analyzer.matchedModuleSpecifiers).toContain('sample-api');
      expect(new Set(analyzer.importsFromTargetModules)).toEqual(
        new Set([
          'DocumentsService',
          'ISnap',
          'IIssue',
          'IIssueStep',
          'IssueStepsService',
          'WorkersService',
        ])
      );
    });

    it('respects custom targetModules to include/exclude matches', () => {
      const tsPath = path.resolve(__dirname, '../../fixtures', 'imports', 'imports.component.ts');
      const analyzerNoMatch = new AngularComponentAnalyzer({
        sourceFilePath: tsPath,
        componentClassName: 'ImportsComponent',
        targetModules: ['other-api'],
      });
      analyzerNoMatch.analyze();
      expect(analyzerNoMatch.matchedModuleSpecifiers).toEqual([]);
      expect(analyzerNoMatch.importsFromTargetModules).toEqual([]);
      const analyzerMatch = new AngularComponentAnalyzer({
        sourceFilePath: tsPath,
        componentClassName: 'ImportsComponent',
        targetModules: ['sample-api'],
      });
      analyzerMatch.analyze();
      expect(analyzerMatch.matchedModuleSpecifiers).toEqual(['sample-api']);
      expect(analyzerMatch.importsFromTargetModules.length).toBeGreaterThan(0);
    });
  });

  describe('method usage summary (Phase 1)', () => {
    it('collects methods used on instances typed from target modules within the component class', () => {
      const sourceFilePath = path.resolve(__dirname, '../../fixtures/aliases/target-edit.component.ts');
      const analyzer = new AngularComponentAnalyzer({
        sourceFilePath,
        componentClassName: 'TargetEditComponent',
        targetModules: ['target-module'],
      });
      analyzer.analyze();
      expect(analyzer.matchedModuleSpecifiers).toContain('target-module');
      expect(analyzer.importsFromTargetModules).toEqual(
        expect.arrayContaining(['ITarget', 'ITargetTypeSummary', 'TargetService', 'TargetTypesService', 'HelperService'])
      );
      const instances = analyzer.serviceInstancesFromTargetModules;
      const targetSvc = instances.find(i => i.propertyName === 'targetService');
      const targetTypesSvc = instances.find(i => i.propertyName === 'targetTypesService');
      expect(targetSvc).toBeTruthy();
      expect(targetSvc?.typeName).toBe('TargetService');
      expect(targetSvc?.methodsUsed).toEqual(expect.arrayContaining(['Get', 'Create', 'Update', 'Delete']));
      expect(targetTypesSvc).toBeTruthy();
      expect(targetTypesSvc?.typeName).toBe('TargetTypesService');
      expect(targetTypesSvc?.methodsUsed).toEqual(expect.arrayContaining(['GetSummaries']));
      const helperSvc = instances.find(i => i.propertyName === 'helperService');
      expect(helperSvc).toBeTruthy();
      expect(helperSvc?.typeName).toBe('HelperService');
      expect(helperSvc?.methodsUsed).toEqual(expect.arrayContaining(['bark']));
      expect(analyzer.allMethodsUsedOnTargetInstances).toEqual(
        expect.arrayContaining(['Get', 'Create', 'Update', 'Delete', 'GetSummaries', 'bark'])
      );
    });
  });

  describe('analyze (Angular)', () => {
    it('detects external template via templateUrl', () => {
      const tsPath = path.resolve(__dirname, '../../fixtures', 'external', 'external.component.ts');
      const info = new AngularComponentAnalyzer({
        sourceFilePath: tsPath,
        componentClassName: 'ExternalComponent',
      });
      info.analyze();
      const expectedHtml = path.resolve(path.dirname(tsPath), 'external.component.html');
      expect(info.templateFilePath).toBe(expectedHtml);
      expect(info.inlineTemplate).toBeUndefined();
    });

    it('captures inline template via template property', () => {
      const tsPath = path.resolve(__dirname, '../../fixtures', 'inline', 'inline.component.ts');
      const info = new AngularComponentAnalyzer({
        sourceFilePath: tsPath,
        componentClassName: 'InlineComponent',
      });
      info.analyze();
      expect(info.inlineTemplate).toContain('Inline Template');
      expect(info.templateFilePath).toBeUndefined();
    });
  });
});
