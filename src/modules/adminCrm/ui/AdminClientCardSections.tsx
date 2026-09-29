import React, { useState } from 'react';
import { Trash2, X } from 'lucide-react';
import type { AdminCrmNote, AdminCrmPerson } from '../api/adminCrmClient';
import {
  accessSourceLabel,
  buildPersonTimeline,
  formatDate,
  identityProviderLabel,
} from './adminClientCardModel';

type SectionProps = { idPrefix: string; card: AdminCrmPerson };

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section className="admin-crm-section" aria-labelledby={id}>
      <h3 id={id}>{title}</h3>
      {children}
    </section>
  );
}

function manualAccessSummary(manual: NonNullable<AdminCrmPerson['access']['manual']>): string {
  if (manual.active) return manual.expiresAt ? `до ${formatDate(manual.expiresAt, true)}` : 'навсегда';
  if (manual.revokedAt) return `отозван ${formatDate(manual.revokedAt)}`;
  return manual.expiresAt ? `истёк ${formatDate(manual.expiresAt, true)}` : 'не действует';
}

export function AccessSection({ idPrefix, card }: SectionProps) {
  const manual = card.access.manual;
  return (
    <Section id={`${idPrefix}-access`} title="Доступ">
      <dl className="admin-crm-facts">
        <div><dt>Источник</dt><dd>{accessSourceLabel(card.access.source)}</dd></div>
        {card.access.message && <div><dt>Статус проверки</dt><dd>{card.access.message}</dd></div>}
        <div><dt>Последняя проверка</dt><dd>{formatDate(card.access.checkedAt, true)}</dd></div>
        {manual && (
          <>
            <div><dt>Ручной доступ</dt><dd>{manualAccessSummary(manual)}</dd></div>
            <div><dt>Выдал</dt><dd>{manual.grantedBy} · {formatDate(manual.grantedAt)}</dd></div>
            {manual.note && <div><dt>Причина</dt><dd>{manual.note}</dd></div>}
          </>
        )}
      </dl>
    </Section>
  );
}

export function TagsSection({ idPrefix, card, busy, onSave }: SectionProps & { busy: boolean; onSave: (tags: string[]) => void }) {
  const [draft, setDraft] = useState('');
  return (
    <Section id={`${idPrefix}-tags`} title="Теги">
      <ul className="admin-crm-tags">
        {card.tags.map(tag => (
          <li key={tag}>
            {tag}
            <button type="button" aria-label={`Убрать тег ${tag}`} disabled={busy} onClick={() => onSave(card.tags.filter(item => item !== tag))}><X size={12} /></button>
          </li>
        ))}
        {!card.tags.length && <li className="is-empty">Тегов нет</li>}
      </ul>
      <form className="admin-crm-inline-form" onSubmit={event => {
        event.preventDefault();
        const tag = draft.trim();
        if (!tag) return;
        setDraft('');
        onSave([...card.tags, tag]);
      }}>
        <label className="admin-crm-sr-only" htmlFor={`${idPrefix}-tag-input`}>Новый тег</label>
        <input id={`${idPrefix}-tag-input`} value={draft} maxLength={32} placeholder="vip, стример, партнёр…" onChange={event => setDraft(event.target.value)} />
        <button type="submit" className="contest-secondary-button" disabled={busy || !draft.trim()}>Добавить</button>
      </form>
    </Section>
  );
}

type NotesSectionProps = SectionProps & {
  busy: string;
  onAdd: (body: string) => Promise<boolean>;
  onDelete: (note: AdminCrmNote) => void;
};

export function NotesSection({ idPrefix, card, busy, onAdd, onDelete }: NotesSectionProps) {
  const [draft, setDraft] = useState('');
  return (
    <Section id={`${idPrefix}-notes`} title="Заметки">
      <form className="admin-crm-note-form" onSubmit={async event => {
        event.preventDefault();
        const body = draft.trim();
        if (body && await onAdd(body)) setDraft('');
      }}>
        <label className="admin-crm-sr-only" htmlFor={`${idPrefix}-note-input`}>Новая заметка</label>
        <textarea id={`${idPrefix}-note-input`} value={draft} maxLength={2000} placeholder="Видна только администраторам" onChange={event => setDraft(event.target.value)} />
        <button type="submit" className="contest-secondary-button" disabled={busy === 'note' || !draft.trim()}>{busy === 'note' ? 'Сохраняем…' : 'Сохранить заметку'}</button>
      </form>
      {card.notes.length ? (
        <ul className="admin-crm-notes">
          {card.notes.map(note => (
            <li key={note.id}>
              <p>{note.body}</p>
              <footer>
                <span>{note.authorName} · {formatDate(note.createdAt, true)}</span>
                <button type="button" aria-label="Удалить заметку" disabled={Boolean(busy)} onClick={() => onDelete(note)}><Trash2 size={14} /></button>
              </footer>
            </li>
          ))}
        </ul>
      ) : <p className="admin-crm-muted">Заметок пока нет.</p>}
    </Section>
  );
}

function mailingSummary(card: AdminCrmPerson): string {
  const mailing = card.mailing;
  if (!mailing) return card.person.newsletterOptIn ? 'согласие есть, писем не было' : 'не подписан';
  const status = mailing.consentStatus === 'subscribed' ? 'подписан' : mailing.consentStatus === 'unsubscribed' ? 'отписался' : mailing.consentStatus;
  return `${status} · доставлено ${mailing.delivered}${mailing.failed ? `, ошибок ${mailing.failed}` : ''}`;
}

export function AccountsSection({ idPrefix, card }: SectionProps) {
  const { contacts } = card.person;
  return (
    <Section id={`${idPrefix}-accounts`} title="Аккаунты и контакты">
      <dl className="admin-crm-facts">
        {card.identities.map(identity => (
          <div key={`${identity.provider}-${identity.createdAt}`}>
            <dt>{identityProviderLabel(identity.provider)}</dt>
            <dd>{identity.username ? `@${identity.username}` : 'привязан'} · {formatDate(identity.createdAt)}</dd>
          </div>
        ))}
        {contacts.telegram && <div><dt>Контакт Telegram</dt><dd>{contacts.telegram}</dd></div>}
        {contacts.vk && <div><dt>VK</dt><dd>{contacts.vk}</dd></div>}
        {contacts.email && <div><dt>Контактный email</dt><dd>{contacts.email}</dd></div>}
        <div><dt>Пришёл по ссылке</dt><dd>{card.referral
          ? `${card.referral.label}${card.referral.campaign ? ` · ${card.referral.campaign}` : ''} · ${formatDate(card.referral.clickedAt)}`
          : 'нет данных'}</dd></div>
        <div><dt>Рассылка</dt><dd>{mailingSummary(card)}</dd></div>
      </dl>
    </Section>
  );
}

export function HistorySection({ idPrefix, card }: SectionProps) {
  const events = buildPersonTimeline(card);
  return (
    <Section id={`${idPrefix}-history`} title="История">
      {events.length ? (
        <ol className="admin-crm-timeline">
          {events.map(event => (
            <li key={event.key} className={`is-${event.tone}`}>
              <strong>{event.title}</strong>
              <span>{formatDate(event.at, true)}{event.detail ? ` · ${event.detail}` : ''}</span>
            </li>
          ))}
        </ol>
      ) : <p className="admin-crm-muted">Событий пока нет.</p>}
    </Section>
  );
}
