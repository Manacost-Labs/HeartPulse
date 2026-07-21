import React from 'react';
import { CheckCircle2, Clock3, ShieldCheck, Sparkles } from 'lucide-react';
import { formatAdminDate } from './format';
import type { ParserControlSnapshot } from './types';

export function PublicationPolicyCard({
  snapshot,
  saving,
  onSelectStable,
  onSelectEarly,
}: {
  snapshot: ParserControlSnapshot;
  saving: boolean;
  onSelectStable: () => void;
  onSelectEarly: () => void;
}) {
  const { policy, summary } = snapshot;
  const activeMode = policy.effectiveMode;
  const expiredEarlyMode = policy.mode === 'early' && activeMode === 'stable';
  const environmentManaged = policy.managedBy === 'environment';
  return (
    <section className="contest-admin-card admin-parser-card" aria-labelledby="parser-policy-title">
      <div className="admin-card-heading admin-parser-card__heading">
        <div>
          <h2 id="parser-policy-title"><ShieldCheck size={21} /> Режим публикации</h2>
          <p className="contest-muted">Определяет качество публикуемых данных и не управляет расписанием парсеров.</p>
        </div>
        <span className={`admin-parser-mode-badge is-${activeMode}`}>
          {activeMode === 'early' ? <Sparkles size={15} /> : <CheckCircle2 size={15} />}
          {activeMode === 'early' ? 'Ранняя мета' : 'Стабильная мета'}
        </span>
      </div>

      <div className="admin-parser-mode-options" role="group" aria-label="Режим публикации статистики">
        <button
          type="button"
          className={activeMode === 'stable' ? 'is-active' : ''}
          aria-pressed={activeMode === 'stable'}
          disabled={saving}
          onClick={onSelectStable}
        >
          <CheckCircle2 size={20} />
          <span><strong>Стабильная мета</strong><small>Только полные снимки; при сбое остаётся предыдущая версия.</small></span>
        </button>
        <button
          type="button"
          className={activeMode === 'early' ? 'is-active is-early' : ''}
          aria-pressed={activeMode === 'early'}
          disabled={saving || summary.earlyCapableSources === 0}
          onClick={onSelectEarly}
        >
          <Sparkles size={20} />
          <span><strong>Ранняя мета</strong><small>Первые проверенные данные после патча с явной пометкой на сайте.</small></span>
        </button>
      </div>

      <div className="admin-parser-policy-meta">
        <span><strong>{summary.earlyCapableSources}</strong> источников поддерживают ранний режим</span>
        {activeMode === 'early' && <span><Clock3 size={15} /> до {formatAdminDate(policy.earlyUntil)}</span>}
        {expiredEarlyMode && <span className="admin-parser-policy-meta__expired">Срок ранней меты истёк — действует стабильный режим</span>}
        {environmentManaged && <span className="admin-parser-policy-meta__expired">Исходный режим задан сервером. После выбора управление перейдёт этой панели.</span>}
        {policy.reason && <span className="admin-parser-policy-meta__reason">Причина: {policy.reason}</span>}
        {policy.updatedBy && <span>Изменил: {policy.updatedBy}{policy.updatedAt ? ` · ${formatAdminDate(policy.updatedAt)}` : ''}</span>}
      </div>
    </section>
  );
}
