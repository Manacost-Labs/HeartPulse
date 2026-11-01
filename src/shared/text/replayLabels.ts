/**
 * Russian labels for a web replay's mode and result (plan 2.2). The server keeps only these values
 * (`REPLAY_MODES`, `REPLAY_RESULTS` in `server/modules/replayShares/sanitize.ts`); anything else shows nothing.
 */
const MODES: Record<string, string> = {
  Ranked: 'Рейтинговая игра',
  Casual: 'Обычная игра',
  Arena: 'Арена',
  Brawl: 'Потасовка',
  Practice: 'Тренировка',
  Friendly: 'Дружеский матч',
  Battlegrounds: 'Поля сражений',
  Duos: 'Поля сражений: дуо',
  Mercenaries: 'Наёмники',
  Other: 'Матч',
};

const RESULTS: Record<string, string> = {
  Win: 'Победа',
  Loss: 'Поражение',
  Tie: 'Ничья',
  Abandoned: 'Игра прервана',
};

export function replayModeLabel(mode: unknown): string {
  return (typeof mode === 'string' && Object.hasOwn(MODES, mode) ? MODES[mode] : MODES.Other);
}

/** The result in Russian, or '' when it is unknown. */
export function replayResultLabel(result: unknown): string {
  return typeof result === 'string' && Object.hasOwn(RESULTS, result) ? RESULTS[result] : '';
}
