export const AGENT_CHECK_BASE_SCRIPTS = [
  { script: 'lint:module-boundaries', source: 'architecture' },
  { script: 'lint', source: 'typecheck' },
];

export const FOCUSED_TEST_COMMAND_PATTERN = /^npm run (test:[a-z0-9]+(?:[-:][a-z0-9]+)*)$/;
export const FOCUSED_TEST_SCRIPT_PATTERN = /^test:[a-z0-9]+(?:[-:][a-z0-9]+)*$/;

export function focusedTestScriptId(command) {
  if (typeof command !== 'string') return null;
  return FOCUSED_TEST_COMMAND_PATTERN.exec(command)?.[1] ?? null;
}

export function packageScriptExists(packageJson, scriptId) {
  return packageJson !== null
    && typeof packageJson === 'object'
    && !Array.isArray(packageJson)
    && packageJson.scripts !== null
    && typeof packageJson.scripts === 'object'
    && !Array.isArray(packageJson.scripts)
    && Object.hasOwn(packageJson.scripts, scriptId)
    && typeof packageJson.scripts[scriptId] === 'string'
    && packageJson.scripts[scriptId].trim().length > 0;
}

export function packageScriptLifecycleHooks(packageJson, scriptId) {
  return [`pre${scriptId}`, `post${scriptId}`]
    .filter(hook => packageScriptExists(packageJson, hook));
}
