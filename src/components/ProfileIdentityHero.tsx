import type { ReactNode } from 'react';
import AuthAvatar from './AuthAvatar';
import './ProfileIdentityHero.css';

export type ProfileIdentityBadge = {
  label: string;
  icon?: ReactNode;
};

type ProfileIdentityHeroProps = {
  eyebrow: string;
  name: string;
  publicProfileId: string;
  avatarInitials?: string;
  photoUrl?: string;
  contact?: string;
  actions?: ReactNode;
  badges?: readonly ProfileIdentityBadge[];
  headingId?: string;
  tourId?: string;
};

/**
 * Shared presentation for private and public identities. Privacy decisions stay
 * with the caller: optional private fields are never inferred or fetched here.
 */
export default function ProfileIdentityHero({
  eyebrow,
  name,
  publicProfileId,
  avatarInitials,
  photoUrl,
  contact,
  actions,
  badges = [],
  headingId = 'profile-identity-title',
  tourId,
}: ProfileIdentityHeroProps) {
  return (
    <section className="profile-hero" aria-labelledby={headingId}>
      <div className="profile-hero__body">
        <AuthAvatar
          user={{ name, email: '', avatarInitials, photoUrl }}
          size={92}
        />
        <div className="profile-hero__identity" data-tour-id={tourId}>
          <p className="profile-hero__eyebrow">{eyebrow}</p>
          <h1 id={headingId}>{name}</h1>
          {contact && <p className="profile-hero__contact">{contact}</p>}
          <p className="profile-hero__id" title={`Публичный ID ${publicProfileId}`}>
            ID <code>/{publicProfileId}</code>
          </p>
          {actions}
          {badges.length > 0 && (
            <div className="profile-status-chips" aria-label="Сведения о профиле">
              {badges.map(badge => (
                <span key={badge.label} className="profile-status-chip">
                  {badge.icon}
                  {badge.label}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
