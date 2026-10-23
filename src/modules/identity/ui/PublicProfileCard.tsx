import { useState } from 'react';
import { BadgeCheck, CalendarDays, Check, Copy, Sparkles } from 'lucide-react';
import type { PublicProfile } from '../model/publicProfile';
import { memberSinceLabel } from '../model/publicProfile';
import AuthAvatar from './AuthAvatar';
import './IdentityPlate.css';
import './PublicProfileCard.css';

export type PublicProfileCardProps = {
  profile: PublicProfile;
  onCopyLink: () => Promise<void> | void;
  /** The viewer is signed in: the invitation leads to their own account instead of sign-up. */
  signedIn?: boolean;
};

/** A player without a nickname has no initials of their own; the site's mark stands in. */
const NEUTRAL_PORTRAIT = '/arena-logo-icon-256.webp';

/**
 * The public player card at `/id/<n>/`. It renders only the fields of the
 * public projection; everything here is visible to anyone with the link.
 */
export default function PublicProfileCard({ profile, onCopyLink, signedIn = false }: PublicProfileCardProps) {
  const [copied, setCopied] = useState(false);
  const copyLink = async () => {
    try {
      await onCopyLink();
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      setCopied(false);
    }
  };
  const since = memberSinceLabel(profile.memberSince);
  const CopyIcon = copied ? Check : Copy;

  return (
    <article className="public-profile" aria-labelledby="public-profile-title">
      <header className="identity-plate">
        <AuthAvatar
          user={{
            name: profile.displayName,
            email: '',
            avatarInitials: profile.avatarInitials,
            photoUrl: profile.nickname ? undefined : NEUTRAL_PORTRAIT,
          }}
          size={96}
        />
        <div className="identity-plate__text">
          <p className="identity-plate__eyebrow">Профиль игрока</p>
          <h1 id="public-profile-title">{profile.displayName}</h1>
          {(since || profile.isSubscriber) && (
            <ul className="identity-plate__facts" aria-label="Сведения о профиле">
              {since && <li><CalendarDays size={16} aria-hidden="true" />{since}</li>}
              {profile.isSubscriber && (
                <li className="identity-plate__fact--accent"><BadgeCheck size={16} aria-hidden="true" />Подписчик</li>
              )}
            </ul>
          )}
        </div>
        <div className="identity-plate__actions">
          <button type="button" className="identity-plate__action" onClick={() => { void copyLink(); }}>
            <CopyIcon size={16} aria-hidden="true" />
            {copied ? 'Ссылка скопирована' : 'Скопировать ссылку'}
          </button>
        </div>
      </header>
      <section className="public-profile__about" aria-labelledby="public-profile-about">
        <div className="public-profile__about-text">
          <p className="public-profile__eyebrow"><Sparkles size={14} aria-hidden="true" />HearthPulse</p>
          <h2 id="public-profile-about">Статистика Hearthstone на русском</h2>
          <p>
            Мета, тир-листы и матчапы Стандарта, Арены и Полей сражений. Такая страница есть у каждого
            аккаунта: ник, месяц регистрации и значок подписчика — без почты и контактов.
          </p>
        </div>
        <a className="public-profile__cta" href="/?login">{signedIn ? 'Мой кабинет' : 'Создать свой профиль'}</a>
      </section>
    </article>
  );
}
