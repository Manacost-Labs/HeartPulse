import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Database, Save } from 'lucide-react';
import { formatAdminDate, HEALTH_LABEL } from './format';
import type {
  ParserControlSnapshot,
  ParserHealth,
  ParserPublicationChannel,
  ParserPublicationMode,
  ParserSection,
} from './types';

const GROUP_LABELS: Record<string, string> = {
  traditional: 'Традиционный режим',
  constructed: 'Традиционный режим',
  standard: 'Традиционный режим',
  arena: 'Арена',
  battlegrounds: 'Поля Сражений',
  battleground: 'Поля Сражений',
  system: 'Служебные данные',
  service: 'Служебные данные',
  other: 'Другие источники',
};

const PUBLICATION_CHANNEL_LABEL: Record<ParserPublicationChannel, string> = {
  early: 'Ранняя публикация',
  stable: 'Стабильный снимок',
  stable_baseline: 'Стабильная резервная версия',
  unavailable: 'Не опубликовано',
};

function StatusBadge({ status }: { status: ParserHealth }) {
  return <span className={`admin-parser-status is-${status}`}><i aria-hidden="true" />{HEALTH_LABEL[status]}</span>;
}

function SectionRow({
  section,
  enabled,
  expanded,
  effectiveMode,
  onToggleExpanded,
  onToggleEnabled,
}: {
  section: ParserSection;
  enabled: boolean;
  expanded: boolean;
  effectiveMode: ParserPublicationMode;
  onToggleExpanded: () => void;
  onToggleEnabled: (enabled: boolean) => void;
}) {
  const capable = section.sources.filter(source => source.supportsEarly).length;
  return (
    <article className={`admin-parser-section ${expanded ? 'is-expanded' : ''}`}>
      <div className="admin-parser-section__head">
        <button type="button" className="admin-parser-section__expand" aria-expanded={expanded} onClick={onToggleExpanded}>
          <ChevronDown size={18} aria-hidden="true" />
          <span><strong>{section.label}</strong><small>{section.description || `${section.sources.length} источников`}</small></span>
        </button>
        <div className="admin-parser-section__summary">
          <StatusBadge status={enabled ? section.status : 'paused'} />
          <span className="admin-parser-section__date">{formatAdminDate(section.lastSuccessAt)}</span>
          <label className="admin-parser-switch">
            <input type="checkbox" checked={enabled} onChange={event => onToggleEnabled(event.target.checked)} />
            <span aria-hidden="true" />
            <b>{enabled ? 'Автообновление включено' : 'Автообновление выключено'}</b>
          </label>
        </div>
      </div>
      {expanded && (
        <div className="admin-parser-sources" role="list" aria-label={`Источники раздела ${section.label}`}>
          {section.sources.length ? section.sources.map(source => (
            <div key={source.id} role="listitem" className="admin-parser-source">
              <div>
                <strong>{source.label}</strong>
                <code>{source.id}</code>
                {source.description && <small>{source.description}</small>}
              </div>
              <div className="admin-parser-source__flags">
                <StatusBadge status={source.status} />
                <span className={`publication-channel is-${source.publicationChannel}`}>
                  {PUBLICATION_CHANNEL_LABEL[source.publicationChannel]}
                </span>
                <span className={source.supportsEarly ? 'supports-early' : 'not-applicable'}>
                  {source.supportsEarly ? 'Ранняя мета' : 'Режим не применяется'}
                </span>
              </div>
              <dl>
                <div><dt>Опубликовано</dt><dd>{formatAdminDate(source.publishedFetchedAt)}</dd></div>
                <div><dt>Кандидат</dt><dd>{formatAdminDate(source.candidateFetchedAt)}</dd></div>
                <div><dt>Последняя попытка</dt><dd>{formatAdminDate(source.lastAttemptAt)}</dd></div>
                <div><dt>Записей</dt><dd>{source.itemCount?.toLocaleString('ru-RU') ?? '—'}</dd></div>
                {source.sourceState && <div><dt>Состояние API</dt><dd>{source.sourceState}</dd></div>}
                {source.lastError && <div className="has-error"><dt>Последняя ошибка</dt><dd>{source.lastError}</dd></div>}
              </dl>
              {effectiveMode === 'stable' && source.candidateFetchedAt && (
                !source.publishedFetchedAt || Date.parse(source.candidateFetchedAt) > Date.parse(source.publishedFetchedAt)
              ) && (
                <p className="admin-parser-source__notice">
                  Новый кандидат ещё не опубликован: пользователи видят стабильную версию.
                </p>
              )}
              {effectiveMode === 'stable' && !source.stableBaselineAvailable && source.publicationChannel === 'unavailable' && (
                <p className="admin-parser-source__notice is-danger">
                  Стабильной резервной версии нет — источник сейчас не публикуется.
                </p>
              )}
            </div>
          )) : <p className="admin-parser-empty">В разделе пока нет зарегистрированных источников.</p>}
          {capable > 0 && <p className="admin-parser-section__footnote">Ранний режим поддерживают {capable} из {section.sources.length} источников.</p>}
        </div>
      )}
    </article>
  );
}

export function ParserSectionsCard({
  snapshot,
  saving,
  onSave,
}: {
  snapshot: ParserControlSnapshot;
  saving: boolean;
  onSave: (sections: Record<string, boolean>) => void;
}) {
  const baseline = useMemo(
    () => Object.fromEntries(snapshot.sections.map(section => [section.id, section.enabled])),
    [snapshot.sections],
  );
  const [draft, setDraft] = useState<Record<string, boolean>>(baseline);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => setDraft(baseline), [baseline]);
  const dirty = snapshot.sections.some(section => draft[section.id] !== section.enabled);
  const groupedSections = useMemo(() => {
    const groups = new Map<string, ParserSection[]>();
    for (const section of snapshot.sections) {
      const group = section.group || 'other';
      groups.set(group, [...(groups.get(group) ?? []), section]);
    }
    return [...groups.entries()];
  }, [snapshot.sections]);

  return (
    <section className="contest-admin-card admin-parser-card" aria-labelledby="parser-sections-title">
      <div className="admin-card-heading admin-parser-card__heading">
        <div>
          <h2 id="parser-sections-title"><Database size={21} /> Автообновление разделов</h2>
          <p className="contest-muted">Отключение останавливает будущие запуски. Уже опубликованные данные сохраняются.</p>
        </div>
        <button type="button" className="contest-primary-button" disabled={!dirty || saving} onClick={() => onSave(draft)}>
          <Save size={16} /> {saving ? 'Сохраняем…' : 'Сохранить'}
        </button>
      </div>
      <div className="admin-parser-sections">
        {groupedSections.length ? groupedSections.map(([group, sections], groupIndex) => (
          <section key={group} className="admin-parser-section-group" aria-labelledby={`parser-group-${groupIndex}`}>
            <h3 id={`parser-group-${groupIndex}`}>{GROUP_LABELS[group.toLowerCase()] || group}</h3>
            <div>
              {sections.map(section => (
                <React.Fragment key={section.id}>
                  <SectionRow
                    section={section}
                    enabled={draft[section.id] ?? section.enabled}
                    expanded={expanded.has(section.id)}
                    effectiveMode={snapshot.policy.effectiveMode}
                    onToggleExpanded={() => setExpanded(current => {
                      const next = new Set(current);
                      if (next.has(section.id)) next.delete(section.id); else next.add(section.id);
                      return next;
                    })}
                    onToggleEnabled={enabled => setDraft(current => ({ ...current, [section.id]: enabled }))}
                  />
                </React.Fragment>
              ))}
            </div>
          </section>
        )) : <p className="admin-parser-empty" role="status">API данных пока не вернул ни одного раздела.</p>}
      </div>
      {dirty && <p className="admin-parser-unsaved" role="status">Есть несохранённые изменения автообновления.</p>}
    </section>
  );
}
