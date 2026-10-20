import type { ReactNode } from 'react';
import { LoadingSurface } from '../../shared/ui/LoadingSurface';
import { ChartFrame } from '../../shared/ui/analytics/ChartFrame';
import '../../shared/ui/LoadingSurface.css';
import '../../shared/ui/analytics/Analytics.css';
import '../ViciousSyndicateGold.css';
import './ViciousGoldSkeleton.css';

// The statistics below the banner while they load: class shares, the deck
// list and the Power Tier board, built from the dashboard's own classes so
// panels, 86 px deck rows and tier cards keep their real geometry. Result
// counts are data: the skeleton shows a first screen of rows and the
// one-viewport reserve, not the final page length.

const DECK_ROWS = 8;
const TIER_CARDS = 4;
const CLASS_BARS = 11;
const RANK_TABS = ['Все ранги', 'Легенда', 'Алмаз 1–4', 'Алмаз 5–10', 'Платина', 'Золото, Серебро, Бронза'];
const CLASS_TABS = ['Воин', 'Маг', 'Рыцарь смерти', 'Паладин', 'Разбойник', 'Охотник на демонов', 'Шаман', 'Жрец', 'Друид', 'Охотник', 'Чернокнижник'];

/**
 * A placeholder block. It is an `i` rather than LoadingBlock's `span`: the
 * dashboard styles `… > span` and `… span` children (build labels, headings),
 * and those rules must not reach the placeholders.
 */
function Bar({ className }: { className: string }) {
  return <i className={`loading-block ${className}`} aria-hidden="true" />;
}

/** Static copy as a text-shaped bar in the font of its holder (an `i`, so the dashboard's `span` rules leave it alone). */
function Words({ children }: { children: string }) {
  return <i className="loading-block vsgold-skeleton__words" aria-hidden="true">{children}</i>;
}

/** One line of a data value in the font of its holder. */
function Value({ wide = false, inline = false }: { wide?: boolean; inline?: boolean }) {
  return <i className={`loading-block vsgold-skeleton__value${wide ? ' vsgold-skeleton__value--wide' : ''}${inline ? ' vsgold-skeleton__value--inline' : ''}`} aria-hidden="true" />;
}

function SectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return <div className="vsgold__section-heading">
    <Bar className="vsgold-skeleton__heading-icon" />
    <div><span><Words>{eyebrow}</Words></span><div className="vsgold-skeleton__title"><Words>{title}</Words></div></div>
  </div>;
}

function Build({ open = false }: { open?: boolean }) {
  return <div className="vsgold__build">
    <i className="loading-block vsgold-skeleton__copy" aria-hidden="true"><i className="vsgold-skeleton__copy-art" /></i>
    {open ? <Bar className="vsgold-skeleton__open" /> : null}
    <span><Value wide /></span>
  </div>;
}

function Tab({ children }: { children: ReactNode }) {
  return <span className="vsgold-skeleton__tab">{children}</span>;
}

function DistributionSkeleton() {
  return <div className="vsgold__distribution-grid">
    <div className="vsgold__panel vsgold__classes">
      <SectionHeading eyebrow="Доля в партиях" title="Распределение классов" />
      <ChartFrame title="Доля классов" subtitle="Выберите класс, чтобы отфильтровать колоды">
        <div className="analytics-chart__plot">
          <div className="vsgold-skeleton__bars">
            {Array.from({ length: CLASS_BARS }, (_, index) => <Bar key={index} className="vsgold-skeleton__bar" />)}
          </div>
          <Bar className="vsgold-skeleton__chart-data" />
        </div>
      </ChartFrame>
    </div>
    <div className="vsgold__panel vsgold__decks">
      <SectionHeading eyebrow="Популярность от 0,5%" title="Распределение колод" />
      <div className="vsgold__deck-tools"><Bar className="vsgold-skeleton__tool" /><Bar className="vsgold-skeleton__tool" /></div>
      <div className="vsgold__deck-list">
        {Array.from({ length: DECK_ROWS }, (_, index) => <div key={index} className="vsgold__deck-row">
          <Bar className="vsgold-skeleton__deck-icon" />
          <div className="vsgold__deck-name"><strong><Value wide /></strong><span><Value wide /></span></div>
          <b><Value /></b>
          <Build open />
        </div>)}
      </div>
    </div>
  </div>;
}

function PowerTierSkeleton() {
  return <div className="vsgold__panel vsgold__power">
    <div className="vsgold__power-heading">
      <SectionHeading eyebrow="Винрейт по рангам" title="Power Tier List" />
      <p><Words>Выберите диапазон рангов и класс. Винрейт и порядок берутся из Vicious Syndicate Live.</Words></p>
    </div>
    <div className="vsgold__rank-tabs">{RANK_TABS.map(label => <Tab key={label}><Words>{label}</Words></Tab>)}</div>
    <div className="vsgold__class-tabs">
      <Tab><Bar className="vsgold-skeleton__tab-icon" /><Words>Все</Words></Tab>
      {CLASS_TABS.map(label => <Tab key={label}><Bar className="vsgold-skeleton__tab-icon" /><Words>{label}</Words></Tab>)}
    </div>
    <div className="vsgold__tier-band">
      <header><div className="vsgold-skeleton__band-title"><Value wide /></div><p><Value wide /></p></header>
      <div className="vsgold__tier-board">
        {Array.from({ length: TIER_CARDS }, (_, index) => <div key={index} className="vsgold__tier-card">
          <span className="vsgold__tier-rank"><Value /></span>
          <Bar className="vsgold-skeleton__tier-icon" />
          <div><small><Value wide inline /></small><div className="vsgold-skeleton__tier-name"><Value wide /></div><p><Value wide /></p></div>
          <strong><Value /><span><Value /></span></strong>
          <Build />
        </div>)}
      </div>
    </div>
  </div>;
}

/** The dashboard below the banner while statistics load; the same frame serves the access check. */
export function ViciousGoldSkeleton() {
  return <LoadingSurface label="Загружаем Vicious Syndicate Gold" quiet layout="rows" className="vsgold__loading vsgold-skeleton">
    <div className="vsgold-skeleton__body" inert>
      <div className="vsgold__mobile-nav">{[0, 1, 2].map(index => <Bar key={index} className="vsgold-skeleton__nav-item" />)}</div>
      <DistributionSkeleton />
      <PowerTierSkeleton />
    </div>
  </LoadingSurface>;
}
