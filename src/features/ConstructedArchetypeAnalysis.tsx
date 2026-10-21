import { useMemo } from 'react';
import { ExternalLink, Swords } from 'lucide-react';
import { classIconUrl, useNeutralClassIcon } from './classIcons';
import { hsguruAnalysisEmptyMessage, hsguruMatchupTone } from './archetypeDetailModel';
import { CardStatsPanel, type ConstructedCardStat } from './ConstructedArchetypeCardStats';
import './ConstructedArchetypeAnalysis.css';

export type { ConstructedCardStat };

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
        <p className="constructed-analysis-empty">
          {hsguruAnalysisEmptyMessage(analysis?.state ?? null, 'matchups')}
        </p>
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

export { ArchetypeAnalysisSkeleton } from './ConstructedArchetypeAnalysisSkeleton';
