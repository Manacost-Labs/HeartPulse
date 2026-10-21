import { useMemo, type CSSProperties } from 'react';
import { useChartSize } from '../../vendor/varylo-ui/charts/useChartSize';
import { createTextMeasure } from '../../vendor/varylo-ui/charts/utils';
import {
  classIcon, classShareRows, percent, thresholdPercent,
  type ClassDistribution, type DeckDistribution,
} from './viciousGoldModel';

const LABEL_FONT = { size: 12, weight: 700 };
/** Horizontal padding of a segment label (0.4rem each side). */
const LABEL_PAD = 13;
const SHORT = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });

/**
 * Meta shares as one stacked bar per class: the class icon and its share in large type, then
 * the class split into its archetypes, each a shade of the class colour with its name and share
 * written in when they fit (the share alone, or nothing, when they do not; the title and the
 * list below always have it). The bar is the class's own 100%, so small archetypes of a small
 * class stay readable. A class filters the deck list.
 */
export function ClassShareBars({ classes, decks, selectedClass, onSelectClass, minimumFrequency }: {
  classes: ClassDistribution[];
  decks: DeckDistribution[];
  selectedClass: string;
  onSelectClass: (classKey: string) => void;
  minimumFrequency: number;
}) {
  const rows = useMemo(() => classShareRows(classes, decks), [classes, decks]);
  const { ref, width } = useChartSize<HTMLOListElement>();
  const measure = useMemo(() => createTextMeasure(typeof document === 'undefined' ? null : getComputedStyle(document.body).fontFamily), []);
  // The bar's width: the list's width minus the class column on wide screens (see .vsgold-classbars).
  const barWidth = width > 720 ? width - 16 * 16 : width;

  return (
    <ol ref={ref} className="vsgold-classbars" aria-label="Доли классов и их архетипов" data-tour-id="vicious-classes">
      {rows.map(row => {
        const total = row.frequency || 1;
        return (
          <li key={row.class} style={{ '--class-color': row.color } as CSSProperties}>
            <button type="button" aria-pressed={selectedClass === row.class}
              onClick={() => onSelectClass(selectedClass === row.class ? 'all' : row.class)}>
              <span className="vsgold-classbars__class">
                <img src={classIcon(row.classIcon)} alt="" width="32" height="32" loading="lazy" decoding="async" />
                <span>{row.classLabel}</span>
                <b>{percent(row.frequency)}</b>
              </span>
              <span className="vsgold-classbars__bar">
                {row.segments.map(segment => {
                  const px = barWidth * segment.frequency / total;
                  const share = `${SHORT.format(segment.frequency)}%`;
                  const full = `${segment.label} ${share}`;
                  const text = measure(full, LABEL_FONT) + LABEL_PAD <= px ? full : measure(share, LABEL_FONT) + LABEL_PAD <= px ? share : '';
                  return (
                    <span key={segment.deck} className="vsgold-classbars__segment" title={`${segment.fullLabel}: ${percent(segment.frequency)}`}
                      style={{ flexGrow: segment.frequency, background: segment.background, color: segment.ink }}>
                      {text ? <span aria-hidden="true">{text}</span> : null}
                    </span>
                  );
                })}
                {row.rest > 0 ? (
                  <span className="vsgold-classbars__segment vsgold-classbars__segment--rest" style={{ flexGrow: row.rest }}
                    title={`Архетипы меньше ${thresholdPercent(minimumFrequency)}: ${percent(row.rest)}`} />
                ) : null}
              </span>
              <span className="sr-only">
                {row.segments.map(segment => `${segment.fullLabel} ${percent(segment.frequency)}`).join(', ')}
                {row.rest > 0 ? `, остальные архетипы ${percent(row.rest)}` : ''}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
