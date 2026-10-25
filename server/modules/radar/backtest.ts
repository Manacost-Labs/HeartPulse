/**
 * Бэктест радара (`/v1/constructed/balance-radar/backtest`): за неделю до
 * каждого прошлого патча — сколько правок статистическая часть радара
 * назвала в своих первых 3, 5 и 10 кандидатах. Ответ без этих цифр — `null`,
 * и блок точности не показывается.
 */
import { count, finite, record } from './parsing.js';
import type { RadarBacktest, RadarBacktestSide } from './types.js';

const TOPS = [3, 5, 10];

function side(value: unknown): RadarBacktestSide[] {
  const row = record(value);
  return TOPS.flatMap(top => {
    const cell = record(row?.[`@${top}`]);
    const hits = count(cell?.hits);
    const actual = count(cell?.actual);
    if (hits === null || !actual) return [];
    const share = (part: unknown) => {
      const result = finite(part);
      return result === null || result < 0 || result > 1 ? null : Math.round(result * 100);
    };
    return [{ top, hits, actual, predicted: count(cell?.predicted) ?? 0, precision: share(cell?.precision), recall: share(cell?.recall) }];
  });
}

export function parseBacktest(value: unknown): RadarBacktest | null {
  const envelope = record(value);
  const statistical = record(record(envelope?.data ?? envelope)?.statistical);
  const patches = count(statistical?.patches);
  if (!statistical || !patches) return null;
  const result = { patches, nerf: side(statistical.nerf), buff: side(statistical.buff) };
  return result.nerf.length || result.buff.length ? result : null;
}
