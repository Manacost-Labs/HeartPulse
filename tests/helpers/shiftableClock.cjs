// Preloaded into a Next server under test (`--require`): every SIGUSR2 moves
// `Date.now()` and `performance.now()` (Next's cache reads the latter) one hour ahead, so a prerendered page counts as stale and the
// next request regenerates it, without waiting for its five-minute window.
const realNow = Date.now;
const realPerformanceNow = performance.now.bind(performance);
let offset = 0;
Date.now = () => realNow() + offset;
performance.now = () => realPerformanceNow() + offset;
process.on('SIGUSR2', () => { offset += 60 * 60 * 1000; });
