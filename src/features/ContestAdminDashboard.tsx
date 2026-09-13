import React from 'react';
import {
  Activity,
  ArrowUpRight,
  BookOpenText,
  Database,
  ImagePlus,
  MailPlus,
  Megaphone,
  Plus,
  Trophy,
  Users,
  WandSparkles,
} from 'lucide-react';
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

function formatDashboardValue(value: number | string) {
  return typeof value === 'number' ? value.toLocaleString('ru-RU') : value;
}

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
    <div className="admin-dashboard">
      <section className="admin-dashboard-hero" aria-labelledby="admin-dashboard-pulse-title">
        <div>
          <span><Activity size={15} aria-hidden="true" /> Центр управления</span>
          <h2 id="admin-dashboard-pulse-title">Пульс проекта</h2>
          <p>Контент, аудитория и операционные разделы в одном рабочем пространстве.</p>
        </div>
        <button type="button" onClick={() => onNavigate('standard-data')}>
          <Database size={18} aria-hidden="true" /> Данные и парсеры
        </button>
      </section>

      <dl className="admin-stat-grid" aria-label="Ключевые показатели проекта">
        <div className="is-content">
          <dt><BookOpenText size={18} aria-hidden="true" /><span>Контент</span></dt>
          <dd><strong>{formatDashboardValue(articleCount)}</strong><small>статей · {formatDashboardValue(galleryCount)} артов</small></dd>
        </div>
        <div className="is-audience">
          <dt><Users size={18} aria-hidden="true" /><span>Аудитория</span></dt>
          <dd><strong>{formatDashboardValue(boostyPaidCount)}</strong><small>платных Boosty · Telegram {formatDashboardValue(telegramAccessCount)}</small></dd>
        </div>
        <div className="is-contests">
          <dt><Trophy size={18} aria-hidden="true" /><span>Конкурсы</span></dt>
          <dd><strong>{formatDashboardValue(contestCount)}</strong><small>{formatDashboardValue(contestEntryCount)} заявок</small></dd>
        </div>
        <div className="is-growth">
          <dt><Megaphone size={18} aria-hidden="true" /><span>Кампании</span></dt>
          <dd><strong>{formatDashboardValue(referralCount)}</strong><small>{formatDashboardValue(referralClickCount)} переходов</small></dd>
        </div>
      </dl>

      <div className="contest-admin-grid admin-dashboard-grid">
        <section className="contest-admin-card admin-dashboard-actions" aria-labelledby="admin-dashboard-actions-title">
          <div className="admin-card-heading">
            <div>
              <span className="admin-card-eyebrow">Рабочие процессы</span>
              <h2 id="admin-dashboard-actions-title">Быстрые действия</h2>
            </div>
          </div>
          <div className="admin-quick-actions">
            <button type="button" className="is-primary" onClick={onCreateContest}><Plus size={18} />Создать конкурс</button>
            <button type="button" onClick={() => onNavigate('articles')}><BookOpenText size={18} />Добавить статью</button>
            <button type="button" onClick={() => onNavigate('gallery')}><ImagePlus size={18} />Загрузить арт</button>
            <button type="button" onClick={() => onNavigate('translations')}><WandSparkles size={18} />Добавить перевод</button>
            <button type="button" onClick={() => onNavigate('mailing')}><MailPlus size={18} />Создать рассылку</button>
            <button type="button" onClick={() => onNavigate('referrals')}><Megaphone size={18} />Новая рекламная ссылка</button>
            <button type="button" onClick={() => onNavigate('users')}><Users size={18} />Найти пользователя</button>
          </div>
        </section>

        <section className="contest-admin-card admin-dashboard-activity" aria-labelledby="admin-dashboard-activity-title">
          <div className="admin-card-heading">
            <div>
              <span className="admin-card-eyebrow">Реферальные кампании</span>
              <h2 id="admin-dashboard-activity-title">Последние переходы</h2>
            </div>
            <button type="button" onClick={() => onNavigate('referrals')}>Все кампании <ArrowUpRight size={16} /></button>
          </div>
          <div className="admin-referral-clicks">
            {recentReferralClicks.slice(0, 8).map(click => (
              <div key={click.id}>
                <span className="admin-activity-mark" aria-hidden="true" />
                <strong>/r/{click.slug}</strong>
                <span>{click.clickedAt ? formatDate(click.clickedAt) : 'без даты'}</span>
              </div>
            ))}
            {!recentReferralClicks.length && <p className="contest-muted" role="status">Переходов пока нет.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
