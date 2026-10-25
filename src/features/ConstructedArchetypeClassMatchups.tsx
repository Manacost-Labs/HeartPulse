import { useMemo, type ReactNode } from 'react';
import { ExternalLink, Swords } from 'lucide-react';
// Not a hook despite its name: it swaps a failed class icon for the neutral one.
import { classIconUrl, useNeutralClassIcon as showNeutralClassIcon } from './classIcons';
import { hsguruMatchupTone } from './archetypeDetailModel';

const CLASS_LABELS: Record<string, string> = {
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

export type ClassMatchupRow = { classKey: string; winrate: number; games: number; share: number | null };

const PERCENT = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });
const COUNT = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const DATE = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

function formatPercent(value: number | null): string {
  return value === null || !Number.isFinite(value) ? '—' : `${PERCENT.format(value)}%`;
}

function formatDate(value: string | null): string {
  if (!value || !Number.isFinite(Date.parse(value))) return 'срез ещё не готов';
  return DATE.format(new Date(value));
}

/**
 * Winrate against each class, hardest first. `scope` names the HSGuru slice
 * in the eyebrow; `empty` is shown when the slice has no rows.
 */
export function ClassMatchupsPanel({ rows, scope, updatedAt, sourceUrl, empty }: {
  rows: readonly ClassMatchupRow[];
  scope: string;
  updatedAt: string | null;
  sourceUrl: string;
  empty: ReactNode;
}) {
  const sorted = useMemo(() => [...rows].filter(row => CLASS_LABELS[row.classKey]).sort((left, right) => left.winrate - right.winrate), [rows]);
  const summary = sorted.reduce((result, row) => {
    result[hsguruMatchupTone(row.winrate)] += 1;
    return result;
  }, { favored: 0, even: 0, unfavored: 0, unknown: 0 });

  return (
    <section className="constructed-analysis-panel" aria-labelledby="constructed-matchups-title">
      <header className="constructed-analysis-heading">
        <div>
          <span className="archetypes-eyebrow"><Swords aria-hidden="true" /> {scope}</span>
          <h2 id="constructed-matchups-title">Матчапы против классов</h2>
          <p>Винрейт архетипа против каждого класса. Сначала показаны самые сложные соперники.</p>
        </div>
        <dl className="constructed-matchup-summary" aria-label="Сводка матчапов">
          <div data-tone="favored"><dt>Выгодных</dt><dd>{summary.favored}</dd></div>
          <div data-tone="even"><dt>Ровных</dt><dd>{summary.even}</dd></div>
          <div data-tone="unfavored"><dt>Сложных</dt><dd>{summary.unfavored}</dd></div>
        </dl>
      </header>

      {sorted.length ? (
        <ol className="constructed-matchup-ledger">
          {sorted.map(row => (
            <li key={row.classKey} data-tone={hsguruMatchupTone(row.winrate)}>
              <img src={classIconUrl(row.classKey)} alt="" width="46" height="46" loading="lazy"
                onError={event => showNeutralClassIcon(event.currentTarget)} />
              <span className="constructed-matchup-ledger__identity">
                <strong>{CLASS_LABELS[row.classKey]}</strong>
                <small>{COUNT.format(row.games)} игр{row.share === null ? '' : ` · ${formatPercent(row.share)} выборки`}</small>
              </span>
              <span className="constructed-matchup-ledger__meter" aria-hidden="true">
                <i />
                <b style={{ left: `${Math.min(100, Math.max(0, row.winrate))}%` }} />
              </span>
              <strong className="constructed-matchup-ledger__winrate">{formatPercent(row.winrate)}</strong>
            </li>
          ))}
        </ol>
      ) : empty}

      <footer className="constructed-analysis-source">
        <span>Обновлено: {formatDate(updatedAt)}</span>
        {sourceUrl ? (
          <a href={sourceUrl} target="_blank" rel="noreferrer">Проверить на HSGuru <ExternalLink aria-hidden="true" /></a>
        ) : null}
      </footer>
    </section>
  );
}
