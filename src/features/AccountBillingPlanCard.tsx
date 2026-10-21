import { BillingPlanCard, type BillingPlanCardLabels } from '../vendor/valyro-ui/ai/BillingPlanCard';
import type { AccountPlanCardProps } from '../modules/identity/public';
import '../vendor/varylo-ui/styles/index.css';
import '../shared/ui/varyloParchment.css';
import './AccountBillingPlanCard.css';

const LABELS: Partial<BillingPlanCardLabels> = {
  currentPlan: 'Ваш уровень',
  status: { active: 'Активна', trialing: 'Пробный период', past_due: 'Ждёт оплаты', canceled: 'Не продлится' },
  interval: { month: '/ месяц', year: '/ год' },
  renews: 'Следующий платёж',
  accessEnds: 'Доступ до',
  manage: 'Управлять на Boosty',
};

/**
 * The account's priced plan on the vendored Valyro card, in parchment. The
 * account module receives it through `AccountPlanCardSlot`; managing the
 * subscription opens the provider in a new tab.
 */
export default function AccountBillingPlanCard({ plan, manageUrl }: AccountPlanCardProps) {
  if (plan.price === null) return null;
  return (
    <div className="account-billing-plan hp-varylo-parchment">
      <BillingPlanCard
        className="account-billing-plan__card"
        plan={plan.title}
        status={plan.renewal === 'ends' ? 'canceled' : 'active'}
        price={plan.price}
        currency="RUB"
        interval="month"
        renewsAt={plan.renewsAt ?? undefined}
        locale="ru-RU"
        labels={plan.renewal === 'unknown' ? { ...LABELS, renews: 'Оплачено до' } : LABELS}
        onManage={plan.provider === 'boosty' ? () => { window.open(manageUrl, '_blank', 'noopener,noreferrer'); } : undefined}
      />
    </div>
  );
}
