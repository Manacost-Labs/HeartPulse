/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

interface ProfileDashboardOverviewProps {
  accessLabel: string;
  accessPending: boolean;
  hasAccess: boolean;
  identityLabel: string;
  contestsLabel: string;
}

export default function ProfileDashboardOverview({
  accessLabel,
  accessPending,
  hasAccess,
  identityLabel,
  contestsLabel,
}: ProfileDashboardOverviewProps) {
  const accessStatus = accessPending
    ? 'Проверяем'
    : hasAccess
      ? accessLabel
      : 'Не подтверждён';

  return (
    <section className="profile-dashboard-overview" aria-label="Сводка профиля">
      <div className="profile-dashboard-overview__item">
        <span>Доступ</span>
        <strong>{accessStatus}</strong>
      </div>
      <div className="profile-dashboard-overview__item">
        <span>Способ входа</span>
        <strong>{identityLabel}</strong>
      </div>
      <div className="profile-dashboard-overview__item">
        <span>Конкурсы</span>
        <strong>{contestsLabel}</strong>
      </div>
    </section>
  );
}
