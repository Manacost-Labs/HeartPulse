import {
  assembleBasesByOffer, assembleRankableDonors,
  type AssembleBase, type AssembleDonor, type AssembleOption, type AssemblePoolDonor, type AssembleVariant, type CardAssembleData,
} from './cardAssemble';

/** The 11 player classes, in the order of the game's class selection. */
export const ASSEMBLE_PLAYER_CLASSES: readonly { key: string; label: string }[] = [
  { key: 'DEATHKNIGHT', label: 'Рыцарь смерти' },
  { key: 'DEMONHUNTER', label: 'Охотник на демонов' },
  { key: 'DRUID', label: 'Друид' },
  { key: 'HUNTER', label: 'Охотник' },
  { key: 'MAGE', label: 'Маг' },
  { key: 'PALADIN', label: 'Паладин' },
  { key: 'PRIEST', label: 'Жрец' },
  { key: 'ROGUE', label: 'Разбойник' },
  { key: 'SHAMAN', label: 'Шаман' },
  { key: 'WARLOCK', label: 'Чернокнижник' },
  { key: 'WARRIOR', label: 'Воин' },
];

const NEUTRAL = 'NEUTRAL';

/** The donor pool depends on the player's class (the neutral F3TCH3R) and the answer carries a checked one. */
export function assembleClassDependent(data: CardAssembleData | null): boolean {
  return data?.donorPoolStatus?.state === 'ok' && data.donorPoolStatus.classDependent;
}

/** Bases a player of this class can be rolled: the class's own and neutral ones (all, until a class is chosen). */
export function assembleBasesForClass<T extends AssembleBase>(bases: readonly T[], playerClass: string | null): T[] {
  return playerClass ? bases.filter(base => base.card.cardClass === playerClass || base.card.cardClass === NEUTRAL) : [...bases];
}

/** The base to move to when the class changes: `null` while the shown base can still be rolled by the class. */
export function assembleBaseAfterClassChange(data: CardAssembleData, shown: AssembleBase | null, next: string | null): number | null {
  if (!next || !shown) return null;
  const allowed = assembleBasesForClass(assembleBasesByOffer(data), next);
  return allowed.some(base => base.card.dbfId === shown.card.dbfId) ? null : allowed[0]?.card.dbfId ?? null;
}

/** A donor that never met the base: its texts, and no percentage anywhere. */
function withoutStats(donor: AssemblePoolDonor): AssembleDonor {
  const options: AssembleOption[] = donor.options.map(option => ({
    half: option.half, text: option.text, pickRate: null, winRate: null, picks: null, lowSample: true, undervalued: false,
  }));
  return { card: donor.card, offerRate: null, pickRate: null, winRate: null, picks: null, lowSample: true, options, noStats: true };
}

/**
 * Donors «Мне предложили» can pick from. With the full pool: every pool donor (of the chosen class
 * and neutral ones when the pool depends on the class), those with statistics first, then those
 * that never met the base. Without a pool (not requested, mismatch, unavailable): the donors with
 * HSReplay winrate data, as before.
 */
export function assembleOfferedDonors(data: CardAssembleData, base: AssembleBase, playerClass: string | null): AssembleDonor[] {
  const pool = data.donorPoolStatus?.state === 'ok' ? base.donorPool : null;
  if (!pool?.length) return assembleRankableDonors(base);
  const classDependent = data.donorPoolStatus?.classDependent === true;
  if (classDependent && !playerClass) return [];
  const known = new Map((base.donors ?? []).map(donor => [donor.card.cardId, donor]));
  const donors = pool
    .filter(donor => !classDependent || donor.card.cardClass === playerClass || donor.card.cardClass === NEUTRAL)
    .map(donor => (donor.hasStats ? known.get(donor.card.cardId) ?? withoutStats(donor) : withoutStats(donor)));
  return [...donors.filter(donor => !donor.noStats), ...donors.filter(donor => donor.noStats)];
}

/** The four variants of two donors; variants without statistics sort last, the rest by winrate. */
export function assembleOfferedVariants(a: AssembleDonor, b: AssembleDonor): AssembleVariant[] {
  return [a, b]
    .flatMap(donor => donor.options.map(option => ({ donor, option })))
    .map((variant, index) => ({ variant, index }))
    .sort((x, y) => (y.variant.option.winRate ?? -1) - (x.variant.option.winRate ?? -1) || x.index - y.index)
    .map(item => item.variant);
}
