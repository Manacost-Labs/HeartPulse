import { useId, useRef } from 'react';
import ModalSurface from '../../components/ModalSurface/ModalSurface';
import { loginUrlReturningTo } from '../../modules/identity/public';
import SubscriptionPurchaseButtons from '../../components/SubscriptionPurchaseButtons';
import './LegendariesPaidOffer.css';

/**
 * The subscription offer a guest gets by tapping a paid figure. It stays on the
 * page (the class and the chosen group are in the address), so paying and
 * pressing «Проверить доступ» unlocks the same group where it stands.
 */
export function LegendariesPaidOffer({ groupName, returnTo, signedIn, checking, onRefresh, onClose }: {
  groupName: string | null;
  /** The page address with the class and the group, for the sign-in to come back to. */
  returnTo: string;
  signedIn: boolean;
  checking: boolean;
  onRefresh: () => Promise<unknown>;
  onClose: () => void;
}) {
  const titleId = useId();
  const textId = useId();
  const closeRef = useRef<HTMLButtonElement | null>(null);
  return <ModalSurface className="legendaries-offer" panelClassName="legendaries-offer__panel"
    backdropClassName="legendaries-offer__backdrop" ariaLabelledBy={titleId} ariaDescribedBy={textId}
    closeLabel="Закрыть" initialFocusRef={closeRef} onClose={onClose}>
    <div className="legendaries-offer__body" data-testid="legendaries-offer">
      <button ref={closeRef} type="button" className="legendaries-offer__close" aria-label="Закрыть" data-modal-close="">
        <span aria-hidden="true">×</span>
      </button>
      <h2 id={titleId}>Узнать, как часто эту группу предлагают вашему классу</h2>
      <p id={textId}>
        {groupName ? <>Группа «{groupName}». </> : null}
        Частота предложения и оценка ArenaSmith открываются по подписке: Boosty уровня «Любитель Арены» и выше
        или VIP Telegram-канал. Винрейт, частота выбора и состав групп остаются бесплатными.
      </p>
      <SubscriptionPurchaseButtons />
      <div className="legendaries-offer__actions">
        {signedIn
          ? <button type="button" disabled={checking} onClick={() => { void onRefresh(); }}>{checking ? 'Проверяем...' : 'Проверить доступ'}</button>
          : <a href={loginUrlReturningTo(returnTo)}>Уже подписаны? Войти</a>}
      </div>
    </div>
  </ModalSurface>;
}
