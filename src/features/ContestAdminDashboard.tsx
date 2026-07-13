import React from 'react';
import type { AdminReferralClick } from './ContestAdminReferrals';
import type { AdminWorkspaceSection } from './adminWorkspaceState';

type ContestAdminDashboardProps = {
  articleCount: number;
  galleryCount: number;
  boostyPaidCount: number | string;
  telegramAccessCount: number | string;
  contestCount: number;
  contestEntryCount: number;
  referralCount: number;
  referralClickCount: number;
  recentReferralClicks: AdminReferralClick[];
  formatDate: (value: string) => string;
  onNavigate: (section: AdminWorkspaceSection) => void;
  onCreateContest: () => void;
};

export function ContestAdminDashboard({
  articleCount,
  galleryCount,
  boostyPaidCount,
  telegramAccessCount,
  contestCount,
  contestEntryCount,
  referralCount,
  referralClickCount,
  recentReferralClicks,
  formatDate,
  onNavigate,
  onCreateContest,
}: ContestAdminDashboardProps) {
  return (
    <>
      <div className="admin-stat-grid">
        <div><span>Контент</span><strong>{articleCount}</strong><small>статей · {galleryCount} артов</small></div>
        <div><span>Аудитория</span><strong>{boostyPaidCount}</strong><small>платных Boosty · Telegram {telegramAccessCount}</small></div>
        <div><span>Конкурсы</span><strong>{contestCount}</strong><small>{contestEntryCount} заявок</small></div>
        <div><span>Кампании</span><strong>{referralCount}</strong><small>{referralClickCount} переходов</small></div>
      </div>
      <div className="contest-admin-grid admin-dashboard-grid">
        <div className="contest-admin-card">
          <h2>Быстрый доступ</h2>
          <div className="admin-quick-actions">
            <button type="button" onClick={onCreateContest}>Создать конкурс</button>
            <button type="button" onClick={() => onNavigate('articles')}>Добавить статью</button>
            <button type="button" onClick={() => onNavigate('gallery')}>Загрузить арт</button>
            <button type="button" onClick={() => onNavigate('translations')}>Добавить перевод</button>
            <button type="button" onClick={() => onNavigate('mailing')}>Создать рассылку</button>
            <button type="button" onClick={() => onNavigate('boosty')}>Открыть Boosty</button>
            <button type="button" onClick={() => onNavigate('telegram')}>Открыть Telegram</button>
            <button type="button" onClick={() => onNavigate('referrals')}>Новая рекламная ссылка</button>
            <button type="button" onClick={() => onNavigate('users')}>Найти пользователя</button>
          </div>
        </div>
        <div className="contest-admin-card">
          <h2>Последние переходы</h2>
          <div className="admin-referral-clicks">
            {recentReferralClicks.slice(0, 8).map(click => (
              <div key={click.id}>
                <strong>/r/{click.slug}</strong>
                <span>{click.clickedAt ? formatDate(click.clickedAt) : 'без даты'}</span>
              </div>
            ))}
            {!recentReferralClicks.length && <p className="contest-muted" role="status">Переходов пока нет.</p>}
          </div>
        </div>
      </div>
    </>
  );
}
