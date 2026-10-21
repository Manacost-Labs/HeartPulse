import { LoadingSurface } from '../../shared/ui/LoadingSurface';
import { LoadingText, LoadingValue } from '../../shared/ui/LoadingShapes';
import '../../shared/ui/LoadingSurface.css';
import '../ViciousSyndicateGold.css';
import './ViciousGoldSkeleton.css';

// The statistics below the banner while they load: the report plate and the
// first screen of the Power Tier board, built from the page's own classes so
// the plate, the controls and the 52 px rows keep their real geometry. Result
// counts are data: the skeleton shows a first screen of rows and the
// one-viewport reserve, not the final page length.

const POWER_ROWS = 8;
const CONTENTS = ['Power Tier 6 диапазонов рангов', 'Доли меты 11 классов', 'Колоды 30 архетипов'];
const RANK_TABS = ['Все ранги', 'Легенда', 'Алмаз 1–4', 'Алмаз 5–10', 'Платина', 'Золото, Серебро, Бронза'];

/**
 * A placeholder block. It is an `i` rather than LoadingBlock's `span`: the
 * page styles `… span` children (names, labels), and those rules must not
 * reach the placeholders.
 */
function Bar({ className }: { className: string }) {
  return <i className={`loading-block ${className}`} aria-hidden="true" />;
}

/** Static copy as a text-shaped bar in the font of its holder. */
function Words({ children }: { children: string }) {
  return <LoadingText as="i" className="vsgold-skeleton__words">{children}</LoadingText>;
}

/** One line of a data value in the font of its holder. */
function Value({ wide = false }: { wide?: boolean }) {
  return <LoadingValue as="i" className={wide ? 'vsgold-skeleton__value vsgold-skeleton__value--wide' : 'vsgold-skeleton__value'} />;
}

function ReportSkeleton() {
  return <div className="vsgold-report">
    <div className="vsgold-report__copy">
      <p className="vsgold-report__eyebrow"><Words>Data Reaper Live · Стандарт</Words></p>
      <div className="vsgold-skeleton__report-title"><Words>Мета за последние 24 часа</Words></div>
      <p className="vsgold-report__meta"><span><Words>Обновлено 20 октября в 21:29 МСК</Words></span><span><Words>136 843 партий · Vicious Syndicate</Words></span></p>
      <div className="vsgold-report__contents">
        {CONTENTS.map(label => <span key={label} className="vsgold-report__chip"><Words>{label}</Words></span>)}
      </div>
    </div>
    <div className="ui-kpi-group vsgold-report__kpis vsgold-skeleton__kpis">{[0, 1, 2, 3].map(index => <Bar key={index} className="vsgold-skeleton__kpi" />)}</div>
  </div>;
}

function PowerSkeleton() {
  return <div className="vsgold-section vsgold-power">
    <div className="vsgold-section__head">
      <div>
        <div className="vsgold-skeleton__title"><Words>Power Tier List</Words></div>
        <p><Words>Ожидаемый винрейт колоды против меты выбранного диапазона рангов: расчёт vS по матчапам и частоте соперников.</Words></p>
      </div>
    </div>
    <div className="vsgold-power__controls">
      <div className="vsgold-power__ranks">{RANK_TABS.map(label => <span key={label} className="vsgold-skeleton__tab"><Words>{label}</Words></span>)}</div>
      <div className="vsgold-select"><Bar className="vsgold-skeleton__tool" /></div>
    </div>
    <div className="vsgold-tier">
      <div className="vsgold-tier__head"><Bar className="vsgold-skeleton__badge" /><div className="vsgold-skeleton__tier-title"><Value /></div></div>
      {Array.from({ length: POWER_ROWS }, (_, index) => <div key={index} className="vsgold-power-row">
        <span className="vsgold-power-row__rank"><Value /></span>
        <Bar className="vsgold-skeleton__icon" />
        <div className="vsgold-power-row__name"><strong><Value wide /></strong><small><Value wide /></small></div>
        <Bar className="vsgold-power-row__bar" />
        <b className="vsgold-power-row__winrate"><Value /></b>
        <span className="vsgold-power-row__delta" />
        <Bar className="vsgold-skeleton__copy" />
      </div>)}
    </div>
  </div>;
}

/** The page below the banner while statistics load; the same frame serves the access check. */
export function ViciousGoldSkeleton() {
  return <LoadingSurface label="Загружаем Vicious Syndicate Gold" quiet layout="rows" className="vsgold__loading vsgold-skeleton">
    <div className="vsgold-skeleton__body" inert>
      <ReportSkeleton />
      <PowerSkeleton />
    </div>
  </LoadingSurface>;
}
