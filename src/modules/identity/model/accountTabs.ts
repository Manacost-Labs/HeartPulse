export type AccountTab = 'personal' | 'subscription' | 'stats' | 'decks';

export const ACCOUNT_TABS: ReadonlyArray<{ id: AccountTab; label: string }> = [
  { id: 'personal', label: 'Персональные данные' },
  { id: 'subscription', label: 'Подписка' },
  { id: 'stats', label: 'Моя статистика' },
  { id: 'decks', label: 'Мои колоды' },
];

/**
 * Section anchors that existed before the account had tabs. FAQ answers, the
 * Boosty row's «Подтвердить» and old bookmarks still link to them, so each
 * one opens the tab that now holds the section.
 */
const SECTION_TABS: Readonly<Record<string, AccountTab>> = {
  'account-access': 'subscription',
  'account-game-stats': 'stats',
  'account-tracker-data': 'stats',
  'account-public-profile': 'personal',
  'account-links': 'personal',
  'account-settings': 'personal',
  'account-contests': 'personal',
};

/** The tab a location hash (`#stats`, `#account-access`) asks for, or null for any other hash. */
export function accountTabFromHash(hash: string): AccountTab | null {
  let key: string;
  try {
    key = decodeURIComponent(hash.replace(/^#/, ''));
  } catch {
    return null;
  }
  if (ACCOUNT_TABS.some(tab => tab.id === key)) return key as AccountTab;
  // Own keys only: `#constructor` must not resolve through the prototype.
  return Object.hasOwn(SECTION_TABS, key) ? SECTION_TABS[key] : null;
}
