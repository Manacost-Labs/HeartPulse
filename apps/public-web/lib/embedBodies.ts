import { escapeHtml } from './embedDocument';
import { deckClassName, type PublicDeck } from './publicDeckData';
import type { PublicReplay } from './publicReplay';
import { replayShareText, replayUrls } from './replayShare';

/** A card's deck tile (HearthstoneJSON art through the site's card-image route). */
const tile = (cardId: string) => (cardId ? `<img src="/api/card-image/${encodeURIComponent(cardId)}/tile.webp" alt="" loading="lazy">` : '');

/** The embed body: the same sanitized summary the replay page shows, compact enough for a 600 × 360 frame. */
export function replayEmbedBody(replay: PublicReplay): string {
  const { summary } = replay;
  const bg = replay.kind === 'battlegrounds';
  const { title } = replayShareText(replay);
  const badgeClass = bg ? (summary.placement && summary.placement <= 4 ? 'win' : 'loss') : summary.resultKey === 'Win' ? 'win' : summary.resultKey === 'Loss' ? 'loss' : '';
  const badge = bg ? (summary.placement ? `${summary.placement}-е место` : '') : summary.result;
  const facts = [summary.mode, summary.turns ? `${summary.turns} ход.` : '', new Date(replay.createdAt).toLocaleDateString('ru-RU', { timeZone: 'UTC' })]
    .filter(Boolean).join(' · ');
  const heroes = bg
    ? `<div class="hp-heroes"><div class="hp-hero">${tile(summary.heroCardId)}<span>${escapeHtml(summary.heroName)}</span></div></div>`
    : `<div class="hp-heroes"><div class="hp-hero">${tile(summary.heroCardId)}<span>${escapeHtml(summary.heroName)}</span></div>`
      + `<b>vs</b><div class="hp-hero">${tile(summary.opponentHeroCardId)}<span>${escapeHtml(summary.opponentHeroName || 'Соперник')}`
      + `${summary.opponentArchetype ? ` · ${escapeHtml(summary.opponentArchetype)}` : ''}</span></div></div>`;
  const board = bg && summary.finalBoard.length
    ? `<p class="hp-meta">Итоговый стол</p><ul class="hp-board">${summary.finalBoard.map(minion =>
      `<li>${escapeHtml(minion.name)} ${minion.attack}/${minion.health}</li>`).join('')}</ul>`
    : '';
  return `<h1 class="hp-title">${badge ? `<span class="hp-badge ${badgeClass}">${escapeHtml(badge)}</span> ` : ''}${escapeHtml(title.replace(/^[^:]*:\s*/, ''))}</h1>`
    + `<p class="hp-meta">${escapeHtml(facts)}</p>${heroes}${board}`
    + `<a class="hp-open" href="${replayUrls(replay.id).page}" target="_blank" rel="noopener">Смотреть ход игры</a>`;
}


/** The title of a deck embed: its archetype, else its class, with the format. */
export function deckTitle(deck: PublicDeck): string {
  const name = deck.archetype ?? (deckClassName(deck.heroDbfId) ? `Колода: ${deckClassName(deck.heroDbfId)}` : 'Колода Hearthstone');
  return `${name} · ${deck.format === 'wild' ? 'Вольный' : 'Стандартный'}`;
}

/** Copies per mana cost 0…7+, the bars of the curve. */
export function manaCurve(deck: PublicDeck): number[] {
  const curve = Array.from({ length: 8 }, () => 0);
  for (const card of deck.cards) curve[Math.min(Math.max(card.cost, 0), 7)] += card.count;
  return curve;
}

/** The embed body of a deck: copy button, mana curve and the card list by cost. */
export function deckEmbedBody(deck: PublicDeck): string {
  const curve = manaCurve(deck);
  const peak = Math.max(1, ...curve);
  const bars = curve.map((copies, cost) => `<div title="${copies}"><span>${copies || ''}</span><i style="height:${Math.round((copies / peak) * 44)}px"></i>${cost === 7 ? '7+' : cost}</div>`).join('');
  const cards = [...deck.cards].sort((left, right) => left.cost - right.cost || left.name.localeCompare(right.name, 'ru'))
    .map(card => `<li class="hp-card${card.rarity === 'LEGENDARY' ? ' legendary' : ''}"><b>${card.cost}</b>${tile(card.id)}<span>${escapeHtml(card.name)}</span>`
      + `<em>${card.rarity === 'LEGENDARY' && card.count === 1 ? '★' : `×${card.count}`}</em></li>`).join('');
  return `<h1 class="hp-title">${escapeHtml(deckTitle(deck))}</h1><p class="hp-meta">${deck.totalCards} карт</p>`
    + `<button class="hp-copy" type="button" data-copy="${escapeHtml(deck.deckCode)}">Скопировать код</button>`
    + `<div class="hp-curve" aria-label="Кривая маны">${bars}</div><ul class="hp-cards">${cards}</ul>`;
}
