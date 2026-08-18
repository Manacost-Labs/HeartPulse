import { lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  focusedTestScriptId,
  packageScriptExists,
  packageScriptLifecycleHooks,
} from './npm-script-policy.mjs';

export function addInventoryError(errors, code, message, details = {}) {
  errors.push({ code, message, ...details });
}

export function isInventoryRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isRegularFile(path) {
  try {
    return lstatSync(path).isFile();
  } catch {
    return false;
  }
}

export function readPackageJsonForValidation(rootDir, errors) {
  const packagePath = join(rootDir, 'package.json');
  if (!isRegularFile(packagePath)) {
    addInventoryError(errors, 'invalid-package-json', 'package.json must be a regular file');
    return {};
  }
  try {
    const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
    if (!isInventoryRecord(packageJson)) throw new Error('root value must be an object');
    return packageJson;
  } catch (error) {
    addInventoryError(errors, 'invalid-package-json', `package.json is invalid: ${error.message}`);
    return {};
  }
}

export function validateFocusedTests(ownerLabel, commands, packageJson, errors) {
  for (const command of commands) {
    const script = focusedTestScriptId(command);
    if (!script) {
      addInventoryError(
        errors,
        'invalid-focused-test-command',
        `${ownerLabel} focusedTests must contain exact allowlisted npm run test:* commands`,
      );
    } else if (!packageScriptExists(packageJson, script)) {
      addInventoryError(
        errors,
        'missing-focused-test-script',
        `${ownerLabel} references missing package script ${script}`,
      );
    } else {
      const hooks = packageScriptLifecycleHooks(packageJson, script);
      if (hooks.length > 0) {
        addInventoryError(
          errors,
          'focused-test-lifecycle-hook',
          `${ownerLabel} focused test ${script} must not have pre/post lifecycle hooks`,
        );
      }
    }
  }
}
