/*
  RouteAnalyzer
  -------------
  Purpose: Analyze Angular routing configuration files to find routes with data.menuId properties.

  High-level outputs (set on the class instance after analyze()):
  - routesWithMenuId: array of route configurations that contain data.menuId
  - totalRoutesFound: total number of routes analyzed
  - filesAnalyzed: list of files that were processed

  Inputs (RouteAnalyzerInput):
  - projectPath: path to the Angular project root
  - includePatterns?: glob patterns for files to analyze (defaults to routing-related files)
  - excludePatterns?: glob patterns for files to exclude

  Notes:
  - Analyzes TypeScript files containing RouterModule.forRoot() and RouterModule.forChild() calls
  - Extracts route configuration objects and checks for data.menuId properties
  - Supports nested route configurations and lazy-loaded routes
  - Captures file path, line number, route path, menuId value, and component information
*/

import { Project, SourceFile, SyntaxKind, ObjectLiteralExpression, PropertyAssignment } from 'ts-morph';
import { getSharedProject } from './ProjectHost';
import * as path from 'path';

export interface RouteAnalyzerInput {
  /** Path to the Angular project root directory */
  projectPath: string;
  /** 
   * Glob patterns for files to include in analysis. 
   * Defaults to common routing file patterns if not provided.
   */
  includePatterns?: string[];
  /** Glob patterns for files to exclude from analysis */
  excludePatterns?: string[];
}

export interface RouteWithMenuId {
  /** File path where the route was found */
  filePath: string;
  /** Line number in the file */
  lineNumber: number;
  /** Route path (e.g., 'users', 'admin/settings') */
  routePath?: string;
  /** Value of the menuId property */
  menuId: string;
  /** Component name if specified */
  componentName?: string;
  /** Full route configuration object as text */
  routeConfig: string;
}

/**
 * Analyzes Angular routing files to find routes with data.menuId properties.
 * Supports RouterModule.forRoot() and RouterModule.forChild() configurations.
 */
export class RouteAnalyzer {
  // --- Configuration ---
  projectPath: string;
  includePatterns: string[];
  excludePatterns: string[];

  // --- Results ---
  routesWithMenuId: RouteWithMenuId[] = [];
  totalRoutesFound: number = 0;
  filesAnalyzed: string[] = [];

  constructor(input: RouteAnalyzerInput) {
    this.projectPath = input.projectPath;
    
    // Default patterns for Angular routing files
    this.includePatterns = input.includePatterns || [
      '**/*routing*.ts',
      '**/*-routing.module.ts',
      '**/*.routing.ts',
      '**/app.module.ts',
      '**/*module.ts'
    ];
    
    this.excludePatterns = input.excludePatterns || [
      '**/node_modules/**',
      '**/dist/**',
      '**/*.spec.ts',
      '**/*.test.ts'
    ];
  }

  /**
   * Runs the route analysis across the project.
   * Finds all routing files and extracts routes with data.menuId.
   */
  analyze(): void {
    // Reset results
    this.routesWithMenuId = [];
    this.totalRoutesFound = 0;
    this.filesAnalyzed = [];

    const project = getSharedProject();
    
    // Get all source files matching our patterns
    const sourceFiles = this.getRoutingFiles(project);
    
    for (const sourceFile of sourceFiles) {
      this.filesAnalyzed.push(sourceFile.getFilePath());
      this.analyzeSourceFile(sourceFile);
    }

    console.log(`Route analysis complete: ${this.routesWithMenuId.length} routes with menuId found in ${this.filesAnalyzed.length} files`);
  }

  /**
   * Gets all source files that match routing patterns
   */
  private getRoutingFiles(project: Project): SourceFile[] {
    // First, we need to add source files to the project based on our patterns
    const globPatterns = this.includePatterns.map(pattern => 
      path.isAbsolute(pattern) ? pattern : path.join(this.projectPath, pattern)
    );
    
    // Add source files matching include patterns
    for (const pattern of globPatterns) {
      try {
        project.addSourceFilesAtPaths(pattern);
      } catch (error) {
        // Ignore errors for patterns that don't match any files
        console.warn(`No files found for pattern: ${pattern}`);
      }
    }
    
    const allFiles = project.getSourceFiles();
    
    return allFiles.filter(file => {
      const filePath = file.getFilePath();
      const relativePath = path.relative(this.projectPath, filePath);
      
      // Check if file matches include patterns
      const matchesInclude = this.includePatterns.some(pattern => 
        this.matchesGlob(relativePath, pattern)
      );
      
      // Check if file matches exclude patterns
      const matchesExclude = this.excludePatterns.some(pattern => 
        this.matchesGlob(relativePath, pattern)
      );
      
      return matchesInclude && !matchesExclude;
    });
  }

  /**
   * Simple glob pattern matching (supports ** and * wildcards)
   */
  private matchesGlob(filePath: string, pattern: string): boolean {
    // Convert glob pattern to regex
    const regexPattern = pattern
      .replace(/\*\*/g, '.*')  // ** matches any path
      .replace(/\*/g, '[^/]*') // * matches any filename chars except path separator
      .replace(/\./g, '\\.');   // Escape dots
    
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(filePath.replace(/\\/g, '/'));
  }

  /**
   * Analyzes a single source file for routing configurations
   */
  private analyzeSourceFile(sourceFile: SourceFile): void {
    // Look for RouterModule.forRoot() and RouterModule.forChild() calls
    const callExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);
    
    for (const callExpr of callExpressions) {
      const expression = callExpr.getExpression();
      
      // Check if this is a RouterModule.forRoot() or RouterModule.forChild() call
      if (expression.getKind() === SyntaxKind.PropertyAccessExpression) {
        const propertyAccess = expression.asKindOrThrow(SyntaxKind.PropertyAccessExpression);
        const object = propertyAccess.getExpression();
        const property = propertyAccess.getName();
        
        if ((property === 'forRoot' || property === 'forChild') && 
            object.getText() === 'RouterModule') {
          
          // Get the routes array (first argument)
          const args = callExpr.getArguments();
          if (args.length > 0) {
            this.analyzeRoutesArray(args[0], sourceFile);
          }
        }
      }
    }
  }

  /**
   * Analyzes a routes array expression for data.menuId properties
   */
  private analyzeRoutesArray(routesExpression: any, sourceFile: SourceFile): void {
    if (routesExpression.getKind() === SyntaxKind.ArrayLiteralExpression) {
      const arrayLiteral = routesExpression.asKindOrThrow(SyntaxKind.ArrayLiteralExpression);
      
      for (const element of arrayLiteral.getElements()) {
        if (element.getKind() === SyntaxKind.ObjectLiteralExpression) {
          this.analyzeRouteObject(element as ObjectLiteralExpression, sourceFile);
          this.totalRoutesFound++;
        }
      }
    } else if (routesExpression.getKind() === SyntaxKind.Identifier) {
      // Handle case where routes are defined in a variable (e.g., RouterModule.forRoot(routes))
      const identifier = routesExpression.asKindOrThrow(SyntaxKind.Identifier);
      const variableName = identifier.getText();
      
      // Find the variable declaration in the same file
      const variableDeclarations = sourceFile.getVariableDeclarations();
      for (const varDecl of variableDeclarations) {
        if (varDecl.getName() === variableName) {
          const initializer = varDecl.getInitializer();
          if (initializer) {
            // Recursively analyze the initializer
            this.analyzeRoutesArray(initializer, sourceFile);
          }
          break;
        }
      }
    }
  }

  /**
   * Analyzes a single route object for data.menuId property
   */
  private analyzeRouteObject(routeObject: ObjectLiteralExpression, sourceFile: SourceFile): void {
    let routePath: string | undefined;
    let componentName: string | undefined;
    let menuId: string | undefined;
    
    // Extract route properties
    for (const property of routeObject.getProperties()) {
      if (property.getKind() === SyntaxKind.PropertyAssignment) {
        const propAssignment = property as PropertyAssignment;
        const propName = propAssignment.getName();
        
        if (propName === 'path') {
          const pathValue = propAssignment.getInitializer();
          if (pathValue && pathValue.getKind() === SyntaxKind.StringLiteral) {
            routePath = pathValue.asKindOrThrow(SyntaxKind.StringLiteral).getLiteralValue();
          }
        } else if (propName === 'component') {
          const componentValue = propAssignment.getInitializer();
          if (componentValue) {
            componentName = componentValue.getText();
          }
        } else if (propName === 'data') {
          const dataValue = propAssignment.getInitializer();
          if (dataValue && dataValue.getKind() === SyntaxKind.ObjectLiteralExpression) {
            menuId = this.extractMenuIdFromData(dataValue as ObjectLiteralExpression);
          }
        }
      }
    }

    // If we found a menuId, record this route
    if (menuId) {
      this.routesWithMenuId.push({
        filePath: sourceFile.getFilePath(),
        lineNumber: routeObject.getStartLineNumber(),
        routePath,
        menuId,
        componentName,
        routeConfig: routeObject.getText()
      });
    }

    // Recursively check children routes
    this.analyzeChildrenRoutes(routeObject, sourceFile);
  }

  /**
   * Extracts menuId value from a data object
   */
  private extractMenuIdFromData(dataObject: ObjectLiteralExpression): string | undefined {
    for (const property of dataObject.getProperties()) {
      if (property.getKind() === SyntaxKind.PropertyAssignment) {
        const propAssignment = property as PropertyAssignment;
        const propName = propAssignment.getName();
        
        if (propName === 'menuId') {
          const menuIdValue = propAssignment.getInitializer();
          if (menuIdValue && menuIdValue.getKind() === SyntaxKind.StringLiteral) {
            return menuIdValue.asKindOrThrow(SyntaxKind.StringLiteral).getLiteralValue();
          }
        }
      }
    }
    return undefined;
  }

  /**
   * Recursively analyzes children routes
   */
  private analyzeChildrenRoutes(routeObject: ObjectLiteralExpression, sourceFile: SourceFile): void {
    for (const property of routeObject.getProperties()) {
      if (property.getKind() === SyntaxKind.PropertyAssignment) {
        const propAssignment = property as PropertyAssignment;
        const propName = propAssignment.getName();
        
        if (propName === 'children') {
          const childrenValue = propAssignment.getInitializer();
          if (childrenValue) {
            this.analyzeRoutesArray(childrenValue, sourceFile);
          }
        }
      }
    }
  }

  /**
   * Returns a summary of the analysis results
   */
  getSummary(): {
    totalFiles: number;
    totalRoutes: number;
    routesWithMenuId: number;
    files: string[];
  } {
    return {
      totalFiles: this.filesAnalyzed.length,
      totalRoutes: this.totalRoutesFound,
      routesWithMenuId: this.routesWithMenuId.length,
      files: this.filesAnalyzed
    };
  }
}
