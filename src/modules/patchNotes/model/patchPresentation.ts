import type { PatchCardView, PatchKindCounts, PatchView } from './patchEntries';
import type { PatchNotesSummary } from './types';

/* What the page shows around the changes: the expansion cycle, the hero's lead and the archive timeline. */

/**
 * Every major client version opens one expansion cycle: 35.0 shipped
 * «КАТАКЛИЗМ», 35.6 is still its cycle. Majors are confirmed by the archive's
 * own article titles (25, 26, 28–30, 32, 33, 35, 37) or by the release order
 * of the card catalog's sets; a major the archive has no patch of is left out
 * rather than guessed. Codes are HearthstoneJSON `set` values.
 */
const EXPANSION_BY_MAJOR: Readonly<Record<number, string>> = {
  18: 'SCHOLOMANCE',
  21: 'STORMWIND',
  23: 'THE_SUNKEN_CITY',
  24: 'REVENDRETH',
  25: 'RETURN_OF_THE_LICH_KING',
  26: 'BATTLE_OF_THE_BANDS',
  27: 'TITANS',
  28: 'WILD_WEST',
  29: 'WHIZBANGS_WORKSHOP',
  30: 'ISLAND_VACATION',
  31: 'SPACE',
  32: 'EMERALD_DREAM',
  33: 'THE_LOST_CITY',
  34: 'TIME_TRAVEL',
  35: 'CATACLYSM',
  36: 'ESCAPEFROM_VIOLET_HOLD',
  37: 'BE',
};

/** The expansion whose cycle a version belongs to, `null` for a cycle not listed above. */
export function patchExpansionCode(version: string): string | null {
  const major = Number.parseInt(version, 10);
  return Number.isSafeInteger(major) ? EXPANSION_BY_MAJOR[major] ?? null : null;
}

/**
 * The article title opens with the version ("Обновление 36.4.2 уже в игре:"),
 * which the header already shows; the rest is the patch's point in one line.
 */
const HEADLINE_HEAD = /^(?:\([^)]*\)\s*)?(?:обновление|патч)\s+\d+(?:\.\d+)*(?:\s+уже в игре)?\s*(?:[:!—–-]\s*|$)/iu;

/** The title without its version prefix, `null` when nothing else is left; a title in another shape is kept whole. */
export function patchHeadline(title: string): string | null {
  const text = title.trim();
  const head = HEADLINE_HEAD.exec(text);
  if (!head) return text || null;
  const rest = text.slice(head[0].length).replace(/\s*[—–-]?\s*уже в игре!?$/iu, '').trim();
  return rest ? rest.charAt(0).toLocaleUpperCase('ru-RU') + rest.slice(1) : null;
}

/** Whose art leads the patch header: Battlegrounds when most changes are there, else the most changed class. */
export type PatchHeroLead = { mode: 'battlegrounds' } | { classKey: string };

export function patchHeroLead(view: PatchView): PatchHeroLead | null {
  const battlegrounds = view.sections.find(section => section.id === 'battlegrounds')?.count ?? 0;
  if (battlegrounds > view.total - battlegrounds) return { mode: 'battlegrounds' };
  const byClass = new Map<string, number>();
  for (const card of view.groups.flatMap(group => group.entries)) {
    if (card.classKey) byClass.set(card.classKey, (byClass.get(card.classKey) ?? 0) + 1);
  }
  // Map order is view order, so a tie goes to the class shown first.
  const [lead] = [...byClass.entries()].sort((left, right) => right[1] - left[1]);
  if (lead) return { classKey: lead[0] };
  return battlegrounds > 0 ? { mode: 'battlegrounds' } : null;
}

/** Art this wide fills a featured plate without visible upscaling after the proxy's resize. */
const FEATURED_ART_MIN_WIDTH = 1000;

export function patchHasWideArtwork(card: PatchCardView): card is PatchCardView & { artwork: NonNullable<PatchCardView['artwork']> } {
  return (card.artwork?.width ?? 0) >= FEATURED_ART_MIN_WIDTH;
}

/** The first card, in the given order, whose wiki art is wide enough to carry a featured plate. */
export function patchFeaturedArtwork(cards: readonly PatchCardView[]): { card: PatchCardView; url: string } | null {
  const card = cards.find(patchHasWideArtwork);
  return card ? { card, url: card.artwork.url } : null;
}

/** Consecutive patches of one expansion cycle; `code` is `null` for an unlisted cycle. */
export type PatchArchiveGroup = { key: string; code: string | null; patches: PatchNotesSummary[] };

/** The archive (newest first) cut into expansion cycles, keeping its order. */
export function patchArchiveByExpansion(patches: readonly PatchNotesSummary[]): PatchArchiveGroup[] {
  const groups: PatchArchiveGroup[] = [];
  for (const patch of patches) {
    const code = patchExpansionCode(patch.version);
    const key = code ?? `major-${Number.parseInt(patch.version, 10)}`;
    const last = groups.at(-1);
    if (last?.key === key) last.patches.push(patch);
    else groups.push({ key, code, patches: [patch] });
  }
  return groups;
}

/** Whole-percent shares of buffs, nerfs and reworks for share bars; all zero for an empty count. */
export function patchKindShares(kinds: PatchKindCounts): PatchKindCounts {
  const total = kinds.buff + kinds.nerf + kinds.rework;
  if (!total) return { buff: 0, nerf: 0, rework: 0 };
  const share = (value: number) => Math.round((value / total) * 100);
  return { buff: share(kinds.buff), nerf: share(kinds.nerf), rework: share(kinds.rework) };
}

/** A node of the "changed cards → affected archetypes" flow; `href` is where a click leads. */
export type PatchFlowNode = {
  id: string;
  kind: 'card' | 'archetype';
  label: string;
  href: string;
  /** Buff, nerf or rework of a card node. */
  cardKind?: PatchCardView['kind'];
  classKey: string | null;
};
export type PatchFlowLink = { source: string; target: string; value: number };

/**
 * Changed cards flowing into today's archetypes that play them. A link is the
 * number of the archetype's listed builds that contain the card (`decks`), so
 * an archetype's height counts card appearances, not distinct builds. Only the
 * `archetypes` most popular archetypes are kept, and the cards that reach them.
 */
export function patchMetaFlow(view: PatchView, { archetypes = 10 } = {}): { nodes: PatchFlowNode[]; links: PatchFlowLink[] } {
  const cards = view.groups.flatMap(group => group.entries).filter(card => card.archetypes.length > 0);
  const byArchetype = new Map<string, { node: PatchFlowNode; popularity: number }>();
  for (const card of cards) {
    for (const use of card.archetypes) {
      const id = `archetype:${use.format}:${use.slug}`;
      if (!byArchetype.has(id)) {
        byArchetype.set(id, { node: { id, kind: 'archetype', label: use.name, href: use.href, classKey: use.classKey }, popularity: use.popularity ?? 0 });
      }
    }
  }
  const kept = new Set([...byArchetype.entries()].sort((left, right) => right[1].popularity - left[1].popularity)
    .slice(0, archetypes).map(([id]) => id));
  const links: PatchFlowLink[] = [];
  const cardNodes: PatchFlowNode[] = [];
  for (const card of cards) {
    const id = `card:${card.anchor}`;
    const own = card.archetypes.filter(use => kept.has(`archetype:${use.format}:${use.slug}`) && use.decks > 0);
    if (!own.length) continue;
    cardNodes.push({ id, kind: 'card', label: card.name, href: card.cardUrl ?? `#${card.anchor}`, cardKind: card.kind, classKey: card.classKey });
    for (const use of own) links.push({ source: id, target: `archetype:${use.format}:${use.slug}`, value: use.decks });
  }
  const targets = new Set(links.map(link => link.target));
  const archetypeNodes = [...byArchetype.values()].filter(({ node }) => targets.has(node.id))
    .sort((left, right) => right.popularity - left.popularity).map(({ node }) => node);
  return { nodes: [...cardNodes, ...archetypeNodes], links };
}
