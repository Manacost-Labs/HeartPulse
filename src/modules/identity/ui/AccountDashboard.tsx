import { Suspense, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Activity, Layers, Swords, TrendingUp, X } from 'lucide-react';
import type { SubscriptionStatus } from '../../subscriptions/public';
import type { AccountSocialLinks } from '../model/accountDashboard';
import { accountPlanSummary } from '../model/accountPlan';
import type { AuthUser } from '../model/authUser';
import type { AccountSessionsControl } from '../hooks/useAccountSessions';
import type { BoostyConfirmation } from './AccountAccessOptions';
import AccountContests, { type AccountContestEntry } from './AccountContests';
import AccountDecks from './AccountDecks';
import AccountEmptyPreview from './AccountEmptyPreview';
import { AccountGameStatsSlot } from './accountGameStatsSlot';
import AccountHero from './AccountHero';
import AccountLinks, { type AccountTelegramLink } from './AccountLinks';
import AccountPlanSection from './AccountPlanSection';
import AccountSectionHead from './AccountSectionHead';
import AccountReplays from './AccountReplays';
import AccountTrackerData from './AccountTrackerData';
import AccountPublicProfile, { type AccountPublicProfileProps } from './AccountPublicProfile';
import AccountSettings, { type AccountSettingsProps } from './AccountSettings';
import AccountTabs from './AccountTabs';
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
  /** The public profile links and nickname form; omitted while the account is not loaded. */
  publicProfile?: AccountPublicProfileProps;
  onLogout: () => void;
};

/**
 * Results of saving, linking and checking float at the bottom of the screen,
 * so they are seen next to the button that caused them. Successes hide after
 * a few seconds; errors stay until closed or replaced. The message lives in
 * `document.body`: the page content is its own stacking context, under the footer.
 *
 * It must never hide the control that caused it (a «Сохранить» low on a
 * phone): while it shows, the page gets room for it at the end, and the
 * focused control is scrolled above it.
 */
function AccountMessage({ message }: Pick<AccountDashboardProps, 'message'>) {
  const [closed, setClosed] = useState<AccountDashboardProps['message']>(null);
  const toast = useRef<HTMLDivElement>(null);
  // Rendered after mounting only: the server and the first client render agree (nothing), then the portal appears.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const visible = Boolean(message) && message !== closed;
  useEffect(() => {
    if (message?.type !== 'ok') return undefined;
    const timer = window.setTimeout(() => setClosed(message), 6_000);
    return () => window.clearTimeout(timer);
  }, [message]);
  // The control a message answers is the last one pressed or focused: a busy
  // «Сохранить» is disabled while it works and has lost the focus by now.
  const lastTarget = useRef<Element | null>(null);
  useEffect(() => {
    const remember = (event: Event) => { if (event.target instanceof Element) lastTarget.current = event.target; };
    document.addEventListener('pointerdown', remember, true);
    document.addEventListener('focusin', remember, true);
    return () => {
      document.removeEventListener('pointerdown', remember, true);
      document.removeEventListener('focusin', remember, true);
    };
  }, []);
  useLayoutEffect(() => {
    const target = lastTarget.current;
    if (!visible || !toast.current || !target?.isConnected) return;
    const overlap = target.getBoundingClientRect().bottom + 12 - toast.current.getBoundingClientRect().top;
    if (overlap > 0) window.scrollBy({ top: overlap, behavior: 'auto' });
  }, [visible, message, mounted]);
  if (!message || !visible || !mounted) return null;
  return (
    <>
      <div className="account-message-room" aria-hidden="true" />
      {createPortal(
        <div ref={toast} className={`account-message account-message--${message.type}`} role={message.type === 'err' ? 'alert' : 'status'}>
          <p>{message.text}</p>
          <button type="button" aria-label="Закрыть сообщение" onClick={() => setClosed(message)}><X size={18} aria-hidden="true" /></button>
        </div>,
        document.body,
      )}
    </>
  );
}

function StatsHead() {
  return (
    <AccountSectionHead
      id="account-game-stats-title"
      icon={<Activity size={15} aria-hidden="true" />}
      eyebrow="Hearthpulse"
      title="Моя статистика"
      description="Ваши игры из приложения Hearthpulse: рейтинг, герои, колоды и забеги."
    />
  );
}

/**
 * Shown while the tracker has sent no games. The application does not send
 * games for everyone yet, so this says what will appear without asking anyone
 * to install it.
 */
const NO_STATS = (
  <section id="account-game-stats" className="account-section account-game-stats" aria-labelledby="account-game-stats-title">
    <StatsHead />
    <p className="account-muted">Пока игр нет. Когда приложение Hearthpulse начнёт присылать ваши партии, здесь появится:</p>
    <AccountEmptyPreview items={[
      { icon: <TrendingUp size={17} />, title: 'Рейтинг и ранги', text: 'По каждой игре, за сезон и за последние 7–90 дней.' },
      { icon: <Layers size={17} />, title: 'Колоды', text: 'Винрейт по колодам, классам и соперникам, код для импорта.' },
      { icon: <Swords size={17} />, title: 'Поля сражений и Арена', text: 'Герои, места и забеги с итоговым счётом.' },
    ]} />
  </section>
);

/**
 * The signed-in account: who and the plan's status in the header, then four
 * tabs — personal data, subscription, statistics and decks. State and
 * requests stay in `LoginPanel`.
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
      <AccountTabs panels={{
        personal: (
          <>
            {props.publicProfile && <AccountPublicProfile {...props.publicProfile} />}
            <AccountLinks user={props.user} subscription={props.subscription} telegram={props.telegram} patreonLinkUrl={props.patreonLinkUrl} social={props.social} sessions={props.sessions} />
            <AccountSettings {...props.settings} />
            <AccountContests entries={props.contests.entries} loading={props.contests.loading} />
          </>
        ),
        subscription: (
          <>
            <AccountPlanSection
              plan={plan}
              subscription={props.subscription}
              loading={props.subscriptionLoading}
              checkedAt={props.checkedAt}
              onRefresh={props.onRefreshSubscription}
              boosty={props.boosty}
              patreonLinkUrl={props.patreonLinkUrl}
              telegramLinked={Boolean(props.user.telegramLinked || props.user.telegramUsername)}
            />
          </>
        ),
        stats: (
          <>
            {GameStats ? (
              <Suspense fallback={null}>
                <GameStats
                  empty={NO_STATS}
                  frame={body => (
                    <section id="account-game-stats" className="account-section account-game-stats" aria-labelledby="account-game-stats-title">
                      <StatsHead />
                      {body}
                    </section>
                  )}
                />
              </Suspense>
            ) : NO_STATS}
            <AccountTrackerData />
            <AccountReplays />
          </>
        ),
        decks: <AccountDecks />,
      }} />
      <AccountMessage message={props.message} />
    </div>
  );
}
