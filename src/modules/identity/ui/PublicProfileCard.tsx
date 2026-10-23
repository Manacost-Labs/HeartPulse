import { useState } from 'react';
import { BadgeCheck, CalendarDays, Copy, Home } from 'lucide-react';
import type { PublicProfile } from '../model/publicProfile';
import { memberSinceLabel } from '../model/publicProfile';
import type { ProfileIdentityBadge } from './ProfileIdentityHero';
import ProfileIdentityHero from './ProfileIdentityHero';
import './IdentityProfile.css';
import './PublicProfilePage.css';

export type PublicProfileCardProps = {
  profile: PublicProfile;
  onCopyLink: () => Promise<void> | void;
};

/**
 * The public player card at `/id/<n>/`. It renders only the fields of the
 * public projection; everything here is visible to anyone with the link.
 */
export default function PublicProfileCard({ profile, onCopyLink }: PublicProfileCardProps) {
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
  const badges: ProfileIdentityBadge[] = [
    ...(since ? [{ label: since, icon: <CalendarDays size={14} aria-hidden="true" /> }] : []),
    ...(profile.isSubscriber ? [{ label: 'Подписчик', icon: <BadgeCheck size={14} aria-hidden="true" /> }] : []),
  ];

  return (
    <div className="profile-workspace public-profile-card-shell">
      <div className="profile-card">
        <ProfileIdentityHero
          eyebrow="Профиль игрока"
          name={profile.displayName}
          publicProfileId={profile.publicProfileId}
          avatarInitials={profile.avatarInitials}
          headingId="public-profile-title"
          actions={(
            <div className="profile-public-link">
              <button type="button" onClick={() => { void copyLink(); }}>
                <Copy size={14} aria-hidden="true" />
                {copied ? 'Ссылка скопирована' : 'Скопировать ссылку'}
              </button>
              <a href="/">
                <Home size={14} aria-hidden="true" />
                На главную
              </a>
            </div>
          )}
          badges={badges}
        />
      </div>
    </div>
  );
}
