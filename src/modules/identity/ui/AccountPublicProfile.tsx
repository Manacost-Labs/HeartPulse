import { useEffect, useState, type FormEvent } from 'react';
import { Copy, Globe } from 'lucide-react';
import type { OwnPublicProfile } from '../model/publicProfile';
import { publicProfilePath } from '../model/publicProfile';
import AccountSectionHead from './AccountSectionHead';
import './AccountPublicProfile.css';

export type AccountPublicProfileProps = {
  /** Null while loading or when unavailable (`failed`). */
  identity: OwnPublicProfile | null;
  failed: boolean;
  saving: boolean;
  saveNickname: (nickname: string) => void;
  /** Shows or hides the statistics and decks on the public page; without it there is no switch. */
  saveStatsVisible?: (visible: boolean) => void;
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
    <li className="account-links__row account-public-profile__link">
      <span className="account-public-profile__link-label">{label}</span>
      <a className="account-public-profile__url" href={href}>{href}</a>
      <button type="button" className="account-button account-button--secondary account-button--small" aria-label={copyLabel} onClick={copy}>
        <Copy size={15} aria-hidden="true" />{copied ? 'Скопировано' : 'Скопировать'}
      </button>
    </li>
  );
}

/**
 * The account's public page as rows of settings: its links with copy
 * buttons, the nickname, and the switch that adds the statistics and decks.
 * The card itself is public for everyone; the games only after the switch.
 */
export default function AccountPublicProfile({ identity, failed, saving, saveNickname, saveStatsVisible, origin }: AccountPublicProfileProps) {
  const [nickname, setNickname] = useState(identity?.nickname ?? '');
  useEffect(() => { setNickname(identity?.nickname ?? ''); }, [identity?.nickname]);
  const siteOrigin = origin ?? (typeof window === 'undefined' ? 'https://hearthpulse.net' : window.location.origin);
  const lockedUntil = identity?.nicknameChangeAvailableAt ? changeDate(identity.nicknameChangeAvailableAt) : '';
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    saveNickname(nickname.trim());
  };

  return (
    <section id="account-public-profile" className="account-section account-public-profile" aria-labelledby="account-public-profile-title">
      <AccountSectionHead
        id="account-public-profile-title"
        icon={<Globe size={15} aria-hidden="true" />}
        eyebrow="Профиль"
        title="Публичный профиль"
        description="По ссылке видны ник, месяц регистрации и значок «Подписчик». Почта, контакты и подписка скрыты."
      />
      {!identity && <p className="account-muted">{failed ? 'Не удалось загрузить ссылку на профиль. Обновите страницу.' : 'Загружаем ссылку…'}</p>}
      {identity && (
        <div className="account-rows">
          <div className="account-row">
            <h3 className="account-row__label">Ссылки</h3>
            <ul className="account-row__body account-links__list account-public-profile__links">
              <ProfileLink label="Короткая" href={new URL(publicProfilePath(identity.publicProfileId), siteOrigin).href} copyLabel="Скопировать короткую ссылку" />
              {identity.nickname && (
                <ProfileLink label="По нику" href={new URL(`/u/${encodeURIComponent(identity.nickname)}/`, siteOrigin).href} copyLabel="Скопировать ссылку по нику" />
              )}
            </ul>
          </div>
          <form className="account-row account-public-profile__nickname" onSubmit={onSubmit}>
            <label className="account-row__label" htmlFor="account-nickname">Ник</label>
            <div className="account-row__body">
              <div className="account-public-profile__field">
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
                <button type="submit" className="account-button" disabled={saving || Boolean(lockedUntil) || nickname.trim() === (identity.nickname ?? '')}>
                  {saving ? 'Сохраняем…' : 'Сохранить ник'}
                </button>
              </div>
              <p id="account-nickname-hint" className="account-row__hint">
                {lockedUntil
                  ? `Ник меняется раз в 30 дней. Следующая смена — ${lockedUntil}.`
                  : '3–24 символа: буквы, цифры, «_» и «-». Менять можно раз в 30 дней.'}
              </p>
            </div>
          </form>
          {saveStatsVisible && (
            <div className="account-row account-public-profile__visibility" data-tour-id="profile-public-stats">
              <span className="account-row__label">Статистика</span>
              <div className="account-row__body">
                {/* A switch, not a checkbox: the choice is saved at once, without a «Сохранить». */}
                <button
                  type="button"
                  role="switch"
                  className="account-switch"
                  aria-checked={identity.statsVisible}
                  aria-describedby="account-public-stats-hint"
                  disabled={saving}
                  onClick={() => saveStatsVisible(!identity.statsVisible)}
                >
                  <span className="account-switch__track" aria-hidden="true"><span className="account-switch__thumb" /></span>
                  Показывать мою статистику и колоды
                </button>
                <p id="account-public-stats-hint" className="account-row__hint">Игры из приложения Hearthpulse; даты — по дням, без времени партий.</p>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
