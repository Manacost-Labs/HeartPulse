import { type CSSProperties, type ReactNode } from 'react';
import { ArrowDownRight } from 'lucide-react';
import { LEADERBOARD_RATING_LABELS, formatPlayers } from '../model/leaderboardsView';
import { histogramBars, histogramTicks, summaryLine, type HistogramBar } from '../model/leaderboardSummary';
import type { LeaderboardStats } from '../model/types';

function RatingHistogram({ bars, unit }: { bars: HistogramBar[]; unit: string }) {
  const ticks = histogramTicks(bars);
  return <figure className="leaderboards-histogram">
    <figcaption className="leaderboards-label">{unit === 'Рейтинг' ? 'Распределение рейтинга' : `Распределение: ${unit.toLowerCase()}`}</figcaption>
    <div className="leaderboards-histogram__bars" role="img" aria-label={`Распределение игроков по рейтингу: ${bars.map(bar => bar.label).join('; ')}`}>
      {bars.map(bar => <span key={bar.from} title={bar.label} style={{ '--lb-bar': Math.max(bar.height, 0.04) } as CSSProperties} />)}
    </div>
    <div className="leaderboards-histogram__ticks" aria-hidden="true">{ticks.map((tick, index) => <span key={index}>{tick}</span>)}</div>
  </figure>;
}

function ThresholdJump({ rank, onRank, children }: { rank: number; onRank: (rank: number) => void; children: ReactNode }) {
  return <button type="button" className="leaderboards-summary__jump" title={`Перейти к ${formatPlayers(rank)}-му месту`} onClick={() => onRank(rank)}>
    {children}<ArrowDownRight aria-hidden="true" />
  </button>;
}

/**
 * Сводка над таблицей полосой плиток: игроки (и изменение за день) и пороги
 * топ-100/1000/5000 — каждая плитка порога переводит к своему месту. У режимов
 * с рейтингом справа — гистограмма рейтинга.
 */
export function LeaderboardSummary({ stats, onRank }: { stats: LeaderboardStats; onRank: (rank: number) => void }) {
  const line = summaryLine(stats);
  const bars = histogramBars(stats);
  return <div className={bars.length ? 'leaderboards-summary has-histogram' : 'leaderboards-summary'}>
    <dl className="leaderboards-kpis">
      <div className="leaderboards-kpi">
        <dt className="leaderboards-label">Игроков</dt>
        <dd><strong>{line.players}</strong>{line.delta && <small>{line.delta}</small>}</dd>
      </div>
      {stats.board.rated
        ? line.thresholds.map(threshold => <div key={threshold.rank} className="leaderboards-kpi">
          <dt className="leaderboards-label">{threshold.label}</dt>
          <dd><ThresholdJump rank={threshold.rank} onRank={onRank}><strong>{threshold.rating ?? '—'}</strong></ThresholdJump></dd>
        </div>)
        // Без рейтинга у порога нет числа: одна плитка переходов вместо трёх пустых.
        : line.thresholds.length > 0 && <div className="leaderboards-kpi leaderboards-kpi--jumps">
          <dt className="leaderboards-label">Топ</dt>
          <dd>{line.thresholds.map(threshold => <ThresholdJump key={threshold.rank} rank={threshold.rank} onRank={onRank}>
            <span>{formatPlayers(threshold.rank)}</span>
          </ThresholdJump>)}</dd>
        </div>}
    </dl>
    {bars.length > 0 && <RatingHistogram bars={bars} unit={LEADERBOARD_RATING_LABELS[stats.board.mode] ?? 'Рейтинг'} />}
    {stats.snapshot.truncated && <p className="leaderboards-muted leaderboards-summary__note">Сохранены первые {formatPlayers(stats.snapshot.stored)} мест</p>}
  </div>;
}
