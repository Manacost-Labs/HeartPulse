import { Suspense, useContext, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Activity, ArrowRight, X } from 'lucide-react';
import type { SubscriptionStatus } from '../../subscriptions/public';
import type { AccountSocialLinks } from '../model/accountDashboard';
import { accountPlanSummary } from '../model/accountPlan';
import type { AuthUser } from '../model/authUser';
import type { AccountSessionsControl } from '../hooks/useAccountSessions';
import type { BoostyConfirmation } from './AccountAccessOptions';
import AccountContests, { type AccountContestEntry } from './AccountContests';
import { AccountGameStatsSlot } from './accountGameStatsSlot';
import AccountHero from './AccountHero';
import AccountLinks, { type AccountTelegramLink } from './AccountLinks';
import AccountPlanSection from './AccountPlanSection';
import AccountSectionHead from './AccountSectionHead';
import AccountSettings, { type AccountSettingsProps } from './AccountSettings';
import './AccountDashboard.css';

export type AccountDashboardProps = {
  user: AuthUser;
  name: string;
  contact: string;
  message: { type: 'ok' | 'err'; text: string } | null;
  subscription: SubscriptionStatus | null;
  subscriptionLoading: boolean;
  subscriptionChecked: boolean;
  checkedAt: string;
  onRefreshSubscription: () => void;
  boosty: BoostyConfirmation;
  patreonLinkUrl: string;
  telegram: AccountTelegramLink;
  social?: AccountSocialLinks;
  sessions?: AccountSessionsControl;
  contests: { entries: AccountContestEntry[]; loading: boolean };
  settings: AccountSettingsProps;
  onLogout: () => void;
};

/**
 * Results of saving, linking and checking float at the bottom of the screen,
 * so they are seen next to the button that caused them. Successes hide after
 * a few seconds; errors stay until closed or replaced. The message lives in
 * `document.body`: the page content is its own stacking context, under the footer.
 */
function AccountMessage({ message }: Pick<AccountDashboardProps, 'message'>) {
  const [closed, setClosed] = useState<AccountDashboardProps['message']>(null);
  useEffect(() => {
    if (message?.type !== 'ok') return undefined;
    const timer = window.setTimeout(() => setClosed(message), 6_000);
    return () => window.clearTimeout(timer);
  }, [message]);
  if (!message || message === closed || typeof document === 'undefined') return null;
  return createPortal(
    <div className={`account-message account-message--${message.type}`} role={message.type === 'err' ? 'alert' : 'status'}>
      <p>{message.text}</p>
      <button type="button" aria-label="Закрыть сообщение" onClick={() => setClosed(message)}><X size={18} aria-hidden="true" /></button>
    </div>,
    document.body,
  );
}

const HELP_LINKS = [
  { href: '/faq/#faq-access-missing', label: 'Оплатили, а доступ закрыт' },
  { href: '/faq/#faq-telegram-link', label: 'Как привязать Telegram' },
  { href: '/faq/#faq-public-profile', label: 'Кто видит мой профиль' },
] as const;

/**
 * The signed-in account: who and what plan in the header, then the plan, the
 * ways into the account, settings and contests. State and requests stay in `LoginPanel`.
 */
export default function AccountDashboard(props: AccountDashboardProps) {
  const plan = accountPlanSummary(props.subscription, props.subscriptionChecked);
  const GameStats = useContext(AccountGameStatsSlot);
  return (
    <div className="account-dashboard">
      <AccountHero
        user={props.user}
        name={props.name}
        contact={props.contact}
        plan={plan}
        onLogout={props.onLogout}
      />
      <AccountMessage message={props.message} />
      <AccountPlanSection
        plan={plan}
        subscription={props.subscription}
        loading={props.subscriptionLoading}
        checkedAt={props.checkedAt}
        onRefresh={props.onRefreshSubscription}
        boosty={props.boosty}
        patreonLinkUrl={props.patreonLinkUrl}
      />
      {GameStats ? (
        <section id="account-game-stats" className="account-section account-game-stats" aria-labelledby="account-game-stats-title">
          <AccountSectionHead
            id="account-game-stats-title"
            icon={<Activity size={15} aria-hidden="true" />}
            eyebrow="Hearthpulse"
            title="Моя статистика"
            description="Ваши игры из приложения Hearthpulse: рейтинг, герои, колоды и забеги."
          />
          <Suspense fallback={null}><GameStats /></Suspense>
        </section>
      ) : null}
      <div className="account-dashboard__columns">
        <AccountLinks user={props.user} subscription={props.subscription} telegram={props.telegram} patreonLinkUrl={props.patreonLinkUrl} social={props.social} sessions={props.sessions} />
        <AccountSettings {...props.settings} />
      </div>
      <AccountContests entries={props.contests.entries} loading={props.contests.loading} />
      <nav className="account-help" aria-label="Помощь по аккаунту">
        <span>Помощь:</span>
        {HELP_LINKS.map(link => <a key={link.href} href={link.href}>{link.label}<ArrowRight size={15} aria-hidden="true" /></a>)}
      </nav>
    </div>
  );
}
