export const CLEAN_CODE_ROOTS = ['src', 'server', 'shared'];

export function isAuthoredSource(file) {
  const normalized = String(file || '').replaceAll('\\', '/');
  return /^(?:src|server|shared)\/.+\.tsx?$/.test(normalized)
    && !normalized.split('/').includes('vendor');
}
