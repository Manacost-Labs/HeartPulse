import { ArrowDownUp, ExternalLink, Sparkles, Swords } from 'lucide-react';
import { LoadingBlock, LoadingSurface } from '../shared/ui/LoadingSurface';
import { Title, Value, Words } from './archetypeSkeletonText';
import '../modules/constructedCards/public.css';
import './ConstructedArchetypeAnalysis.css';
import './ConstructedArchetypeAnalysisPlaceholders.css';

const MATCHUP_ROWS = 11;
/** The table's first page; the «show all» control follows it when more cards exist. */
const CARD_ROWS = 15;
/** The phone sort controls' labels (ConstructedArchetypeAnalysis): they wrap where the loaded controls wrap. */
const MOBILE_SORTS = ['В муллигане', 'Муллиганов', 'При доборе', 'Доборов', 'При оставлении', 'Оставлений'];

function AnalysisSource() {
  return <div className="constructed-analysis-source">
    <span><Words>Обновлено: срез ещё не готов</Words></span>
    <span className="archetype-analysis-skeleton__source-link"><Words>Проверить на HSGuru</Words><ExternalLink aria-hidden="true" /></span>
  </div>;
}

/**
 * Matchups against the eleven classes, then the mulligan table with its first
 * page of rows (phone: sort controls and cards), in the analysis view's own
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
            <p><Words>Сортируйте по влиянию или размеру выборки. Положительное значение означает результат выше среднего винрейта архетипа.</Words>
              {' '}<span className="archetype-analysis-skeleton__tip"><LoadingBlock /></span></p>
          </div>
          <span className="archetype-section-heading__count"><Value /></span>
        </div>
        <div className="constructed-card-stats__scroll">
          <div className="archetype-analysis-skeleton__table">
            {Array.from({ length: CARD_ROWS + 2 }, (_, index) => <LoadingBlock key={index} className="archetype-analysis-skeleton__table-row" />)}
          </div>
        </div>
        <div className="constructed-card-stats__mobile">
          <fieldset className="constructed-card-stats__mobile-sort" disabled>
            <legend><Words>Сортировать</Words></legend>
            {MOBILE_SORTS.map(label => <span key={label} className="archetype-analysis-skeleton__sort"><Words>{label}</Words><ArrowDownUp aria-hidden="true" /></span>)}
          </fieldset>
          <div className="constructed-card-stats__cards">
            {Array.from({ length: CARD_ROWS }, (_, index) => <div key={index} className="archetype-analysis-skeleton__mobile-card">
              <LoadingBlock className="archetype-analysis-skeleton__mobile-tile" /><LoadingBlock className="archetype-analysis-skeleton__mobile-metrics" />
            </div>)}
          </div>
        </div>
        <LoadingBlock className="constructed-card-stats__more" />
        <AnalysisSource />
      </div>
    </div>
  </LoadingSurface>;
}
