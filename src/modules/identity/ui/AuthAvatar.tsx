import type { CSSProperties } from 'react';

export type AvatarUser = {
  name: string;
  email: string;
  avatarInitials?: string;
  photoUrl?: string;
};

function initials(user: AvatarUser): string {
  const raw = user.avatarInitials || user.name || user.email;
  return raw
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('') || 'HS';
}

export default function AuthAvatar({ user, size = 52 }: { user: AvatarUser; size?: number }) {
  const avatarSrc = user.photoUrl?.trim() || '';
  const inset = Math.max(3, Math.round(size * 0.075));
  const avatarStyle = {
    '--auth-avatar-size': `${size}px`,
    '--auth-avatar-inset': `${inset}px`,
    '--auth-avatar-font-size': `${Math.max(11, Math.round(size * 0.32))}px`,
  } as CSSProperties;

  return (
    <span
      className="auth-avatar"
      aria-hidden="true"
      style={avatarStyle}
    >
      <span className="auth-avatar__portrait auth-avatar__initials">
        {initials(user)}
      </span>
      {avatarSrc && (
        <img
          className="auth-avatar__portrait auth-avatar__image"
          src={avatarSrc}
          alt=""
          draggable={false}
          onError={event => { event.currentTarget.style.display = 'none'; }}
        />
      )}
    </span>
  );
}
