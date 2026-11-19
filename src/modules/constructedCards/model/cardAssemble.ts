import { cardChoiceWinrateTone } from './cardChoices';

export { formatChoicePercent } from './cardChoices';

/**
 * «Сборка» (Assemble) of a card, as `/api/card-assemble/:format/:cardId` answers it
 * (the Express projection of hs-data-api `/v1/hsreplay/assemble`). Percentages are 0–100.
 */
export type AssembleHalf = 'effect' | 'trigger';
export type AssembleCard = { cardId: string; dbfId: number; name: string; cost: number | null; cardClass: string | null; rarity: string | null };
export type AssembleText = { trigger: string; effect: string; locale: 'ru' | 'en' };
export type AssembleOption = {
  /** The half of the DONOR; the other half comes from the base. */
  half: AssembleHalf;
  /** Full text is `trigger + ' ' + effect`. */
  text: AssembleText | null;
  pickRate: number | null;
  winRate: number | null;
  picks: number | null;
  lowSample: boolean;
  undervalued: boolean;
};
export type AssembleDonor = {
  card: AssembleCard;
  offerRate: number | null;
  pickRate: number | null;
  winRate: number | null;
  picks: number | null;
  lowSample: boolean;
  /** `[effect, trigger]`. */
  options: AssembleOption[];
};
export type AssembleBase = {
  card: AssembleCard;
  offerRate: number | null;
  winRate: number | null;
  lowSample: boolean;
  donorsTotal: number;
  /** `null`: the donors of this base are not loaded. */
  donors: AssembleDonor[] | null;
};
export type CardAssembleData = {
  cardId: string;
  format: 'standard' | 'wild';
  /** `ok`, `no_data`, `not_collected` or `failed`. */
  state: string;
  checkedAt: string | null;
  asOf: string | null;
  stale: boolean;
  sourceUrl: string | null;
  timeRange: string;
  originalClassOnly: boolean;
  basesTotal: number;
  winRate: number | null;
  bases: AssembleBase[];
};

export type AssembleVariant = { donor: AssembleDonor; option: AssembleOption };
export type AssembleBestOffered = {
  best: AssembleVariant;
  /** Every variant had a small sample: the pick is the best of weak data. */
  lowSample: boolean;
  /** The four variants of the two donors. */
  variants: AssembleVariant[];
};

// The keyword is a bold «Собирает» / «собираете» ("Вы собираете…") / «Assemble». No HSJ card carries the ASSEMBLE mechanic (checked 2026-11-18).
const ASSEMBLE_KEYWORD = /<b>\s*(?:собира(?:ет|ете)|assemble)(?![\p{L}])/iu;

/** A card with the Assemble keyword in its Russian or English text (or the ASSEMBLE mechanic, for later). */
export function isAssembleCard(card: {
  mechanics?: readonly unknown[] | null;
  text?: { ru?: string | null; en?: string | null } | null;
} | null | undefined): boolean {
  if (!card) return false;
  if ((card.mechanics ?? []).some(item => String(item).toUpperCase() === 'ASSEMBLE')) return true;
  return [card.text?.ru, card.text?.en].some(value => typeof value === 'string' && ASSEMBLE_KEYWORD.test(value));
}

export function assembleFullText(text: AssembleText | null): string | null {
  return text ? `${text.trigger} ${text.effect}` : null;
}

/** Descending by a nullable number; nulls last. */
function byDescending(a: number | null, b: number | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return b - a;
}

/** All «лучшие сборки» of a base: donor options by pick rate, small samples at the end. */
export function assembleOptionsOfBase(base: AssembleBase): AssembleVariant[] {
  const variants = (base.donors ?? []).flatMap(donor => donor.options.map(option => ({ donor, option })));
  return variants
    .map((variant, index) => ({ variant, index }))
    .sort((a, b) => Number(a.variant.option.lowSample) - Number(b.variant.option.lowSample)
      || byDescending(a.variant.option.pickRate, b.variant.option.pickRate)
      || a.index - b.index)
    .map(item => item.variant);
}

/** Average winrate of the base's options with a real sample: the line its options are compared against. */
export function assembleMeanWinrate(base: AssembleBase): number | null {
  const solid = (base.donors ?? []).flatMap(donor => donor.options).filter(option => !option.lowSample && option.winRate !== null);
  return solid.length ? solid.reduce((sum, option) => sum + (option.winRate ?? 0), 0) / solid.length : null;
}

/** Winrate tone against the base's own average, as for card choices. */
export function assembleWinrateTone(value: number | null, base: AssembleBase): 'positive' | 'negative' | 'neutral' {
  return cardChoiceWinrateTone(value, assembleMeanWinrate(base));
}

function better(a: AssembleVariant, b: AssembleVariant): AssembleVariant {
  const byWinrate = byDescending(a.option.winRate, b.option.winRate);
  if (byWinrate !== 0) return byWinrate < 0 ? a : b;
  return byDescending(a.option.pickRate, b.option.pickRate) <= 0 ? a : b;
}

/**
 * «Мне предложили»: the best of the four variants of two offered donors (each donor's
 * effect and trigger) — the highest winrate among variants with a real sample; when
 * all are small samples, the highest winrate flagged `lowSample`. A tie goes to the
 * higher pick rate. `null` when the donors are not in the base or no variant has a winrate.
 */
export function bestOfOffered(
  base: AssembleBase,
  donorA: AssembleDonor | string,
  donorB: AssembleDonor | string,
): AssembleBestOffered | null {
  const find = (donor: AssembleDonor | string) => (base.donors ?? []).find(item => item.card.cardId === (typeof donor === 'string' ? donor : donor.card.cardId));
  const a = find(donorA);
  const b = find(donorB);
  if (!a || !b || a === b) return null;
  const variants = [a, b].flatMap(donor => donor.options.map(option => ({ donor, option })));
  const ranked = variants.filter(variant => variant.option.winRate !== null);
  const solid = ranked.filter(variant => !variant.option.lowSample);
  const pool = solid.length ? solid : ranked;
  if (!pool.length) return null;
  return { best: pool.reduce(better), lowSample: !solid.length, variants };
}

/** The base whose donors are loaded: the one the answer was requested for. */
export function assembleActiveBase(data: CardAssembleData): AssembleBase | null {
  return data.bases.find(base => base.donors !== null) ?? null;
}

/** The base with the highest winrate among those with a real sample; `null` without one. */
export function assembleBestBase(data: CardAssembleData): AssembleBase | null {
  const solid = data.bases.filter(base => !base.lowSample && base.winRate !== null);
  return solid.length ? solid.reduce((best, base) => ((base.winRate ?? 0) > (best.winRate ?? 0) ? base : best)) : null;
}

/** Donors of a base that «Мне предложили» can rank: those with HSReplay winrate data, most offered first. */
export function assembleRankableDonors(base: AssembleBase): AssembleDonor[] {
  return (base.donors ?? [])
    .filter(donor => donor.options.some(option => option.winRate !== null))
    .sort((a, b) => byDescending(a.offerRate, b.offerRate));
}

/** Bases in the order of the «Что выпало?» ribbon: most offered first, ties by name. */
export function assembleBasesByOffer(data: CardAssembleData): AssembleBase[] {
  return [...data.bases].sort((a, b) => byDescending(a.offerRate, b.offerRate) || a.card.name.localeCompare(b.card.name, 'ru'));
}
