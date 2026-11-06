/** Creates a browser-side function handle for synchronous CSS measurements.
 * Temporary elements must be gone before React can resume hydration.
 */
export function createHomeOrbitInspector() {
  return (element, inspect) => {
    const fixtures = [];
    try {
      const board = element.querySelector('.home-draft-orbit__board');
      if (!element.querySelector('.home-orbit-class__copy')) {
        const fixture = document.createElement('div');
        fixture.dataset.qaHomeOrbitFixture = 'true';
        fixture.className = 'home-orbit-class';
        fixture.setAttribute('aria-hidden', 'true');
        fixture.style.visibility = 'hidden';
        fixture.innerHTML = `
          <span class="home-orbit-class__icon"><img alt="" width="44" height="44"></span>
          <span class="home-orbit-class__copy"><small>Class</small><strong>Name</strong><b>50%</b></span>`;
        board?.append(fixture);
        fixtures.push(fixture);
      }
      if (!element.querySelector('.home-orbit-empty')) {
        const emptyFixture = document.createElement('div');
        emptyFixture.dataset.qaHomeOrbitEmptyFixture = 'true';
        emptyFixture.className = 'home-orbit-empty';
        emptyFixture.setAttribute('aria-hidden', 'true');
        emptyFixture.style.visibility = 'hidden';
        board?.append(emptyFixture);
        fixtures.push(emptyFixture);
      }
      return inspect();
    } finally {
      for (const fixture of fixtures) fixture.remove();
    }
  };
}
