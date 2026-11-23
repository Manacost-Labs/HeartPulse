import { lazy, Suspense, useId, useState } from 'react';
import type { PatchNotesPoolGroup, PatchNotesPoolItem } from '../../modules/patchNotes/public';
import { registerLightboxModule } from '../../shared/ui/lightboxIntent';
import type { CardPreviewSheetCard } from '../CardPreviewSheet';
import type { CardPreviewTarget } from '../CardPreviewTooltip';
import { proxiedCardImage } from './PatchGeneralChanges';

type PoolStatus = 'removed' | 'added' | 'returning';
type PreviewHandlers = {
  onHover: (item: PatchNotesPoolItem, element: HTMLElement) => void;
  onLeave: () => void;
  onOpenSheet: (item: PatchNotesPoolItem) => void;
};

const STATUS_ORDER: readonly PoolStatus[] = ['removed', 'added', 'returning'];
const STATUS_META: Record<PoolStatus, { mark: string; label: string }> = {
  removed: { mark: '−', label: 'Удалены' },
  added: { mark: '+', label: 'Новые' },
  returning: { mark: '↺', label: 'Возвращаются' },
};

const loadCardPreviewSheet = () => import('../CardPreviewSheet');
const loadCardPreviewTooltip = () => import('./PatchCardTooltip');
const CardPreviewSheet = lazy(loadCardPreviewSheet);
const CardPreviewTooltip = lazy(loadCardPreviewTooltip);
registerLightboxModule('card-preview', () => Promise.all([loadCardPreviewSheet(), loadCardPreviewTooltip()]));

function openAfterFocusScroll(element: HTMLElement, open: (element: HTMLElement) => void) {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (document.activeElement === element) open(element);
  }));
}

const itemsOf = (group: PatchNotesPoolGroup, status: PoolStatus): readonly PatchNotesPoolItem[] => group[status] ?? [];
const availableStatuses = (group: PatchNotesPoolGroup): PoolStatus[] => STATUS_ORDER.filter(s => itemsOf(group, s).length > 0);
const groupTotal = (group: PatchNotesPoolGroup): number =>
  (group.removed?.length ?? 0) + (group.added?.length ?? 0) + (group.returning?.length ?? 0);

function chipBadge(item: PatchNotesPoolItem): string | null {
  if (typeof item.tier === 'number') return `Т${item.tier}`;
  const hint = `${item.tribe ?? ''} ${item.cardType ?? ''}`.toLocaleLowerCase('ru-RU');
  if (hint.includes('малый') || hint.includes('lesser') || hint.includes('minor')) return 'Малый';
  if (hint.includes('большой') || hint.includes('greater') || hint.includes('major')) return 'Большой';
  return null;
}

function PoolChips({ groupId, status, items, handlers }: {
  groupId: string; status: 'removed' | 'returning'; items: readonly PatchNotesPoolItem[]; handlers: PreviewHandlers;
}) {
  const mark = STATUS_META[status].mark;
  return (
    <ul className="hp-pool__chips">
      {items.map((item, index) => {
        const badge = chipBadge(item);
        const key = `${groupId}-${status}-${item.cardId ?? item.name}-${index}`;
        const content = (
          <>
            <span className="hp-pool-chip__mark" aria-hidden="true">{mark}</span>
            {badge && <span className="hp-pool-chip__badge">{badge}</span>}
            <span className="hp-pool-chip__name">{item.name}</span>
          </>
        );
        return (
          <li key={key}>
            {item.cardId ? (
              <button
                type="button"
                className="hp-pool-chip hp-pool-chip--interactive"
                data-status={status}
                data-lightbox-module="card-preview"
                aria-label={`${item.name}: показать карту`}
                onPointerEnter={event => { if (event.pointerType === 'mouse') handlers.onHover(item, event.currentTarget); }}
                onPointerLeave={handlers.onLeave}
                onFocus={event => openAfterFocusScroll(event.currentTarget, element => handlers.onHover(item, element))}
                onBlur={handlers.onLeave}
                onClick={() => handlers.onOpenSheet(item)}
              >
                {content}
              </button>
            ) : (
              <span className="hp-pool-chip" data-status={status}>{content}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function PoolNewCards({ groupId, items, handlers }: {
  groupId: string; items: readonly PatchNotesPoolItem[]; handlers: PreviewHandlers;
}) {
  const costUnit = groupId.toLocaleLowerCase('en-US').includes('timewarp') ? 'Хронума' : 'золота';
  return (
    <ul className="hp-pool__new-grid">
      {items.map((item, index) => {
        const key = `${groupId}-added-${item.cardId ?? item.name}-${index}`;
        const hasMeta = item.tier != null || item.cost != null || Boolean(item.tribe) || Boolean(item.stats);
        return (
          <li key={key}>
            <article className="hp-pool-card">
              <div className="hp-pool-card__head">
                {item.cardId ? (
                  <button
                    type="button"
                    className="hp-pool-card__name hp-pool-card__name--btn"
                    data-lightbox-module="card-preview"
                    aria-label={`${item.name}: показать карту`}
                    onPointerEnter={event => { if (event.pointerType === 'mouse') handlers.onHover(item, event.currentTarget); }}
                    onPointerLeave={handlers.onLeave}
                    onFocus={event => openAfterFocusScroll(event.currentTarget, element => handlers.onHover(item, element))}
                    onBlur={handlers.onLeave}
                    onClick={() => handlers.onOpenSheet(item)}
                  >
                    {item.name}
                  </button>
                ) : (
                  <p className="hp-pool-card__name">{item.name}</p>
                )}
              </div>
              {hasMeta && (
                <div className="hp-pool-card__meta">
                  {typeof item.tier === 'number' && <span className="hp-pool-card__tag hp-pool-card__tag--accent">{`Тир ${item.tier}`}</span>}
                  {typeof item.cost === 'number' && <span className="hp-pool-card__tag hp-pool-card__tag--accent">{`${item.cost} ${costUnit}`}</span>}
                  {item.tribe && <span className="hp-pool-card__tag">{item.tribe}</span>}
                  {item.stats && <span className="hp-pool-card__tag">{item.stats}</span>}
                </div>
              )}
              {item.text && <p className="hp-pool-card__text">{item.text}</p>}
            </article>
          </li>
        );
      })}
    </ul>
  );
}

/** Interactive parchment pool explorer for major season rotations (removed / new / returning). */
export function PatchPoolExplorer({ groups }: { groups: PatchNotesPoolGroup[] }) {
  const baseId = useId();
  const [selectedGroupId, setSelectedGroupId] = useState(() => groups[0]?.id ?? '');
  const activeGroup = groups.find(group => group.id === selectedGroupId) ?? groups[0];
  const statuses = activeGroup ? availableStatuses(activeGroup) : [];
  const [selectedStatus, setSelectedStatus] = useState<PoolStatus>(() => statuses[0] ?? 'removed');
  const [preview, setPreview] = useState<CardPreviewTarget | null>(null);
  const [sheet, setSheet] = useState<CardPreviewSheetCard | null>(null);

  if (!activeGroup) return null;

  const activeStatus: PoolStatus = statuses.includes(selectedStatus) ? selectedStatus : (statuses[0] ?? 'removed');
  const panelId = `${baseId}-panel`;
  const removedCount = activeGroup.removed?.length ?? 0;
  const addedCount = activeGroup.added?.length ?? 0;
  const returningCount = activeGroup.returning?.length ?? 0;
  const activeItems = itemsOf(activeGroup, activeStatus);

  const selectGroup = (group: PatchNotesPoolGroup) => {
    setPreview(null);
    setSelectedGroupId(group.id);
    setSelectedStatus(availableStatuses(group)[0] ?? 'removed');
  };

  const handlers: PreviewHandlers = {
    onHover: (item, element) => {
      if (!item.cardId) return;
      setPreview({ id: item.cardId, name: item.name, imageUrl: proxiedCardImage(item.renderUrl), rect: element.getBoundingClientRect() });
    },
    onLeave: () => setPreview(null),
    onOpenSheet: item => {
      if (!item.cardId) return;
      setPreview(null);
      setSheet({ id: item.cardId, name: item.name, imageUrl: proxiedCardImage(item.renderUrl) });
    },
  };

  return (
    <section className="hp-pool" aria-label="Ротация пула">
      <header className="hp-pool__head">
        <div className="hp-pool__title-wrap">
          <h4 className="hp-pool__title">Ротация пула</h4>
          {groups.length === 1 && <span className="hp-pool__single">{activeGroup.title}</span>}
        </div>
        <div className="hp-pool__stats" aria-live="polite">
          {removedCount > 0 && <span className="hp-pool__stat" data-status="removed">{`−${removedCount} удалено`}</span>}
          {addedCount > 0 && <span className="hp-pool__stat" data-status="added">{`+${addedCount} новых`}</span>}
          {returningCount > 0 && <span className="hp-pool__stat" data-status="returning">{`↺${returningCount} возвращается`}</span>}
        </div>
      </header>
      {groups.length > 1 && (
        <div className="hp-pool__tabs" role="tablist" aria-label="Категории ротации пула">
          {groups.map(group => (
            <button
              key={group.id}
              type="button"
              role="tab"
              id={`${baseId}-tab-${group.id}`}
              className="hp-pool__tab"
              aria-selected={group.id === activeGroup.id}
              aria-controls={panelId}
              onClick={() => selectGroup(group)}
            >
              <span>{group.title}</span>
              <span className="hp-pool__tab-count">{groupTotal(group)}</span>
            </button>
          ))}
        </div>
      )}
      <div
        id={panelId}
        className="hp-pool__panel"
        role={groups.length > 1 ? 'tabpanel' : undefined}
        aria-labelledby={groups.length > 1 ? `${baseId}-tab-${activeGroup.id}` : undefined}
      >
        {activeGroup.note && <p className="hp-pool__note">{activeGroup.note}</p>}
        {statuses.length > 0 && (
          <div className="hp-pool__statuses" role="group" aria-label="Статус карт в пуле">
            {statuses.map(status => (
              <button
                key={status}
                type="button"
                className="hp-pool__status"
                data-status={status}
                aria-pressed={activeStatus === status}
                onClick={() => { setPreview(null); setSelectedStatus(status); }}
              >
                {`${STATUS_META[status].mark} ${STATUS_META[status].label} (${itemsOf(activeGroup, status).length})`}
              </button>
            ))}
          </div>
        )}
        {activeStatus === 'added'
          ? <PoolNewCards groupId={activeGroup.id} items={activeItems} handlers={handlers} />
          : <PoolChips groupId={activeGroup.id} status={activeStatus} items={activeItems} handlers={handlers} />}
      </div>
      {preview && <Suspense fallback={null}><CardPreviewTooltip preview={preview} /></Suspense>}
      {sheet && <Suspense fallback={null}><CardPreviewSheet card={sheet} onClose={() => setSheet(null)} /></Suspense>}
    </section>
  );
}
