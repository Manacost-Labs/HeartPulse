import React, { useMemo, useState } from 'react';
import {
  ArrowDownUp,
  ChevronDown,
  CircleHelp,
  ExternalLink,
  Sparkles,
  Swords,
} from 'lucide-react';
import { classIconUrl, useNeutralClassIcon } from './classIcons';
import CardPreviewTooltip, { type CardPreviewTarget } from './CardPreviewTooltip';
import {
  hsguruImpactTone,
  hsguruMatchupTone,
  sortHsguruCardStats,
  type HsguruCardStatSort,
  type HsguruCardStatSortKey,
} from './archetypeDetailModel';
import './ConstructedArchetypeAnalysis.css';

const CardPreviewSheet = React.lazy(() => import('./CardPreviewSheet'));

type ArchetypeClass =
  | 'deathknight'
  | 'demonhunter'
  | 'druid'
  | 'hunter'
  | 'mage'
  | 'paladin'
  | 'priest'
  | 'rogue'
  | 'shaman'
  | 'warlock'
  | 'warrior';

export type ConstructedClassMatchup = {
  classKey: ArchetypeClass;
  classLabel: string;
  winrate: number;
  games: number;
  share: number | null;
};

export type ConstructedCardStat = {
  cardId: string | null;
  dbfId: number | null;
  cardName: string;
  cost: number | null;
  mulliganImpact: number | null;
  mulliganCount: number;
  drawnImpact: number | null;
  drawnCount: number | null;
  keptImpact: number | null;
  keptCount: number | null;
};

export type ConstructedAnalysis = {
  rank: 'legend';
  period: 'past_week';
  state: 'ok' | 'partial' | 'error';
  updatedAt: string | null;
  matchupsUpdatedAt: string | null;
  cardStatsUpdatedAt: string | null;
  sourceUrls: {
    matchups: string;
    cards: string;
  };
  classMatchups: ConstructedClassMatchup[];
  cardStats: ConstructedCardStat[];
};

const CLASS_LABELS: Record<ArchetypeClass, string> = {
  deathknight: 'Рыцарь смерти',
  demonhunter: 'Охотник на демонов',
  druid: 'Друид',
  hunter: 'Охотник',
  mage: 'Маг',
  paladin: 'Паладин',
  priest: 'Жрец',
  rogue: 'Разбойник',
  shaman: 'Шаман',
  warlock: 'Чернокнижник',
  warrior: 'Воин',
};

const COLUMN_COPY: Record<HsguruCardStatSortKey, { label: string; description: string }> = {
  mulliganImpact: {
    label: 'Влияние в муллигане',
    description: 'Разница между винрейтом матчей, где карта была в муллигане, и общим винрейтом колоды. Включает как оставленные, так и заменённые карты.',
  },
  mulliganCount: {
    label: 'Количество муллиганов',
    description: 'Сколько раз карта попадала на муллиган; размер выборки для «Влияния в муллигане».',
  },
  drawnImpact: {
    label: 'Влияние при доборе',
    description: 'Разница между винрейтом матчей, где карта была добрана, и общим винрейтом колоды.',
  },
  drawnCount: {
    label: 'Количество доборов',
    description: 'Сколько раз карта была добрана; размер выборки для «Влияния при доборе».',
  },
  keptImpact: {
    label: 'Влияние при оставлении',
    description: 'Разница между винрейтом матчей, где карту оставили в муллигане, и общим винрейтом колоды.',
  },
  keptCount: {
    label: 'Количество оставлений',
    description: 'Сколько раз карту оставили в муллигане; размер выборки для «Влияния при оставлении».',
  },
};

function formatPercent(value: number | null, signed = false): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const sign = signed && value > 0 ? '+' : '';
  return `${sign}${value.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%`;
}

function formatNumber(value: number | null): string {
  return value === null || !Number.isFinite(value)
    ? '—'
    : Math.round(value).toLocaleString('ru-RU');
}

function formatDate(value: string | null): string {
  if (!value || !Number.isFinite(Date.parse(value))) return 'срез ещё не готов';
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function cardTileUrl(cardId: string): string {
  return `/api/card-image/${encodeURIComponent(cardId)}/tile.webp?v=card_tile_v1`;
}

function cardRenderUrl(cardId: string): string {
  return `/api/public-resource/hsjson/v1/render/latest/ruRU/512x/${encodeURIComponent(cardId)}.png`;
}

function InfoTip({ label, description }: { label: string; description: string }) {
  return (
    <span className="constructed-analysis-tip">
      <button type="button" aria-label={`${label}: ${description}`}>
        <CircleHelp aria-hidden="true" />
      </button>
      <span role="tooltip">
        <strong>{label}</strong>
        {description}
      </span>
    </span>
  );
}

function MatchupsPanel({ analysis }: { analysis: ConstructedAnalysis | null }) {
  const rows = useMemo(
    () => [...(analysis?.classMatchups ?? [])].sort((left, right) => left.winrate - right.winrate),
    [analysis?.classMatchups],
  );
  const summary = rows.reduce((result, row) => {
    result[hsguruMatchupTone(row.winrate)] += 1;
    return result;
  }, { favored: 0, even: 0, unfavored: 0, unknown: 0 });

  return (
    <section className="constructed-analysis-panel" aria-labelledby="constructed-matchups-title">
      <header className="constructed-analysis-heading">
        <div>
          <span className="archetypes-eyebrow"><Swords aria-hidden="true" /> HSGuru · Легенда</span>
          <h2 id="constructed-matchups-title">Матчапы против классов</h2>
          <p>Винрейт архетипа против каждого класса за последние 7 дней. Сначала показаны самые сложные соперники.</p>
        </div>
        <dl className="constructed-matchup-summary" aria-label="Сводка матчапов">
          <div data-tone="favored"><dt>Выгодных</dt><dd>{summary.favored}</dd></div>
          <div data-tone="even"><dt>Ровных</dt><dd>{summary.even}</dd></div>
          <div data-tone="unfavored"><dt>Сложных</dt><dd>{summary.unfavored}</dd></div>
        </dl>
      </header>

      {rows.length ? (
        <ol className="constructed-matchup-ledger">
          {rows.map(row => {
            const tone = hsguruMatchupTone(row.winrate);
            return (
              <li key={row.classKey} data-tone={tone}>
                <img
                  src={classIconUrl(row.classKey)}
                  alt=""
                  width="46"
                  height="46"
                  loading="lazy"
                  onError={event => useNeutralClassIcon(event.currentTarget)}
                />
                <span className="constructed-matchup-ledger__identity">
                  <strong>{CLASS_LABELS[row.classKey]}</strong>
                  <small>{formatNumber(row.games)} игр{row.share === null ? '' : ` · ${formatPercent(row.share)} выборки`}</small>
                </span>
                <span className="constructed-matchup-ledger__meter" aria-hidden="true">
                  <i />
                  <b style={{ left: `${Math.min(100, Math.max(0, row.winrate))}%` }} />
                </span>
                <strong className="constructed-matchup-ledger__winrate">{formatPercent(row.winrate)}</strong>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="constructed-analysis-empty">Матчапы Легенды появятся после первого ежедневного среза.</p>
      )}

      <footer className="constructed-analysis-source">
        <span>Обновлено: {formatDate(analysis?.matchupsUpdatedAt ?? null)}</span>
        {analysis?.sourceUrls.matchups ? (
          <a href={analysis.sourceUrls.matchups} target="_blank" rel="noreferrer">
            Проверить на HSGuru <ExternalLink aria-hidden="true" />
          </a>
        ) : null}
      </footer>
    </section>
  );
}

function SortHeading({
  column,
  sort,
  onSort,
}: {
  column: HsguruCardStatSortKey;
  sort: HsguruCardStatSort;
  onSort: (column: HsguruCardStatSortKey) => void;
}) {
  const copy = COLUMN_COPY[column];
  const active = sort.key === column;
  return (
    <th scope="col" aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <div>
        <button type="button" onClick={() => onSort(column)}>
          {copy.label}
          <ArrowDownUp aria-hidden="true" />
        </button>
        <InfoTip label={copy.label} description={copy.description} />
      </div>
    </th>
  );
}

function ImpactValue({ value }: { value: number | null }) {
  return <strong data-impact={hsguruImpactTone(value)}>{formatPercent(value, true)}</strong>;
}

function CardTile({
  row,
  onOpen,
  onPreview,
  onPreviewEnd,
}: {
  row: ConstructedCardStat;
  onOpen: (row: ConstructedCardStat) => void;
  onPreview: (row: ConstructedCardStat, target: HTMLElement) => void;
  onPreviewEnd: () => void;
}) {
  const content = (
    <>
      {row.cardId ? (
        <img
          className="constructed-card-tile__art"
          src={cardTileUrl(row.cardId)}
          width="256"
          height="59"
          loading="lazy"
          decoding="async"
          alt=""
          aria-hidden="true"
        />
      ) : null}
      <span className="constructed-card-tile__fade" aria-hidden="true" />
      <span className="constructed-card-tile__mana" aria-hidden="true">{row.cost ?? '—'}</span>
      <strong>{row.cardName}</strong>
    </>
  );

  if (!row.cardId) {
    return <span className="constructed-card-tile">{content}</span>;
  }

  return (
    <button
      type="button"
      className="constructed-card-tile"
      onClick={() => onOpen(row)}
      onMouseEnter={event => onPreview(row, event.currentTarget)}
      onMouseLeave={onPreviewEnd}
      onFocus={event => onPreview(row, event.currentTarget)}
      onBlur={onPreviewEnd}
      aria-label={`${row.cardName}, ${row.cost ?? 'неизвестная стоимость'} маны. Открыть полную карту`}
    >
      {content}
    </button>
  );
}

const MOBILE_METRICS = [
  { key: 'mulliganImpact', label: 'В муллигане', impact: true },
  { key: 'mulliganCount', label: 'Муллиганов', impact: false },
  { key: 'drawnImpact', label: 'При доборе', impact: true },
  { key: 'drawnCount', label: 'Доборов', impact: false },
  { key: 'keptImpact', label: 'При оставлении', impact: true },
  { key: 'keptCount', label: 'Оставлений', impact: false },
] as const;

function CardStatsPanel({ analysis }: { analysis: ConstructedAnalysis | null }) {
  const [sort, setSort] = useState<HsguruCardStatSort>({ key: 'mulliganImpact', direction: 'desc' });
  const [showAll, setShowAll] = useState(false);
  const [preview, setPreview] = useState<CardPreviewTarget | null>(null);
  const [selectedCard, setSelectedCard] = useState<ConstructedCardStat | null>(null);
  const rows = useMemo(
    () => sortHsguruCardStats(analysis?.cardStats ?? [], sort),
    [analysis?.cardStats, sort],
  );
  const visibleRows = showAll ? rows : rows.slice(0, 15);
  const selectedPreviewCard = useMemo(() => (
    selectedCard?.cardId
      ? {
        id: selectedCard.cardId,
        name: selectedCard.cardName,
        imageUrl: cardRenderUrl(selectedCard.cardId),
      }
      : null
  ), [selectedCard]);
  const changeSort = (key: HsguruCardStatSortKey) => {
    setSort(current => current.key === key
      ? { key, direction: current.direction === 'desc' ? 'asc' : 'desc' }
      : { key, direction: 'desc' });
  };
  const showPreview = (row: ConstructedCardStat, target: HTMLElement) => {
    if (!row.cardId) return;
    setPreview({
      id: row.cardId,
      name: row.cardName,
      imageUrl: cardRenderUrl(row.cardId),
      rect: target.getBoundingClientRect(),
    });
  };
  const cardTile = (row: ConstructedCardStat) => (
    <CardTile
      row={row}
      onOpen={setSelectedCard}
      onPreview={showPreview}
      onPreviewEnd={() => setPreview(null)}
    />
  );

  return (
    <section className="constructed-analysis-panel constructed-card-stats" aria-labelledby="constructed-card-stats-title">
      <header className="constructed-analysis-heading">
        <div>
          <span className="archetypes-eyebrow"><Sparkles aria-hidden="true" /> Статистика карт</span>
          <h2 id="constructed-card-stats-title">Муллиган и влияние карт</h2>
          <p>
            Сортируйте по влиянию или размеру выборки. Положительное значение означает результат выше среднего винрейта архетипа.
            {' '}
            <InfoTip
              label="Влияние на винрейт"
              description="Насколько событие, связанное с картой, меняет винрейт относительно среднего винрейта колоды."
            />
          </p>
        </div>
        <span className="archetype-section-heading__count">{rows.length} карт</span>
      </header>

      {visibleRows.length ? (
        <>
          <div className="constructed-card-stats__scroll" role="region" aria-label="Сортируемая статистика карт" tabIndex={0}>
            <table>
              <thead>
                <tr>
                  <th scope="col" className="constructed-card-stats__card-heading">Карта</th>
                  <SortHeading column="mulliganImpact" sort={sort} onSort={changeSort} />
                  <SortHeading column="mulliganCount" sort={sort} onSort={changeSort} />
                  <SortHeading column="drawnImpact" sort={sort} onSort={changeSort} />
                  <SortHeading column="drawnCount" sort={sort} onSort={changeSort} />
                  <SortHeading column="keptImpact" sort={sort} onSort={changeSort} />
                  <SortHeading column="keptCount" sort={sort} onSort={changeSort} />
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row, index) => (
                  <tr key={row.cardId || row.dbfId || `${row.cardName}-${index}`}>
                    <th scope="row">{cardTile(row)}</th>
                    <td><ImpactValue value={row.mulliganImpact} /></td>
                    <td>{formatNumber(row.mulliganCount)}</td>
                    <td><ImpactValue value={row.drawnImpact} /></td>
                    <td>{formatNumber(row.drawnCount)}</td>
                    <td><ImpactValue value={row.keptImpact} /></td>
                    <td>{formatNumber(row.keptCount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="constructed-card-stats__mobile">
            <fieldset className="constructed-card-stats__mobile-sort">
              <legend>Сортировать</legend>
              {MOBILE_METRICS.map(metric => (
                <button
                  key={metric.key}
                  type="button"
                  aria-pressed={sort.key === metric.key}
                  onClick={() => changeSort(metric.key)}
                >
                  {metric.label}
                  <ArrowDownUp aria-hidden="true" />
                </button>
              ))}
            </fieldset>
            <ol className="constructed-card-stats__cards">
              {visibleRows.map((row, index) => (
                <li key={`mobile-${row.cardId || row.dbfId || `${row.cardName}-${index}`}`}>
                  <header>
                    <span className="constructed-card-stats__rank" aria-label={`Позиция ${index + 1}`}>{index + 1}</span>
                    {cardTile(row)}
                  </header>
                  <dl>
                    {MOBILE_METRICS.map(metric => {
                      const value = row[metric.key];
                      return (
                        <div key={metric.key}>
                          <dt>{metric.label}</dt>
                          <dd>{metric.impact
                            ? <ImpactValue value={value} />
                            : formatNumber(value)}</dd>
                        </div>
                      );
                    })}
                  </dl>
                </li>
              ))}
            </ol>
          </div>
        </>
      ) : (
        <p className="constructed-analysis-empty">Статистика карт появится после первого ежедневного среза.</p>
      )}

      {rows.length > 15 && !showAll ? (
        <button type="button" className="constructed-card-stats__more" onClick={() => setShowAll(true)}>
          Показать все {rows.length} карт <ChevronDown aria-hidden="true" />
        </button>
      ) : null}
      <footer className="constructed-analysis-source">
        <span>Обновлено: {formatDate(analysis?.cardStatsUpdatedAt ?? null)}</span>
        {analysis?.sourceUrls.cards ? (
          <a href={analysis.sourceUrls.cards} target="_blank" rel="noreferrer">
            Проверить на HSGuru <ExternalLink aria-hidden="true" />
          </a>
        ) : null}
      </footer>
      {preview ? <CardPreviewTooltip preview={preview} /> : null}
      {selectedPreviewCard ? (
        <React.Suspense fallback={null}>
          <CardPreviewSheet
            card={selectedPreviewCard}
            onClose={() => setSelectedCard(null)}
          />
        </React.Suspense>
      ) : null}
    </section>
  );
}

export default function ConstructedArchetypeAnalysis({
  analysis,
}: {
  analysis: ConstructedAnalysis | null;
}) {
  return (
    <div className="constructed-analysis-stack" data-tour-id="archetype-analysis">
      <MatchupsPanel analysis={analysis} />
      <CardStatsPanel analysis={analysis} />
    </div>
  );
}
