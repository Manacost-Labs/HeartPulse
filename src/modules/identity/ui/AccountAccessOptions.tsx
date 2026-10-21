import type { FormEvent } from 'react';
import { Check, ExternalLink, Lock } from 'lucide-react';
import type { SubscriptionStatus } from '../../subscriptions/public';
import AccountBrandIcon from './AccountBrandIcon';
import { accountAccessTiles, type AccountAccessTile } from '../model/accountDashboard';

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

/** The paid sections as one row of compact links; the description is the link's tooltip. */
export function AccessTiles({ tiles }: { tiles: AccountAccessTile[] }) {
  return (
    <ul className="account-access__tiles">
      {tiles.map(tile => (
        <li key={tile.key}>
          {tile.unlocked ? (
            <a className="account-access__tile" href={tile.href} title={tile.description}>
              <Check size={16} aria-hidden="true" />
              {tile.title}
            </a>
          ) : (
            <span className="account-access__tile account-access__tile--locked">
              <Lock size={16} aria-hidden="true" />
              {tile.title}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

export function BoostyForm({ boosty }: { boosty: BoostyConfirmation }) {
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

export function NoAccess({ subscription, boosty, patreonLinkUrl }: { subscription: SubscriptionStatus | null; boosty: BoostyConfirmation; patreonLinkUrl: string }) {
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
