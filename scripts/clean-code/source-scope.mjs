export const CLEAN_CODE_ROOTS = ['src', 'server', 'shared', 'scripts/clean-code'];

export function isAuthoredSource(file) {
  const normalized = String(file || '').replaceAll('\\', '/');
  if (normalized.split('/').includes('vendor')) return false;
  return /^(?:src|server|shared)\/.+\.tsx?$/.test(normalized)
    || /^scripts\/clean-code\/.+\.(?:[cm]?[jt]s)$/.test(normalized);
}
