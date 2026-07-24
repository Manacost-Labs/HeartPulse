import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  ChevronDown,
  ExternalLink,
  LayoutGrid,
  Sparkles,
  Swords,
} from 'lucide-react';
import CardPreviewTooltip, { type CardPreviewTarget } from './CardPreviewTooltip';
import {
  encodeConstructedDeck,
  normalizeConstructedHeroClass,
} from './constructedDeckCode';
import DeckListView, { type DeckListCard } from './decklist/DeckListView';
import './ArchetypeDetailSections.css';

export type ArchetypeSnapshot = {
  name?: string | null;
  nameRu?: string | null;
  player_class?: string | null;
  region?: string | null;
  rank_range?: string | null;
  mulligan_time_range?: string | null;
  win_rate?: number | null;
  total_games?: number | null;
  pct_of_total?: number | null;
  as_of_popularity?: string | null;
};

export type ArchetypeMulliganRow = {
  dbf_id: number;
  card_id?: string | null;
  card_name?: string | null;
  card_name_en?: string | null;
  cost?: number | null;
  card_type?: string | null;
  rarity?: string | null;
  hsreplay_rank?: number | null;
  keep_percentage?: number | null;
  opening_hand_winrate?: number | null;
  winrate_when_drawn?: number | null;
  winrate_when_played?: number | null;
  times_presented_in_initial_cards?: number | null;
  times_kept?: number | null;
  times_card_drawn?: number | null;
  times_card_played?: number | null;
  avg_turn_played_on?: number | null;
};

export type ArchetypeMatchupRow = {
  opponent_archetype_id: number;
  opponent_name?: string | null;
  opponent_class?: string | null;
  win_rate?: number | null;
  total_games?: number | null;
};

export type ArchetypeDeckCard = {
  dbf_id: number;
  card_id?: string | null;
  card_name?: string | null;
  card_name_en?: string | null;
  cost?: number | null;
  rarity?: string | null;
  count?: number | null;
  sideboard?: number | boolean | null;
};

export type ArchetypeDeck = {
  id: number;
  deck_id?: string | null;
  url?: string | null;
  total_games?: number | null;
  win_rate?: number | null;
  avg_num_player_turns?: number | null;
  card_count?: number | null;
  cards?: ArchetypeDeckCard[];
};

export type ArchetypeDetailData = {
  snapshot: ArchetypeSnapshot;
  matchups: ArchetypeMatchupRow[];
  mulligan: ArchetypeMulliganRow[];
  decks: ArchetypeDeck[];
  history: Array<Record<string, unknown>>;
};

const CLASS_COLORS: Record<string, string> = {
  DEATHKNIGHT: '#397b87',
  DEMONHUNTER: '#556d24',
  DRUID: '#8b4d25',
  HUNTER: '#3f792f',
  MAGE: '#326c97',
  PALADIN: '#a77816',
  PRIEST: '#6e6862',
  ROGUE: '#55545b',
  SHAMAN: '#345aa0',
  WARLOCK: '#694477',
  WARRIOR: '#8e342f',
};

function finite(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatPercent(value: unknown, digits = 1): string {
  const number = finite(value);
  return number === null ? '—' : `${number.toLocaleString('ru-RU', { maximumFractionDigits: digits })}%`;
}

function formatNumber(value: unknown): string {
  const number = finite(value);
  return number === null ? '—' : Math.round(number).toLocaleString('ru-RU');
}

function cardTileUrl(cardId: string): string {
  return `https://art.hearthstonejson.com/v1/tiles/${encodeURIComponent(cardId)}.webp`;
}

function cardRenderUrl(cardId: string): string {
  return `https://art.hearthstonejson.com/v1/render/latest/ruRU/512x/${encodeURIComponent(cardId)}.png`;
}

function classIcon(value: unknown): string {
  const normalized = String(value ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '');
  return normalized && normalized !== 'unknown'
    ? `/class_icon/ui/${normalized}-64.webp`
    : '/class_icon/neutral.webp';
}

function matchupTone(value: number | null): {
  key: 'favored' | 'even' | 'unfavored' | 'unknown';
  label: string;
} {
  if (value === null) return { key: 'unknown', label: 'Нет данных' };
  if (value >= 52) return { key: 'favored', label: 'Выгодный' };
  if (value >= 48) return { key: 'even', label: 'Ровный' };
  return { key: 'unfavored', label: 'Сложный' };
}

function useCardPreview() {
  const [preview, setPreview] = useState<CardPreviewTarget | null>(null);

  useEffect(() => {
    if (!preview) return undefined;
    const dismiss = () => setPreview(null);
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismiss();
    };
    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('resize', dismiss);
    document.addEventListener('keydown', dismissOnEscape);
    return () => {
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('resize', dismiss);
      document.removeEventListener('keydown', dismissOnEscape);
    };
  }, [preview]);

  return { preview, setPreview };
}

function MulliganCard({
  row,
  onPreview,
  onPreviewEnd,
}: {
  row: ArchetypeMulliganRow;
  onPreview: (preview: CardPreviewTarget) => void;
  onPreviewEnd: () => void;
}) {
  const cardId = String(row.card_id ?? '').trim();
  const name = String(row.card_name || row.card_name_en || `Карта ${row.dbf_id}`);
  const artStyle = cardId
    ? { '--archetype-card-tile': `url("${cardTileUrl(cardId)}")` } as React.CSSProperties
    : undefined;
  const body = (
    <>
      <span className="archetype-mulligan-card__art" aria-hidden="true" />
      <span className="archetype-mulligan-card__fade" aria-hidden="true" />
      <span className="archetype-mulligan-card__mana" aria-hidden="true">{finite(row.cost) ?? '—'}</span>
      <span className="archetype-mulligan-card__copy">
        <strong>{name}</strong>
        <small>{row.card_type || 'Карта Hearthstone'}</small>
      </span>
    </>
  );

  if (!cardId) {
    return <div className="archetype-mulligan-card" style={artStyle}>{body}</div>;
  }

  return (
    <button
      type="button"
      className="archetype-mulligan-card"
      style={artStyle}
      onMouseEnter={event => onPreview({
        id: cardId,
        name,
        imageUrl: cardRenderUrl(cardId),
        rect: event.currentTarget.getBoundingClientRect(),
      })}
      onMouseLeave={onPreviewEnd}
      onFocus={event => onPreview({
        id: cardId,
        name,
        imageUrl: cardRenderUrl(cardId),
        rect: event.currentTarget.getBoundingClientRect(),
      })}
      onBlur={onPreviewEnd}
      aria-label={`Показать полную карту «${name}»`}
    >
      {body}
    </button>
  );
}

export function ArchetypeMulliganPanel({
  rows,
  snapshot,
}: {
  rows: ArchetypeMulliganRow[];
  snapshot: ArchetypeSnapshot;
}) {
  const { preview, setPreview } = useCardPreview();
  const visibleRows = rows.filter(row => Number.isSafeInteger(Number(row.dbf_id)));

  return (
    <section className="archetypes-detail__panel archetype-analysis-panel" aria-labelledby="archetype-mulligan-title">
      <header className="archetype-analysis-panel__heading">
        <div>
          <span className="archetype-analysis-panel__eyebrow"><Sparkles aria-hidden="true" /> Стартовая рука</span>
          <h2 id="archetype-mulligan-title">Муллиган <span>{visibleRows.length}</span></h2>
        </div>
        <p>
          HSReplay · {snapshot.region === 'REGION_EU' ? 'Европа' : snapshot.region || 'Все регионы'} ·
          {' '}{snapshot.rank_range || 'Легенда'} · последние 30 дней
        </p>
      </header>

      {visibleRows.length ? (
        <ol className="archetype-mulligan-list">
          {visibleRows.map((row, index) => {
            const keepRate = finite(row.keep_percentage);
            const keepWidth = keepRate === null ? 0 : clamp(keepRate, 0, 100);
            return (
              <li key={row.dbf_id} className="archetype-mulligan-row">
                <span className="archetype-mulligan-row__rank" aria-label={`Позиция ${row.hsreplay_rank || index + 1}`}>
                  {row.hsreplay_rank || index + 1}
                </span>

                <MulliganCard
                  row={row}
                  onPreview={setPreview}
                  onPreviewEnd={() => setPreview(null)}
                />

                <div className="archetype-keep-rate">
                  <div>
                    <span>Оставляют</span>
                    <strong>{formatPercent(keepRate)}</strong>
                  </div>
                  <span className="archetype-keep-rate__track" aria-hidden="true">
                    <span style={{ width: `${keepWidth}%` }} />
                  </span>
                  <small>{formatNumber(row.times_kept)} из {formatNumber(row.times_presented_in_initial_cards)} предложений</small>
                </div>

                <dl className="archetype-mulligan-metrics">
                  <div>
                    <dt>В стартовой</dt>
                    <dd>{formatPercent(row.opening_hand_winrate)}</dd>
                  </div>
                  <div>
                    <dt>При взятии</dt>
                    <dd>{formatPercent(row.winrate_when_drawn)}</dd>
                  </div>
                  <div>
                    <dt>При розыгрыше</dt>
                    <dd>{formatPercent(row.winrate_when_played)}</dd>
                  </div>
                  <div>
                    <dt>Средний ход</dt>
                    <dd>{finite(row.avg_turn_played_on)?.toLocaleString('ru-RU', { maximumFractionDigits: 1 }) ?? '—'}</dd>
                  </div>
                </dl>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="archetype-analysis-panel__empty">Для текущего среза статистика муллигана ещё не собрана.</p>
      )}

      {preview ? <CardPreviewTooltip preview={preview} /> : null}
    </section>
  );
}

export function ArchetypeMatchupsPanel({ rows }: { rows: ArchetypeMatchupRow[] }) {
  const sortedRows = useMemo(() => [...rows].sort((left, right) => (
    (finite(right.win_rate) ?? -1) - (finite(left.win_rate) ?? -1)
    || (finite(right.total_games) ?? 0) - (finite(left.total_games) ?? 0)
  )), [rows]);
  const summary = useMemo(() => sortedRows.reduce((totals, row) => {
    totals[matchupTone(finite(row.win_rate)).key] += 1;
    return totals;
  }, { favored: 0, even: 0, unfavored: 0, unknown: 0 }), [sortedRows]);

  return (
    <section className="archetypes-detail__panel archetype-analysis-panel" aria-labelledby="archetype-matchups-title">
      <header className="archetype-analysis-panel__heading archetype-analysis-panel__heading--matchups">
        <div>
          <span className="archetype-analysis-panel__eyebrow"><Swords aria-hidden="true" /> Карта противников</span>
          <h2 id="archetype-matchups-title">Матчапы <span>{sortedRows.length}</span></h2>
        </div>
        <dl className="archetype-matchup-summary" aria-label="Сводка матчапов">
          <div data-tone="favored"><dt>Выгодных</dt><dd>{summary.favored}</dd></div>
          <div data-tone="even"><dt>Ровных</dt><dd>{summary.even}</dd></div>
          <div data-tone="unfavored"><dt>Сложных</dt><dd>{summary.unfavored}</dd></div>
        </dl>
      </header>

      {sortedRows.length ? (
        <ol className="archetype-matchup-list">
          {sortedRows.map(row => {
            const winrate = finite(row.win_rate);
            const tone = matchupTone(winrate);
            return (
              <li key={row.opponent_archetype_id} className="archetype-matchup-row" data-tone={tone.key}>
                <img src={classIcon(row.opponent_class)} alt="" width="46" height="46" loading="lazy" decoding="async" />
                <div className="archetype-matchup-row__identity">
                  <strong>{row.opponent_name || `Архетип #${row.opponent_archetype_id}`}</strong>
                  <span>{formatNumber(row.total_games)} игр</span>
                </div>
                <span className="archetype-matchup-row__tone">{tone.label}</span>
                <div className="archetype-matchup-row__meter" aria-hidden="true">
                  <span style={{ width: `${winrate === null ? 0 : clamp(winrate, 0, 100)}%` }} />
                  <i />
                </div>
                <strong className="archetype-matchup-row__winrate">{formatPercent(winrate)}</strong>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="archetype-analysis-panel__empty">Для текущего среза матчапы ещё не собраны.</p>
      )}
    </section>
  );
}

function deckListCard(card: ArchetypeDeckCard): DeckListCard | null {
  const dbfId = Number(card.dbf_id);
  if (!Number.isSafeInteger(dbfId) || dbfId <= 0) return null;
  const cardId = String(card.card_id || '').trim();
  const name = String(card.card_name || card.card_name_en || `Карта ${dbfId}`);
  const rarity = String(card.rarity || 'COMMON').toUpperCase();
  return {
    id: cardId || `dbf-${dbfId}`,
    dbfId,
    name,
    cost: finite(card.cost) ?? 0,
    rarity,
    elite: rarity === 'LEGENDARY',
    count: Math.max(1, Math.round(finite(card.count) ?? 1)),
    image: cardId ? cardTileUrl(cardId) : '',
    cardImage: cardId ? cardRenderUrl(cardId) : '',
  };
}

function buildDeckCode(deck: ArchetypeDeck, classKey: unknown): string {
  const heroClass = normalizeConstructedHeroClass(classKey);
  if (!heroClass) return '';
  const cards = (deck.cards || [])
    .filter(card => !card.sideboard)
    .flatMap(card => {
      const dbfId = Number(card.dbf_id);
      const count = Math.max(1, Math.round(finite(card.count) ?? 1));
      return Number.isSafeInteger(dbfId) && dbfId > 0 ? [{ dbfId, count }] : [];
    });
  if (!cards.length) return '';
  return encodeConstructedDeck({ heroClass, format: 'standard', cards });
}

export function ArchetypeDecksPanel({
  decks,
  classKey,
}: {
  decks: ArchetypeDeck[];
  classKey: unknown;
}) {
  const [visibleCount, setVisibleCount] = useState(4);
  const normalizedClass = normalizeConstructedHeroClass(classKey);
  const classColor = normalizedClass ? CLASS_COLORS[normalizedClass] : '#67131c';
  const visibleDecks = decks.slice(0, visibleCount);

  return (
    <section className="archetypes-detail__panel archetype-analysis-panel" aria-labelledby="archetype-decks-title">
      <header className="archetype-analysis-panel__heading">
        <div>
          <span className="archetype-analysis-panel__eyebrow"><LayoutGrid aria-hidden="true" /> Готовые сборки</span>
          <h2 id="archetype-decks-title">Сборки колод <span>{decks.length}</span></h2>
        </div>
        <p>Раскройте сборку, изучите карты и продолжите редактирование в конструкторе из раздела «Разное».</p>
      </header>

      {visibleDecks.length ? (
        <div className="archetype-deck-folios">
          {visibleDecks.map((deck, index) => {
            const cards = (deck.cards || []).filter(card => !card.sideboard).flatMap(card => {
              const resolved = deckListCard(card);
              return resolved ? [resolved] : [];
            });
            const sideboardCount = (deck.cards || []).filter(card => Boolean(card.sideboard)).length;
            const deckCode = buildDeckCode(deck, classKey);
            const builderHref = deckCode ? `/deck-builder?code=${encodeURIComponent(deckCode)}` : '';

            return (
              <details className="archetype-deck-folio" key={deck.id || deck.deck_id || index} open={index === 0}>
                <summary>
                  <span className="archetype-deck-folio__number">#{index + 1}</span>
                  <span className="archetype-deck-folio__title">
                    <strong>Сборка {index + 1}</strong>
                    <small>{formatNumber(deck.total_games)} игр · {formatNumber(deck.card_count || cards.reduce((sum, card) => sum + card.count, 0))} карт</small>
                  </span>
                  <span className="archetype-deck-folio__metric">
                    <small>Винрейт</small>
                    <strong>{formatPercent(deck.win_rate)}</strong>
                  </span>
                  <span className="archetype-deck-folio__metric">
                    <small>Ходов</small>
                    <strong>{finite(deck.avg_num_player_turns)?.toLocaleString('ru-RU', { maximumFractionDigits: 1 }) ?? '—'}</strong>
                  </span>
                  <ChevronDown aria-hidden="true" />
                </summary>

                <div className="archetype-deck-folio__body">
                  <DeckListView
                    cards={cards}
                    title={`Сборка ${index + 1}`}
                    subtitle={sideboardCount ? `${sideboardCount} карт сайдборда не включены в код` : 'Стандарт'}
                    headerColor={classColor}
                    totalCards={cards.reduce((sum, card) => sum + card.count, 0)}
                    deckCode={deckCode}
                    showCopy={Boolean(deckCode)}
                    emptyText="Состав этой сборки пока недоступен."
                  />

                  <div className="archetype-deck-folio__actions">
                    <div className="archetype-deck-folio__action-copy">
                      <strong>Продолжить работу со сборкой</strong>
                      <p>Код и состав автоматически перенесутся в админский конструктор колод.</p>
                    </div>
                    {builderHref ? (
                      <a className="archetype-builder-link" href={builderHref}>
                        <LayoutGrid aria-hidden="true" />
                        Открыть в конструкторе
                      </a>
                    ) : (
                      <span className="archetype-builder-link is-disabled" aria-disabled="true">
                        <LayoutGrid aria-hidden="true" />
                        Код сборки недоступен
                      </span>
                    )}
                    {deck.url ? (
                      <a className="archetype-source-link" href={deck.url} target="_blank" rel="noreferrer">
                        Источник HSReplay <ExternalLink aria-hidden="true" />
                      </a>
                    ) : null}
                  </div>
                </div>
              </details>
            );
          })}
        </div>
      ) : (
        <p className="archetype-analysis-panel__empty">Для текущего среза готовые сборки ещё не найдены.</p>
      )}

      {visibleCount < decks.length ? (
        <button
          type="button"
          className="archetype-analysis-panel__more"
          onClick={() => setVisibleCount(count => Math.min(decks.length, count + 4))}
        >
          <BarChart3 aria-hidden="true" />
          Показать ещё сборки
        </button>
      ) : null}
    </section>
  );
}
