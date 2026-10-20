import { LogIn, UserCircle } from 'lucide-react';
import { AuthAvatar, type AuthUser } from '../../modules/identity/public';

// While the session check runs, the button says «Профиль», not that it checks
// access, and the phone menu holds the avatar's place, which a remembered
// viewer's avatar fills before the first client paint (usePublicAccess).
const MOBILE_AVATAR_PENDING = {
  width: 28, height: 28, borderRadius: '50%', flexShrink: 0, background: 'rgba(148, 163, 184, 0.28)',
} as const;

type ProfileState = { user: AuthUser | null; pending: boolean; label: string };

export function HeaderProfileButton({ user, checking = false, variant = 'sidebar' }: { user: AuthUser | null; checking?: boolean; variant?: 'sidebar' | 'mobile' }) {
  const state = { user, pending: checking && !user, label: user || checking ? 'Профиль' : 'Войти' };
  return variant === 'mobile' ? <MobileProfile {...state} /> : <SidebarProfile {...state} />;
}

function MobileProfile({ user, pending, label }: ProfileState) {
  const icon = user ? <AuthAvatar user={user} size={28} />
    : pending ? <span className="arena-mobile-profile-pending" aria-hidden="true" style={MOBILE_AVATAR_PENDING} />
      : <LogIn size={18} className="flex-shrink-0" />;
  return <>{icon}<span aria-busy={pending || undefined}>{label}</span></>;
}

function SidebarProfile({ user, pending, label }: ProfileState) {
  const hint = user?.name && user.name !== 'Пользователь Манакост' ? user.name : 'Личный кабинет';
  const Icon = pending ? UserCircle : LogIn;
  return (
    <span className="arena-sidebar-profile-content" aria-busy={pending || undefined}>
      {user
        ? <span className="arena-sidebar-profile-avatar"><AuthAvatar user={user} size={34} /></span>
        : <span className="arena-sidebar-profile-icon"><Icon size={18} className="opacity-85" /></span>}
      <span className="arena-sidebar-profile-copy">
        <span className="arena-sidebar-profile-label">{label}</span>
        <span className="arena-sidebar-profile-hint">{hint}</span>
      </span>
    </span>
  );
}
