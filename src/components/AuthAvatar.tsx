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
  const avatarSrc = user.photoUrl?.trim() || '';
  const inset = Math.max(3, Math.round(size * 0.055));
  const portraitSize = size - (inset * 2);
  const portraitStyle = {
    position: 'absolute' as const,
    inset,
    width: portraitSize,
    height: portraitSize,
    border: '1px solid rgba(255,231,163,.5)',
    borderRadius: '50%',
  };

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
        background: 'conic-gradient(from 24deg,#6f4618,#f5d57a 18%,#936328 34%,#ffe9a4 51%,#7b4f1c 70%,#d7a64b 86%,#6f4618)',
        border: '1px solid rgba(255,231,161,.92)',
        boxShadow: '0 12px 28px rgba(25,4,9,.38),0 0 0 2px rgba(74,25,21,.72),inset 0 1px 0 rgba(255,249,219,.8)',
        color: '#fff1c8',
        fontFamily: 'var(--font-display)',
        fontSize: Math.max(11, Math.round(size * 0.34)),
        fontWeight: 900,
        lineHeight: 1,
        overflow: 'visible',
      }}
    >
      <span
        style={{
          ...portraitStyle,
          display: 'grid',
          placeItems: 'center',
          overflow: 'hidden',
          background: 'radial-gradient(circle at 30% 18%,#9870b8 0%,#4a2f66 45%,#210f30 100%)',
          boxShadow: 'inset 0 0 18px rgba(10,2,15,.45),inset 0 1px 0 rgba(255,255,255,.24)',
          textShadow: '0 2px 0 rgba(30,5,12,.8),0 0 12px rgba(255,227,153,.32)',
        }}
      >
        {initials(user)}
      </span>
      {avatarSrc && (
        <img
          src={avatarSrc}
          alt=""
          style={{ ...portraitStyle, zIndex: 1, objectFit: 'cover', display: 'block' }}
          draggable={false}
          onError={event => { event.currentTarget.style.display = 'none'; }}
        />
      )}
    </span>
  );
}
