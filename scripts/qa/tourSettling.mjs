/** Wait for motion to settle; callers still assert the resulting geometry. */
export async function waitForTourGeometry(page, { timeout = 10_000 } = {}) {
  const state = await page.evaluateHandle(() => ({ geometry: '', stableFrames: 0 }));
  try {
    const ready = await page.waitForFunction(previous => {
      const dialog = document.querySelector('.page-tour__dialog');
      const spotlight = document.querySelector('.ui-tour__spotlight');
      const tour = dialog?.closest('.ui-tour');
      if (!dialog || !spotlight || !tour || document.fonts.status !== 'loaded'
        || tour.getAnimations({ subtree: true }).some(animation => (
          Number.isFinite(animation.effect?.getComputedTiming().endTime)
          && (animation.pending || animation.playState === 'running')
        ))) {
        previous.stableFrames = 0;
        return false;
      }
      const geometry = JSON.stringify([scrollX, scrollY, ...[dialog, spotlight].flatMap(element => {
        const { x, y, width, height } = element.getBoundingClientRect();
        return [x, y, width, height];
      })]);
      previous.stableFrames = geometry === previous.geometry ? previous.stableFrames + 1 : 0;
      previous.geometry = geometry;
      return previous.stableFrames >= 2;
    }, { polling: 'raf', timeout }, state);
    await ready.dispose();
  } finally {
    await state.dispose();
  }
}
