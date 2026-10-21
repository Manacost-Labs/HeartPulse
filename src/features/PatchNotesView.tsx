'use client';

import { useMemo } from 'react';
import { patchNotesHref, toPatchNotesView, type PatchNotesDetail, type PatchNotesSummary } from '../modules/patchNotes/public';
import { PatchNotes, type PatchNotesProps } from '../vendor/varylo-ui/gaming/PatchNotes';
import { useViewerTimeZone } from '../shared/ui/useViewerTimeZone';
import '../vendor/varylo-ui/styles/index.css';
import '../shared/ui/varyloParchment.css';
import './PatchNotesView.css';

const LABELS: PatchNotesProps['labels'] = {
  filter: 'Показать',
  all: 'Все',
  kinds: { buff: 'Усиления', nerf: 'Ослабления', rework: 'Изменения', new: 'Новое', removed: 'Удалено', fix: 'Исправления' },
  entryKinds: { buff: 'Усиление', nerf: 'Ослабление', rework: 'Изменение', new: 'Новое', removed: 'Удалено', fix: 'Исправление' },
  sectionFilter: 'Класс и режим',
  allSections: 'Все',
  search: 'Найти карту или изменение',
  before: 'было',
  after: 'стало',
  better: 'лучше для игрока',
  worse: 'хуже для игрока',
  other: 'Другие изменения',
  developerNote: 'Комментарий разработчиков',
  noResults: 'Нет изменений по выбранным фильтрам.',
};

const dateFormats = new Map<string, Intl.DateTimeFormat>();

/** One formatter per time zone: before hydration Europe/Moscow, then the viewer's own (`''`). */
function dateFormat(timeZone = ''): Intl.DateTimeFormat {
  let format = dateFormats.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', year: 'numeric', ...(timeZone ? { timeZone } : {}) });
    dateFormats.set(timeZone, format);
  }
  return format;
}

function ArchiveList({ patches, current, timeZone }: { patches: PatchNotesSummary[]; current: string; timeZone?: string }) {
  const format = dateFormat(timeZone);
  return (
    <nav className="hp-patch-archive" aria-labelledby="hp-patch-archive-title">
      <h2 id="hp-patch-archive-title" className="hp-patch-archive__title">Архив патчей</h2>
      <ol className="hp-patch-archive__list">
        {patches.map((patch, index) => (
          <li key={patch.version}>
            <a href={patchNotesHref(index === 0 ? null : patch.version)}
              aria-current={patch.version === current ? 'page' : undefined}>
              <span className="hp-patch-archive__version">{patch.version}</span>
              <span className="hp-patch-archive__meta">
                {patch.publishedAt ? format.format(new Date(patch.publishedAt)) : 'дата неизвестна'}
                {` · ${patch.changeCount} изм.`}
              </span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/**
 * One patch as Varylo patch notes, restyled to parchment, with the archive of
 * patches that have card changes. Every value comes from the stored article;
 * what the article does not state is said, not filled in.
 */
export function PatchNotesView({ patch, archive }: { patch: PatchNotesDetail; archive: PatchNotesSummary[] }) {
  const timeZone = useViewerTimeZone();
  const view = useMemo(() => toPatchNotesView(patch), [patch]);
  const resolved = patch.entries.filter(entry => entry.cardId).length;
  const constructed = patch.entries.filter(entry => entry.mode !== 'battlegrounds').length;
  return (
    <div className="hp-patch-notes hp-varylo-parchment">
      <div className="hp-patch-notes__main">
        <PatchNotes
          entries={view.entries}
          sections={view.sections}
          title={patch.title}
          version={`Патч ${patch.version}`}
          {...(patch.publishedAt ? { date: patch.publishedAt } : {})}
          headingLevel={2}
          locale="ru-RU"
          {...(timeZone ? { timeZone } : {})}
          labels={LABELS}
        />
        {patch.entries.length === 0 && (
          <p className="hp-patch-notes__notice" role="status">
            В статье этого патча нет построчных изменений карт «было → стало». Полный текст — по ссылке ниже.
          </p>
        )}
        <footer className="hp-patch-notes__source">
          <p>
            Изменения взяты из статьи{' '}
            {patch.sourceUrl ? <a href={patch.sourceUrl} target="_blank" rel="noreferrer">hs-manacost.ru</a> : 'hs-manacost.ru'}
.
            {patch.officialUrl && <>{' '}Официальный патчноут Blizzard: <a href={patch.officialUrl} target="_blank" rel="noreferrer">playhearthstone.com</a>.</>}
            {' '}Направление (усиление или ослабление) указано только для чисел: стоимости, атаки, здоровья и брони; изменения текста отмечены как «Изменение».
          </p>
          {patch.missingBefore > 0 && (
            <p>У {patch.missingBefore} изм. в статье нет прежнего значения — показано только новое.</p>
          )}
          {constructed > resolved && (
            <p>Картинки есть у {resolved} из {constructed} карт: остальные названия в статье не совпали с коллекционными картами.</p>
          )}
          {patch.entries.some(entry => entry.mode === 'battlegrounds') && (
            <p>Для Полей сражений картинок нет: в источнике у этих строк нет идентификаторов карт.</p>
          )}
        </footer>
      </div>
      {archive.length > 0 && <ArchiveList patches={archive} current={patch.version} {...(timeZone ? { timeZone } : {})} />}
    </div>
  );
}
