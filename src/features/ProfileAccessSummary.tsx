type ProfileAccessSummaryProps = {
  pending: boolean;
  active: boolean;
  checkedAt: string;
  onRefresh: () => void;
};

export default function ProfileAccessSummary({ pending, active, checkedAt, onRefresh }: ProfileAccessSummaryProps) {
  return (
    <div className="profile-subscription-header" data-tour-id="profile-access-status">
      <div>
        <p className="profile-subscription-kicker">Ваша подписка</p>
        <h2 className="profile-subscription-state">
          {pending ? 'Проверяем доступ' : active ? 'Доступ открыт' : 'Доступ не подтверждён'}
        </h2>
        <p className="profile-subscription-checked">Последняя проверка: {checkedAt}</p>
      </div>
      <button type="button" onClick={onRefresh} disabled={pending}>
        {pending ? 'Проверяем...' : 'Проверить доступ'}
      </button>
    </div>
  );
}
