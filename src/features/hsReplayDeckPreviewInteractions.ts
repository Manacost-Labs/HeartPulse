import type { CardPreviewTarget } from './CardPreviewTooltip';
import type { CardPreviewSheetCard } from './CardPreviewSheet';
import type { HsReplayDeckCard } from './HsReplayDeckList';

export type DeckPreviewInteractionOptions = {
  container: HTMLElement;
  cards: HsReplayDeckCard[];
  showPreview: (preview: CardPreviewTarget) => void;
  hidePreview: (cardId: string) => void;
  openSheet: (card: CardPreviewSheetCard, trigger: HTMLElement) => void;
};

export function bindDeckPreviewInteractions({
  container,
  cards,
  showPreview,
  hidePreview,
  openSheet,
}: DeckPreviewInteractionOptions): () => void {
  const cardsById = new Map(cards.map(card => [card.id, card]));
  container.querySelectorAll<HTMLElement>('.hsrdv-card-tile').forEach(tile => {
    const card = cardsById.get(tile.dataset.cardId || '');
    if (!card) return;
    tile.tabIndex = 0;
    tile.setAttribute('role', 'button');
    tile.setAttribute('aria-haspopup', 'dialog');
    tile.setAttribute('aria-label', `Открыть полную карту «${card.name}», ${card.cost} маны`);
    tile.dataset.cardPreviewTrigger = '';
  });

  const resolveTile = (target: EventTarget | null) => {
    const tile = target instanceof Element ? target.closest<HTMLElement>('.hsrdv-card-tile') : null;
    const card = tile && container.contains(tile) ? cardsById.get(tile.dataset.cardId || '') : null;
    return tile && card ? { tile, card } : null;
  };
  const show = (event: MouseEvent | FocusEvent) => {
    const resolved = resolveTile(event.target);
    if (!resolved || (event.relatedTarget instanceof Node && resolved.tile.contains(event.relatedTarget))) return;
    const { card, tile } = resolved;
    showPreview({ id: card.id, name: card.name, imageUrl: card.cardImage, rect: tile.getBoundingClientRect() });
  };
  const hide = (event: MouseEvent | FocusEvent) => {
    const resolved = resolveTile(event.target);
    if (!resolved || (event.relatedTarget instanceof Node && resolved.tile.contains(event.relatedTarget))) return;
    hidePreview(resolved.card.id);
  };
  const open = (event: MouseEvent | KeyboardEvent) => {
    const resolved = resolveTile(event.target);
    if (!resolved) return;
    if (event instanceof KeyboardEvent) {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
    }
    resolved.tile.focus({ preventScroll: true });
    openSheet({ id: resolved.card.id, name: resolved.card.name, imageUrl: resolved.card.cardImage }, resolved.tile);
  };

  container.addEventListener('mouseover', show);
  container.addEventListener('mouseout', hide);
  container.addEventListener('focusin', show);
  container.addEventListener('focusout', hide);
  container.addEventListener('click', open);
  container.addEventListener('keydown', open);
  return () => {
    container.removeEventListener('mouseover', show);
    container.removeEventListener('mouseout', hide);
    container.removeEventListener('focusin', show);
    container.removeEventListener('focusout', hide);
    container.removeEventListener('click', open);
    container.removeEventListener('keydown', open);
  };
}
