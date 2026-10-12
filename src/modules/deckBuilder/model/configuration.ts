import { cardCopyLimit, deckCount, type BuilderCard, type BuilderClass, type BuilderEntry } from './selection';

export type CardConfiguration = {
  kind: 'etc' | 'zilliax'; modules: BuilderCard[]; art: BuilderCard[]; banned: string[];
};

export function configurationKind(card: Pick<BuilderCard, 'id'>): CardConfiguration['kind'] | null {
  return card.id === 'ETC_080' ? 'etc' : card.id === 'TOY_330' ? 'zilliax' : null;
}

export const isZilliaxModule = (card: BuilderCard) => /^TOY_330t9[2-9]$/.test(card.id);
export const isZilliaxArt = (card: BuilderCard) => /^TOY_330t(?:[5-9]|1[0-2])$/.test(card.id);

export function canAddSideboard(deck: BuilderEntry[], ownerDbf: number, card: BuilderCard,
  heroClass: BuilderClass, configuration: CardConfiguration, legal?: (card: BuilderCard, current: BuilderEntry[]) => boolean): boolean {
  const owner = deck.find(entry => entry.dbfId === ownerDbf);
  if (!owner || configurationKind(owner) !== configuration.kind) return false;
  const board = owner.sideboard ?? [];
  if (configuration.kind === 'zilliax') {
    if (isZilliaxArt(card)) return configuration.art.some(item => item.dbfId === card.dbfId && item.id === card.id);
    return configuration.modules.some(item => item.dbfId === card.dbfId && item.id === card.id)
      && !board.some(item => item.dbfId === card.dbfId) && board.filter(isZilliaxModule).length < 2;
  }
  if (configuration.banned.includes(card.id) || configurationKind(card)
    || (legal ? !legal(card, deck) : !card.classes.includes('NEUTRAL') && !card.classes.includes(heroClass)) || deckCount(board) >= 3) return false;
  const copies = deck.reduce((total, entry) => total + (entry.dbfId === card.dbfId ? entry.count : 0)
    + (entry.id === 'ETC_080' ? (entry.sideboard ?? []).filter(item => item.dbfId === card.dbfId)
      .reduce((sum, item) => sum + item.count, 0) : 0), 0);
  return copies < cardCopyLimit(card);
}

/** Sideboard cards never occupy main-deck slots; removing an owner removes its board. */
export function changeSideboard(deck: BuilderEntry[], ownerDbf: number, card: BuilderCard, delta: 1 | -1,
  heroClass: BuilderClass, configuration: CardConfiguration, legal?: (card: BuilderCard, current: BuilderEntry[]) => boolean): BuilderEntry[] {
  if (delta > 0 && !canAddSideboard(deck, ownerDbf, card, heroClass, configuration, legal)) return deck;
  return deck.map(owner => {
    if (owner.dbfId !== ownerDbf || configurationKind(owner) !== configuration.kind) return owner;
    let board = owner.sideboard ?? [];
    if (configuration.kind === 'zilliax' && isZilliaxArt(card)) {
      if (delta < 0) return owner;
      board = [...board.filter(item => !isZilliaxArt(item)), { ...card, count: 1 }];
    } else {
      const existing = board.find(item => item.dbfId === card.dbfId);
      if (!existing && delta < 0) return owner;
      board = existing ? board.map(item => item.dbfId === card.dbfId ? { ...item, count: item.count + delta } : item)
        .filter(item => item.count > 0) : [...board, { ...card, count: 1 }];
      if (configuration.kind === 'zilliax' && !board.some(isZilliaxArt) && configuration.art[0]) {
        board = [...board, { ...configuration.art[0], count: 1 }];
      }
    }
    return { ...owner, sideboard: board,
      ...(configuration.kind === 'zilliax' ? { cost: board.filter(isZilliaxModule).reduce((sum, item) => sum + item.cost, 0) } : {}) };
  });
}

export function configurationIssues(deck: BuilderEntry[]): string[] {
  return deck.flatMap(owner => {
    const kind = configurationKind(owner);
    const board = owner.sideboard ?? [];
    if (kind === 'etc' && deckCount(board) !== 3) return [`${owner.name}: выберите 3 карты для группы (${deckCount(board)}/3)`];
    if (kind === 'zilliax' && (board.filter(isZilliaxModule).length !== 2 || board.filter(isZilliaxArt).length !== 1
      || board.some(item => item.count !== 1) || new Set(board.map(item => item.dbfId)).size !== 3)) {
      return [`${owner.name}: выберите 2 разных модуля и вариант арта`];
    }
    return [];
  });
}
