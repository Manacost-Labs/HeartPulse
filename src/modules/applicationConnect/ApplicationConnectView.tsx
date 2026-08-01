import type { ReactNode } from 'react';
import {
  AlertTriangle,
  KeyRound,
  MonitorSmartphone,
  ShieldCheck,
  UserRoundCheck,
  XCircle,
} from 'lucide-react';
import {
  SCOPE_LABELS,
  formatConnectExpiry,
  normalizedUserCode,
  type ConnectState,
  type ConnectUser,
  type DeviceAuthorization,
} from './applicationConnectModel';
import './applicationConnect.css';

export type ApplicationConnectViewProps = {
  state: ConnectState;
  userCode: string;
  user: ConnectUser | null;
  authorization: DeviceAuthorization | null;
  errorMessage: string;
  loginPanel?: ReactNode;
  onCodeChange: (value: string) => void;
  onInspect: () => void;
  onApprove: () => void;
  onDeny: () => void;
};

function ConnectionSteps({ current }: { current: 1 | 2 | 3 }) {
  const steps = ['Код устройства', 'Проверка доступа', 'Готово'];
  return (
    <nav className="application-connect__steps" aria-label="Этапы подключения">
      <ol>
        {steps.map((label, index) => {
          const step = (index + 1) as 1 | 2 | 3;
          const complete = step < current;
          return (
            <li
              key={label}
              className={`${step === current ? 'is-current' : ''} ${complete ? 'is-complete' : ''}`.trim()}
              aria-current={step === current ? 'step' : undefined}
            >
              <span aria-hidden="true">{complete ? '✓' : step}</span>
              <strong>{label}</strong>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function ConnectionResult({ state }: { state: 'approved' | 'denied' }) {
  const approved = state === 'approved';
  return (
    <section className={`application-connect__result ${approved ? 'is-approved' : 'is-denied'}`} aria-live="polite">
      <span className="application-connect__result-icon" aria-hidden="true">
        {approved ? <ShieldCheck size={42} /> : <XCircle size={42} />}
      </span>
      <p className="application-connect__result-kicker">{approved ? 'Подключение подтверждено' : 'Запрос отклонён'}</p>
      <h2>{approved ? 'Manacost Tracker подключён' : 'Доступ не предоставлен'}</h2>
      <p>
        {approved
          ? 'Вернитесь в приложение — оно завершит вход автоматически. Эту вкладку уже можно закрыть.'
          : 'Приложение не получило доступ к аккаунту. Можно безопасно закрыть эту вкладку.'}
      </p>
      <span className="application-connect__result-note"><ShieldCheck size={16} /> Пароль и данные входа не передавались</span>
    </section>
  );
}

export function ApplicationConnectView({
  state,
  userCode,
  user,
  authorization,
  errorMessage,
  loginPanel,
  onCodeChange,
  onInspect,
  onApprove,
  onDeny,
}: ApplicationConnectViewProps) {
  const busy = state === 'loading' || state === 'submitting';
  const completed = state === 'approved' || state === 'denied';
  const currentStep: 1 | 2 | 3 = completed ? 3 : authorization ? 2 : 1;
  const initials = user?.avatarInitials || user?.name.trim().slice(0, 2).toLocaleUpperCase('ru') || 'MC';

  return (
    <article className="application-connect" aria-labelledby="application-connect-title">
      <header className="application-connect__header">
        <div className="application-connect__brand">
          <span className="application-connect__brand-mark" aria-hidden="true">
            <img src="/arena-logo-icon-256.webp" alt="" width="88" height="88" />
          </span>
          <div>
            <span className="application-connect__kicker"><ShieldCheck size={18} /> Безопасный вход Manacost</span>
            <h1 id="application-connect-title">Подключить Manacost Tracker</h1>
            <p>
              Подтвердите вход на этом устройстве. Приложение получит отдельный токен,
              а ваш пароль останется только на Manacost.
            </p>
          </div>
        </div>
        <ul className="application-connect__trust" aria-label="Гарантии безопасности">
          <li><KeyRound size={17} /> Пароль не передаётся</li>
          <li><ShieldCheck size={17} /> Доступ можно отозвать</li>
        </ul>
      </header>

      <ConnectionSteps current={currentStep} />

      <div className="application-connect__body" aria-busy={busy}>
        {loginPanel ? (
          <section className="application-connect__login" aria-labelledby="application-connect-login-title">
            <div className="application-connect__section-heading">
              <span aria-hidden="true"><UserRoundCheck size={24} /></span>
              <div>
                <p>Шаг 1 из 2</p>
                <h2 id="application-connect-login-title">Войдите в аккаунт Manacost</h2>
                <small>После входа вы автоматически вернётесь к подтверждению устройства.</small>
              </div>
            </div>
            {loginPanel}
          </section>
        ) : completed ? (
          <ConnectionResult state={state} />
        ) : (
          <>
            <section className="application-connect__code" aria-labelledby="application-connect-code-title">
              <div className="application-connect__section-heading">
                <span aria-hidden="true"><KeyRound size={24} /></span>
                <div>
                  <p>Код подтверждения</p>
                  <h2 id="application-connect-code-title">Введите код из приложения</h2>
                  <small>Сверьте восемь символов с кодом, показанным в Manacost Tracker.</small>
                </div>
              </div>
              <form onSubmit={(event) => { event.preventDefault(); onInspect(); }}>
                <label htmlFor="application-connect-code">Код устройства</label>
                <div>
                  <input
                    id="application-connect-code"
                    name="user_code"
                    value={userCode}
                    onChange={event => onCodeChange(normalizedUserCode(event.target.value))}
                    placeholder="ABCD-2345"
                    autoComplete="one-time-code"
                    inputMode="text"
                    spellCheck={false}
                    maxLength={9}
                    aria-describedby={errorMessage ? 'application-connect-error' : 'application-connect-code-hint'}
                  />
                  <button type="submit" disabled={busy || userCode.length !== 9}>
                    {state === 'loading' && <span className="application-connect__spinner" aria-hidden="true" />}
                    {state === 'loading' ? 'Проверяем…' : 'Проверить код'}
                  </button>
                </div>
                <small id="application-connect-code-hint">Формат: четыре буквы, дефис и четыре символа</small>
              </form>
            </section>

            {state === 'error' && (
              <div id="application-connect-error" className="application-connect__message is-error" role="alert">
                <AlertTriangle size={21} />
                <div><strong>Не удалось продолжить</strong><span>{errorMessage}</span></div>
              </div>
            )}

            {authorization && user && (
              <section className="application-connect__review" aria-labelledby="application-connect-review-title">
                <header className="application-connect__app">
                  <span className="application-connect__app-icon" aria-hidden="true">
                    <img src="/arena-logo-icon-256.webp" alt="" width="64" height="64" />
                  </span>
                  <div>
                    <p>Запрашивает доступ к аккаунту</p>
                    <h2 id="application-connect-review-title">{authorization.clientName}</h2>
                    <span className="application-connect__app-meta">
                      <span><MonitorSmartphone size={15} /> Приложение для компьютера</span>
                      <span><KeyRound size={15} /> Код действует до {formatConnectExpiry(authorization.expiresAt)}</span>
                    </span>
                  </div>
                  <span className="application-connect__verified"><ShieldCheck size={17} /> Проверено Manacost</span>
                </header>

                <div className="application-connect__review-grid">
                  <section className="application-connect__identity" aria-labelledby="application-connect-account-title">
                    <h3 id="application-connect-account-title">Ваш аккаунт</h3>
                    <div>
                      <span className="application-connect__avatar" aria-hidden="true">{initials}</span>
                      <div><strong>{user.name}</strong><small>{user.email}</small></div>
                    </div>
                    <p><UserRoundCheck size={17} /> Подключение будет привязано к этому профилю</p>
                  </section>

                  <section className="application-connect__permissions" aria-labelledby="application-connect-permissions-title">
                    <h3 id="application-connect-permissions-title"><ShieldCheck size={19} /> Разрешения только на чтение</h3>
                    <ul>
                      {authorization.scopes.map(scope => (
                        <li key={scope}><span className="application-connect__scope-check" aria-hidden="true">✓</span><span>{SCOPE_LABELS[scope] ?? scope}</span></li>
                      ))}
                    </ul>
                  </section>
                </div>

                <div className="application-connect__privacy-note">
                  <ShieldCheck size={20} />
                  <p><strong>Ваши данные под контролем</strong><span>Приложение не сможет изменять профиль, подписку или данные сайта.</span></p>
                </div>

                <div className="application-connect__actions">
                  <button type="button" className="is-secondary" onClick={onDeny} disabled={busy}>Отклонить</button>
                  <button type="button" className="is-primary" onClick={onApprove} disabled={busy}>
                    {state === 'submitting' && <span className="application-connect__spinner" aria-hidden="true" />}
                    {state === 'submitting' ? 'Подключаем…' : 'Разрешить подключение'}
                  </button>
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </article>
  );
}
