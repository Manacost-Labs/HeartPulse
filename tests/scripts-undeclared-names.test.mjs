import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import test from 'node:test';
import ts from 'typescript';

// `node --check` accepts a reference to a name that no longer exists, and a
// script that only fails in a rarely used mode can reach CI that way. The type
// checker reports such names without running anything.
test('repository scripts reference no undeclared names', () => {
  const scripts = execFileSync('git', ['ls-files', 'scripts/*.mjs', 'scripts/*.js', 'scripts/**/*.mjs'], { encoding: 'utf8' })
    .split('\n').filter(Boolean).map(file => resolve(file));
  assert.ok(scripts.length > 50, 'the script list must not be empty');
  const program = ts.createProgram(scripts, {
    allowJs: true, checkJs: true, noEmit: true, skipLibCheck: true,
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext,
  });
  const checked = new Set(scripts);
  // TS2304 "Cannot find name" and TS2552 "Cannot find name, did you mean".
  const undeclared = ts.getPreEmitDiagnostics(program)
    .filter(diagnostic => diagnostic.file && checked.has(resolve(diagnostic.file.fileName)) && [2304, 2552].includes(diagnostic.code))
    .map(diagnostic => {
      const { line } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
      return `${diagnostic.file.fileName.replace(`${process.cwd()}/`, '')}:${line + 1} ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`;
    });
  assert.deepEqual(undeclared, []);
});
