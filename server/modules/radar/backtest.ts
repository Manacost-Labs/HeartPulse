/**
 * Проверка радара на прошлых патчах. Два формата hs-data-api: `data.accuracy`
 * самого прогона (`{basis, text, caveat, statistical|model: {patches,
 * "nerf@5": {...}}}`) и ответ `/v1/constructed/balance-radar/backtest`
 * (`statistical: {patches, nerf: {"@5": {...}}}`). Без цифр — `null`, и блок
 * точности не показывается.
 */
import { count, finite, record, text } from './parsing.js';
import type { RadarBacktest, RadarBacktestSide } from './types.js';

const TOPS = [3, 5, 10];

const share = (part: unknown) => {
  const result = finite(part);
  return result === null || result < 0 || result > 1 ? null : Math.round(result * 100);
};

function side(block: Record<string, unknown>, name: 'nerf' | 'buff'): RadarBacktestSide[] {
  const nested = record(block[name]);
  return TOPS.flatMap(top => {
    const cell = record(block[`${name}@${top}`] ?? nested?.[`@${top}`]);
    const hits = count(cell?.hits);
    const actual = count(cell?.actual);
    if (hits === null || !actual) return [];
    return [{ top, hits, actual, predicted: count(cell?.predicted) ?? 0, precision: share(cell?.precision), recall: share(cell?.recall) }];
  });
}

export function parseBacktest(value: unknown): RadarBacktest | null {
  const envelope = record(value);
  const row = record(envelope?.data) ?? envelope;
  if (!row) return null;
  const basis = row.basis === 'model' && record(row.model) ? 'model' : 'statistical';
  const block = record(row[basis]);
  const patches = count(block?.patches);
  if (!block || !patches) return null;
  const result = {
    patches, nerf: side(block, 'nerf'), buff: side(block, 'buff'), basis,
    text: text(row.text, 800), caveat: text(row.caveat, 400),
  } as const;
  return result.nerf.length || result.buff.length ? { ...result, nerf: [...result.nerf], buff: [...result.buff] } : null;
}
