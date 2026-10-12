/** Russian ё/е and common provider spellings should not hide a relevant answer. */
export function normalizeHelpSearch(value: string): string {
  return value.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е')
    .replace(/бусти/g, 'boosty').replace(/патреон/g, 'patreon')
    .replace(/телеграм/g, 'telegram').replace(/тир[ -]+лист/g, 'тирлист').trim();
}

export function matchesHelpSearch(text: string, query: string): boolean {
  const haystack = normalizeHelpSearch(text);
  return normalizeHelpSearch(query).split(/\s+/).filter(Boolean).every(term => haystack.includes(term));
}
