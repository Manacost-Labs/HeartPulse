// The shipped cards_ru.json predates the rotation of the three Ranger DBFs.
// Match the old pair, so a refreshed dictionary passes through unchanged.
const prerelease = new Map<string, readonly [number, number]>([
  ['TIME_609', [119705, 119707]],
  ['TIME_609t1', [119706, 119705]],
  ['TIME_609t2', [119707, 119706]],
]);

export function deckDictionaryDbf(cardId: string, dbf: number | null): number | null {
  const correction = prerelease.get(cardId);
  return correction && dbf === correction[0] ? correction[1] : dbf;
}
