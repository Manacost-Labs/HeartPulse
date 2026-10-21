'use client';

import React, { useCallback, useDeferredValue, useId, useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ExternalLink, ImageOff, Search } from 'lucide-react';
import {
  PATCH_SECTION_TITLES, filterPatchView, patchGroupOptions, patchNotesHref, sentenceCase, toPatchView,
  type PatchCardView, type PatchChangeView, type PatchFilter, type PatchKind, type PatchNotesDetail, type PatchNotesMode,
  type PatchNotesSummary, type PatchView,
} from '../modules/patchNotes/public';
import { wordDiff } from '../vendor/varylo-ui/gaming/patch';
import { publicResourceUrl } from '../publicResourceUrl';
import { useViewerTimeZone } from '../shared/ui/useViewerTimeZone';
import CardPreviewTooltip, { fallbackCardRender, type CardPreviewTarget } from './CardPreviewTooltip';
import type { CardPreviewSheetCard } from './CardPreviewSheet';
import './PatchNotesView.css';

const CardPreviewSheet = React.lazy(() => import('./CardPreviewSheet'));

const KIND_LABELS: Record<PatchKind, { one: string; many: string }> = {
  buff: { one: 'Усиление', many: 'Усиления' },
  nerf: { one: 'Ослабление', many: 'Ослабления' },
  rework: { one: 'Изменение', many: 'Изменения' },
};
const KINDS: PatchKind[] = ['buff', 'nerf', 'rework'];
/** Thumbnail boxes match the proxy's image sizes, so lazy images reserve their place. */
const ART_SIZE = { card: [360, 497], square: [360, 360], hero: [360, 546] } as const;
/** Cards above the fold load eagerly; the rest wait for the scroll. */
const EAGER_CARDS = 4;

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

function formatDate(value: string | null, timeZone?: string): string | null {
  return value && Number.isFinite(Date.parse(value)) ? dateFormat(timeZone).format(new Date(value)) : null;
}

function previewSource(card: PatchCardView): string {
  const render = publicResourceUrl(card.renderUrl);
  // Unknown hosts stay unproxied; the page loads images only through the site.
  if (render.startsWith('/api/')) return render;
  return card.section === 'battlegrounds' && card.cardId ? `/api/card-image/${encodeURIComponent(card.cardId)}/full.webp` : '';
}

function ArchiveList({ patches, current, timeZone }: { patches: PatchNotesSummary[]; current: string; timeZone?: string }) {
  return (
    <nav className="hp-patch-archive" aria-labelledby="hp-patch-archive-title">
      <h2 id="hp-patch-archive-title" className="hp-patch-archive__title">Архив патчей</h2>
      <ol className="hp-patch-archive__list">
        {patches.map((patch, index) => (
          <li key={patch.version}>
            <a href={patchNotesHref(index === 0 ? null : patch.version)} aria-current={patch.version === current ? 'page' : undefined}>
              <span className="hp-patch-archive__version">{patch.version}</span>
              <span className="hp-patch-archive__meta">
                {formatDate(patch.publishedAt, timeZone) ?? 'дата неизвестна'}{` · ${patch.changeCount} изм.`}
              </span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function VersionPicker({ patches, current, onSelect }: { patches: PatchNotesSummary[]; current: string; onSelect: (href: string) => void }) {
  const id = useId();
  return (
    <div className="hp-patch-picker">
      <label htmlFor={id}>Версия</label>
      <select id={id} value={current} onChange={event => {
        const index = patches.findIndex(patch => patch.version === event.target.value);
        if (index !== -1) onSelect(patchNotesHref(index === 0 ? null : patches[index].version));
      }}>
        {!patches.some(patch => patch.version === current) && <option value={current}>{current}</option>}
        {patches.map(patch => <option key={patch.version} value={patch.version}>{patch.version} · {patch.changeCount} изм.</option>)}
      </select>
    </div>
  );
}

function PatchHeader({ patch, view, archive, timeZone, onSection, onSelectVersion }: {
  patch: PatchNotesDetail; view: PatchView; archive: PatchNotesSummary[]; timeZone?: string;
  onSection: (section: PatchNotesMode) => void; onSelectVersion: (href: string) => void;
}) {
  const date = formatDate(patch.publishedAt, timeZone);
  return (
    <header className="hp-patch-hero">
      <div className="hp-patch-hero__top">
        <p className="hp-patch-hero__eyebrow">
          <span>Патч {patch.version}</span>
          {date && <time dateTime={patch.publishedAt ?? undefined}>{date}</time>}
        </p>
        {archive.length > 1 && <VersionPicker patches={archive} current={patch.version} onSelect={onSelectVersion} />}
      </div>
      <h2 className="hp-patch-hero__title">{patch.title}</h2>
      {patch.summary && <p className="hp-patch-hero__lead">{patch.summary}</p>}
      {view.total > 0 && (
        <dl className="hp-patch-hero__stats">
          <div><dt>Изменений карт</dt><dd>{view.total}</dd></div>
          {KINDS.map(kind => (
            <div key={kind} data-kind={kind}><dt>{KIND_LABELS[kind].many}</dt><dd>{view.kinds[kind]}</dd></div>
          ))}
        </dl>
      )}
      {view.sections.length > 1 && (
        <ul className="hp-patch-hero__sections" aria-label="Изменения по режимам">
          {view.sections.map(section => (
            <li key={section.id}>
              <button type="button" onClick={() => onSection(section.id)}>
                <span>{section.title}</span>
                <b>{section.count}</b>
                <small>
                  {KINDS.filter(kind => section.kinds[kind] > 0).map(kind => (
                    <span key={kind} data-kind={kind}>{section.kinds[kind]} {KIND_LABELS[kind].many.toLocaleLowerCase('ru-RU')}</span>
                  ))}
                </small>
              </button>
            </li>
          ))}
        </ul>
      )}
      {(patch.officialUrl || patch.sourceUrl) && (
        <p className="hp-patch-hero__links">
          {patch.officialUrl && <a href={patch.officialUrl} target="_blank" rel="noreferrer">Официальный патчноут Blizzard <ExternalLink aria-hidden="true" /></a>}
          {patch.sourceUrl && <a href={patch.sourceUrl} target="_blank" rel="noreferrer">Статья на hs-manacost.ru <ExternalLink aria-hidden="true" /></a>}
        </p>
      )}
    </header>
  );
}

function Toolbar({ view, filter, onChange }: { view: PatchView; filter: PatchFilter; onChange: (next: Partial<PatchFilter>) => void }) {
  const searchId = useId();
  const groupId = useId();
  const groups = patchGroupOptions(view, filter.section);
  const scoped = filter.section === 'all' ? view.kinds : view.sections.find(section => section.id === filter.section)?.kinds ?? view.kinds;
  const scopedTotal = filter.section === 'all' ? view.total : view.sections.find(section => section.id === filter.section)?.count ?? 0;
  return (
    <div className="hp-patch-toolbar" role="group" aria-label="Фильтры изменений">
      {view.sections.length > 1 && (
        <div className="hp-patch-tabs" role="group" aria-label="Режим">
          {[{ id: 'all' as const, title: 'Все режимы', count: view.total }, ...view.sections].map(section => (
            <button key={section.id} type="button" aria-pressed={filter.section === section.id}
              onClick={() => onChange({ section: section.id, group: 'all' })}>
              {section.title} <span>{section.count}</span>
            </button>
          ))}
        </div>
      )}
      <div className="hp-patch-toolbar__row">
        <div className="hp-patch-kinds" role="group" aria-label="Тип изменения">
          <button type="button" aria-pressed={filter.kind === 'all'} onClick={() => onChange({ kind: 'all' })}>
            Все <span>{scopedTotal}</span>
          </button>
          {KINDS.map(kind => (
            <button key={kind} type="button" data-kind={kind} aria-pressed={filter.kind === kind}
              disabled={scoped[kind] === 0 && filter.kind !== kind} onClick={() => onChange({ kind })}>
              {KIND_LABELS[kind].many} <span>{scoped[kind]}</span>
            </button>
          ))}
        </div>
        {groups.length > 1 && (
          <div className="hp-patch-field">
            <label htmlFor={groupId}>{filter.section === 'battlegrounds' ? 'Тип' : 'Класс и тип'}</label>
            <select id={groupId} value={filter.group} onChange={event => onChange({ group: event.target.value })}>
              <option value="all">Все</option>
              {groups.map(group => (
                <option key={group.id} value={group.id}>
                  {filter.section === 'all' ? `${PATCH_SECTION_TITLES[group.section]}: ` : ''}
                  {group.title} ({group.count})
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="hp-patch-search">
          <Search aria-hidden="true" />
          <label htmlFor={searchId} className="sr-only">Найти карту или изменение</label>
          <input id={searchId} type="search" value={filter.query} placeholder="Карта или текст изменения"
            autoComplete="off" onChange={event => onChange({ query: event.target.value })} />
        </div>
      </div>
    </div>
  );
}

function TextDiff({ change }: { change: PatchChangeView }) {
  const before = typeof change.before === 'string' ? change.before : change.before?.toString();
  const after = typeof change.after === 'string' ? change.after : change.after?.toString();
  const tokens = before !== undefined && after !== undefined ? wordDiff(before, after) : null;
  return (
    <div className="hp-change__text">
      {before !== undefined && (
        <p data-side="before">
          <span className="hp-change__tag">Было</span>
          {tokens ? tokens.filter(token => token.op !== 'add').map((token, index) => token.op === 'remove'
            ? <del key={index}>{token.text}</del> : <React.Fragment key={index}>{token.text}</React.Fragment>) : before}
        </p>
      )}
      {after !== undefined && (
        <p data-side="after">
          <span className="hp-change__tag">Стало</span>
          {tokens ? tokens.filter(token => token.op !== 'remove').map((token, index) => token.op === 'add'
            ? <ins key={index}>{token.text}</ins> : <React.Fragment key={index}>{token.text}</React.Fragment>) : after}
        </p>
      )}
      {before === undefined && <p className="hp-change__missing">Прежний текст в статье не указан.</p>}
      {after === undefined && <p className="hp-change__missing">Новый текст в статье не указан.</p>}
    </div>
  );
}

const DIRECTION_TEXT = { buff: 'лучше для игрока', nerf: 'хуже для игрока', neutral: '' } as const;

function ChangeLine({ change }: { change: PatchChangeView }) {
  const long = typeof change.before === 'string' && change.before.length > 12 || typeof change.after === 'string' && change.after.length > 12;
  if (long) {
    return <li className="hp-change hp-change--text"><span className="hp-change__label">{change.label}</span><TextDiff change={change} /></li>;
  }
  const up = typeof change.before === 'number' && typeof change.after === 'number' && change.after > change.before;
  return (
    <li className="hp-change" data-direction={change.direction}>
      <span className="hp-change__label">{change.label}</span>
      <span className="hp-change__values">
        {change.before !== undefined
          ? <s aria-label={`было ${change.before}`}>{change.before}</s>
          : <span className="hp-change__unknown" title="Прежнее значение в статье не указано">?</span>}
        <span className="hp-change__arrow" aria-hidden="true">→</span>
        <b aria-label={change.after !== undefined ? `стало ${change.after}` : undefined}>{change.after ?? '—'}</b>
        {change.direction !== 'neutral' && (
          <span className="hp-change__direction" title={DIRECTION_TEXT[change.direction]}>
            {up ? <ArrowUp aria-hidden="true" /> : <ArrowDown aria-hidden="true" />}
            <span className="sr-only">{DIRECTION_TEXT[change.direction]}</span>
          </span>
        )}
      </span>
    </li>
  );
}

function CardArt({ card, eager, onPreview, onPreviewEnd, onOpen }: {
  card: PatchCardView; eager: boolean;
  onPreview: (card: PatchCardView, target: HTMLElement) => void; onPreviewEnd: () => void; onOpen: (card: PatchCardView) => void;
}) {
  const [failed, setFailed] = useState(false);
  const [width, height] = ART_SIZE[card.art];
  if (!card.thumb || failed) {
    return (
      <span className="hp-patch-card__art" data-art={card.art} data-empty="">
        <ImageOff aria-hidden="true" />
        <span className="sr-only">{card.thumb ? 'Картинка недоступна' : 'Карта не найдена в каталоге'}</span>
      </span>
    );
  }
  return (
    <button type="button" className="hp-patch-card__art" data-art={card.art} aria-label={`Полная карта: ${card.name}`}
      onMouseEnter={event => onPreview(card, event.currentTarget)} onMouseLeave={onPreviewEnd}
      onFocus={event => onPreview(card, event.currentTarget)} onBlur={onPreviewEnd}
      onClick={() => { onPreviewEnd(); onOpen(card); }}>
      <img src={card.thumb} alt="" width={width} height={height} loading={eager ? 'eager' : 'lazy'} decoding="async"
        onError={() => setFailed(true)} />
    </button>
  );
}

function PatchCard({ card, eager, ...handlers }: {
  card: PatchCardView; eager: boolean;
  onPreview: (card: PatchCardView, target: HTMLElement) => void; onPreviewEnd: () => void; onOpen: (card: PatchCardView) => void;
}) {
  return (
    <li className="hp-patch-card-slot" data-wide={card.hasText || undefined}>
      <article className="hp-patch-card" data-kind={card.kind} aria-labelledby={`hp-patch-${card.id}`}>
        <CardArt card={card} eager={eager} {...handlers} />
        <div className="hp-patch-card__body">
          <div className="hp-patch-card__head">
            <div className="hp-patch-card__title">
              <h5 id={`hp-patch-${card.id}`} className="hp-patch-card__name">{card.name}</h5>
              {(card.typeLabel || card.sourceName) && (
                <p className="hp-patch-card__meta">
                  {card.typeLabel}
                  {card.sourceName && <span lang="en">{card.typeLabel ? ' · ' : ''}{card.sourceName}</span>}
                </p>
              )}
            </div>
            <span className="hp-patch-badge" data-kind={card.kind}>{KIND_LABELS[card.kind].one}</span>
          </div>
          <ul className="hp-patch-card__changes">
            {card.changes.map((change, index) => <ChangeLine key={`${change.label}-${index}`} change={change} />)}
          </ul>
          {card.note && <p className="hp-patch-card__note"><span>Комментарий разработчиков:</span> {card.note}</p>}
        </div>
      </article>
    </li>
  );
}

function SectionNotes({ patch, section }: { patch: PatchNotesDetail; section: PatchNotesMode }) {
  const general = patch.generalChanges.filter(item => item.mode === section).flatMap(item => item.lines);
  const pictures = patch.pictureSections.filter(item => item.mode === section).map(item => sentenceCase(item.title));
  if (!general.length && !pictures.length) return null;
  return (
    <div className="hp-patch-section-notes">
      {general.length > 0 && (
        <div className="hp-patch-general">
          <h4>Общие изменения</h4>
          <ul>{general.map(line => <li key={line}>{line}</li>)}</ul>
        </div>
      )}
      {pictures.length > 0 && (
        <p className="hp-patch-pictures" role="note">
          <ImageOff aria-hidden="true" />
          <span>
            {pictures.join(', ')} — в статье только картинками, текстом их нет, поэтому здесь они не показаны.
            {patch.sourceUrl && <> <a href={patch.sourceUrl} target="_blank" rel="noreferrer">Открыть статью</a>.</>}
          </span>
        </p>
      )}
    </div>
  );
}

const INITIAL_FILTER: PatchFilter = { section: 'all', kind: 'all', group: 'all', query: '' };

function defaultSelectVersion(href: string) {
  window.location.assign(href);
}

/**
 * One patch: header with counts by kind and mode, filters, compact change
 * cards with card art and was → now values, and the archive of patches.
 * Every value comes from the stored article; what it does not state is said.
 */
export function PatchNotesView({ patch, archive, onSelectVersion = defaultSelectVersion }: {
  patch: PatchNotesDetail; archive: PatchNotesSummary[]; onSelectVersion?: (href: string) => void;
}) {
  const timeZone = useViewerTimeZone();
  const view = useMemo(() => toPatchView(patch), [patch]);
  const [filter, setFilter] = useState<PatchFilter>(INITIAL_FILTER);
  const deferredQuery = useDeferredValue(filter.query);
  const groups = useMemo(() => filterPatchView(view, { ...filter, query: deferredQuery }), [view, filter, deferredQuery]);
  const [preview, setPreview] = useState<CardPreviewTarget | null>(null);
  const [opened, setOpened] = useState<CardPreviewSheetCard | null>(null);
  const change = useCallback((next: Partial<PatchFilter>) => setFilter(current => ({ ...current, ...next })), []);
  const showPreview = useCallback((card: PatchCardView, target: HTMLElement) => {
    // Touch taps open the sheet; a hover card would cover it.
    if (!card.cardId || window.matchMedia?.('(hover: none)').matches) return;
    setPreview({ id: card.cardId, name: `${card.name} — текущая версия`, imageUrl: previewSource(card) || null, rect: target.getBoundingClientRect() });
  }, []);
  const hidePreview = useCallback(() => setPreview(null), []);
  const open = useCallback((card: PatchCardView) => {
    if (card.cardId) setOpened({ id: card.cardId, name: card.name, imageUrl: previewSource(card) || fallbackCardRender(card.cardId) });
  }, []);

  const sectionsShown = view.sections.filter(section => filter.section === 'all' || section.id === filter.section);
  const notesOnly = (['constructed', 'arena', 'battlegrounds', 'other'] as PatchNotesMode[]).filter(section =>
    (filter.section === 'all' || filter.section === section) && !view.sections.some(item => item.id === section)
    && (patch.generalChanges.some(item => item.mode === section) || patch.pictureSections.some(item => item.mode === section)));
  let rendered = 0;
  const filtered = filter.kind !== 'all' || filter.group !== 'all' || deferredQuery.trim() !== '';

  return (
    <div className="hp-patch">
      <div className="hp-patch__layout">
        <div className="hp-patch__main">
          <PatchHeader patch={patch} view={view} archive={archive} {...(timeZone ? { timeZone } : {})}
            onSection={section => change({ section, group: 'all' })} onSelectVersion={onSelectVersion} />
          {view.total > 0 && <Toolbar view={view} filter={filter} onChange={change} />}
          {view.total === 0 && (
            <p className="hp-patch-notes__notice" role="status">
              В статье этого патча нет построчных изменений карт «было → стало». Полный текст — по ссылкам выше.
            </p>
          )}
          {view.total > 0 && groups.length === 0 && (
            <p className="hp-patch-notes__notice" role="status">
              Нет изменений по выбранным фильтрам.{' '}
              <button type="button" className="hp-patch-reset" onClick={() => setFilter(INITIAL_FILTER)}>Сбросить фильтры</button>
            </p>
          )}
          {sectionsShown.map(section => {
            const sectionGroups = groups.filter(group => group.section === section.id);
            if (!sectionGroups.length && filtered) return null;
            return (
              <section key={section.id} className="hp-patch-section" aria-labelledby={`hp-patch-section-${section.id}`}>
                <h3 id={`hp-patch-section-${section.id}`} className="hp-patch-section__title">
                  {section.title} <span>{section.count}</span>
                </h3>
                {sectionGroups.map(group => (
                  <div key={group.id} className="hp-patch-group">
                    <h4 className="hp-patch-group__title">{group.title} <span>{group.entries.length}</span></h4>
                    <ul className="hp-patch-group__list">
                      {group.entries.map(card => (
                        <PatchCard key={card.id} card={card} eager={rendered++ < EAGER_CARDS}
                          onPreview={showPreview} onPreviewEnd={hidePreview} onOpen={open} />
                      ))}
                    </ul>
                  </div>
                ))}
                {!filtered && <SectionNotes patch={patch} section={section.id} />}
              </section>
            );
          })}
          {!filtered && notesOnly.map(section => (
            <section key={section} className="hp-patch-section" aria-labelledby={`hp-patch-section-${section}`}>
              <h3 id={`hp-patch-section-${section}`} className="hp-patch-section__title">{PATCH_SECTION_TITLES[section]}</h3>
              <SectionNotes patch={patch} section={section} />
            </section>
          ))}
          <SourceFooter patch={patch} view={view} />
        </div>
        {archive.length > 0 && <ArchiveList patches={archive} current={patch.version} {...(timeZone ? { timeZone } : {})} />}
      </div>
      {preview && <CardPreviewTooltip preview={preview} />}
      {opened && (
        <React.Suspense fallback={null}>
          <CardPreviewSheet card={opened} onClose={() => setOpened(null)} />
        </React.Suspense>
      )}
    </div>
  );
}

function SourceFooter({ patch, view }: { patch: PatchNotesDetail; view: PatchView }): ReactNode {
  const cards = view.groups.flatMap(group => group.entries);
  const unmatched = cards.filter(card => !card.cardId).length;
  return (
    <footer className="hp-patch-notes__source">
      <p>
        Изменения взяты из статьи{' '}
        {patch.sourceUrl ? <a href={patch.sourceUrl} target="_blank" rel="noreferrer">hs-manacost.ru</a> : 'hs-manacost.ru'}.
        {' '}Усиление или ослабление указано только для чисел: стоимости, атаки, здоровья и брони. Изменения текста и уровня таверны
        отмечены как «Изменение». При наведении на картинку видна текущая версия карты: изображений карт до патча нет.
      </p>
      {patch.missingBefore > 0 && <p>У {patch.missingBefore} изм. в статье нет прежнего значения — показано только новое.</p>}
      {unmatched > 0 && <p>Без картинки {unmatched} из {cards.length}: их названия не нашлись в каталоге карт.</p>}
    </footer>
  );
}
