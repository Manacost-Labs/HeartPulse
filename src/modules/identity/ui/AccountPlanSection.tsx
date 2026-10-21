import { Suspense, useContext } from 'react';
import { CreditCard } from 'lucide-react';
import type { SubscriptionStatus } from '../../subscriptions/public';
import { accountAccessNote, accountAccessTiles } from '../model/accountDashboard';
import type { AccountPlanSummary } from '../model/accountPlan';
import { AccessTiles, BOOSTY_SUBSCRIBE_URL, BoostyForm, NoAccess, type BoostyConfirmation } from './AccountAccessOptions';
import { AccountPlanCardSlot } from './accountPlanCardSlot';
import AccountPlanPlate from './AccountPlanPlate';
import AccountSectionHead from './AccountSectionHead';
import './AccountPlanSection.css';

export type AccountPlanSectionProps = {
  plan: AccountPlanSummary;
  subscription: SubscriptionStatus | null;
  /** A status, refresh or Boosty request is in flight. */
  loading: boolean;
  /** The formatted time of the last provider check; empty when there was none. */
  checkedAt: string;
  onRefresh: () => void;
  boosty: BoostyConfirmation;
  patreonLinkUrl: string;
};

const HEAD: Record<AccountPlanSummary['state'], { title: string; description: string }> = {
  active: { title: 'Ваш план', description: 'Что оплачено, до какого числа и что входит.' },
  none: { title: 'Откройте полный доступ', description: 'Подписка на Boosty или Patreon открывает тир-листы, мету, библиотеку и все статьи.' },
  pending: { title: 'Подписка', description: 'Проверяем подписку…' },
  unknown: { title: 'Подписка', description: 'Не удалось проверить подписку. Попробуйте ещё раз.' },
};

function ActivePlan({ plan, subscription }: Pick<AccountPlanSectionProps, 'plan' | 'subscription'>) {
  const PlanCard = useContext(AccountPlanCardSlot);
  // A grant's own message is already the plain plate's status line.
  const note = plan.provider === 'manual' ? '' : accountAccessNote(subscription);
  const plate = <AccountPlanPlate plan={plan} manageUrl={BOOSTY_SUBSCRIBE_URL} />;
  // Only Boosty reports a price and a date; other sources keep the plain plate.
  return (
    <>
      {plan.price !== null && PlanCard
        ? <Suspense fallback={plate}><PlanCard plan={plan} manageUrl={BOOSTY_SUBSCRIBE_URL} /></Suspense>
        : plate}
      {note && <p className="account-access__note">{note}</p>}
      <h3 className="account-access__subheading">Что входит</h3>
      <AccessTiles tiles={accountAccessTiles(subscription).sort((a, b) => Number(b.unlocked) - Number(a.unlocked))} />
    </>
  );
}

/** Section two of the account: the plan and what it opens, or the ways to get one. */
export default function AccountPlanSection({ plan, subscription, loading, checkedAt, onRefresh, boosty, patreonLinkUrl }: AccountPlanSectionProps) {
  const head = HEAD[plan.state];
  const description = plan.state === 'none' && subscription?.message ? subscription.message : head.description;
  return (
    <section id="account-access" className={`account-section account-plan account-plan--${plan.state}`} aria-labelledby="account-access-title">
      <AccountSectionHead
        id="account-access-title"
        icon={<CreditCard size={15} aria-hidden="true" />}
        eyebrow="Подписка"
        title={head.title}
        description={description}
        aside={plan.state !== 'pending' && (
          <span className="account-plan__check">
            {checkedAt && <small>Проверено {checkedAt}</small>}
            <button type="button" className="account-button account-button--secondary account-button--small" onClick={onRefresh} disabled={loading}>
              {loading ? 'Проверяем…' : 'Проверить снова'}
            </button>
          </span>
        )}
      />
      {plan.state === 'active' && <ActivePlan plan={plan} subscription={subscription} />}
      {plan.state === 'none' && <NoAccess subscription={subscription} boosty={boosty} patreonLinkUrl={patreonLinkUrl} />}
      {/* The status check failed, but the Boosty confirmation is a separate request. */}
      {plan.state === 'unknown' && <div className="account-access__options"><BoostyForm boosty={boosty} /></div>}
    </section>
  );
}
