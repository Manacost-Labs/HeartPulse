type AvatarUser = {
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
  const avatarSrc = user.photoUrl || '/assets/manacost-avatar.jpeg';
  return (
    <span
      className="auth-avatar"
      aria-hidden="true"
      style={{
        position: 'relative',
        width: size,
        height: size,
        borderRadius: '50%',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        background: 'radial-gradient(circle at 30% 20%, #e0f2fe, #38bdf8 46%, #0f172a 100%)',
        border: '2px solid rgba(147,197,253,0.86)',
        boxShadow: '0 12px 28px rgba(8,16,32,0.34), inset 0 1px 0 rgba(255,255,255,0.55)',
        color: '#e5eefc',
        fontFamily: 'var(--font-display)',
        fontSize: Math.max(11, Math.round(size * 0.34)),
        fontWeight: 800,
        lineHeight: 1,
        overflow: 'hidden',
      }}
    >
      <span>{initials(user)}</span>
      <img
        src={avatarSrc}
        alt=""
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        draggable={false}
        onError={event => { event.currentTarget.style.display = 'none'; }}
      />
    </span>
  );
}
