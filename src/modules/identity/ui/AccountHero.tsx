import { Check, Globe, Lock, LogOut, RefreshCw, TriangleAlert } from 'lucide-react';
import type { AccountPlanSummary } from '../model/accountPlan';
import type { AuthUser } from '../model/authUser';
import { isNumericPublicProfileId, publicProfilePath } from '../model/publicProfile';
import AuthAvatar from './AuthAvatar';
import './IdentityPlate.css';
import './AccountHero.css';
import ShareProfileButton from './ShareProfileButton';

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
      {/* Leaving the account is not one of the page's actions: it waits in the frame's corner. */}
      <button type="button" className="account-hero__action account-logout" onClick={onLogout}><LogOut size={16} aria-hidden="true" /><span className="account-logout__label">Выйти</span></button>
      {profileId && isNumericPublicProfileId(profileId) && (
        <div className="identity-plate__actions account-hero__actions" data-tour-id="profile-account-actions">
          {/* Both act on the public page, so they are one plaque with two halves. */}
          <div className="account-hero__plaque" role="group" aria-label="Публичный профиль">
            <a className="account-hero__action account-hero__half" href={publicProfilePath(profileId)}><Globe size={17} aria-hidden="true" />Мой профиль</a>
            <ShareProfileButton
              className="account-hero__action account-hero__half"
              url={typeof window === 'undefined' ? publicProfilePath(profileId) : new URL(publicProfilePath(profileId), window.location.origin).href}
              title={`${name} на HearthPulse`}
            />
          </div>
        </div>
      )}
    </header>
  );
}
