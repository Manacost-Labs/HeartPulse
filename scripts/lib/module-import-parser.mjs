import ts from 'typescript';

function importClauseKind(node) {
  if (node.importClause?.isTypeOnly) return 'type';
  const bindings = node.importClause?.namedBindings;
  if (bindings && ts.isNamedImports(bindings) && bindings.elements.length > 0
    && !node.importClause.name && bindings.elements.every(element => element.isTypeOnly)) {
    return 'type';
  }
  return 'runtime';
}

function exportDeclarationKind(node) {
  if (node.isTypeOnly) return 'type';
  if (node.exportClause && ts.isNamedExports(node.exportClause)
    && node.exportClause.elements.length > 0
    && node.exportClause.elements.every(element => element.isTypeOnly)) {
    return 'type';
  }
  return 'runtime';
}

function isImportMetaGlobCall(node) {
  if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return false;
  const { expression } = node;
  return ['glob', 'globEager'].includes(expression.name.text)
    && ts.isMetaProperty(expression.expression)
    && expression.expression.keywordToken === ts.SyntaxKind.ImportKeyword
    && expression.expression.name.text === 'meta';
}

function staticGlobPatterns(argument) {
  if (argument && ts.isStringLiteralLike(argument)) return [argument.text];
  if (argument && ts.isArrayLiteralExpression(argument)
    && argument.elements.every(element => ts.isStringLiteralLike(element))) {
    return argument.elements.map(element => element.text);
  }
  return null;
}

function extractStyleImports(sourceText) {
  const imports = [];
  const withoutComments = sourceText.replace(/\/\*[\s\S]*?\*\//g, '');
  const importPattern = /@(?:import|use|forward)\s+(?:url\(\s*)?(?:(['"])(.*?)\1|([^'"\s);]+))\s*\)?[^;]*;/giu;
  for (const match of withoutComments.matchAll(importPattern)) {
    const specifier = match[2] || match[3];
    if (specifier) imports.push({ specifier, kind: 'runtime' });
  }
  return { imports, errors: [] };
}

function scriptKindForPath(sourcePath) {
  if (sourcePath.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (sourcePath.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (/\.(?:js|mjs|cjs)$/.test(sourcePath)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

export function extractImports(sourcePath, sourceText) {
  if (/\.(?:css|scss|sass|less)$/.test(sourcePath)) {
    return extractStyleImports(sourceText);
  }
  const sourceFile = ts.createSourceFile(
    sourcePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    scriptKindForPath(sourcePath),
  );
  const imports = [];
  const errors = [];
  const record = (specifier, kind) => {
    if (typeof specifier === 'string' && specifier.length > 0) imports.push({ specifier, kind });
  };

  for (const reference of sourceFile.referencedFiles) record(reference.fileName, 'type');

  const visit = node => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteralLike(node.moduleSpecifier)) {
      record(node.moduleSpecifier.text, importClauseKind(node));
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
      record(node.moduleSpecifier.text, exportDeclarationKind(node));
    } else if (ts.isImportEqualsDeclaration(node)
      && ts.isExternalModuleReference(node.moduleReference)
      && node.moduleReference.expression
      && ts.isStringLiteralLike(node.moduleReference.expression)) {
      record(node.moduleReference.expression.text, node.isTypeOnly ? 'type' : 'runtime');
    } else if (isImportMetaGlobCall(node)) {
      const patterns = staticGlobPatterns(node.arguments[0]);
      if (!patterns || patterns.length === 0) {
        errors.push({
          code: 'dynamic-import-meta-glob',
          message: 'import.meta.glob patterns must be static string literals',
        });
      } else {
        imports.push({ patterns, kind: 'runtime', glob: true });
      }
    } else if (ts.isCallExpression(node) && node.arguments.length > 0) {
      const dynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const commonJsRequire = ts.isIdentifier(node.expression) && node.expression.text === 'require';
      if ((dynamicImport || commonJsRequire) && ts.isStringLiteralLike(node.arguments[0])) {
        record(node.arguments[0].text, 'runtime');
      } else if (dynamicImport) {
        errors.push({
          code: 'dynamic-module-import',
          message: 'dynamic import targets must be static string literals',
        });
      } else if (commonJsRequire) {
        errors.push({
          code: 'dynamic-require',
          message: 'require targets must be static string literals',
        });
      }
    } else if (ts.isImportTypeNode(node)
      && ts.isLiteralTypeNode(node.argument)
      && ts.isStringLiteralLike(node.argument.literal)) {
      record(node.argument.literal.text, 'type');
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return { imports, errors };
}
