import { useEffect, useState, type FormEvent } from 'react';
import { Copy, Globe } from 'lucide-react';
import type { OwnPublicProfile } from '../model/publicProfile';
import { publicProfilePath } from '../model/publicProfile';
import AccountSectionHead from './AccountSectionHead';

export type AccountPublicProfileProps = {
  /** Null while loading or when unavailable (`failed`). */
  identity: OwnPublicProfile | null;
  failed: boolean;
  saving: boolean;
  saveNickname: (nickname: string) => void;
  /** Site origin for the shown links; the browser's own origin by default. */
  origin?: string;
};

function changeDate(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
    : '';
}

function ProfileLink({ label, href, copyLabel }: { label: string; href: string; copyLabel: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard?.writeText(href).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    }, () => setCopied(false));
  };
  return (
    <li className="account-links__row">
      <span className="account-links__text">
        <strong>{label}</strong>
        <small><a href={href}>{href}</a></small>
      </span>
      <button type="button" className="account-button account-button--secondary account-button--small" aria-label={copyLabel} onClick={copy}>
        <Copy size={15} aria-hidden="true" />{copied ? 'Ссылка скопирована' : 'Скопировать ссылку'}
      </button>
    </li>
  );
}

/**
 * The account's public page: its links, with copy buttons, and the nickname
 * form. The page is public for everyone without a switch; this section says
 * what is on it so nobody is surprised.
 */
export default function AccountPublicProfile({ identity, failed, saving, saveNickname, origin }: AccountPublicProfileProps) {
  const [nickname, setNickname] = useState(identity?.nickname ?? '');
  useEffect(() => { setNickname(identity?.nickname ?? ''); }, [identity?.nickname]);
  const siteOrigin = origin ?? (typeof window === 'undefined' ? 'https://hearthpulse.net' : window.location.origin);
  const lockedUntil = identity?.nicknameChangeAvailableAt ? changeDate(identity.nicknameChangeAvailableAt) : '';
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    saveNickname(nickname.trim());
  };

  return (
    <section id="account-public-profile" className="account-section account-settings" aria-labelledby="account-public-profile-title">
      <AccountSectionHead
        id="account-public-profile-title"
        icon={<Globe size={15} aria-hidden="true" />}
        eyebrow="Профиль"
        title="Публичный профиль"
        description="Страницу видят все, у кого есть ссылка: ник, месяц регистрации и значок «Подписчик». Почта, контакты, способы входа и детали подписки на ней не показываются."
      />
      {!identity && <p className="account-muted">{failed ? 'Не удалось загрузить ссылку на профиль. Обновите страницу.' : 'Загружаем ссылку…'}</p>}
      {identity && (
        <>
          <ul className="account-links__list">
            <ProfileLink label="Короткая ссылка" href={new URL(publicProfilePath(identity.publicProfileId), siteOrigin).href} copyLabel="Скопировать короткую ссылку" />
            {identity.nickname && (
              <ProfileLink label="Ссылка по нику" href={new URL(`/u/${encodeURIComponent(identity.nickname)}/`, siteOrigin).href} copyLabel="Скопировать ссылку по нику" />
            )}
          </ul>
          <form className="account-settings__form" onSubmit={onSubmit}>
            <div className="account-settings__field">
              <label htmlFor="account-nickname">Ник</label>
              <input
                id="account-nickname"
                value={nickname}
                onChange={event => setNickname(event.target.value)}
                minLength={3}
                maxLength={24}
                autoComplete="nickname"
                spellCheck={false}
                disabled={Boolean(lockedUntil)}
                aria-describedby="account-nickname-hint"
                placeholder="Например, Arena_Master"
              />
              <p id="account-nickname-hint" className="account-muted">
                {lockedUntil
                  ? `Ник можно менять раз в 30 дней. Следующая смена — ${lockedUntil}.`
                  : 'От 3 до 24 символов: латиница или кириллица, цифры, «_» и «-». Менять ник можно раз в 30 дней; старая ссылка по нику работает ещё 90 дней.'}
              </p>
            </div>
            <button type="submit" className="account-button" disabled={saving || Boolean(lockedUntil) || nickname.trim() === (identity.nickname ?? '')}>
              {saving ? 'Сохраняем…' : 'Сохранить ник'}
            </button>
          </form>
        </>
      )}
    </section>
  );
}
