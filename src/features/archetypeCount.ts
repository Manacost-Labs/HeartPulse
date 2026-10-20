/** «N архетипов» with the Russian plural form for N. */
export const formatArchetypeCount = (count: number) => {
  const lastTwo = count % 100;
  const last = count % 10;
  const noun = lastTwo >= 11 && lastTwo <= 14
    ? 'архетипов'
    : last === 1
      ? 'архетип'
      : last >= 2 && last <= 4
        ? 'архетипа'
        : 'архетипов';
  return `${count} ${noun}`;
};
