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
  const inset = Math.max(3, Math.round(size * 0.075));
  const portraitSize = size - (inset * 2);
  const portraitStyle = {
    position: 'absolute' as const,
    inset,
    width: portraitSize,
    height: portraitSize,
    border: '1px solid rgba(255,235,177,.62)',
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
        background: 'conic-gradient(from 18deg,#6c4216,#fff0ae 20%,#8c5a20 34%,#f3ce70 49%,#704315 63%,#f9dc83 78%,#6c4216)',
        border: '1px solid #ffe9ad',
        boxShadow: '0 8px 22px rgba(25,4,9,.4),0 0 0 2px #39180a,0 0 0 3px rgba(230,186,91,.58),inset 0 1px 0 #fff6ce',
        color: '#fff1c8',
        fontFamily: 'var(--font-display)',
        fontSize: Math.max(11, Math.round(size * 0.32)),
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
          background: 'radial-gradient(circle at 30% 18%,rgba(255,245,211,.22),transparent 24%),repeating-conic-gradient(rgba(255,255,255,.045) 0 7deg,transparent 7deg 24deg),radial-gradient(circle,#76539a,#24132f 74%)',
          boxShadow: 'inset 0 0 16px rgba(12,2,7,.55),inset 0 1px 0 rgba(255,248,218,.18)',
          textShadow: '0 2px 0 rgba(38,4,8,.85),0 0 10px rgba(255,220,132,.36)',
        }}
      >
        {initials(user)}
      </span>
      {avatarSrc && (
        <img
          src={avatarSrc}
          alt=""
          style={{ ...portraitStyle, zIndex: 1, objectFit: 'cover', display: 'block', filter: 'saturate(.92) contrast(1.04)' }}
          draggable={false}
          onError={event => { event.currentTarget.style.display = 'none'; }}
        />
      )}
    </span>
  );
}
