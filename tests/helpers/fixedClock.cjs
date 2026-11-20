// Preloaded into a Next server under test (`--require`): `Date.now()` and `performance.now()` start at
// `TEST_CLOCK_AT` (an ISO date) and run on from there, so a page that prints the date of its data, or
// leaves the month out of its title when the data is a week old, renders the same text on any day.
// A clock ahead of the build makes every prerendered copy stale: its next request regenerates it.
const realNow = Date.now;
const realPerformanceNow = performance.now.bind(performance);
const offset = Date.parse(process.env.TEST_CLOCK_AT ?? '') - realNow();
if (!Number.isFinite(offset)) throw new Error('fixedClock.cjs needs TEST_CLOCK_AT');
Date.now = () => realNow() + offset;
performance.now = () => realPerformanceNow() + offset;
