import {
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const HTTP_METHODS = new Set([
  'all',
  'delete',
  'get',
  'head',
  'options',
  'patch',
  'post',
  'put',
  'use',
]);
const EXPRESS_RECEIVERS = new Set(['app', 'dependencies.app', 'router']);
const GUARD_SIGNAL_PATTERN = /(?:auth|csrf|guard|limiter|ratelimit|requireaccess|accesstoken)/i;

function listTypeScriptFiles(directory) {
  const files = [];
  const visit = currentDirectory => {
    for (const entry of readdirSync(currentDirectory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))) {
      const absolutePath = path.join(currentDirectory, entry.name);
      if (entry.isDirectory()) visit(absolutePath);
      else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
        files.push(absolutePath);
      }
    }
  };
  visit(directory);
  return files;
}

function unwrapExpression(node) {
  let current = node;
  while (
    ts.isAsExpression(current)
    || ts.isSatisfiesExpression(current)
    || ts.isParenthesizedExpression(current)
    || ts.isNonNullExpression(current)
    || ts.isTypeAssertionExpression(current)
  ) current = current.expression;
  return current;
}

function scopeContaining(node) {
  let current = node.parent;
  while (current) {
    if (
      ts.isSourceFile(current)
      || ts.isBlock(current)
      || ts.isFunctionLike(current)
    ) return current;
    current = current.parent;
  }
  return null;
}

function collectSimpleBindings(sourceFile) {
  const bindings = [];
  const visit = node => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      bindings.push({
        name: node.name.text,
        initializer: node.initializer,
        start: node.getStart(sourceFile),
        scope: scopeContaining(node),
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return bindings;
}

function nearestBinding(bindings, name, position) {
  return bindings
    .filter(binding => (
      binding.name === name
      && binding.start < position
      && binding.scope
      && binding.scope.pos <= position
      && binding.scope.end >= position
    ))
    .sort((left, right) => right.start - left.start)[0] ?? null;
}

function forOfBindingValues(identifier, sourceFile, bindings, seen) {
  let current = identifier.parent;
  while (current && !ts.isSourceFile(current)) {
    if (ts.isForOfStatement(current) && ts.isVariableDeclarationList(current.initializer)) {
      const declaration = current.initializer.declarations[0];
      if (declaration && ts.isArrayBindingPattern(declaration.name)) {
        const bindingIndex = declaration.name.elements.findIndex(element => (
          ts.isBindingElement(element)
          && ts.isIdentifier(element.name)
          && element.name.text === identifier.text
        ));
        if (bindingIndex >= 0) {
          const collection = evaluateStatic(current.expression, sourceFile, bindings, seen);
          if (!Array.isArray(collection)) return undefined;
          const values = collection.map(item => (
            Array.isArray(item) ? item[bindingIndex] : undefined
          ));
          return values.every(value => typeof value === 'string') ? values : undefined;
        }
      }
    }
    current = current.parent;
  }
  return undefined;
}

function evaluateTemplate(node, sourceFile, bindings, seen) {
  let values = [node.head.text];
  for (const span of node.templateSpans) {
    const evaluated = evaluateStatic(span.expression, sourceFile, bindings, seen);
    const replacements = Array.isArray(evaluated) ? evaluated : [evaluated];
    if (!replacements.every(value => typeof value === 'string')) return undefined;
    values = values.flatMap(prefix => replacements.map(value => `${prefix}${value}${span.literal.text}`));
  }
  return values.length === 1 ? values[0] : values;
}

function evaluateStatic(node, sourceFile, bindings, seen = new Set()) {
  const expression = unwrapExpression(node);
  if (ts.isStringLiteralLike(expression)) return expression.text;
  if (ts.isRegularExpressionLiteral(expression)) return expression.getText(sourceFile);
  if (ts.isTemplateExpression(expression)) {
    return evaluateTemplate(expression, sourceFile, bindings, seen);
  }
  if (ts.isArrayLiteralExpression(expression)) {
    const values = expression.elements.map(element => (
      evaluateStatic(element, sourceFile, bindings, seen)
    ));
    return values.every(value => value !== undefined) ? values : undefined;
  }
  if (ts.isIdentifier(expression)) {
    const loopValues = forOfBindingValues(expression, sourceFile, bindings, seen);
    if (loopValues !== undefined) return loopValues;
    const binding = nearestBinding(bindings, expression.text, expression.getStart(sourceFile));
    if (!binding || seen.has(binding.initializer)) return undefined;
    const nextSeen = new Set(seen);
    nextSeen.add(binding.initializer);
    return evaluateStatic(binding.initializer, sourceFile, bindings, nextSeen);
  }
  return undefined;
}

function pathValues(node, sourceFile, bindings) {
  const value = evaluateStatic(node, sourceFile, bindings);
  if (typeof value === 'string') return [value];
  if (Array.isArray(value) && value.every(item => typeof item === 'string')) return value;
  return null;
}

function expressionLabel(node, sourceFile) {
  const expression = unwrapExpression(node);
  if (ts.isArrowFunction(expression) || ts.isFunctionExpression(expression)) {
    return '<inline-handler>';
  }
  if (ts.isIdentifier(expression) || ts.isPropertyAccessExpression(expression)) {
    return expression.getText(sourceFile);
  }
  if (ts.isCallExpression(expression)) {
    const callee = expression.expression.getText(sourceFile);
    if (expression.arguments.length === 0) return `${callee}()`;
    if (expression.arguments.length === 1) {
      const argument = expressionLabel(expression.arguments[0], sourceFile);
      if (argument === '<inline-handler>' || /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(argument)) {
        return `${callee}(${argument})`;
      }
    }
    return `${callee}(...)`;
  }
  if (ts.isArrayLiteralExpression(expression)) {
    return `[${expression.elements.map(element => expressionLabel(element, sourceFile)).join(', ')}]`;
  }
  return `<${ts.SyntaxKind[expression.kind]}>`;
}

function flattenHandlers(nodes, sourceFile) {
  return nodes.flatMap(node => {
    const expression = unwrapExpression(node);
    return ts.isArrayLiteralExpression(expression)
      ? flattenHandlers([...expression.elements], sourceFile)
      : [expressionLabel(expression, sourceFile)];
  });
}

function guardSignals(labels) {
  return labels.filter(label => GUARD_SIGNAL_PATTERN.test(label));
}

function routeRegistration(call, method, receiver, sourceFile, bindings, file, sourceOrder) {
  const firstArgument = call.arguments[0];
  const pathKind = firstArgument && ts.isRegularExpressionLiteral(unwrapExpression(firstArgument))
    ? 'regexp'
    : 'string';
  const paths = firstArgument ? pathValues(firstArgument, sourceFile, bindings) : null;
  const handlers = flattenHandlers([...call.arguments].slice(1), sourceFile);
  const middleware = handlers.slice(0, -1);
  const handler = handlers.at(-1) ?? '<missing-handler>';
  const resolvedPaths = paths ?? [`<unresolved:${firstArgument?.getText(sourceFile) ?? 'missing'}>`];
  return resolvedPaths.map((routePath, expansionOrder) => ({
    kind: 'route',
    method: method.toUpperCase(),
    path: routePath,
    pathKind,
    receiver,
    middleware,
    handler,
    guardSignals: guardSignals(middleware),
    source: file,
    sourceOrder,
    ...(resolvedPaths.length > 1 ? { expansionOrder } : {}),
  }));
}

function middlewareRegistration(call, receiver, sourceFile, bindings, file, sourceOrder) {
  const firstArgument = call.arguments[0];
  const resolvedPaths = firstArgument ? pathValues(firstArgument, sourceFile, bindings) : null;
  const hasPath = Boolean(resolvedPaths);
  const handlers = flattenHandlers(
    [...call.arguments].slice(hasPath ? 1 : 0),
    sourceFile,
  );
  return {
    kind: 'middleware',
    paths: hasPath ? resolvedPaths : ['/'],
    receiver,
    handlers,
    guardSignals: guardSignals(handlers),
    source: file,
    sourceOrder,
  };
}

function registrationsFromFile(absolutePath, repositoryRoot) {
  const file = path.relative(repositoryRoot, absolutePath).split(path.sep).join('/');
  const source = readFileSync(absolutePath, 'utf8');
  const sourceFile = ts.createSourceFile(
    absolutePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const bindings = collectSimpleBindings(sourceFile);
  const calls = [];
  const visit = node => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const receiver = node.expression.expression.getText(sourceFile);
      const method = node.expression.name.text;
      if (EXPRESS_RECEIVERS.has(receiver) && HTTP_METHODS.has(method)) {
        calls.push({ call: node, method, receiver, start: node.getStart(sourceFile) });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  calls.sort((left, right) => left.start - right.start);

  return calls.flatMap(({ call, method, receiver }, sourceOrder) => (
    method === 'use'
      ? [middlewareRegistration(call, receiver, sourceFile, bindings, file, sourceOrder)]
      : routeRegistration(call, method, receiver, sourceFile, bindings, file, sourceOrder)
  ));
}

export function collectHttpRouteManifest(repositoryRoot) {
  const serverRoot = path.join(repositoryRoot, 'server');
  const registrations = listTypeScriptFiles(serverRoot)
    .flatMap(file => registrationsFromFile(file, repositoryRoot));
  const routeRegistrations = registrations.filter(entry => entry.kind === 'route');
  const middlewareRegistrations = registrations.filter(entry => entry.kind === 'middleware');
  const unresolvedPaths = routeRegistrations.filter(entry => entry.path.startsWith('<unresolved:'));
  return {
    schemaVersion: 1,
    scope: 'Authored Express route and middleware registrations under server/',
    summary: {
      sourceFiles: new Set(registrations.map(entry => entry.source)).size,
      routeRegistrations: routeRegistrations.length,
      middlewareRegistrations: middlewareRegistrations.length,
      explicitGuardRouteRegistrations: routeRegistrations.filter(entry => entry.guardSignals.length > 0).length,
      unresolvedPaths: unresolvedPaths.length,
    },
    registrations,
  };
}

function main() {
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const manifestPath = path.join(repositoryRoot, 'config/http-route-manifest.json');
  const manifest = collectHttpRouteManifest(repositoryRoot);
  if (manifest.summary.unresolvedPaths > 0) {
    throw new Error(`HTTP route manifest contains ${manifest.summary.unresolvedPaths} unresolved path(s)`);
  }
  const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
  const [mode] = process.argv.slice(2);
  if (mode === '--write') {
    writeFileSync(manifestPath, serialized);
    console.log(`[http-route-manifest] wrote ${manifest.summary.routeRegistrations} routes and ${manifest.summary.middlewareRegistrations} middleware registrations`);
    return;
  }
  if (mode === '--check') {
    const checked = readFileSync(manifestPath, 'utf8');
    if (checked !== serialized) {
      throw new Error('HTTP route manifest drifted; review the contract change and run npm run architecture:http-manifest:update');
    }
    console.log(`[http-route-manifest] stable: ${manifest.summary.routeRegistrations} routes, ${manifest.summary.middlewareRegistrations} middleware registrations`);
    return;
  }
  throw new Error('usage: node scripts/http-route-manifest.mjs <--check|--write>');
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) {
  try {
    main();
  } catch (error) {
    console.error(`[http-route-manifest] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
