export const CANONICAL_MODULE_ROOTS = Object.freeze(['src/modules', 'server/modules']);

export const CANONICAL_SHARED_ROOTS = Object.freeze([
  Object.freeze({ id: 'shared-root.client', runtime: 'client', root: 'src/shared' }),
  Object.freeze({ id: 'shared-root.server', runtime: 'server', root: 'server/shared' }),
]);

export const MODULE_EXCEPTION_GROUPS = Object.freeze([
  'missingPublicEntry',
  'internalImport',
  'moduleLegacyImport',
  'runtimeCrossing',
  'typeCycle',
]);

export const MAX_EXCEPTION_AGE_DAYS = 180;
