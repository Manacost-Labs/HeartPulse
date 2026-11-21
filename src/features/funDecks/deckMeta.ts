import { FUN_DECK_CLASSES, funDeckClassId, type FunDeckRow } from '../funDecksPreview';
import { SERVER_RENDER_TIME_ZONE } from '../../shared/ui/serverRenderTimeZone';

export type FunDeckClassMeta = { label: string; color: string; icon: string };

const CLASS_META: Record<string, FunDeckClassMeta> = Object.fromEntries(
  FUN_DECK_CLASSES.map(item => [item.id, item]),
);

const HERO_CLASS_BY_DBF: Record<number, string> = {
  7: 'warrior',
  31: 'hunter',
  274: 'druid',
  637: 'mage',
  671: 'paladin',
  813: 'priest',
  893: 'warlock',
  930: 'rogue',
  1066: 'shaman',
  56550: 'demonhunter',
  78065: 'deathknight',
};

export function funDeckFormat(deck: FunDeckRow): 'standard' | 'wild' {
  return deck.format.toLowerCase() === 'wild' ? 'wild' : 'standard';
}

export function funDeckFormatLabel(deck: FunDeckRow): string {
  return funDeckFormat(deck) === 'wild' ? 'Вольный формат' : 'Стандарт';
}

/** The deck's class from the dataset, else from the resolved hero, else a neutral placeholder. */
export function funDeckClassMeta(deck: FunDeckRow, heroDbfId?: number | null): FunDeckClassMeta {
  const resolvedClass = heroDbfId ? HERO_CLASS_BY_DBF[heroDbfId] : '';
  return CLASS_META[funDeckClassId(deck)] || CLASS_META[resolvedClass] || {
    label: deck.className && deck.className !== '—' ? deck.className : 'Класс определяется',
    color: '#67131c',
    icon: '/arena-logo-icon.webp',
  };
}

const DATA_DATE = new Intl.DateTimeFormat('ru-RU', { timeZone: SERVER_RENDER_TIME_ZONE, day: 'numeric', month: 'long', year: 'numeric' });

/**
 * When the deck was last seen (else first seen), «20 ноября 2026 г.», for the
 * card's «Данные на». One fixed zone on the server and in the browser, so the
 * date hydrates as rendered. `null` for a missing or unreadable date.
 */
export function funDeckDataDate(deck: Pick<FunDeckRow, 'lastSeenAt' | 'firstSeenAt'>): { iso: string; label: string } | null {
  const timestamp = Date.parse(deck.lastSeenAt ?? deck.firstSeenAt ?? '');
  if (!Number.isFinite(timestamp)) return null;
  const at = new Date(timestamp);
  return { iso: at.toISOString(), label: DATA_DATE.format(at) };
}
