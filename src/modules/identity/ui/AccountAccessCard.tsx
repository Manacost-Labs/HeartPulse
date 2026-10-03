import type { FormEvent } from 'react';
import { AlertTriangle, Check, ExternalLink, Lock, RefreshCw } from 'lucide-react';
import type { SubscriptionStatus } from '../../subscriptions/public';
import AccountBrandIcon from './AccountBrandIcon';
import { accountAccessNote, accountAccessSource, accountAccessTiles, type AccountAccessTile } from '../model/accountDashboard';

const BOOSTY_SUBSCRIBE_URL = 'https://boosty.to/kolodahearthstone';

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
  /** A status, refresh or Boosty request is in flight. */
  loading: boolean;
  /** The first status request has finished, successfully or not. */
  checked: boolean;
  /** The formatted time of the last provider check; empty when there was none. */
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
      <strong className="account-access__option-title"><AccountBrandIcon brand="boosty" />Подписаны на Boosty</strong>
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
            <strong className="account-access__option-title"><AccountBrandIcon brand="patreon" />Подписаны на Patreon</strong>
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

type AccessState = 'pending' | 'unknown' | 'active' | 'none';

const ACCESS_STATES = {
  pending: { Icon: RefreshCw, pill: 'Проверяем доступ', title: 'Ваш доступ к HearthPulse' },
  unknown: { Icon: AlertTriangle, pill: 'Не удалось проверить', title: 'Ваш доступ к HearthPulse' },
  active: { Icon: Check, pill: 'Доступ открыт', title: 'Ваш доступ к HearthPulse' },
  none: { Icon: Lock, pill: 'Доступ закрыт', title: 'Откройте полный доступ' },
} as const;

// Only the first request shows the neutral state: a refresh, a retry or a
// Boosty request keeps the last known state on screen.
function accessState(subscription: SubscriptionStatus | null, checked: boolean): AccessState {
  if (!subscription) return checked ? 'unknown' : 'pending';
  return subscription.hasAccess ? 'active' : 'none';
}

function accessSummary(state: AccessState, subscription: SubscriptionStatus | null, checkedAt: string): string {
  if (state === 'pending') return 'Проверяем подписку…';
  if (state === 'unknown') return 'Не удалось проверить подписку. Попробуйте ещё раз.';
  if (state === 'active') return [accountAccessSource(subscription), checkedAt && `проверено ${checkedAt}`].filter(Boolean).join(' · ');
  return subscription?.message || 'Подписка на Boosty или Patreon открывает тир-листы, мету, библиотеку и все статьи. Уже подписаны — подтвердите это ниже.';
}

/**
 * The first thing the account answers: which paid sections are open and why.
 * Without access it shows the three ways to open them.
 */
export default function AccountAccessCard({ subscription, loading, checked, checkedAt, onRefresh, boosty, patreonLinkUrl }: AccountAccessCardProps) {
  const state = accessState(subscription, checked);
  const { Icon, pill, title } = ACCESS_STATES[state];
  const note = accountAccessNote(subscription);
  const summary = accessSummary(state, subscription, checkedAt);
  return (
    <section id="account-access" className={`account-card account-access account-access--${state}`} aria-labelledby="account-access-title" data-tour-id="profile-access-status">
      <div className="account-access__head">
        <div className="account-access__summary">
          <span className={`account-pill account-pill--${state}`}><Icon size={16} aria-hidden="true" />{pill}</span>
          <h2 id="account-access-title">{title}</h2>
          {summary && <p className="account-muted">{summary}</p>}
          {note && <p className="account-access__note">{note}</p>}
        </div>
        {state !== 'pending' && (
          <button type="button" className="account-button account-button--secondary" onClick={onRefresh} disabled={loading}>
            {loading ? 'Проверяем…' : 'Проверить снова'}
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
      {/* The status check failed, but the Boosty confirmation is a separate request. */}
      {state === 'unknown' && <div className="account-access__options"><BoostyForm boosty={boosty} /></div>}
    </section>
  );
}
