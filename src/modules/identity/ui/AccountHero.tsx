import { Check, Copy, ExternalLink, Lock, LogOut, RefreshCw, TriangleAlert } from 'lucide-react';
import type { AccountPlanSummary } from '../model/accountPlan';
import type { AuthUser } from '../model/authUser';
import AuthAvatar from './AuthAvatar';
import './AccountHero.css';

export type AccountHeroProps = {
  user: AuthUser;
  name: string;
  contact: string;
  plan: AccountPlanSummary;
  publicProfileHref: string;
  linkCopied: boolean;
  onCopyLink: () => void;
  onLogout: () => void;
};

const PLAN_ICONS = { active: Check, none: Lock, pending: RefreshCw, unknown: TriangleAlert } as const;
const PLAN_LABELS = { active: 'Подписка активна', none: 'Без подписки', pending: 'Проверяем', unknown: 'Не удалось проверить' } as const;

/**
 * One cinematic plate for the signed-in reader: who they are, what they pay for
 * and until when, and the few actions about the account itself.
 */
export default function AccountHero({ user, name, contact, plan, publicProfileHref, linkCopied, onCopyLink, onLogout }: AccountHeroProps) {
  const PlanIcon = PLAN_ICONS[plan.state];
  return (
    <header className="account-hero" data-tour-id="profile-summary">
      <div className="account-hero__identity">
        <AuthAvatar user={{ name, email: '', avatarInitials: user.avatarInitials, photoUrl: user.photoUrl }} size={96} />
        <div className="account-hero__text">
          <p className="account-hero__eyebrow">Личный кабинет</p>
          <h1 id="account-title">{name}</h1>
          {contact && <p className="account-hero__contact">{contact}</p>}
        </div>
      </div>
      <div className="account-hero__plan" data-tour-id="profile-access-status">
        <span className={`account-hero__pill account-hero__pill--${plan.state}`}><PlanIcon size={15} aria-hidden="true" />{PLAN_LABELS[plan.state]}</span>
        {plan.state === 'active' && plan.title && <strong className="account-hero__plan-title">{plan.title}</strong>}
        {plan.state === 'none'
          ? <a className="account-hero__plan-line" href="#account-access">Как открыть полный доступ</a>
          : <span className="account-hero__plan-line">{plan.statusLine}</span>}
      </div>
      <div className="account-hero__actions" data-tour-id="profile-account-actions">
        {publicProfileHref && (
          <>
            <a className="account-hero__action" href={publicProfileHref}><ExternalLink size={17} aria-hidden="true" />Публичный профиль</a>
            <button type="button" className="account-hero__action" onClick={onCopyLink}>
              <Copy size={17} aria-hidden="true" />{linkCopied ? 'Ссылка скопирована' : 'Копировать ссылку'}
            </button>
          </>
        )}
        <button type="button" className="account-hero__action account-hero__action--quiet account-logout" onClick={onLogout}><LogOut size={17} aria-hidden="true" />Выйти</button>
      </div>
    </header>
  );
}
