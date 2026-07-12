import { Mail, Monitor, Newspaper, Send, Smartphone, Trophy } from 'lucide-react';

export type MailingSegment = 'all-consented' | 'active' | 'former';
export type MailingPreviewMode = 'desktop' | 'mobile';

export type MailingTemplate = {
  id: string;
  label: string;
  description: string;
  subject: string;
  preheader: string;
  htmlBody: string;
};

export type MailingContact = {
  id: string;
  email: string;
  name: string;
  consentStatus: 'unknown' | 'subscribed' | 'unsubscribed' | 'suppressed';
  consentSource: string;
  lifecycle: 'active' | 'former';
  accountState: 'current' | 'former';
  eligible: boolean;
  updatedAt: string;
};

export type MailingCampaign = {
  id: string;
  subject: string;
  preheader: string;
  templateKey: string;
  segment: MailingSegment;
  status: string;
  recipientCount: number;
  acceptedCount: number;
  failedCount: number;
  skippedCount: number;
  createdAt: string;
  startedAt: string;
  completedAt: string;
  error: string;
};

export type MailingOverview = {
  summary: { total: number; eligible: number; active: number; former: number; excluded: number; unsubscribed: number; pendingConsent: number; suppressed: number };
  templates: MailingTemplate[];
  contacts: MailingContact[];
  campaigns: MailingCampaign[];
  transport: { configured: boolean; from: string };
};

export type MailingDraft = {
  subject: string;
  preheader: string;
  htmlBody: string;
  segment: MailingSegment;
  templateKey: string;
};

export const EMPTY_MAILING_DRAFT: MailingDraft = {
  subject: 'Новости Manacost',
  preheader: 'Свежие материалы и обновления HS-Arena.',
  htmlBody: '<h2>Заголовок письма</h2><p>Напишите здесь основной текст рассылки.</p>',
  segment: 'all-consented',
  templateKey: 'blank',
};

function campaignStatus(status: string): { label: string; tone: string } {
  if (status === 'completed') return { label: 'Отправлена', tone: 'ok' };
  if (status === 'completed-with-errors') return { label: 'С ошибками', tone: 'bad' };
  if (status === 'sending') return { label: 'Отправляется', tone: 'working' };
  if (status === 'queued') return { label: 'В очереди', tone: 'working' };
  if (status === 'failed') return { label: 'Ошибка', tone: 'bad' };
  return { label: status || 'Неизвестно', tone: 'muted' };
}

function consentLabel(contact: MailingContact): string {
  if (contact.consentStatus === 'subscribed' && contact.eligible) return 'Можно отправлять';
  if (contact.consentStatus === 'unsubscribed') return 'Отписан';
  if (contact.consentStatus === 'suppressed') return 'Исключён';
  if (contact.consentStatus === 'subscribed') return 'Временно исключён';
  return 'Ожидает согласия';
}

type ContestAdminMailingProps = {
  overview: MailingOverview | null;
  loading: boolean;
  draft: MailingDraft;
  previewHtml: string;
  previewCount: number;
  previewMode: MailingPreviewMode;
  previewLoading: boolean;
  sending: boolean;
  testing: boolean;
  onReload: () => void;
  onApplyTemplate: (template: MailingTemplate) => void;
  onDraftChange: (patch: Partial<MailingDraft>, options?: { invalidatePreview?: boolean }) => void;
  onPreviewModeChange: (mode: MailingPreviewMode) => void;
  onPreview: () => void;
  onTest: () => void;
  onSend: () => void;
  formatDate: (value: string | null) => string;
};

export function ContestAdminMailing({ overview, loading, draft, previewHtml, previewCount, previewMode, previewLoading, sending, testing, onReload, onApplyTemplate, onDraftChange, onPreviewModeChange, onPreview, onTest, onSend, formatDate }: ContestAdminMailingProps) {
  const segments: Array<{ id: MailingSegment; label: string; count: number; caption: string }> = [
    { id: 'all-consented', label: 'Все согласившиеся', count: overview?.summary.eligible ?? 0, caption: 'Активные и бывшие подписчики' },
    { id: 'active', label: 'Только активные', count: overview?.summary.active ?? 0, caption: 'Есть подписка или бессрочный доступ' },
    { id: 'former', label: 'Только бывшие', count: overview?.summary.former ?? 0, caption: 'Ушли, но не отписались от писем' },
  ];

  return (
    <div className="admin-mailing-page">
      <div className="admin-stat-grid admin-mailing-stats">
        <div><span>Доступно для отправки</span><strong>{overview?.summary.eligible ?? '—'}</strong><small>только с подтверждённым согласием</small></div>
        <div><span>Активные</span><strong>{overview?.summary.active ?? '—'}</strong><small>с действующим доступом</small></div>
        <div><span>Бывшие</span><strong>{overview?.summary.former ?? '—'}</strong><small>адрес сохранён, отписки не было</small></div>
        <div><span>Исключены</span><strong>{overview?.summary.excluded ?? '—'}</strong><small>отписаны, без согласия или заблокированы</small></div>
      </div>

      <section className="contest-admin-card admin-mailing-templates" aria-labelledby="mailing-templates-title">
        <div className="contest-users-head"><div><h2 id="mailing-templates-title">Начать с шаблона</h2><p className="contest-muted">Шаблон заполнит тему и HTML. Всё можно отредактировать перед отправкой.</p></div>
          <button type="button" className="contest-secondary-button" disabled={loading} onClick={onReload}>{loading ? 'Обновляем…' : 'Обновить данные'}</button>
        </div>
        <div className="admin-mailing-template-grid">
          {(overview?.templates || []).map(template => {
            const TemplateIcon = template.id === 'latest-article' ? Newspaper : template.id === 'tier-list-update' ? Trophy : Mail;
            return <button type="button" key={template.id} className={draft.templateKey === template.id ? 'is-selected' : ''} aria-pressed={draft.templateKey === template.id} onClick={() => onApplyTemplate(template)}>
              <span><TemplateIcon size={20} /></span><strong>{template.label}</strong><small>{template.description}</small>
            </button>;
          })}
          {!loading && !overview?.templates.length && <p className="contest-muted" role="status">Шаблоны пока недоступны.</p>}
        </div>
      </section>

      <div className="admin-mailing-layout">
        <section className="contest-admin-card admin-mailing-editor" aria-labelledby="mailing-editor-title">
          <div className="admin-card-heading"><span className="admin-card-heading-icon"><Mail size={19} /></span><div><h2 id="mailing-editor-title">Содержание письма</h2><p>Сначала выберите аудиторию, затем проверьте письмо справа.</p></div></div>
          <fieldset className="admin-mailing-audience"><legend>Получатели</legend>{segments.map(segment => (
            <label key={segment.id} className={draft.segment === segment.id ? 'is-selected' : ''}>
              <input type="radio" name="mailing-segment" value={segment.id} checked={draft.segment === segment.id} onChange={() => onDraftChange({ segment: segment.id })} />
              <span><strong>{segment.label}</strong><small>{segment.caption}</small></span><b>{segment.count}</b>
            </label>
          ))}</fieldset>
          <label className="admin-mailing-field"><span>Тема письма <b>{draft.subject.length}/160</b></span><input value={draft.subject} maxLength={160} onChange={event => onDraftChange({ subject: event.target.value, templateKey: 'custom' }, { invalidatePreview: !event.target.value.trim() })} placeholder="Например: Тир-лист Арены обновлён" /></label>
          <label className="admin-mailing-field"><span>Короткое описание <b>{draft.preheader.length}/220</b></span><input value={draft.preheader} maxLength={220} onChange={event => onDraftChange({ preheader: event.target.value, templateKey: 'custom' })} placeholder="Этот текст виден рядом с темой во входящих" /></label>
          <label className="admin-mailing-field admin-mailing-html-field"><span>HTML статьи <b>{draft.htmlBody.length.toLocaleString('ru-RU')} знаков</b></span><textarea value={draft.htmlBody} maxLength={100000} spellCheck={false} onChange={event => onDraftChange({ htmlBody: event.target.value, templateKey: 'custom' }, { invalidatePreview: !event.target.value.trim() })} aria-describedby="mailing-html-help" /></label>
          <p id="mailing-html-help" className="admin-mailing-help">Разрешены безопасные заголовки, абзацы, списки, ссылки, изображения и таблицы. Скрипты, формы, стили и опасные ссылки сервер удалит. Шапка и ссылка отписки добавляются автоматически.</p>
          <div className="admin-mailing-actions">
            <button type="button" className="contest-secondary-button" disabled={previewLoading} onClick={onPreview}><Monitor size={17} /> {previewLoading ? 'Собираем…' : 'Обновить предпросмотр'}</button>
            <button type="button" className="contest-secondary-button" disabled={testing || !overview?.transport.configured} onClick={onTest}><Send size={17} /> {testing ? 'Отправляем…' : 'Отправить тест себе'}</button>
            <button type="button" className="contest-primary-button admin-mailing-send-button" disabled={sending || previewCount < 1 || !overview?.transport.configured} onClick={onSend}><Mail size={17} /> {sending ? 'Ставим в очередь…' : `Разослать · ${previewCount}`}</button>
          </div>
          {overview && !overview.transport.configured && <p className="admin-inline-error" role="alert">Почтовый транспорт или секрет ссылки отписки не настроен на сервере.</p>}
        </section>

        <section className="contest-admin-card admin-mailing-preview-card" aria-labelledby="mailing-preview-title">
          <div className="admin-mailing-preview-toolbar"><div><h2 id="mailing-preview-title">Предпросмотр</h2><p>Точная версия после серверной очистки HTML</p></div><fieldset aria-label="Размер предпросмотра">
            <button type="button" className={previewMode === 'desktop' ? 'is-active' : ''} aria-pressed={previewMode === 'desktop'} onClick={() => onPreviewModeChange('desktop')}><Monitor size={16} /><span>Экран</span></button>
            <button type="button" className={previewMode === 'mobile' ? 'is-active' : ''} aria-pressed={previewMode === 'mobile'} onClick={() => onPreviewModeChange('mobile')}><Smartphone size={16} /><span>Телефон</span></button>
          </fieldset></div>
          <div className={`admin-mailing-preview-stage is-${previewMode}`} aria-busy={previewLoading}>
            {previewHtml ? <iframe title="Предпросмотр письма" sandbox="" referrerPolicy="no-referrer" srcDoc={previewHtml} /> : <div className="admin-mailing-preview-empty" role="status"><Mail size={30} /><strong>Письмо появится здесь</strong><span>Заполните тему и HTML — предпросмотр обновится автоматически.</span></div>}
          </div>
          <div className="admin-mailing-preview-meta"><span>Получателей после проверок</span><strong>{previewCount}</strong></div>
        </section>
      </div>

      <div className="admin-mailing-bottom-grid">
        <section className="contest-admin-card" aria-labelledby="mailing-history-title"><div className="contest-users-head"><div><h2 id="mailing-history-title">История рассылок</h2><p className="contest-muted">Очередь продолжит работу после перезапуска сервера.</p></div></div><div className="admin-mailing-history">
          {(overview?.campaigns || []).map(campaign => { const status = campaignStatus(campaign.status); return <div key={campaign.id}><span className={`admin-mailing-status is-${status.tone}`}>{status.label}</span><div><strong>{campaign.subject}</strong><small>{formatDate(campaign.createdAt)} · {campaign.recipientCount} получателей</small>{campaign.error && <small className="admin-mailing-campaign-error">{campaign.error}</small>}</div><span>{campaign.acceptedCount} принято · {campaign.failedCount} ошибок · {campaign.skippedCount} пропущено</span></div>; })}
          {!loading && !overview?.campaigns.length && <p className="contest-muted" role="status">Рассылок ещё не было.</p>}
        </div></section>
        <section className="contest-admin-card" aria-labelledby="mailing-contacts-title"><div className="contest-users-head"><div><h2 id="mailing-contacts-title">Реестр адресов</h2><p className="contest-muted">Бывшие подписчики остаются в реестре; отписанные адреса хранятся как запрет отправки.</p></div></div><div className="admin-mailing-contacts">
          {(overview?.contacts || []).slice(0, 10).map(contact => <div key={contact.id}><span className={contact.eligible ? 'is-ok' : 'is-muted'}><i />{consentLabel(contact)}</span><div><strong>{contact.name || contact.email}</strong><small>{contact.email} · {contact.lifecycle === 'active' ? 'активный' : 'бывший'}</small></div></div>)}
          {!loading && !overview?.contacts.length && <p className="contest-muted" role="status">Сохранённых адресов пока нет.</p>}
        </div>{Boolean(overview?.contacts.length) && <p className="admin-mailing-register-note">Показаны последние 10 записей из {overview?.summary.total || 0}.</p>}</section>
      </div>
    </div>
  );
}
