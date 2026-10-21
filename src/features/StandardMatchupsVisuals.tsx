import type { StandardMatchupConfidence, StandardMatchupsClassKey } from '../modules/standardMatchups/public';
import { standardMetaClassIcon } from './standardMetaClassModel';
import './StandardMatchupsVisuals.css';

/** Distance from 50% that fills one half of a bar; larger edges are clipped. */
const BAR_RANGE = 25;

export const CONFIDENCE_TEXT: Record<StandardMatchupConfidence, string> = {
  high: 'надёжно',
  medium: 'средняя точность',
  low: 'мало игр',
};

export function percent(value: number | null | undefined, digits = 1): string {
  return value === null || value === undefined ? '—' : `${value.toLocaleString('ru-RU', { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
}

export function matchupSide(value: number): 'up' | 'down' | 'even' {
  return value >= 52 ? 'up' : value < 48 ? 'down' : 'even';
}

export function ClassIcon({ classKey, size = 28 }: { classKey: StandardMatchupsClassKey | null; size?: number }) {
  return <img className="standard-matchups-class-icon" src={standardMetaClassIcon(classKey)} alt="" width={size} height={size} loading="lazy" decoding="async" />;
}

/** A bar from the 50% line: right and green when favoured, left and red when not. */
export function MatchupBar({ value }: { value: number }) {
  const width = Math.min(Math.abs(value - 50), BAR_RANGE) / BAR_RANGE * 50;
  const start = value >= 50 ? 50 : 50 - width;
  return (
    <span className="standard-matchups-bar" data-side={matchupSide(value)} aria-hidden="true">
      <i style={{ insetInlineStart: `${start}%`, inlineSize: `${Math.max(width, 0.8)}%` }} />
    </span>
  );
}
