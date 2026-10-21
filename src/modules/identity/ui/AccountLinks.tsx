import React from 'react';
import { Check, KeyRound } from 'lucide-react';
import type { SubscriptionStatus } from '../../subscriptions/public';
import { accountLinkRows, hasTelegramLinkActions, type AccountSocialLinks } from '../model/accountDashboard';
import type { AuthUser } from '../model/authUser';
import AccountBrandIcon from './AccountBrandIcon';
import AccountSectionHead from './AccountSectionHead';

const TelegramAccountLinkActions = React.lazy(() => import('./TelegramAccountLinkActions'));

export type AccountTelegramLink = {
  userId: string;
  mode: 'legacy-widget' | 'oidc' | 'disabled';
  botUsername: string;
  onMessage: (type: 'ok' | 'err', text: string) => void;
};

/** Every way into the account in one list, with what is linked and how to link the rest. */
export default function AccountLinks({ user, subscription, telegram, patreonLinkUrl, social }: {
  user: AuthUser;
  subscription: SubscriptionStatus | null;
  telegram: AccountTelegramLink;
  patreonLinkUrl: string;
  social?: AccountSocialLinks;
}) {
  const rows = accountLinkRows(user, subscription, social);
  return (
    <section id="account-links" className="account-section account-links" aria-labelledby="account-links-title">
      <AccountSectionHead
        id="account-links-title"
        icon={<KeyRound size={15} aria-hidden="true" />}
        eyebrow="Входы"
        title="Вход и привязки"
        description="Привяжите все способы входа к одному аккаунту, чтобы подписка открывалась с любого из них."
      />
      <ul className="account-links__list">
        {rows.map(row => (
          <li key={row.id} className="account-links__row" data-tour-id={row.id === 'telegram' ? 'profile-telegram-access' : undefined}>
            <AccountBrandIcon brand={row.id} />
            <span className="account-links__text"><strong>{row.title}</strong><small>{row.detail}</small></span>
            {row.linked && <span className="account-links__ok"><Check size={18} aria-hidden="true" />Привязан</span>}
            {!row.linked && row.linkUrl && (
              <a className="account-button account-button--secondary account-button--small" href={row.linkUrl}>Привязать</a>
            )}
            {!row.linked && row.id === 'boosty' && subscription && !subscription.hasAccess && (
              <a className="account-button account-button--secondary account-button--small" href="#account-access">Подтвердить</a>
            )}
            {!row.linked && row.id === 'patreon' && (
              <a className="account-button account-button--secondary account-button--small" href={patreonLinkUrl}>Подключить</a>
            )}
            {!row.linked && row.id === 'telegram' && hasTelegramLinkActions(telegram.mode, telegram.botUsername) && (
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
