import { ExternalLink, SlidersHorizontal, Sparkles, Swords } from 'lucide-react';
import { LoadingBlock, LoadingSurface } from '../shared/ui/LoadingSurface';
import { DataTable, type DataTableColumn } from '../vendor/varylo-ui/data-display/DataTable';
import { Title, Value, Words } from './archetypeSkeletonText';
import { CARD_STATS_FIRST_PAGE } from './ConstructedArchetypeCardStatsCells';
import { HSGURU_SECTION } from './hsguruStatsModel';
import '../vendor/varylo-ui/styles/index.css';
import './ConstructedArchetypeAnalysis.css';
import './ConstructedArchetypeCardStats.css';
import './ConstructedArchetypeAnalysisPlaceholders.css';
import './HsguruArchetypeStats.css';

const MATCHUP_ROWS = 11;
const PHASE_LABELS = ['Муллиган', 'Добор', 'Оставлена'];
const SLICE_FIELDS = ['Период', 'Ранг', 'Очерёдность хода', 'Соперник'];
const PLACEHOLDER_ROWS = Array.from({ length: CARD_STATS_FIRST_PAGE }, (_, index) => ({ id: String(index) }));
/** The loaded table's columns without sort buttons: a placeholder holds no controls. */
const PLACEHOLDER_COLUMNS: DataTableColumn<{ id: string }>[] = [
  { key: 'card', header: 'Карта', width: '34%', cell: () => <span className="card-stat-row">
    <LoadingBlock className="archetype-analysis-skeleton__tile" />
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
      <div className="constructed-analysis-panel hsguru-section">
        <div className="constructed-analysis-heading">
          <div>
            <span className="archetypes-eyebrow"><SlidersHorizontal size={15} aria-hidden="true" /><Words>{HSGURU_SECTION.eyebrow}</Words></span>
            <Title analysis>{HSGURU_SECTION.title}</Title>
            <p><Words>{HSGURU_SECTION.text}</Words></p>
          </div>
        </div>
        <div className="hsguru-slice">
          <div className="hsguru-slice__filters">
            {SLICE_FIELDS.map(label => <span key={label} className="hsguru-slice__field">
              <span><Words>{label}</Words></span>
              <LoadingBlock className="hsguru-slice__placeholder" />
            </span>)}
          </div>
          <p className="hsguru-slice__summary"><Words>HSGuru · 49 117 игр · обновлено 25 окт., 12:43</Words></p>
        </div>
      </div>
      <div className="constructed-analysis-panel">
        <div className="constructed-analysis-heading">
          <div>
            <span className="archetypes-eyebrow"><Swords aria-hidden="true" /><Words>HSGuru · Легенда · После банов</Words></span>
            <Title analysis>Матчапы против классов</Title>
            <p><Words>Винрейт архетипа против каждого класса. Сначала показаны самые сложные соперники.</Words></p>
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
