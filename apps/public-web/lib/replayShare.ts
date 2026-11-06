import type { PublicReplay } from './publicReplay';

export const SITE_ORIGIN = 'https://hearthpulse.net';

/** Canonical addresses of one replay: the page, its preview image and its embed. */
export function replayUrls(id: string) {
  return {
    page: `${SITE_ORIGIN}/replay/${id}/`,
    image: `${SITE_ORIGIN}/og/replay/${id}/`,
    embed: `${SITE_ORIGIN}/embed/replay/${id}/`,
  };
}

/**
 * The title and description every preview of a replay shows (link preview, embed, oEmbed). Built only from the
 * sanitized summary: heroes by their card names, the mode and the result — never a player's name or BattleTag.
 */
export function replayShareText(replay: PublicReplay): { title: string; description: string } {
  const { summary } = replay;
  if (replay.kind === 'battlegrounds') {
    const place = summary.placement ? `${summary.placement}-е место` : 'Поля сражений';
    const board = summary.finalBoard.slice(0, 7).map(minion => minion.name).join(', ');
    return {
      title: `${place}: ${summary.heroName}`,
      description: `${summary.mode}${summary.turns ? ` · ${summary.turns} ход.` : ''}${board ? ` · итоговый стол: ${board}` : ''}. Реплей из приложения Hearthpulse.`,
    };
  }
  const result = summary.result || summary.mode;
  const versus = summary.opponentHeroName ? ` против ${summary.opponentHeroName}` : '';
  return {
    title: `${result}: ${summary.heroName}${versus}`,
    description: `${summary.mode}${summary.turns ? ` · ${summary.turns} ход.` : ''}${summary.opponentArchetype ? ` · соперник: ${summary.opponentArchetype}` : ''}. Реплей из приложения Hearthpulse.`,
  };
}
