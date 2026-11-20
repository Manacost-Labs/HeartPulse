/** Russian plural form of a count: «1 существо», «2 существа», «5 существ». */
export function pluralRu(count: number, one: string, few: string, many: string): string {
  const tail = count % 100;
  if (tail >= 11 && tail <= 14) return many;
  const last = count % 10;
  if (last === 1) return one;
  return last >= 2 && last <= 4 ? few : many;
}

export const creaturesLabel = (count: number): string => pluralRu(count, 'существо', 'существа', 'существ');
