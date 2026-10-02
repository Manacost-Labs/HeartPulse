import type { FormEvent } from 'react';
import { Check, ExternalLink, Lock, RefreshCw } from 'lucide-react';
import type { SubscriptionStatus } from '../../subscriptions/public';
import { accountAccessSource, accountAccessTiles, type AccountAccessTile } from '../model/accountDashboard';

export const BOOSTY_SUBSCRIBE_URL = 'https://boosty.to/kolodahearthstone';

export type BoostyConfirmation = {
  email: string;
  code: string;
  step: 'email' | 'code';
  busy: boolean;
  onEmailChange: (value: string) => void;
  onCodeChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
};

export type AccountAccessCardProps = {
  subscription: SubscriptionStatus | null;
  pending: boolean;
  checkedAt: string;
  onRefresh: () => void;
  boosty: BoostyConfirmation;
  patreonLinkUrl: string;
};

function AccessTiles({ tiles }: { tiles: AccountAccessTile[] }) {
  return (
    <ul className="account-access__tiles">
      {tiles.map(tile => (
        <li key={tile.key}>
          {tile.unlocked ? (
            <a className="account-access__tile" href={tile.href}>
              <Check size={18} aria-hidden="true" />
              <span><strong>{tile.title}</strong><small>{tile.description}</small></span>
            </a>
          ) : (
            <span className="account-access__tile account-access__tile--locked">
              <Lock size={18} aria-hidden="true" />
              {tile.title}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

function BoostyForm({ boosty }: { boosty: BoostyConfirmation }) {
  const codeStep = boosty.step === 'code';
  return (
    <form className="account-access__option" data-tour-id="profile-boosty-access" onSubmit={boosty.onSubmit}>
      <strong className="account-access__option-title"><span className="account-brand account-brand--boosty" aria-hidden="true">B</span>Подписаны на Boosty</strong>
      <label htmlFor="account-boosty-email">Почта, на которую оформлена подписка</label>
      <input
        id="account-boosty-email"
        type="email"
        autoComplete="email"
        value={boosty.email}
        onChange={event => boosty.onEmailChange(event.target.value)}
        placeholder="name@example.com"
      />
      {codeStep && (
        <>
          <label htmlFor="account-boosty-code">Код из письма</label>
          <input
            id="account-boosty-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            className="account-access__code"
            value={boosty.code}
            onChange={event => boosty.onCodeChange(event.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
          />
        </>
      )}
      <button type="submit" className="account-button" disabled={boosty.busy}>
        {boosty.busy ? 'Проверяем…' : codeStep ? 'Подтвердить код' : 'Прислать код'}
      </button>
    </form>
  );
}

function NoAccess({ subscription, boosty, patreonLinkUrl }: Pick<AccountAccessCardProps, 'subscription' | 'boosty' | 'patreonLinkUrl'>) {
  const patreon = subscription?.patreon;
  return (
    <>
      <div className="account-access__options">
        <BoostyForm boosty={boosty} />
        {patreon?.configured && (
          <div className="account-access__option">
            <strong className="account-access__option-title"><span className="account-brand account-brand--patreon" aria-hidden="true">P</span>Подписаны на Patreon</strong>
            <p>{patreon.message || 'Подключите аккаунт Patreon, и мы сами увидим подписку.'}</p>
            <a className="account-button account-button--secondary" href={patreonLinkUrl}>
              {patreon.connected ? 'Обновить Patreon' : 'Подключить Patreon'}
            </a>
          </div>
        )}
        <div className="account-access__option account-access__option--subscribe">
          <strong className="account-access__option-title">Ещё не подписаны</strong>
          <p>Оформите подписку и вернитесь сюда: доступ откроется после подтверждения.</p>
          <a className="account-button" href={BOOSTY_SUBSCRIBE_URL} target="_blank" rel="noreferrer">
            Оформить на Boosty <ExternalLink size={16} aria-hidden="true" />
          </a>
        </div>
      </div>
      <h3 className="account-access__subheading">Что откроется</h3>
      <AccessTiles tiles={accountAccessTiles(null)} />
    </>
  );
}

/**
 * The first thing the account answers: which paid sections are open and why.
 * Without access it shows the three ways to open them.
 */
export default function AccountAccessCard({ subscription, pending, checkedAt, onRefresh, boosty, patreonLinkUrl }: AccountAccessCardProps) {
  const active = Boolean(subscription?.hasAccess);
  // A refresh or a Boosty request keeps the last known state on screen.
  const state = pending && !subscription ? 'pending' : active ? 'active' : 'none';
  const source = accountAccessSource(subscription);
  return (
    <section id="account-access" className={`account-card account-access account-access--${state}`} aria-labelledby="account-access-title" data-tour-id="profile-access-status">
      <div className="account-access__head">
        <div className="account-access__summary">
          <span className={`account-pill account-pill--${state}`}>
            {state === 'active' ? <Check size={16} aria-hidden="true" /> : state === 'none' ? <Lock size={16} aria-hidden="true" /> : <RefreshCw size={16} aria-hidden="true" />}
            {state === 'active' ? 'Доступ открыт' : state === 'none' ? 'Доступ закрыт' : 'Проверяем доступ'}
          </span>
          <h2 id="account-access-title">{state === 'none' ? 'Откройте полный доступ' : 'Ваш доступ к HearthPulse'}</h2>
          <p className="account-muted">
            {state === 'pending'
              ? 'Проверяем подписку…'
              : active
                ? [source, `проверено ${checkedAt}`].filter(Boolean).join(' · ')
                : subscription?.message || 'Подписка на Boosty или Patreon открывает тир-листы, мету, библиотеку и все статьи. Уже подписаны — подтвердите это ниже.'}
          </p>
        </div>
        {active && (
          <button type="button" className="account-button account-button--secondary" onClick={onRefresh} disabled={pending}>
            {pending ? 'Проверяем…' : 'Проверить снова'}
          </button>
        )}
      </div>
      {state === 'active' && (
        <>
          <h3 className="account-access__subheading">Что открыто</h3>
          <AccessTiles tiles={accountAccessTiles(subscription).sort((a, b) => Number(b.unlocked) - Number(a.unlocked))} />
        </>
      )}
      {state === 'none' && <NoAccess subscription={subscription} boosty={boosty} patreonLinkUrl={patreonLinkUrl} />}
    </section>
  );
}
