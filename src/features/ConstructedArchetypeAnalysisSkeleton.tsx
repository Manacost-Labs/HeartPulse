import { ExternalLink, Sparkles, Swords } from 'lucide-react';
import { LoadingBlock, LoadingSurface } from '../shared/ui/LoadingSurface';
import { DataTable, type DataTableColumn } from '../vendor/varylo-ui/data-display/DataTable';
import { Title, Value, Words } from './archetypeSkeletonText';
import { CARD_STATS_FIRST_PAGE } from './ConstructedArchetypeCardStatsCells';
import { LOW_CARD_SAMPLE } from './archetypeDetailModel';
import '../vendor/varylo-ui/styles/index.css';
import './ConstructedArchetypeAnalysis.css';
import './ConstructedArchetypeCardStats.css';
import './ConstructedArchetypeAnalysisPlaceholders.css';

const MATCHUP_ROWS = 11;
const PHASE_LABELS = ['Муллиган', 'Добор', 'Оставлена'];
const PLACEHOLDER_ROWS = Array.from({ length: CARD_STATS_FIRST_PAGE }, (_, index) => ({ id: String(index) }));
/** The loaded table's columns without sort buttons: a placeholder holds no controls. */
const PLACEHOLDER_COLUMNS: DataTableColumn<{ id: string }>[] = [
  { key: 'card', header: 'Карта', width: '34%', cell: () => <span className="card-stat-name">
    <LoadingBlock className="card-stat-name__thumb" /><LoadingBlock className="archetype-analysis-skeleton__name" />
  </span> },
  ...PHASE_LABELS.map(label => ({ key: label, header: label, width: '22%', cell: () => <span className="card-stat-phase">
    <LoadingBlock className="archetype-analysis-skeleton__phase" /><LoadingBlock className="archetype-analysis-skeleton__sample" />
  </span> })),
];

function AnalysisSource() {
  return <div className="constructed-analysis-source">
    <span><Words>Обновлено: срез ещё не готов</Words></span>
    <span className="archetype-analysis-skeleton__source-link"><Words>Проверить на HSGuru</Words><ExternalLink aria-hidden="true" /></span>
  </div>;
}

/**
 * Matchups against the eleven classes, then the mulligan table with its first
 * page of rows (phone: one row per card), in the analysis view's own
 * classes. Reached only through the lazy analysis chunk (see
 * ArchetypeAnalysisLoading), so ConstructedArchetypeAnalysis.css keeps its
 * cascade position.
 */
export function ArchetypeAnalysisSkeleton() {
  return <LoadingSurface label="Загружаем матчапы и муллиган" quiet layout="rows" className="archetype-detail-skeleton">
    <div className="constructed-analysis-stack" inert>
      <div className="constructed-analysis-panel">
        <div className="constructed-analysis-heading">
          <div>
            <span className="archetypes-eyebrow"><Swords aria-hidden="true" /><Words>HSGuru · Легенда</Words></span>
            <Title analysis>Матчапы против классов</Title>
            <p><Words>Винрейт архетипа против каждого класса за последние 7 дней. Сначала показаны самые сложные соперники.</Words></p>
          </div>
          <dl className="constructed-matchup-summary">
            {['Выгодных', 'Ровных', 'Сложных'].map(label => <div key={label}><dt><Words>{label}</Words></dt><dd><Value /></dd></div>)}
          </dl>
        </div>
        <ol className="constructed-matchup-ledger">
          {Array.from({ length: MATCHUP_ROWS }, (_, index) => <li key={index}>
            <LoadingBlock className="archetype-analysis-skeleton__class-icon" />
            <span className="constructed-matchup-ledger__identity"><strong><Value /></strong><small><Value wide /></small></span>
            <LoadingBlock className="constructed-matchup-ledger__meter" />
            <strong className="constructed-matchup-ledger__winrate"><Value /></strong>
          </li>)}
        </ol>
        <AnalysisSource />
      </div>
      <div className="constructed-analysis-panel constructed-card-stats">
        <div className="constructed-analysis-heading">
          <div>
            <span className="archetypes-eyebrow"><Sparkles aria-hidden="true" /><Words>Статистика карт</Words></span>
            <Title analysis>Муллиган и влияние карт</Title>
            <p><Words>Влияние — разница с средним винрейтом архетипа: зелёное выше среднего, красное ниже. Под значением — размер выборки.</Words>
              {' '}<span className="archetype-analysis-skeleton__tip"><LoadingBlock /></span></p>
          </div>
          <span className="archetype-section-heading__count"><Value /></span>
        </div>
        <div className="constructed-card-stats__toolbar">
          <span className="constructed-card-stats__sort"><Words>Сортировка</Words><LoadingBlock className="archetype-analysis-skeleton__select" /></span>
          <LoadingBlock className="constructed-card-stats__direction" />
          <span className="constructed-card-stats__legend">
            {PHASE_LABELS.map(label => <span key={label}><Words>{label}</Words><span className="archetype-analysis-skeleton__tip"><LoadingBlock /></span></span>)}
            <span className="constructed-card-stats__low"><Words>{`Бледные — выборка меньше ${LOW_CARD_SAMPLE}`}</Words></span>
          </span>
          <LoadingBlock className="constructed-card-stats__csv" />
        </div>
        <div className="constructed-card-stats__table">
          <DataTable data={PLACEHOLDER_ROWS} columns={PLACEHOLDER_COLUMNS} density="compact" label="Муллиган и влияние карт" />
        </div>
        <ol className="constructed-card-stats__list">
          {PLACEHOLDER_ROWS.map(row => <li key={row.id}><LoadingBlock className="archetype-analysis-skeleton__list-row" /></li>)}
        </ol>
        <LoadingBlock className="constructed-card-stats__more" />
        <AnalysisSource />
      </div>
    </div>
  </LoadingSurface>;
}
