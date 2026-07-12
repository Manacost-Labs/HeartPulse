import React, { useState } from 'react';

export type AdminReferralLink = {
  id: string;
  slug: string;
  label: string;
  campaign: string;
  targetPath: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  url: string;
  clicks: number;
  uniqueClicks: number;
  lastClickAt: string;
};

export type AdminReferralClick = {
  id: string;
  referralId: string;
  slug: string;
  clickedAt: string;
  userAgent: string;
  referrer: string;
  landingPath: string;
};

export type ReferralDraft = {
  label: string;
  slug: string;
  campaign: string;
  targetPath: string;
  status: string;
};

const EMPTY_REFERRAL_DRAFT: ReferralDraft = {
  label: '',
  slug: '',
  campaign: '',
  targetPath: '/',
  status: 'active',
};

type ContestAdminReferralsProps = {
  referrals: AdminReferralLink[];
  referralClicks: AdminReferralClick[];
  loading: boolean;
  formatDate: (value: string) => string;
  onCopy: (value: string, confirmation: string) => Promise<void>;
  onSubmit: (draft: ReferralDraft) => Promise<boolean>;
};

export function ContestAdminReferrals({
  referrals,
  referralClicks,
  loading,
  formatDate,
  onCopy,
  onSubmit,
}: ContestAdminReferralsProps) {
  const [draft, setDraft] = useState<ReferralDraft>(EMPTY_REFERRAL_DRAFT);
  const [clicksExpanded, setClicksExpanded] = useState(false);
  const visibleClicks = clicksExpanded ? referralClicks : referralClicks.slice(0, 8);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft.label.trim()) return;
    if (await onSubmit(draft)) setDraft(EMPTY_REFERRAL_DRAFT);
  };

  return (
    <div className="contest-admin-grid admin-referral-layout">
      <form className="contest-admin-card admin-referral-form" onSubmit={submit}>
        <h2>Новая рекламная ссылка</h2>
        <label>Название<input value={draft.label} onChange={event => setDraft(value => ({ ...value, label: event.target.value }))} placeholder="Telegram июль, VK пост, Boosty баннер" /></label>
        <label>Slug<input value={draft.slug} onChange={event => setDraft(value => ({ ...value, slug: event.target.value }))} placeholder="tg-july" /></label>
        <label>Кампания<input value={draft.campaign} onChange={event => setDraft(value => ({ ...value, campaign: event.target.value }))} placeholder="summer-2026" /></label>
        <label>Куда вести<input value={draft.targetPath} onChange={event => setDraft(value => ({ ...value, targetPath: event.target.value }))} placeholder="/" /></label>
        <label>Статус
          <select value={draft.status} onChange={event => setDraft(value => ({ ...value, status: event.target.value }))}>
            <option value="active">Активна</option>
            <option value="paused">Пауза</option>
          </select>
        </label>
        <button type="submit" disabled={loading} className="contest-primary-button">Создать ссылку</button>
      </form>

      <div className="contest-admin-card admin-referral-report">
        <h2>Статистика ссылок</h2>
        <div className="admin-referral-list">
          {referrals.map(item => (
            <div key={item.id} className="admin-referral-row">
              <div>
                <strong>{item.label}</strong>
                <span>{item.campaign || 'без кампании'} · {item.status === 'active' ? 'активна' : 'пауза'}</span>
                <code>{item.url}</code>
              </div>
              <div className="admin-referral-stats">
                <span><strong>{item.clicks}</strong> кликов</span>
                <span><strong>{item.uniqueClicks}</strong> уник.</span>
                <span>{item.lastClickAt ? formatDate(item.lastClickAt) : 'нет кликов'}</span>
              </div>
              <button type="button" onClick={() => void onCopy(item.url, 'Реферальная ссылка скопирована.')}>Копировать</button>
            </div>
          ))}
          {!referrals.length && <p className="contest-muted" role="status">Реферальных ссылок пока нет.</p>}
        </div>
        <h3 className="admin-subtitle">Последние переходы</h3>
        <div className="admin-referral-clicks">
          {visibleClicks.map(click => (
            <div key={click.id}>
              <strong>/r/{click.slug}</strong>
              <span>{click.clickedAt ? formatDate(click.clickedAt) : 'без даты'} · {click.referrer || 'прямой переход'}</span>
            </div>
          ))}
          {!referralClicks.length && <p className="contest-muted" role="status">Переходов пока нет.</p>}
        </div>
        {referralClicks.length > 8 && (
          <button type="button" className="contest-secondary-button admin-referral-more" aria-expanded={clicksExpanded} onClick={() => setClicksExpanded(value => !value)}>
            {clicksExpanded ? 'Свернуть переходы' : `Показать все переходы (${referralClicks.length})`}
          </button>
        )}
      </div>
    </div>
  );
}
