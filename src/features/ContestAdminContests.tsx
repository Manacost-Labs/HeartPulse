import type { FormEvent, RefObject } from 'react';
import { Image as ImageIcon, Trophy } from 'lucide-react';
import { ContestAdminImageUploader } from './ContestAdminImageUploader';
import { ADMIN_INPUT } from './contestAdminUi';

export type Contest = {
  id: string;
  title: string;
  description: string;
  prize: string;
  imageUrl: string;
  startsAt: string;
  endsAt: string;
  status: string;
  winners: string[];
  entry?: { status: string; createdAt: string } | null;
  entriesCount?: number;
};

export type ContestEntry = {
  id: string;
  contestId: string;
  userId: string;
  profileId: string;
  name: string;
  email: string;
  status: string;
  createdAt: string;
  contact: Record<string, any>;
  subscription: Record<string, any>;
  profileContacts: Record<string, string>;
};

export type ContestDraft = {
  id: string;
  title: string;
  prize: string;
  imageUrl: string;
  startsAt: string;
  endsAt: string;
  status: string;
  description: string;
};

export type ContestWorkspaceView = 'manage' | 'editor';

export const CONTEST_STATUS_OPTIONS = [
  { value: 'active', label: 'Опубликовать', caption: 'Конкурс виден на сайте' },
  { value: 'planned', label: 'Запланировать', caption: 'Виден как ближайший конкурс' },
  { value: 'draft', label: 'Черновик', caption: 'Не показывать участникам' },
  { value: 'completed', label: 'Завершить', caption: 'Перенести в прошлые конкурсы' },
  { value: 'cancelled', label: 'Отменить', caption: 'Скрыть без удаления' },
] as const;

type ContestAdminContestsProps = {
  view: ContestWorkspaceView;
  onViewChange: (view: ContestWorkspaceView) => void;
  form: ContestDraft;
  formRef: RefObject<HTMLFormElement | null>;
  onFormChange: (patch: Partial<ContestDraft>) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onReset: () => void;
  onStartNow: () => void;
  onStartInHour: () => void;
  onEndInTenMinutes: () => void;
  onEndInHour: () => void;
  onEndTomorrow: () => void;
  currentStatusLabel: string;
  previewStartsAt: string;
  previewEndsAt: string;
  loading: boolean;
  statusFilter: string;
  onStatusFilterChange: (status: string) => void;
  stats: Record<'all' | 'active' | 'planned' | 'draft' | 'completed' | 'cancelled', number>;
  contests: Contest[];
  selectedContestId: string;
  selectedContest: Contest | undefined;
  onSelectContest: (contest: Contest) => void;
  onEditSelected: () => void;
  onReload: () => void;
  onDelete: (contest: Contest) => void;
  selectedContestEntryCount: number;
  approvedEntryCount: number;
  selectedWinnerCount: number;
  entries: ContestEntry[];
  visibleEntries: ContestEntry[];
  entriesLoading: boolean;
  selectedWinnerIds: string[];
  selectedWinnerIdSet: Set<string>;
  onToggleWinner: (profileId: string) => void;
  onClearWinners: () => void;
  entriesPage: number;
  entriesPageCount: number;
  onEntriesPageChange: (page: number) => void;
  approvedWinnerCount: number;
  onSaveWinners: () => void;
  winnersText: string;
  onWinnersTextChange: (value: string) => void;
  onCopyProfileId: (profileId: string) => void;
  formatDate: (value: string | null) => string;
  statusLabel: (status: string) => string;
};

function ContestEditor({ form, formRef, loading, currentStatusLabel, previewStartsAt, previewEndsAt, onFormChange, onSubmit, onReset, onStartNow, onStartInHour, onEndInTenMinutes, onEndInHour, onEndTomorrow }: Pick<ContestAdminContestsProps, 'form' | 'formRef' | 'loading' | 'currentStatusLabel' | 'previewStartsAt' | 'previewEndsAt' | 'onFormChange' | 'onSubmit' | 'onReset' | 'onStartNow' | 'onStartInHour' | 'onEndInTenMinutes' | 'onEndInHour' | 'onEndTomorrow'>) {
  return (
    <form ref={formRef} className="contest-admin-card admin-contest-form" onSubmit={onSubmit}>
      <div className="admin-contest-form-head"><div><span className="contest-eyebrow">Конкурс</span><h2>{form.id ? 'Редактирование конкурса' : 'Новый конкурс'}</h2>{form.id ? <p>Изменения применятся к выбранному конкурсу и его публичной странице.</p> : <p>Заполни основные данные, проверь предпросмотр и выбери режим публикации.</p>}</div><span className="admin-contest-mode">{form.id ? 'Изменение' : 'Создание'}</span></div>
      <div className="admin-contest-editor">
        <div className="admin-contest-sections">
          <section className="admin-contest-section"><div className="admin-section-title"><span>1</span><div><strong>Основное</strong><small>Название, приз и описание для участников</small></div></div>
            <label>Название конкурса<input value={form.title} onChange={event => onFormChange({ title: event.target.value })} placeholder="Например: Розыгрыш рунических камней" style={ADMIN_INPUT} /></label>
            <label>Приз<input value={form.prize} onChange={event => onFormChange({ prize: event.target.value })} placeholder="Например: 3000 рунических камней" style={ADMIN_INPUT} /></label>
            <label>Описание<textarea value={form.description} onChange={event => onFormChange({ description: event.target.value })} rows={5} placeholder="Коротко объясни условия участия и что получит победитель." style={{ ...ADMIN_INPUT, resize: 'vertical' }} /></label>
          </section>
          <section className="admin-contest-section"><div className="admin-section-title"><span>2</span><div><strong>Картинка</strong><small>Можно вставить Ctrl+V, перетащить файл или указать URL</small></div></div><ContestAdminImageUploader label="Обложка конкурса" value={form.imageUrl} onChange={imageUrl => onFormChange({ imageUrl })} allowExternalUrl={false} /></section>
          <section className="admin-contest-section"><div className="admin-section-title"><span>3</span><div><strong>Расписание</strong><small>Если старт пустой, конкурс запускается сразу после публикации</small></div></div>
            <div className="admin-date-presets" aria-label="Быстрый выбор времени конкурса"><button type="button" onClick={onStartNow}>Старт сейчас</button><button type="button" onClick={onStartInHour}>Старт через час</button><button type="button" onClick={onEndInTenMinutes}>Финиш +10 минут</button><button type="button" onClick={onEndInHour}>Финиш +1 час</button><button type="button" onClick={onEndTomorrow}>Финиш +24 часа</button></div>
            <div className="contest-admin-two"><label>Старт<input type="datetime-local" value={form.startsAt} onChange={event => onFormChange({ startsAt: event.target.value })} style={ADMIN_INPUT} /></label><label>Финиш<input type="datetime-local" value={form.endsAt} onChange={event => onFormChange({ endsAt: event.target.value })} style={ADMIN_INPUT} /></label></div>
            <span className="admin-field-hint">После финиша конкурс останется в прошлых конкурсах. Удалять его можно вручную.</span>
          </section>
          <section className="admin-contest-section"><div className="admin-section-title"><span>4</span><div><strong>Публикация</strong><small>Выбери, что сайт должен сделать с конкурсом</small></div></div><div className="admin-status-grid">{CONTEST_STATUS_OPTIONS.map(option => <button key={option.value} type="button" className={form.status === option.value ? 'is-active' : ''} aria-pressed={form.status === option.value} onClick={() => onFormChange({ status: option.value })}><strong>{option.label}</strong><span>{option.caption}</span></button>)}</div></section>
        </div>
        <aside className="admin-contest-preview-panel" aria-label="Предпросмотр конкурса"><div className="admin-contest-preview-card">{form.imageUrl ? <img src={form.imageUrl} alt="" /> : <div className="admin-contest-preview-placeholder"><ImageIcon size={28} /><span>Обложка появится здесь</span></div>}<div><span className="admin-contest-preview-status">{currentStatusLabel}</span><h3>{form.title.trim() || 'Название конкурса'}</h3><p>{form.description.trim() || 'Описание будет видно участникам на странице конкурсов.'}</p><dl><div><dt>Приз</dt><dd>{form.prize.trim() || 'не указан'}</dd></div><div><dt>Старт</dt><dd>{previewStartsAt}</dd></div><div><dt>Финиш</dt><dd>{previewEndsAt}</dd></div></dl></div></div>
          <div className="admin-form-actions admin-contest-submit-row"><button type="submit" disabled={loading || !form.title.trim() || !form.prize.trim()} className="contest-primary-button">{form.id ? 'Сохранить изменения' : 'Создать конкурс'}</button><button type="button" className="contest-secondary-button" onClick={onReset}>{form.id ? 'Создать новый' : 'Очистить форму'}</button></div>{form.id && <p className="contest-muted">Редактируется: <code>{form.id}</code></p>}
        </aside>
      </div>
    </form>
  );
}

function ContestManager(props: ContestAdminContestsProps) {
  const { loading, statusFilter, onStatusFilterChange, stats, contests, selectedContestId, selectedContest, onSelectContest, onEditSelected, onReload, onDelete, selectedContestEntryCount, approvedEntryCount, selectedWinnerCount, entries, visibleEntries, entriesLoading, selectedWinnerIds, selectedWinnerIdSet, onToggleWinner, onClearWinners, entriesPage, entriesPageCount, onEntriesPageChange, approvedWinnerCount, onSaveWinners, winnersText, onWinnersTextChange, onCopyProfileId, formatDate, statusLabel, onReset } = props;
  const filters: Array<{ id: keyof typeof stats; label: string }> = [{ id: 'all', label: 'Все' }, { id: 'active', label: 'Активные' }, { id: 'planned', label: 'Скоро' }, { id: 'draft', label: 'Черновики' }, { id: 'completed', label: 'Завершены' }, { id: 'cancelled', label: 'Отменены' }];
  return (
    <div className="contest-admin-card admin-contest-manage-card">
      <div className="admin-contest-form-head"><div><span className="contest-eyebrow">Управление</span><h2>Рабочий стол конкурсов</h2><p>Один экран для проверки заявок, выбора победителей и завершения конкурса.</p></div><button type="button" className="contest-secondary-button" onClick={onReset}>Новый конкурс</button></div>
      <div className="admin-contest-summary-grid" aria-label="Сводка конкурсов">{filters.map(filter => <button type="button" key={filter.id} className={statusFilter === filter.id ? 'is-active' : ''} aria-pressed={statusFilter === filter.id} onClick={() => onStatusFilterChange(filter.id)}><strong>{stats[filter.id]}</strong><span>{filter.label}</span></button>)}</div>
      <div className="admin-contest-workflow">
        <div className="admin-contest-picker"><div className="admin-subsection-head"><div><strong>1. Выберите конкурс</strong><span>{contests.length ? `${contests.length} в текущем фильтре` : 'нет конкурсов в фильтре'}</span></div></div><div className="admin-contest-list">{contests.map(contest => <div key={contest.id} className={contest.id === selectedContestId ? 'is-selected' : ''}><button type="button" aria-pressed={contest.id === selectedContestId} onClick={() => onSelectContest(contest)}><strong>{contest.title}</strong><span>{statusLabel(contest.status)} · {contest.entriesCount ?? 0} заявок{contest.endsAt ? ` · ${formatDate(contest.endsAt)}` : ''}</span></button></div>)}{!contests.length && <p className="contest-muted" role="status">В этом фильтре конкурсов нет.</p>}</div></div>
        <div className="admin-contest-detail">{selectedContest ? <>
          <div className="admin-selected-contest"><div><span className={`admin-status-badge admin-status-${selectedContest.status}`}>{statusLabel(selectedContest.status)}</span><h3>{selectedContest.title}</h3><p>{selectedContest.prize}</p></div><dl><div><dt>Заявки</dt><dd>{selectedContestEntryCount}</dd></div><div><dt>Одобрены</dt><dd>{approvedEntryCount}</dd></div><div><dt>Победители</dt><dd>{selectedWinnerCount}</dd></div></dl></div>
          <div className="admin-form-actions"><button type="button" className="contest-secondary-button" onClick={onEditSelected}>Редактировать настройки</button><button type="button" className="contest-secondary-button" onClick={onReload}>Обновить список</button><button type="button" className="admin-danger-button" onClick={() => onDelete(selectedContest)} disabled={loading}>Удалить конкурс</button></div>
          <div className="admin-subsection-head"><div><strong>2. Проверьте заявки</strong><span>Отмечайте победителей прямо в списке. Неодобренные заявки нельзя выбрать.</span></div><button type="button" className="contest-secondary-button" onClick={onClearWinners} disabled={!selectedWinnerIds.length}>Сбросить выбор</button></div>
          <div className="contest-entry-list" aria-busy={entriesLoading}>{entriesLoading ? <p className="contest-muted" role="status">Загружаем заявки конкурса...</p> : entries.length ? visibleEntries.map(entry => { const isApproved = entry.status === 'approved'; const isWinner = selectedWinnerIdSet.has(entry.profileId); return <div key={entry.id} className={`contest-entry-row admin-winner-entry ${isWinner ? 'is-winner' : ''} ${!isApproved ? 'is-disabled' : ''}`}><label className="admin-winner-select"><input type="checkbox" checked={isWinner} disabled={!isApproved} onChange={() => onToggleWinner(entry.profileId)} /><span><strong>{entry.name || entry.profileId}</strong><small>{entry.profileId} · {entry.email || 'email не указан'}</small><small>VK: {entry.profileContacts?.vk || entry.contact?.vk || '—'} · TG: {entry.profileContacts?.telegram || entry.contact?.telegram || '—'}</small></span></label><div className="contest-entry-actions"><code>{statusLabel(entry.status)}</code><button type="button" className="contest-secondary-button" onClick={() => onCopyProfileId(entry.profileId)}>ID</button></div></div>; }) : <p className="contest-muted" role="status">Заявок пока нет. После первой заявки здесь появится список участников.</p>}</div>
          {entriesPageCount > 1 && <nav className="admin-pagination" aria-label="Страницы заявок конкурса"><button type="button" disabled={entriesPage === 1 || entriesLoading} onClick={() => onEntriesPageChange(entriesPage - 1)}>Назад</button><span>Страница {entriesPage} из {entriesPageCount}</span><button type="button" disabled={entriesPage === entriesPageCount || entriesLoading} onClick={() => onEntriesPageChange(Math.min(entriesPageCount, entriesPage + 1))}>Далее</button></nav>}
          <div className="admin-winner-publish"><div><strong>3. Завершите конкурс</strong><span>{approvedWinnerCount} из {selectedWinnerCount} выбранных ID найдены среди одобренных заявок.</span></div><button type="button" disabled={loading || !selectedContestId || !selectedWinnerIds.length} onClick={onSaveWinners} className="contest-primary-button">Опубликовать победителей</button></div>
          <label>Ручной список ID победителей<textarea value={winnersText} onChange={event => onWinnersTextChange(event.target.value)} rows={3} placeholder="Можно вставить ID через запятую или с новой строки" style={{ ...ADMIN_INPUT, resize: 'vertical' }} /></label>
        </> : <div className="contest-empty" role="status"><Trophy size={34} /><strong>Выберите конкурс</strong><span>После выбора появятся заявки, быстрые действия и публикация победителей.</span></div>}</div>
      </div>
    </div>
  );
}

export function ContestAdminContests(props: ContestAdminContestsProps) {
  return (
    <div className="contest-admin-grid">
      <div className="admin-view-switch" role="group" aria-label="Режим работы с конкурсами"><button type="button" className={props.view === 'manage' ? 'is-active' : ''} aria-pressed={props.view === 'manage'} onClick={() => props.onViewChange('manage')}>Управление</button><button type="button" className={props.view === 'editor' ? 'is-active' : ''} aria-pressed={props.view === 'editor'} onClick={() => props.onViewChange('editor')}>{props.form.id ? 'Редактирование' : 'Новый конкурс'}</button></div>
      {props.view === 'editor' ? <ContestEditor {...props} /> : <ContestManager {...props} />}
    </div>
  );
}
