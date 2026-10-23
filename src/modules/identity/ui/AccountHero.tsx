import { Check, Globe, Lock, LogOut, RefreshCw, TriangleAlert } from 'lucide-react';
import type { AccountPlanSummary } from '../model/accountPlan';
import type { AuthUser } from '../model/authUser';
import { isNumericPublicProfileId, publicProfilePath } from '../model/publicProfile';
import AuthAvatar from './AuthAvatar';
import './IdentityPlate.css';
import './AccountHero.css';

export type AccountHeroProps = {
  user: AuthUser;
  name: string;
  contact: string;
  plan: AccountPlanSummary;
  onLogout: () => void;
};

const PLAN_ICONS = { active: Check, none: Lock, pending: RefreshCw, unknown: TriangleAlert } as const;
const PLAN_LABELS = { active: 'Подписка активна', none: 'Без подписки', pending: 'Проверяем подписку', unknown: 'Не удалось проверить' } as const;

/**
 * The account's identity plate, shared in look with the public profile: who
 * the reader is and one status pill. The plan's details live in the plan
 * section right below, so the header does not repeat them.
 */
export default function AccountHero({ user, name, contact, plan, onLogout }: AccountHeroProps) {
  const PlanIcon = PLAN_ICONS[plan.state];
  const profileId = user.publicProfileId;
  return (
    <header className="identity-plate account-hero" data-tour-id="profile-summary">
      <AuthAvatar user={{ name, email: '', avatarInitials: user.avatarInitials, photoUrl: user.photoUrl }} size={96} />
      <div className="identity-plate__text">
        <p className="identity-plate__eyebrow">Личный кабинет</p>
        <h1 id="account-title">{name}</h1>
        <ul className="identity-plate__facts" data-tour-id="profile-access-status">
          <li><span className={`account-hero__pill account-hero__pill--${plan.state}`}><PlanIcon size={15} aria-hidden="true" />{PLAN_LABELS[plan.state]}</span></li>
          {contact && <li className="account-hero__contact">{contact}</li>}
        </ul>
      </div>
      <div className="identity-plate__actions account-hero__actions" data-tour-id="profile-account-actions">
        {profileId && isNumericPublicProfileId(profileId) && (
          <a className="identity-plate__action account-hero__action" href={publicProfilePath(profileId)}><Globe size={17} aria-hidden="true" />Мой профиль</a>
        )}
        <button type="button" className="identity-plate__action identity-plate__action--quiet account-hero__action account-logout" onClick={onLogout}><LogOut size={17} aria-hidden="true" />Выйти</button>
      </div>
    </header>
  );
}
