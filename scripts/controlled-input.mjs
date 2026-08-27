/**
 * Replaces an existing input value through the same focus and keyboard events
 * used by a real operator, so React-controlled fields observe every change.
 */
export async function replaceControlledInputValue(page, target, value) {
  const input = typeof target === 'string' ? await page.$(target) : target;
  if (!input) throw new Error(`Controlled input is missing: ${String(target)}`);

  await input.focus();
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.keyboard.down(modifier);
  try {
    await page.keyboard.press('A');
  } finally {
    await page.keyboard.up(modifier);
  }
  await input.type(value);
}
