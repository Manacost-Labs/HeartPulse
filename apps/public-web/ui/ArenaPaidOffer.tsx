import { useId, useRef } from 'react';
import ModalSurface from '@/src/components/ModalSurface/ModalSurface';
import SubscriptionPurchaseButtons from '@/src/components/SubscriptionPurchaseButtons';
import { loginUrlReturningTo } from '@/src/modules/identity/public';
import './ArenaPaidOffer.css';

/**
 * The subscription offer a guest opens by tapping a lock on the open tier list
 * or class ranking. The page stays where it is (the class is in the address),
 * so signing in or paying and pressing «Проверить доступ» unlocks the same view.
 * Loaded on that tap, not with the page.
 */
export function ArenaPaidOffer({ title, text, returnTo, signedIn, checking, onRefresh, onClose }: {
  title: string;
  text: string;
  /** The page address with its query, for the sign-in to come back to. */
  returnTo: string;
  signedIn: boolean;
  checking: boolean;
  onRefresh: () => Promise<unknown>;
  onClose: () => void;
}) {
  const titleId = useId();
  const textId = useId();
  const closeRef = useRef<HTMLButtonElement | null>(null);
  return <ModalSurface className="arena-paid-offer" panelClassName="arena-paid-offer__panel"
    backdropClassName="arena-paid-offer__backdrop" ariaLabelledBy={titleId} ariaDescribedBy={textId}
    closeLabel="Закрыть" initialFocusRef={closeRef} onClose={onClose}>
    <div className="arena-paid-offer__body" data-testid="arena-paid-offer">
      <button ref={closeRef} type="button" className="arena-paid-offer__close" aria-label="Закрыть" data-modal-close="">
        <span aria-hidden="true">×</span>
      </button>
      <h2 id={titleId}>{title}</h2>
      <p id={textId}>{text}</p>
      <SubscriptionPurchaseButtons />
      <div className="arena-paid-offer__actions">
        {signedIn
          ? <button type="button" disabled={checking} onClick={() => { void onRefresh(); }}>{checking ? 'Проверяем...' : 'Проверить доступ'}</button>
          : <a href={loginUrlReturningTo(returnTo)}>Уже подписаны? Войти</a>}
      </div>
    </div>
  </ModalSurface>;
}
