import { useState } from 'react';
import { Monitor, Smartphone } from 'lucide-react';
import type { AccountSessionsControl } from '../hooks/useAccountSessions';
import { accountSessionDetail, accountSessionDevice, isHandheldSession } from '../model/accountSessions';

/**
 * Where the account is signed in, inside «Вход и привязки». Another session
 * ends with «Завершить»; all of them at once only after a confirmation. This
 * browser signs out with «Выйти» in the header, which also clears its cookies.
 */
export default function AccountSessions({ control, now = Date.now() }: { control: AccountSessionsControl; now?: number }) {
  const [confirming, setConfirming] = useState(false);
  const { sessions, busy } = control;
  if (!sessions?.length) return null;
  const others = sessions.filter(session => !session.current).length;
  return (
    <div className="account-sessions" role="group" aria-labelledby="account-sessions-title">
      <h3 id="account-sessions-title">Активные сеансы</h3>
      <ul className="account-links__list">
        {sessions.map(session => {
          const Icon = isHandheldSession(session) ? Smartphone : Monitor;
          const device = accountSessionDevice(session);
          return (
            <li key={session.id} className="account-links__row account-sessions__row">
              <span className="account-brand account-brand--mail"><Icon size={18} aria-hidden="true" /></span>
              <span className="account-links__text"><strong>{device}</strong><small>{accountSessionDetail(session, now)}</small></span>
              {session.current
                ? <span className="account-sessions__current">Этот браузер</span>
                : (
                  <button type="button" className="account-button account-button--secondary account-button--small"
                    disabled={busy !== null} aria-label={`Завершить сеанс: ${device}`} onClick={() => control.revoke(session.id)}>
                    {busy === session.id ? 'Завершаем…' : 'Завершить'}
                  </button>
                )}
            </li>
          );
        })}
      </ul>
      {others > 0 && !confirming && (
        <button type="button" className="account-sessions__others" disabled={busy !== null} onClick={() => setConfirming(true)}>
          {busy === 'others' ? 'Завершаем…' : 'Выйти на всех других устройствах'}
        </button>
      )}
      {others > 0 && confirming && (
        <div className="account-sessions__confirm" role="alertdialog" aria-labelledby="account-sessions-confirm">
          <p id="account-sessions-confirm">Завершить все сеансы, кроме этого браузера? На других устройствах придётся войти заново.</p>
          <button type="button" className="account-button account-button--small" autoFocus
            onClick={() => { setConfirming(false); control.revokeOthers(); }}>Завершить</button>
          <button type="button" className="account-button account-button--secondary account-button--small" onClick={() => setConfirming(false)}>Отмена</button>
        </div>
      )}
    </div>
  );
}
