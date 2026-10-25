'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { FlaskConical, Info, TrendingDown, TrendingUp } from 'lucide-react';
import {
  DEFAULT_RADAR_FILTERS, RADAR_CLASS_LABELS, RADAR_SECTIONS, filterRadarCandidates, radarClassOptions,
  type RadarFilters, type RadarReport, type RadarSectionId,
} from '../model/radarView';
import { RadarCandidateCard } from './RadarCandidateCard';
import { RadarSummary } from './RadarSummary';
import { RadarPatterns, RadarTrust } from './RadarTrust';
import './RadarView.css';

const SECTION_IDS: RadarSectionId[] = ['nerfs', 'buffs'];
const KIND_OPTIONS: Array<{ value: RadarFilters['kind']; label: string }> = [
  { value: 'all', label: 'Всё' }, { value: 'card', label: 'Карты' }, { value: 'archetype', label: 'Архетипы' }, { value: 'class', label: 'Классы' },
];
const CONFIDENCE_OPTIONS: Array<{ value: RadarFilters['minConfidence']; label: string }> = [
  { value: 0, label: 'Любая' }, { value: 50, label: 'от 50' }, { value: 75, label: 'от 75' },
];

/** Дисклеймер стоит на странице всегда, в том числе в состояниях загрузки и ошибки. */
export function RadarDisclaimer() {
  return <p className="radar-note" role="note">
    <Info aria-hidden="true" />
    <span><b>Это прогноз, а не официальная информация.</b> Решения о балансе принимает только Blizzard.</span>
  </p>;
}

function ButtonGroup<T extends string | number>({ label, options, value, onChange }: {
  label: string; options: Array<{ value: T; label: string }>; value: T; onChange: (value: T) => void;
}) {
  return <div className="radar-filter">
    <span className="radar-filter__label" aria-hidden="true">{label}</span>
    <div className="radar-chips" role="group" aria-label={label}>
      {options.map(option => <button key={String(option.value)} type="button" className="radar-chip"
        aria-pressed={option.value === value} onClick={() => onChange(option.value)}>{option.label}</button>)}
    </div>
  </div>;
}

/**
 * Страница радара после загрузки данных: сводка, переключатель «нерфы ↔
 * баффы», фильтры и карточки кандидатов. Раздел запоминается в `#nerfs` /
 * `#buffs`, чтобы ссылку на радар баффов можно было отправить.
 */
export function RadarView({ report }: { report: RadarReport }) {
  const [section, setSection] = useState<RadarSectionId>('nerfs');
  const [filters, setFilters] = useState<RadarFilters>(DEFAULT_RADAR_FILTERS);
  const classSelectId = useId();
  const classes = useMemo(() => radarClassOptions(report), [report]);
  const visible = useMemo(() => filterRadarCandidates(report[section], filters), [report, section, filters]);
  const filtered = visible.length !== report[section].length;

  useEffect(() => {
    // Хэш читается после гидратации: сервер всегда рисует радар нерфов.
    const follow = () => setSection(window.location.hash === '#buffs' ? 'buffs' : 'nerfs');
    if (window.location.hash === '#buffs') follow();
    window.addEventListener('hashchange', follow);
    return () => window.removeEventListener('hashchange', follow);
  }, []);

  const choose = (next: RadarSectionId) => {
    setSection(next);
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}#${next}`);
  };
  const update = (patch: Partial<RadarFilters>) => setFilters(current => ({ ...current, ...patch }));

  return <>
    {report.demo && <p className="radar-note radar-note--demo" role="status">
      <FlaskConical aria-hidden="true" />
      <span><b>Демонстрационные данные.</b> Сбор радара ещё запускается: карты и архетипы настоящие, а цифры и посты — пример.</span>
    </p>}
    <RadarSummary report={report} />
    <section className="radar-section radar-board" aria-labelledby="radar-board-title">
      <h2 id="radar-board-title" className="sr-only">Кандидаты на изменения</h2>
      <div className="radar-board__bar">
        <div className="radar-tabs" role="tablist" aria-label="Раздел радара">
          {SECTION_IDS.map(id => {
            const Icon = id === 'nerfs' ? TrendingDown : TrendingUp;
            return <button key={id} id={`radar-tab-${id}`} type="button" role="tab" className="radar-tab" data-direction={id}
              aria-selected={section === id} aria-controls="radar-panel" tabIndex={section === id ? 0 : -1}
              onClick={() => choose(id)}
              onKeyDown={event => {
                const next = event.key === 'Home' ? 'nerfs' : event.key === 'End' ? 'buffs'
                  : event.key === 'ArrowLeft' || event.key === 'ArrowRight' ? (id === 'nerfs' ? 'buffs' : 'nerfs') : null;
                if (!next) return;
                event.preventDefault();
                choose(next);
                document.getElementById(`radar-tab-${next}`)?.focus();
              }}>
              <Icon aria-hidden="true" />
              <span>{RADAR_SECTIONS[id].title}</span>
              <span className="radar-tab__count">{report[id].length}</span>
            </button>;
          })}
        </div>
        <div className="radar-filters">
          <div className="radar-filter">
            <label className="radar-filter__label" htmlFor={classSelectId}>Класс</label>
            <select id={classSelectId} className="radar-select" value={filters.classKey}
              onChange={event => update({ classKey: event.target.value as RadarFilters['classKey'] })}>
              <option value="all">Все классы</option>
              {classes.map(key => <option key={key} value={key}>{RADAR_CLASS_LABELS[key]}</option>)}
            </select>
          </div>
          <ButtonGroup label="Тип" options={KIND_OPTIONS} value={filters.kind} onChange={kind => update({ kind })} />
          <ButtonGroup label="Уверенность" options={CONFIDENCE_OPTIONS} value={filters.minConfidence}
            onChange={minConfidence => update({ minConfidence })} />
        </div>
      </div>
      <div id="radar-panel" className="radar-board__panel" role="tabpanel" aria-labelledby={`radar-tab-${section}`}>
        {visible.length
          ? <ol className="radar-list">
            {visible.map((candidate, index) => <li key={candidate.id}>
              <RadarCandidateCard candidate={candidate} direction={section} index={index} />
            </li>)}
          </ol>
          : <div className="radar-empty">
            <p>{filtered ? 'Под выбранные фильтры кандидатов нет.' : RADAR_SECTIONS[section].empty}</p>
            {filtered && <button type="button" className="radar-chip" onClick={() => setFilters(DEFAULT_RADAR_FILTERS)}>
              Сбросить фильтры
            </button>}
          </div>}
      </div>
    </section>
    <RadarTrust backtest={report.backtest} />
    <RadarPatterns history={report.history} />
  </>;
}
