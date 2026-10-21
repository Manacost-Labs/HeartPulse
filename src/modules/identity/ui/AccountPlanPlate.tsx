import { CalendarDays, ExternalLink } from 'lucide-react';
import type { AccountPlanCardProps } from './accountPlanCardSlot';

const DATE_LABELS = { auto: 'Следующий платёж', ends: 'Доступ до', unknown: 'Оплачено до' } as const;

function longDate(value: string): string {
  return new Date(value).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * The plan as a plain plate: the level, the price and date when the provider
 * reports them, and the way to manage it. Also the placeholder while the
 * composed plan card loads, so it keeps the card's information.
 */
export default function AccountPlanPlate({ plan, manageUrl }: Partial<AccountPlanCardProps> & Pick<AccountPlanCardProps, 'plan'>) {
  return (
    <div className="account-plan__plain">
      <div className="account-plan__plain-main">
        <p className="account-plan__plain-eyebrow">{plan.price === null ? 'Ваш доступ' : 'Ваш уровень'}</p>
        <strong>{plan.title}</strong>
        {plan.price === null && <span>{plan.statusLine}</span>}
        {plan.renewsAt && (
          <span className="account-plan__plain-date"><CalendarDays size={15} aria-hidden="true" />{DATE_LABELS[plan.renewal]}: {longDate(plan.renewsAt)}</span>
        )}
      </div>
      {plan.price !== null && <p className="account-plan__plain-price"><strong>{plan.price} ₽</strong> / месяц</p>}
      {manageUrl && plan.provider === 'boosty' && (
        <a className="account-button account-button--secondary" href={manageUrl} target="_blank" rel="noreferrer">
          Управлять на Boosty <ExternalLink size={16} aria-hidden="true" />
        </a>
      )}
    </div>
  );
}
