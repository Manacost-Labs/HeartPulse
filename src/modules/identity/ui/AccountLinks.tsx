import React from 'react';
import { Check, Mail } from 'lucide-react';
import type { SubscriptionStatus } from '../../subscriptions/public';
import { accountLinkRows, type AccountLinkRow } from '../model/accountDashboard';
import type { AuthUser } from '../model/authUser';

const TelegramAccountLinkActions = React.lazy(() => import('./TelegramAccountLinkActions'));

export type AccountTelegramLink = {
  userId: string;
  mode: 'legacy-widget' | 'oidc' | 'disabled';
  botUsername: string;
  onMessage: (type: 'ok' | 'err', text: string) => void;
};

function RowIcon({ id }: { id: AccountLinkRow['id'] }) {
  if (id === 'email') return <span className="account-brand account-brand--mail" aria-hidden="true"><Mail size={18} /></span>;
  const letter = { telegram: 'T', boosty: 'B', patreon: 'P' }[id];
  return <span className={`account-brand account-brand--${id}`} aria-hidden="true">{letter}</span>;
}

/** Every way into the account in one list, with what is linked and how to link the rest. */
export default function AccountLinks({ user, subscription, telegram, patreonLinkUrl }: {
  user: AuthUser;
  subscription: SubscriptionStatus | null;
  telegram: AccountTelegramLink;
  patreonLinkUrl: string;
}) {
  const rows = accountLinkRows(user, subscription);
  return (
    <section className="account-card account-links" aria-labelledby="account-links-title">
      <h2 id="account-links-title">Вход и привязки</h2>
      <p className="account-muted">Любой из этих способов ведёт в один и тот же аккаунт.</p>
      <ul className="account-links__list">
        {rows.map(row => (
          <li key={row.id} className="account-links__row" data-tour-id={row.id === 'telegram' ? 'profile-telegram-access' : undefined}>
            <RowIcon id={row.id} />
            <span className="account-links__text"><strong>{row.title}</strong><small>{row.detail}</small></span>
            {row.linked && <Check className="account-links__ok" size={20} role="img" aria-label="Привязано" />}
            {!row.linked && row.id === 'boosty' && !subscription?.hasAccess && (
              <a className="account-button account-button--secondary account-button--small" href="#account-access">Подтвердить</a>
            )}
            {!row.linked && row.id === 'patreon' && (
              <a className="account-button account-button--secondary account-button--small" href={patreonLinkUrl}>Подключить</a>
            )}
            {!row.linked && row.id === 'telegram' && (
              <div className="account-links__telegram">
                <React.Suspense fallback={null}>
                  <TelegramAccountLinkActions {...telegram} />
                </React.Suspense>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
