export interface StrategyCard {
  id?: string;
  dbfId?: number | null;
  name?: string;
  ruName?: string;
  role?: string;
}

/** One meta build from `/bg-legacy/comps-data.js` (HSReplay and Firestone snapshot, English text). */
export interface StrategyEntry {
  key: string;
  source: string;
  title: string;
  description?: string;
  tier?: string;
  difficulty?: string;
  avgPlacement?: string;
  cards?: StrategyCard[];
}

export type StrategyRow = {
  key: string;
  label: string;
  title: string;
  description: string | null;
  minions: Array<{ key: string; name: string; image: string; current: boolean }>;
};

const TIER_ORDER = ['S', 'A', 'B', 'C', 'D'];
export const STRATEGY_ROWS_SHOWN = 5;
const MINIONS_SHOWN = 5;

/**
 * HSReplay descriptions repeat the build name after a tribe prefix
 * ("Pirates - Bounty APM Bounties generate gold"); only the sentence after it is new.
 */
export function strategyDescription(entry: Pick<StrategyEntry, 'title' | 'description'>): string | null {
  let text = (entry.description ?? '').replace(/\s+/g, ' ').trim();
  const prefix = /^[^-–]{2,40}\s[-–]\s/.exec(text);
  if (prefix) text = text.slice(prefix[0].length);
  if (text.toLowerCase() === entry.title.trim().toLowerCase()) return null;
  const titleWords = entry.title.trim().split(/\s+/);
  // At least two words of the name, so a description that merely starts like it stays whole.
  for (let count = titleWords.length; count >= Math.min(2, titleWords.length); count--) {
    const head = titleWords.slice(-count).join(' ');
    if (text.toLowerCase().startsWith(`${head.toLowerCase()} `)) { text = text.slice(head.length).trim(); break; }
  }
  return text || null;
}

/** Builds sorted by tier (S first; HSReplay has none), each with up to five key minions: this one, then core, then add-ons. */
export function strategyRows(entries: readonly StrategyEntry[], currentDbfId: number, imageFor: (cardId: string) => string): StrategyRow[] {
  const rank = (tier?: string) => {
    const index = TIER_ORDER.indexOf(String(tier ?? '').trim().toUpperCase());
    return index < 0 ? TIER_ORDER.length : index;
  };
  return [...entries]
    .map((entry, index) => ({ entry, index }))
    .sort((left, right) => rank(left.entry.tier) - rank(right.entry.tier) || left.index - right.index)
    .map(({ entry }) => {
      // The spreadsheet-born snapshot carries placeholders such as "#N/A" instead of card ids.
      const cards = (entry.cards ?? []).filter(card => /^[A-Za-z0-9_]+$/.test(card.id ?? ''));
      // The page's own minion leads, so the row shows why the build is listed here.
      const current = cards.filter(card => Number(card.dbfId) === currentDbfId);
      const rest = cards.filter(card => Number(card.dbfId) !== currentDbfId);
      const ordered = [...current, ...rest.filter(card => card.role === 'CORE'), ...rest.filter(card => card.role !== 'CORE')];
      const tier = String(entry.tier ?? '').trim().toUpperCase();
      return {
        key: entry.key,
        label: tier ? `${entry.source} · ${tier}` : entry.source,
        title: entry.title,
        description: strategyDescription(entry),
        minions: ordered.slice(0, MINIONS_SHOWN).map(card => ({
          key: `${card.id}-${card.dbfId ?? ''}`,
          name: card.ruName || card.name || String(card.id),
          image: imageFor(String(card.id)),
          current: Number(card.dbfId) === currentDbfId,
        })),
      };
    });
}
