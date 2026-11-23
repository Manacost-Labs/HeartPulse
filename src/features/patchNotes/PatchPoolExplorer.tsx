import { lazy, Suspense, useId, useState } from 'react';
import type { PatchNotesPoolGroup, PatchNotesPoolItem } from '../../modules/patchNotes/public';
import { registerLightboxModule } from '../../shared/ui/lightboxIntent';
import type { CardPreviewSheetCard } from '../CardPreviewSheet';
import type { CardPreviewTarget } from '../CardPreviewTooltip';
import { cardGalleryPreview, PatchCardGallery, type CardGalleryHandlers } from './PatchCardGallery';

type PoolStatus = 'removed' | 'added' | 'returning';

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

const itemsOf = (group: PatchNotesPoolGroup, status: PoolStatus): readonly PatchNotesPoolItem[] => group[status] ?? [];
const availableStatuses = (group: PatchNotesPoolGroup): PoolStatus[] => STATUS_ORDER.filter(s => itemsOf(group, s).length > 0);
const groupTotal = (group: PatchNotesPoolGroup): number =>
  (group.removed?.length ?? 0) + (group.added?.length ?? 0) + (group.returning?.length ?? 0);

/** Interactive parchment pool explorer for major season rotations (removed / new / returning), shown as card pictures. */
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

  const handlers: CardGalleryHandlers = {
    onHover: (item, element) => setPreview({
      id: item.cardId ?? item.name, name: item.name, imageUrl: cardGalleryPreview(item), rect: element.getBoundingClientRect(),
    }),
    onLeave: () => setPreview(null),
    onOpenSheet: item => {
      setPreview(null);
      setSheet({ id: item.cardId ?? item.name, name: item.name, imageUrl: cardGalleryPreview(item) });
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
        <PatchCardGallery
          key={`${activeGroup.id}-${activeStatus}`}
          items={activeItems}
          handlers={handlers}
          status={activeStatus}
          showName={false}
          showText={false}
          label={`${activeGroup.title}: ${STATUS_META[activeStatus].label.toLocaleLowerCase('ru-RU')}`}
        />
      </div>
      {preview && <Suspense fallback={null}><CardPreviewTooltip preview={preview} /></Suspense>}
      {sheet && <Suspense fallback={null}><CardPreviewSheet card={sheet} onClose={() => setSheet(null)} /></Suspense>}
    </section>
  );
}
