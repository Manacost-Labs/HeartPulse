import { useState, type FormEvent, type ReactNode } from 'react';
import { Eye, EyeOff, Flame } from 'lucide-react';

export type LoginMode = 'login' | 'register' | 'reset';

export type LoginCardValues = {
  name: string;
  country: string;
  email: string;
  password: string;
  code: string;
  newsletter: boolean;
};

export type LoginCardProps = {
  mode: LoginMode;
  step: 'password' | 'code';
  message: { type: 'ok' | 'err'; text: string } | null;
  loading: boolean;
  values: LoginCardValues;
  countries: readonly string[];
  onChange: (patch: Partial<LoginCardValues>) => void;
  onModeChange: (mode: LoginMode) => void;
  onSubmit: (event: FormEvent) => void;
  onEditCredentials: () => void;
  /** Telegram and social sign-in, shown under the login form. */
  providers: ReactNode;
};

const TITLES: Record<LoginMode, string> = {
  login: 'Вход в HearthPulse',
  register: 'Регистрация в HearthPulse',
  reset: 'Восстановление пароля',
};

const INTROS: Record<LoginMode, string> = {
  login: 'Один аккаунт для статистики, статей и конкурсов Манакоста.',
  register: 'Укажите имя, страну и пароль. Почту подтвердим кодом.',
  reset: 'Укажите почту, получите код и задайте новый пароль.',
};

function submitLabel(mode: LoginMode, step: LoginCardProps['step'], loading: boolean): string {
  if (loading) return 'Проверяем…';
  if (step === 'code') return mode === 'reset' ? 'Сменить пароль' : 'Войти';
  return mode === 'register' ? 'Создать аккаунт' : 'Получить код';
}

function PasswordInput({ label, value, onChange, autoComplete }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: 'current-password' | 'new-password';
}) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="login-field login-password-field">
      <span>{label}</span>
      <input type={visible ? 'text' : 'password'} value={value} onChange={event => onChange(event.target.value)} autoComplete={autoComplete} />
      <button type="button" onClick={() => setVisible(current => !current)} aria-label={visible ? 'Скрыть пароль' : 'Показать пароль'}>
        {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
      </button>
    </label>
  );
}

function CredentialFields({ mode, values, countries, onChange }: Pick<LoginCardProps, 'mode' | 'values' | 'countries' | 'onChange'>) {
  return (
    <>
      {mode === 'register' && (
        <>
          <label className="login-field">
            <span>Имя</span>
            <input type="text" value={values.name} onChange={event => onChange({ name: event.target.value })} autoComplete="name" autoFocus />
          </label>
          <label className="login-field">
            <span>Страна</span>
            <select value={values.country} onChange={event => onChange({ country: event.target.value })} required>
              <option value="">Выберите страну</option>
              {countries.map(country => <option key={country} value={country}>{country}</option>)}
            </select>
          </label>
        </>
      )}
      <label className="login-field">
        <span>Почта</span>
        <input type="email" value={values.email} onChange={event => onChange({ email: event.target.value })} placeholder="name@example.com" autoComplete="email" autoFocus={mode !== 'register'} />
      </label>
      {mode !== 'reset' && (
        <PasswordInput
          label="Пароль"
          value={values.password}
          onChange={password => onChange({ password })}
          autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
        />
      )}
      {mode === 'register' && (
        <label className="login-consent">
          <input type="checkbox" checked={values.newsletter} onChange={event => onChange({ newsletter: event.target.checked })} />
          <span>Присылать новости, гайды и обновления HearthPulse на почту. Можно отключить в кабинете.</span>
        </label>
      )}
    </>
  );
}

function CodeFields({ mode, values, onChange, onEditCredentials }: Pick<LoginCardProps, 'mode' | 'values' | 'onChange' | 'onEditCredentials'>) {
  return (
    <>
      <p className="login-code-sent">
        Код отправлен на <b>{values.email}</b>. Если письма нет, проверьте папку «Спам».
      </p>
      <label className="login-field login-code-field">
        <span>Код из письма</span>
        <input
          type="text"
          inputMode="numeric"
          value={values.code}
          onChange={event => onChange({ code: event.target.value.replace(/\D/g, '').slice(0, 6) })}
          placeholder="000000"
          autoComplete="one-time-code"
          autoFocus
        />
      </label>
      {mode === 'reset' && (
        <PasswordInput label="Новый пароль" value={values.password} onChange={password => onChange({ password })} autoComplete="new-password" />
      )}
      <button type="button" onClick={onEditCredentials} className="login-link-button">Изменить почту или пароль</button>
    </>
  );
}

/** The signed-out `/?login` page: sign-in, registration and password reset. State stays in `LoginPanel`. */
export default function LoginCard(props: LoginCardProps) {
  const { mode, step, message, loading, onModeChange } = props;
  return (
    <div className="login-page">
      <section className="login-card" aria-labelledby="login-card-title">
        <div className="login-card__header">
          <div className="login-card__emblem" aria-hidden="true"><Flame size={30} /></div>
          <h1 id="login-card-title" className="login-card__title">{TITLES[mode]}</h1>
          <p className="login-card__intro">{INTROS[mode]}</p>
        </div>
        {message && (
          <div className={`login-message login-message--${message.type}`} role={message.type === 'err' ? 'alert' : 'status'}>
            {message.text}
          </div>
        )}
        {step === 'password' && mode !== 'reset' && (
          <div className="login-mode-tabs" role="group" aria-label="Вход или регистрация">
            {(['login', 'register'] as const).map(item => (
              <button key={item} type="button" onClick={() => onModeChange(item)} className={`login-mode-tab${mode === item ? ' login-mode-tab-active' : ''}`} aria-pressed={mode === item}>
                {item === 'login' ? 'Вход' : 'Регистрация'}
              </button>
            ))}
          </div>
        )}
        <form onSubmit={props.onSubmit} className="login-form">
          {step === 'password' ? <CredentialFields {...props} /> : <CodeFields {...props} />}
          <button type="submit" className="login-submit" disabled={loading}>{submitLabel(mode, step, loading)}</button>
          {step === 'password' && <p className="login-hint">Пришлём на почту код из 6 цифр.</p>}
        </form>
        {step === 'password' && mode === 'login' && props.providers}
        {step === 'password' && mode !== 'register' && (
          <button type="button" onClick={() => onModeChange(mode === 'login' ? 'reset' : 'login')} className="login-link-button login-link-button--footer">
            {mode === 'login' ? 'Забыли пароль?' : 'Вернуться ко входу'}
          </button>
        )}
        <p className="login-legal">
          Продолжая, вы принимаете <a href="/terms/">условия использования</a> и <a href="/privacy/">политику конфиденциальности</a>.
        </p>
      </section>
    </div>
  );
}
