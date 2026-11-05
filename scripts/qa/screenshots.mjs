/** Responsive evidence remains mandatory; other captures are optional diagnostics. */
export function screenshotCapture(mode = 'all') {
  if (!['all', 'responsive'].includes(mode)) throw new Error('QA_SCREENSHOTS must be all or responsive');
  return (target, options) => mode === 'all' ? target?.screenshot(options) : undefined;
}
