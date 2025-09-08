/*
  ComponentLoader
  ---------------
  Locates a component class by name and extracts minimal template metadata.

  Responsibilities (Phase 1)
  - getComponentClass: return the class only if it exists and is decorated with @Component.
  - extractTemplateInfo: capture inline template text or resolve templateUrl relative to the source file.

  Out of scope (Phase 1)
  - Parsing template content
  - Resolving multiple templateUrls or arrays
*/
import { SyntaxKind } from 'ts-morph';
import * as path from 'path';

/**
 * Returns the class declaration when it exists and has an @Component decorator.
 *
 * Inputs
 * - sourceFile: ts-morph SourceFile
 * - componentClassName: exact class name to locate
 *
 * Output
 * - The class node (any) or undefined if not found or missing the decorator
 */
export function getComponentClass(sourceFile: any, componentClassName: string): any | undefined {
  const cls = sourceFile.getClass(componentClassName);
  if (!cls) return undefined;
  const hasComponent = !!cls.getDecorator('Component');
  return hasComponent ? cls : undefined;
}

/**
 * Extracts minimal template metadata from a @Component decorator.
 * - If templateUrl is provided and is a string literal, resolves it relative to sourceFilePath.
 * - If template is provided, supports string literals and template literals/expressions; stores raw text for expressions.
 *
 * Inputs
 * - cls: the component class node (must have @Component)
 * - sourceFilePath: absolute path to the .ts file (used to resolve templateUrl)
 *
 * Output
 * - { templateFilePath?: string; inlineTemplate?: string }
 *   - Only one of these is typically set; if both appear, they’re returned as discovered (callers decide precedence).
 */
export function extractTemplateInfo(cls: any, sourceFilePath: string): { templateFilePath?: string; inlineTemplate?: string } {
  let templateFilePath: string | undefined;
  let inlineTemplate: string | undefined;

  const decorator = cls.getDecorator('Component');
  if (!decorator) return {};

  const args = decorator.getArguments();
  if (!args.length) return {};

  const obj = args[0];
  if (!obj || obj.getKind() !== SyntaxKind.ObjectLiteralExpression) return {};

  const objLit = obj.asKindOrThrow(SyntaxKind.ObjectLiteralExpression);

  // templateUrl (string literal)
  const templateUrlProp = objLit.getProperty('templateUrl');
  if (templateUrlProp && templateUrlProp.getKind() === SyntaxKind.PropertyAssignment) {
    const init = templateUrlProp
      .asKindOrThrow(SyntaxKind.PropertyAssignment)
      .getInitializerIfKind(SyntaxKind.StringLiteral);
    if (init) {
      const rel = init.getLiteralValue();
      // Resolve relative to the component's .ts file directory
      templateFilePath = path.resolve(path.dirname(sourceFilePath), rel);
    }
  }

  // template: string | template literal | template expression
  const templateProp = objLit.getProperty('template');
  if (templateProp && templateProp.getKind() === SyntaxKind.PropertyAssignment) {
    const init =
      templateProp
        .asKindOrThrow(SyntaxKind.PropertyAssignment)
        .getInitializerIfKind(SyntaxKind.NoSubstitutionTemplateLiteral) ||
      templateProp
        .asKindOrThrow(SyntaxKind.PropertyAssignment)
        .getInitializerIfKind(SyntaxKind.StringLiteral) ||
      templateProp
        .asKindOrThrow(SyntaxKind.PropertyAssignment)
        .getInitializerIfKind(SyntaxKind.TemplateExpression);

    if (init) {
      if (
        init.getKind() === SyntaxKind.StringLiteral ||
        init.getKind() === SyntaxKind.NoSubstitutionTemplateLiteral
      ) {
        // Both kinds support getLiteralValue() in ts-morph
        // @ts-ignore
        inlineTemplate = init.getLiteralValue();
      } else if (init.getKind() === SyntaxKind.TemplateExpression) {
        // For expressions, store raw text; evaluation is out of scope in Phase 1.
        inlineTemplate = init.getText();
      }
    }
  }

  return { templateFilePath, inlineTemplate };
}
