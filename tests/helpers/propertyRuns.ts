import fc from 'fast-check';

/**
 * fast-check settings of the property tests. The seed is fixed so a CI run is
 * reproducible; `FAST_CHECK_SEED=<n>` replays or varies it. A failure prints the
 * seed, the replay path and the shrunk counterexample.
 */
export const propertyRuns = {
  numRuns: Number(process.env.FAST_CHECK_RUNS || 300),
  seed: Number(process.env.FAST_CHECK_SEED || 20_261_027),
};

export function assertProperty<Ts extends [unknown, ...unknown[]]>(property: fc.IProperty<Ts>): void {
  fc.assert(property, propertyRuns);
}

export function assertAsyncProperty<Ts extends [unknown, ...unknown[]]>(property: fc.IAsyncProperty<Ts>): Promise<void> {
  return fc.assert(property, propertyRuns);
}
