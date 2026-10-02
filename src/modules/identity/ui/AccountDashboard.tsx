import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Copy, ExternalLink, MoreHorizontal, X } from 'lucide-react';
import type { SubscriptionStatus } from '../../subscriptions/public';
import type { AuthUser } from '../model/authUser';
import AuthAvatar from './AuthAvatar';
import AccountAccessCard, { type BoostyConfirmation } from './AccountAccessCard';
import AccountContests, { type AccountContestEntry } from './AccountContests';
import AccountLinks, { type AccountTelegramLink } from './AccountLinks';
import AccountSettings, { type AccountSettingsProps } from './AccountSettings';
import './AccountDashboard.css';

export type AccountDashboardProps = {
  user: AuthUser;
  name: string;
  contact: string;
  publicProfileHref: string;
  linkCopied: boolean;
  onCopyLink: () => void;
  message: { type: 'ok' | 'err'; text: string } | null;
  subscription: SubscriptionStatus | null;
  subscriptionPending: boolean;
  checkedAt: string;
  onRefreshSubscription: () => void;
  boosty: BoostyConfirmation;
  patreonLinkUrl: string;
  telegram: AccountTelegramLink;
  contests: { entries: AccountContestEntry[]; loading: boolean };
  settings: AccountSettingsProps;
  onLogout: () => void;
};

function openSettings(): void {
  const settings = document.getElementById('account-settings');
  if (settings instanceof HTMLDetailsElement) settings.open = true;
}

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
  if (!message || message === closed) return null;
  return createPortal(
    <div className={`account-message account-message--${message.type}`} role={message.type === 'err' ? 'alert' : 'status'}>
      <p>{message.text}</p>
      <button type="button" aria-label="Закрыть сообщение" onClick={() => setClosed(message)}><X size={18} aria-hidden="true" /></button>
    </div>,
    document.body,
  );
}

function AccountMenu({ onLogout }: { onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);
  return (
    <div className="account-menu" ref={rootRef} data-tour-id="profile-account-actions">
      <button type="button" className="account-header__action account-header__action--icon" aria-label="Меню аккаунта" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen(value => !value)}>
        <MoreHorizontal size={20} aria-hidden="true" />
      </button>
      {open && (
        <div className="account-menu__list">
          <a href="#account-settings" onClick={() => { openSettings(); setOpen(false); }}>Контакты и рассылка</a>
          <button type="button" className="account-menu__logout" onClick={onLogout}>Выйти из аккаунта</button>
        </div>
      )}
    </div>
  );
}

function AccountHeader({ user, name, contact, publicProfileHref, linkCopied, onCopyLink, onLogout }: Pick<AccountDashboardProps, 'user' | 'name' | 'contact' | 'publicProfileHref' | 'linkCopied' | 'onCopyLink' | 'onLogout'>) {
  return (
    <header className="account-header" data-tour-id="profile-summary">
      <AuthAvatar user={{ name, email: '', avatarInitials: user.avatarInitials, photoUrl: user.photoUrl }} size={68} />
      <div className="account-header__identity">
        <p className="account-header__eyebrow">Личный кабинет</p>
        <h1 id="account-title">{name}</h1>
        {contact && <p className="account-header__contact">{contact}</p>}
      </div>
      <div className="account-header__actions">
        {publicProfileHref && (
          <>
            <a className="account-header__action" href={publicProfileHref}><ExternalLink size={18} aria-hidden="true" />Публичный профиль</a>
            <button type="button" className="account-header__action" onClick={onCopyLink}>
              <Copy size={18} aria-hidden="true" />{linkCopied ? 'Ссылка скопирована' : 'Копировать ссылку'}
            </button>
          </>
        )}
        <AccountMenu onLogout={onLogout} />
      </div>
    </header>
  );
}

/**
 * The signed-in account: access first, then the ways into the account, contests
 * and the rarely changed contacts. State and requests stay in `LoginPanel`.
 */
export default function AccountDashboard(props: AccountDashboardProps) {
  return (
    <div className="account-dashboard">
      <AccountHeader {...props} />
      <AccountMessage message={props.message} />
      <div className="account-dashboard__columns">
        <div className="account-dashboard__main">
          <AccountAccessCard
            subscription={props.subscription}
            pending={props.subscriptionPending}
            checkedAt={props.checkedAt}
            onRefresh={props.onRefreshSubscription}
            boosty={props.boosty}
            patreonLinkUrl={props.patreonLinkUrl}
          />
          <AccountContests entries={props.contests.entries} loading={props.contests.loading} />
        </div>
        <div className="account-dashboard__side">
          <AccountLinks user={props.user} subscription={props.subscription} telegram={props.telegram} patreonLinkUrl={props.patreonLinkUrl} />
          <AccountSettings {...props.settings} />
        </div>
      </div>
      <button type="button" className="account-logout" onClick={props.onLogout}>Выйти из аккаунта</button>
    </div>
  );
}
