import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import '../route-parchment.css';
import {
  CircleDollarSign,
  ChartNoAxesCombined,
  Database,
  ExternalLink,
  Gift,
  Image as ImageIcon,
  LayoutDashboard,
  Link2,
  Mail,
  Menu,
  MessageCircle,
  Newspaper,
  ShieldCheck,
  Sparkles,
  Trophy,
  Users,
  X,
} from 'lucide-react';
import './contests.css';
import {
  ContestAdminReferrals,
  type AdminReferralClick,
  type AdminReferralLink,
  type ReferralDraft,
} from './ContestAdminReferrals';
import { contestSelectionReducer, INITIAL_CONTEST_SELECTION } from './contestSelection';
import { ContestAdminDashboard } from './ContestAdminDashboard';
import {
  ContestAdminArticles,
  type Article,
  type ArticleDraft,
} from './ContestAdminArticles';
import { fileToDataUrl } from './ContestAdminImageUploader';
import {
  ContestAdminGallery,
  type GalleryDraft,
  type GalleryItem,
} from './ContestAdminGallery';
import {
  ContestAdminUsers,
  type AdminUserPatch,
  type AdminUserSearchResult,
} from './ContestAdminUsers';
import {
  ContestAdminBoosty,
  type BoostyAdminStatus,
  type BoostySubscribersPayload,
} from './ContestAdminBoosty';
import { ContestAdminAnalytics } from './ContestAdminAnalytics';
import {
  ContestAdminTelegram,
  type TelegramAccountsPayload,
} from './ContestAdminTelegram';
import {
  ContestAdminMailing,
  EMPTY_MAILING_DRAFT,
  type MailingDraft,
  type MailingOverview,
  type MailingPreviewMode,
  type MailingTemplate,
} from './ContestAdminMailing';
import {
  ContestAdminContests,
  CONTEST_STATUS_OPTIONS,
  type Contest,
  type ContestDraft,
  type ContestEntry,
  type ContestWorkspaceView,
} from './ContestAdminContests';
import { ADMIN_INPUT } from './contestAdminUi';
import {
  adminWorkspaceReducer,
  createAdminWorkspaceState,
  type AdminMessage,
  type AdminWorkspaceSection,
} from './adminWorkspaceState';

const ContestAdminTranslations = React.lazy(async () => {
  const module = await import('./ContestAdminTranslations');
  return { default: module.ContestAdminTranslations };
});
const ContestAdminMechanicTranslations = React.lazy(async () => {
  const module = await import('./ContestAdminMechanicTranslations');
  return { default: module.ContestAdminMechanicTranslations };
});
const ContestAdminStandardOperations = React.lazy(async () => {
  const module = await import('./ContestAdminStandardOperations');
  return { default: module.ContestAdminStandardOperations };
});
const ContestAdminFunDecks = React.lazy(async () => {
  const module = await import('./ContestAdminStandardOperations');
  return { default: module.ContestAdminFunDecks };
});

type AuthUser = {
  id?: string;
  profileId?: string;
  email: string;
  name: string;
  role: 'admin' | 'user' | string;
  country?: string;
  newsletterOptIn?: boolean;
  avatarInitials?: string;
  telegramUsername?: string;
  photoUrl?: string;
  contactVkUrl?: string;
  contactTelegram?: string;
  contactEmail?: string;
  adminAllowed?: boolean;
  contestAdminAllowed?: boolean;
};

type SubscriptionStatus = {
  hasAccess: boolean;
  source: string;
  checkedAt: string | null;
  stale: boolean;
  message: string;
  boosty: Record<string, any>;
  telegram: Record<string, any>;
  entitlements?: Partial<Record<SubscriptionEntitlementKey, boolean>>;
};

type SubscriptionEntitlementKey =
  | 'arena'
  | 'battlegrounds'
  | 'standard'
  | 'contests'
  | 'guidesArchive'
  | 'arenaArticles'
  | 'battlegroundsArticles';

const SUBSCRIPTION_ENTITLEMENT_LABELS: ReadonlyArray<[SubscriptionEntitlementKey, string]> = [
  ['arena', 'Арена'],
  ['battlegrounds', 'Поля Сражений'],
  ['standard', 'Стандарт'],
  ['contests', 'Конкурсы'],
  ['guidesArchive', 'Архив гайдов'],
  ['arenaArticles', 'Статьи Арены'],
  ['battlegroundsArticles', 'Статьи Полей'],
];

function formatDate(iso: string | null): string {
  if (!iso) return 'нет данных';
  const d = new Date(iso);
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatDateTimeInput(value: string | null | undefined): string {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) && !/(Z|[+-]\d{2}:?\d{2})$/i.test(value)) return String(value).slice(0, 16);
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return String(value).slice(0, 16);
  const pad = (num: number) => String(num).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parseDateTimeInput(value: string): Date | null {
  if (!value) return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (match) {
    const [, year, month, day, hour, minute, second = '0'] = match;
    const parsed = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function dateTimeInputToIso(value: string): string {
  if (!value) return '';
  const parsed = parseDateTimeInput(value);
  return parsed && Number.isFinite(parsed.getTime()) ? parsed.toISOString() : value;
}

function addHoursForDateInput(hours: number): string {
  return formatDateTimeInput(new Date(Date.now() + hours * 60 * 60 * 1000).toISOString());
}

function RouteFallback({ minHeight = 520 }: { minHeight?: number }) {
  return <div className="route-fallback" aria-busy="true" aria-label="Загрузка раздела" style={{ minHeight, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8b6c42', fontFamily: 'var(--font-display)' }}>Загрузка...</div>;
}

const CONTEST_ADMIN_USER_ID = 'user_42368c85b8de';

function isContestAdminUser(user: AuthUser | null | undefined): boolean {
  return Boolean(user && (user.contestAdminAllowed || user.adminAllowed || user.id === CONTEST_ADMIN_USER_ID || user.profileId === CONTEST_ADMIN_USER_ID));
}

function authJsonHeaders(): HeadersInit {
  return { 'Content-Type': 'application/json', 'X-CSRF-Request': '1' };
}

const SAME_ORIGIN: RequestCredentials = 'same-origin';

function contestStatusLabel(status: string): string {
  if (status === 'approved') return 'Одобрено';
  if (status === 'pending') return 'На проверке';
  if (status === 'completed') return 'Завершен';
  if (status === 'planned') return 'Скоро';
  if (status === 'draft') return 'Черновик';
  if (status === 'cancelled') return 'Отменен';
  return 'Активен';
}

function parseWinnerIds(value: string): string[] {
  return Array.from(new Set(value.split(/[\n,;]/).map(item => item.trim()).filter(Boolean)));
}

const ContestCard: React.FC<{
  contest: Contest;
  authUser: AuthUser | null;
  subscriptionStatus: SubscriptionStatus | null;
  subscriptionLoading: boolean;
  joining?: boolean;
  onJoin: (contestId: string) => void | Promise<void>;
}> = ({
  contest,
  authUser,
  subscriptionStatus,
  subscriptionLoading,
  joining,
  onJoin,
}) => {
  const joined = contest.entry?.status === 'approved';
  const completed = contest.status === 'completed';
  const planned = contest.status === 'planned';
  const hasSubscription = Boolean(subscriptionStatus?.hasAccess);
  const buttonLabel = joined
    ? 'Участие подтверждено'
    : completed
      ? 'Конкурс завершен'
      : planned
        ? 'Ожидает старта'
        : joining || subscriptionLoading
          ? 'Проверяем подписку...'
          : hasSubscription
            ? 'Участвовать'
            : 'Нужна подписка';
  return (
    <article className="contest-card">
      {contest.imageUrl ? (
        <img className="contest-card-image" src={contest.imageUrl} alt="" loading="lazy" />
      ) : (
        <div className="contest-card-image contest-card-image-empty"><Gift size={38} /></div>
      )}
      <div className="contest-card-body">
        <div className="contest-card-kicker">
          <span>{contestStatusLabel(contest.status)}</span>
          {contest.prize && <span>{contest.prize}</span>}
        </div>
        <h3>{contest.title}</h3>
        <p>{contest.description || 'Подписчики Манакоста могут подать заявку на участие.'}</p>
        <div className="contest-card-meta">
          {contest.endsAt && <span>Итоги: {formatDate(contest.endsAt)}</span>}
          {contest.entry && <span>Заявка: {contestStatusLabel(contest.entry.status)}</span>}
        </div>
        {completed && contest.winners.length > 0 && (
          <div className="contest-winners">
            <strong>ID победителей</strong>
            <div>{contest.winners.map(id => <code key={id}>{id}</code>)}</div>
          </div>
        )}
        {!authUser ? (
          <a className="contest-primary-button" href="/?login">Войдите для участия</a>
        ) : (
          <button
            type="button"
            className="contest-primary-button"
            disabled={joined || completed || planned || joining || subscriptionLoading}
            onClick={() => onJoin(contest.id)}
          >
            {buttonLabel}
          </button>
        )}
      </div>
    </article>
  );
};

export function ContestsPage({
  authUser,
  subscriptionStatus,
  subscriptionLoading,
  onRefreshSubscription,
}: {
  authUser: AuthUser | null;
  subscriptionStatus: SubscriptionStatus | null;
  subscriptionLoading: boolean;
  onRefreshSubscription: () => Promise<SubscriptionStatus | null>;
}) {
  const [contests, setContests] = useState<Contest[]>([]);
  const [loading, setLoading] = useState(true);
  const [joiningId, setJoiningId] = useState('');
  const [message, setMessage] = useState<AdminMessage | null>(null);

  const loadContests = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/contests', { headers: authJsonHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Не удалось загрузить конкурсы');
      setContests(Array.isArray(data.contests) ? data.contests : []);
    } catch (err: any) {
      setMessage({ type: 'err', text: err.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadContests(); }, [loadContests, authUser?.id]);

  const joinContest = async (contestId: string) => {
    setJoiningId(contestId);
    setMessage(null);
    try {
      const status = subscriptionStatus?.hasAccess ? subscriptionStatus : await onRefreshSubscription();
      if (!status?.hasAccess) {
        throw new Error(status?.message || 'Участие в конкурсах доступно подписчикам Манакоста.');
      }
      const res = await fetch(`/api/contests/${encodeURIComponent(contestId)}/join`, {
        method: 'POST',
        headers: authJsonHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Не удалось подать заявку');
      setMessage({ type: 'ok', text: 'Заявка одобрена. Вы участвуете в конкурсе.' });
      void onRefreshSubscription();
      await loadContests();
    } catch (err: any) {
      setMessage({ type: 'err', text: err.message });
    } finally {
      setJoiningId('');
    }
  };

  return (
    <section className="contests-page">
      <div className="contest-hero">
        <div>
          <p className="contest-eyebrow">Manacost</p>
          <h1>Конкурсы</h1>
          <p>
            Здесь будут проходить розыгрыши для подписчиков: игровая валюта, бонусы и другие призы.
            Нажмите “Участвовать”, система проверит подписку и подтвердит заявку автоматически.
          </p>
        </div>
        <div className="contest-access-card">
          <span>Статус доступа</span>
          <strong>{subscriptionLoading ? 'Проверяем...' : subscriptionStatus?.hasAccess ? 'Подписка активна' : authUser ? 'Нужна подписка' : 'Нужен вход'}</strong>
          <button type="button" onClick={() => void onRefreshSubscription()} disabled={!authUser || subscriptionLoading}>
            Обновить
          </button>
        </div>
      </div>

      {message && <div className={`contest-message contest-message-${message.type}`}>{message.text}</div>}

      <div className="contest-steps">
        <div><strong>1</strong><span>Выберите конкурс</span></div>
        <div><strong>2</strong><span>Система проверит подписку</span></div>
        <div><strong>3</strong><span>После завершения появятся ID победителей</span></div>
      </div>

      {loading ? (
        <RouteFallback minHeight={260} />
      ) : contests.length ? (
        <div className="contest-grid">
          {contests.map(contest => (
            <ContestCard
              key={contest.id}
              contest={contest}
              authUser={authUser}
              subscriptionStatus={subscriptionStatus}
              subscriptionLoading={subscriptionLoading}
              joining={joiningId === contest.id}
              onJoin={joinContest}
            />
          ))}
        </div>
      ) : (
        <div className="contest-empty">
          <Gift size={34} />
          <strong>Сейчас активных конкурсов нет</strong>
          <span>Когда конкурс будет создан, он появится на этой странице.</span>
        </div>
      )}
    </section>
  );
}

const ADMIN_NAV_ITEMS: ReadonlyArray<{
  id: AdminWorkspaceSection;
  label: string;
  caption: string;
  status: string;
  group: string;
  icon: React.ElementType;
}> = [
  { id: 'dashboard', label: 'Обзор', caption: 'Состояние проекта и быстрые действия', status: 'Сводка проекта', group: 'Рабочий стол', icon: LayoutDashboard },
  { id: 'articles', label: 'Статьи', caption: 'Публикации, раздел и доступ', status: 'Сохранение по кнопке', group: 'Контент', icon: Newspaper },
  { id: 'gallery', label: 'Галерея', caption: 'Арты и оригиналы для скачивания', status: 'Сохранение по кнопке', group: 'Контент', icon: ImageIcon },
  { id: 'translations', label: 'Переводы', caption: 'Названия архетипов и синхронизация BlizzCore', status: 'Ручные правки защищены', group: 'Контент', icon: Newspaper },
  { id: 'mechanics', label: 'Механики и теги', caption: 'Русские переводы, примеры карт и контроль покрытия', status: 'Сохранение по кнопке', group: 'Контент', icon: Newspaper },
  { id: 'standard-data', label: 'Данные и парсеры', caption: 'Режим меты, автообновление и очереди', status: 'Центр управления данными', group: 'Система', icon: Database },
  { id: 'fun-decks', label: 'Фановые колоды', caption: 'Off-meta подборка и коды колод', status: 'Обновляется автоматически', group: 'Система', icon: Sparkles },
  { id: 'users', label: 'Пользователи', caption: 'Права, блокировки и контакты', status: 'Действия с подтверждением', group: 'Аудитория', icon: Users },
  { id: 'mailing', label: 'Рассылка', caption: 'Письма, шаблоны и история отправок', status: 'Безопасная очередь отправки', group: 'Аудитория', icon: Mail },
  { id: 'boosty', label: 'Boosty', caption: 'Подписчики и уровни доступа', status: 'Данные только для просмотра', group: 'Аудитория', icon: CircleDollarSign },
  { id: 'analytics', label: 'Аналитика', caption: 'Статьи, подписки, выручка и удержание', status: 'Наблюдаемые данные Boosty', group: 'Аудитория', icon: ChartNoAxesCombined },
  { id: 'telegram', label: 'Telegram', caption: 'Аккаунты и проверка доступа', status: 'Данные только для просмотра', group: 'Аудитория', icon: MessageCircle },
  { id: 'contests', label: 'Конкурсы', caption: 'Заявки, статусы и победители', status: 'Сохранение по кнопке', group: 'Рост', icon: Trophy },
  { id: 'referrals', label: 'Реферальные ссылки', caption: 'Кампании и статистика кликов', status: 'Сохранение по кнопке', group: 'Рост', icon: Link2 },
];

const ADMIN_USERS_PAGE_SIZE = 20;
const ADMIN_ARTICLES_PAGE_SIZE = 12;
const ADMIN_ENTRIES_PAGE_SIZE = 20;
const ADMIN_WORKSPACE_SECTION_IDS: AdminWorkspaceSection[] = [
  'dashboard',
  'articles',
  'gallery',
  'translations',
  'mechanics',
  'standard-data',
  'fun-decks',
  'users',
  'mailing',
  'boosty',
  'analytics',
  'telegram',
  'contests',
  'referrals',
];

function adminSectionFromLocation(defaultSection: AdminWorkspaceSection): AdminWorkspaceSection {
  const params = new URLSearchParams(window.location.search);
  const requestedSection = params.get('section');
  if (requestedSection === 'list') return 'articles';
  if (requestedSection && ADMIN_WORKSPACE_SECTION_IDS.includes(requestedSection as AdminWorkspaceSection)) {
    return requestedSection as AdminWorkspaceSection;
  }
  if (params.has('contest') || params.has('contests')) return 'contests';
  return defaultSection;
}

function subscriptionEntitlementLabels(subscription: { hasAccess?: boolean; entitlements?: SubscriptionStatus['entitlements'] } | null | undefined): string[] {
  if (!subscription?.entitlements) return subscription?.hasAccess ? ['Все разделы'] : [];
  const labels: string[] = [];
  for (const [key, label] of SUBSCRIPTION_ENTITLEMENT_LABELS) {
    if (subscription.entitlements[key]) labels.push(label);
  }
  return labels;
}

async function uploadGalleryArtFile(file: File, metadata: { title: string; description: string; tag: string; source: string }): Promise<GalleryItem> {
  if (!file.type.startsWith('image/')) throw new Error('Можно загружать только изображения');
  const dataUrl = await fileToDataUrl(file);
  const res = await fetch('/api/admin/gallery', {
    method: 'POST',
    headers: authJsonHeaders(),
    body: JSON.stringify({ ...metadata, dataUrl }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Не удалось загрузить арт');
  return data.item as GalleryItem;
}

export function ContestAdminPanel({ authUser, authChecking = false }: { authUser: AuthUser | null; authChecking?: boolean }) {
  const allowed = isContestAdminUser(authUser);
  const hasFullAdminAccess = Boolean(authUser && (authUser.adminAllowed || authUser.role === 'admin'));
  const [contests, setContests] = useState<Contest[]>([]);
  const [entries, setEntries] = useState<ContestEntry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [contestSelection, dispatchContestSelection] = useReducer(contestSelectionReducer, INITIAL_CONTEST_SELECTION);
  const { contestId: selectedContestId, winnersText } = contestSelection;
  const [contestStatusFilter, setContestStatusFilter] = useState('all');
  const [contestWorkspaceView, setContestWorkspaceView] = useState<ContestWorkspaceView>('manage');
  const [userQuery, setUserQuery] = useState('');
  const [usersPage, setUsersPage] = useState(1);
  const [users, setUsers] = useState<AdminUserSearchResult[]>([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersReloadKey, setUsersReloadKey] = useState(0);
  const [userActionId, setUserActionId] = useState('');
  const [mailingOverview, setMailingOverview] = useState<MailingOverview | null>(null);
  const [mailingLoading, setMailingLoading] = useState(false);
  const [mailingDraft, setMailingDraft] = useState<MailingDraft>(EMPTY_MAILING_DRAFT);
  const [mailingPreviewHtml, setMailingPreviewHtml] = useState('');
  const [mailingPreviewCount, setMailingPreviewCount] = useState(0);
  const [mailingPreviewMode, setMailingPreviewMode] = useState<MailingPreviewMode>('desktop');
  const [mailingPreviewLoading, setMailingPreviewLoading] = useState(false);
  const [mailingSending, setMailingSending] = useState(false);
  const [mailingTesting, setMailingTesting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<ContestDraft>({
    id: '',
    title: '',
    prize: '',
    imageUrl: '',
    startsAt: '',
    endsAt: '',
    status: 'active',
    description: '',
  });
  const initialAdminSection = (() => {
    const requested = adminSectionFromLocation(hasFullAdminAccess ? 'dashboard' : 'contests');
    return hasFullAdminAccess || requested === 'contests' ? requested : 'contests';
  })();
  const [adminWorkspace, dispatchAdminWorkspace] = useReducer(
    adminWorkspaceReducer,
    createAdminWorkspaceState(initialAdminSection),
  );
  const {
    section: adminSection,
    adminMenuOpen,
    openUserMenuId,
    message,
  } = adminWorkspace;
  const setMessage = useCallback((nextMessage: AdminMessage | null) => {
    dispatchAdminWorkspace({ type: 'setMessage', message: nextMessage });
  }, []);
  const [adminArticles, setAdminArticles] = useState<Article[]>([]);
  const [articleQuery, setArticleQuery] = useState('');
  const [articlePage, setArticlePage] = useState(1);
  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([]);
  const [galleryFile, setGalleryFile] = useState<File | null>(null);
  const [galleryUploading, setGalleryUploading] = useState(false);
  const [galleryDeletingId, setGalleryDeletingId] = useState('');
  const [referrals, setReferrals] = useState<AdminReferralLink[]>([]);
  const [referralClicks, setReferralClicks] = useState<AdminReferralClick[]>([]);
  const [articleForm, setArticleForm] = useState<ArticleDraft>({
    title: '',
    tag: '',
    date: '',
    excerpt: '',
    mode: 'arena',
    image: '',
    url: '',
  });
  const [galleryForm, setGalleryForm] = useState<GalleryDraft>({
    title: '',
    tag: '',
    description: '',
    source: '',
  });
  const [editingArticleId, setEditingArticleId] = useState('');
  const [boostyStatus, setBoostyStatus] = useState<BoostyAdminStatus | null>(null);
  const [boostyStatusLoading, setBoostyStatusLoading] = useState(false);
  const [boostySubscribers, setBoostySubscribers] = useState<BoostySubscribersPayload | null>(null);
  const [boostySubscribersLoading, setBoostySubscribersLoading] = useState(false);
  const [telegramAccounts, setTelegramAccounts] = useState<TelegramAccountsPayload | null>(null);
  const [telegramAccountsLoading, setTelegramAccountsLoading] = useState(false);

  const entriesRequestRef = useRef(0);
  const adminMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const adminNavRef = useRef<HTMLElement | null>(null);
  const articleFormRef = useRef<HTMLFormElement | null>(null);
  const articleListRef = useRef<HTMLDivElement | null>(null);
  const contestFormRef = useRef<HTMLFormElement | null>(null);
  const galleryFileInputRef = useRef<HTMLInputElement | null>(null);
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const userMenuTriggerMap = useMemo(() => new Map<string, HTMLButtonElement>(), []);
  const mailingPreviewRequestRef = useRef(0);
  const mailingDraftDirtyRef = useRef(false);

  const changeAdminSection = useCallback((section: AdminWorkspaceSection, options?: { replace?: boolean }) => {
    const nextSection = hasFullAdminAccess || section === 'contests' ? section : 'contests';
    dispatchAdminWorkspace({ type: 'navigate', section: nextSection });

    const url = new URL(window.location.href);
    const alreadyActive = url.searchParams.get('section') === nextSection;
    url.searchParams.set('section', nextSection);
    const method = options?.replace || alreadyActive ? 'replaceState' : 'pushState';
    window.history[method]({ adminSection: nextSection }, '', `${url.pathname}${url.search}${url.hash}`);
  }, [hasFullAdminAccess]);

  useEffect(() => {
    if (authChecking || !allowed) return;
    const requested = adminSectionFromLocation(hasFullAdminAccess ? 'dashboard' : 'contests');
    changeAdminSection(hasFullAdminAccess || requested === 'contests' ? requested : 'contests', { replace: true });
  }, [allowed, authChecking, changeAdminSection, hasFullAdminAccess]);

  useEffect(() => {
    const handlePopState = () => {
      const requested = adminSectionFromLocation(hasFullAdminAccess ? 'dashboard' : 'contests');
      dispatchAdminWorkspace({
        type: 'navigate',
        section: hasFullAdminAccess || requested === 'contests' ? requested : 'contests',
      });
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [hasFullAdminAccess]);

  useEffect(() => {
    if (!adminMenuOpen) return;
    const menuButton = adminMenuButtonRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusable = (): HTMLElement[] => {
      const menu = adminNavRef.current;
      return menu ? Array.from(menu.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]')) : [];
    };
    const focusFrame = window.requestAnimationFrame(() => focusable()[0]?.focus());
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        dispatchAdminWorkspace({ type: 'closeAdminMenu' });
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      window.requestAnimationFrame(() => menuButton?.focus());
    };
  }, [adminMenuOpen]);

  useEffect(() => {
    if (!openUserMenuId) return;
    const closeMenu = (restoreFocus: boolean) => {
      const trigger = userMenuTriggerMap.get(openUserMenuId);
      dispatchAdminWorkspace({ type: 'closeUserMenu' });
      if (restoreFocus) trigger?.focus({ preventScroll: true });
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (!userMenuRef.current?.contains(event.target as Node)
        && !userMenuTriggerMap.get(openUserMenuId)?.contains(event.target as Node)) {
        closeMenu(false);
      }
    };
    const handleFocusIn = (event: FocusEvent) => {
      const target = event.target as Node;
      if (!userMenuRef.current?.contains(target) && !userMenuTriggerMap.get(openUserMenuId)?.contains(target)) {
        dispatchAdminWorkspace({ type: 'closeUserMenu' });
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeMenu(true);
        return;
      }
      if (event.key === 'Tab') {
        event.preventDefault();
        const trigger = userMenuTriggerMap.get(openUserMenuId);
        const focusable = Array.from(document.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        )).filter(item => !userMenuRef.current?.contains(item) && (item.offsetWidth > 0 || item.offsetHeight > 0));
        const triggerIndex = trigger ? focusable.indexOf(trigger) : -1;
        const targetIndex = event.shiftKey
          ? Math.max(0, triggerIndex - 1)
          : Math.min(focusable.length - 1, triggerIndex + 1);
        const target = focusable[targetIndex] || trigger;
        dispatchAdminWorkspace({ type: 'closeUserMenu' });
        target?.focus({ preventScroll: true });
        return;
      }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      const items: HTMLButtonElement[] = userMenuRef.current
        ? Array.from(userMenuRef.current.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'))
        : [];
      if (!items.length) return;
      event.preventDefault();
      const currentIndex = Math.max(0, items.indexOf(document.activeElement as HTMLButtonElement));
      const nextIndex = event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? items.length - 1
          : event.key === 'ArrowDown'
            ? (currentIndex + 1) % items.length
            : (currentIndex - 1 + items.length) % items.length;
      items[nextIndex]?.focus();
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('focusin', handleFocusIn);
    window.requestAnimationFrame(() => userMenuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus());
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('focusin', handleFocusIn);
    };
  }, [openUserMenuId, userMenuTriggerMap]);

  useEffect(() => {
    if (!allowed) return;
    const labels: Record<AdminWorkspaceSection, string> = {
      dashboard: 'Обзор',
      articles: 'Статьи',
      gallery: 'Галерея',
      translations: 'Переводы архетипов',
      mechanics: 'Переводы механик и тегов',
      'standard-data': 'Данные и парсеры',
      'fun-decks': 'Фановые колоды',
      users: 'Пользователи',
      mailing: 'Рассылка',
      boosty: 'Boosty',
      analytics: 'Аналитика',
      telegram: 'Telegram',
      contests: 'Конкурсы',
      referrals: 'Реферальные ссылки',
    };
    document.title = `${labels[adminSection]} — Админка | Manacost Stats`;
  }, [adminSection, allowed]);

  const loadAdminContests = useCallback(async (preferredContestId?: string) => {
    if (!allowed) return;
    setLoading(true);
    try {
      const res = await fetch('/api/admin/contests', { headers: authJsonHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Не удалось загрузить конкурсы');
      const list = Array.isArray(data.contests) ? data.contests : [];
      setContests(list);
      dispatchContestSelection({ type: 'sync', contests: list, preferredContestId });
    } catch (err: any) {
      setMessage({ type: 'err', text: err.message });
    } finally {
      setLoading(false);
    }
  }, [allowed]);

  useEffect(() => { void loadAdminContests(); }, [loadAdminContests]);

  const loadAdminArticles = useCallback(async () => {
    if (!hasFullAdminAccess) return;
    try {
      const res = await fetch(`/api/articles?t=${Date.now()}`, { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Не удалось загрузить статьи');
      setAdminArticles(Array.isArray(data.articles) ? data.articles : []);
    } catch (err: any) {
      setMessage({ type: 'err', text: err.message });
    }
  }, [hasFullAdminAccess]);

  const loadGalleryItems = useCallback(async () => {
    if (!hasFullAdminAccess) return;
    try {
      const res = await fetch(`/api/admin/gallery?t=${Date.now()}`, { headers: authJsonHeaders(), cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Не удалось загрузить галерею');
      setGalleryItems(Array.isArray(data.items) ? data.items : []);
    } catch (err: any) {
      setMessage({ type: 'err', text: err.message });
    }
  }, [hasFullAdminAccess]);

  const loadReferrals = useCallback(async () => {
    if (!hasFullAdminAccess) return;
    try {
      const res = await fetch(`/api/admin/referrals?t=${Date.now()}`, { headers: authJsonHeaders(), cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Не удалось загрузить реферальные ссылки');
      setReferrals(Array.isArray(data.referrals) ? data.referrals : []);
      setReferralClicks(Array.isArray(data.recentClicks) ? data.recentClicks : []);
    } catch (err: any) {
      setMessage({ type: 'err', text: err.message });
    }
  }, [hasFullAdminAccess]);

  const loadBoostyStatus = useCallback(async () => {
    if (!hasFullAdminAccess) return;
    setBoostyStatusLoading(true);
    try {
      const res = await fetch(`/api/admin/boosty/status?t=${Date.now()}`, {
        headers: authJsonHeaders(),
        cache: 'no-store',
        credentials: SAME_ORIGIN,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Не удалось загрузить статус Boosty');
      setBoostyStatus(data as BoostyAdminStatus);
    } catch (err: any) {
      setBoostyStatus({
        configured: true,
        ok: false,
        importStatus: 'error',
        source: 'admin-panel',
        stale: true,
        snapshotAgeSeconds: null,
        lastErrorCategory: 'admin-request-failed',
        lastErrorMessage: err?.message || 'Не удалось загрузить статус Boosty',
        warnings: ['admin-request-failed'],
        summary: {},
        checkedAt: new Date().toISOString(),
        graceHours: 24,
      });
    } finally {
      setBoostyStatusLoading(false);
    }
  }, [hasFullAdminAccess]);

  const loadBoostySubscribers = useCallback(async () => {
    if (!hasFullAdminAccess) return;
    setBoostySubscribersLoading(true);
    try {
      const res = await fetch(`/api/admin/boosty/subscribers?includeInactive=1&t=${Date.now()}`, {
        headers: authJsonHeaders(),
        cache: 'no-store',
        credentials: SAME_ORIGIN,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Не удалось загрузить подписчиков Boosty');
      setBoostySubscribers({
        configured: Boolean(data.configured),
        source: String(data.source || ''),
        stale: Boolean(data.stale),
        summary: data.summary && typeof data.summary === 'object' ? data.summary : {},
        levels: data.levels && typeof data.levels === 'object' ? data.levels : {},
        subscribers: Array.isArray(data.subscribers) ? data.subscribers : [],
        fetchedAt: String(data.fetchedAt || new Date().toISOString()),
        error: data.error ? String(data.error) : undefined,
      });
    } catch (err: any) {
      setBoostySubscribers({
        configured: true,
        source: 'admin-panel',
        stale: true,
        summary: {},
        levels: {},
        subscribers: [],
        fetchedAt: new Date().toISOString(),
        error: err?.message || 'Не удалось загрузить подписчиков Boosty',
      });
    } finally {
      setBoostySubscribersLoading(false);
    }
  }, [hasFullAdminAccess]);

  const loadTelegramAccounts = useCallback(async () => {
    if (!hasFullAdminAccess) return;
    setTelegramAccountsLoading(true);
    try {
      const res = await fetch(`/api/admin/telegram/accounts?t=${Date.now()}`, {
        headers: authJsonHeaders(),
        cache: 'no-store',
        credentials: SAME_ORIGIN,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Не удалось загрузить Telegram-аккаунты');
      setTelegramAccounts({
        configured: Boolean(data.configured),
        chatIds: Array.isArray(data.chatIds) ? data.chatIds.map(String) : [],
        summary: data.summary && typeof data.summary === 'object'
          ? {
            total: Number(data.summary.total || 0),
            access: Number(data.summary.access || 0),
            checkable: Number(data.summary.checkable || 0),
            contactOnly: Number(data.summary.contactOnly || 0),
            stale: Number(data.summary.stale || 0),
            blocked: Number(data.summary.blocked || 0),
          }
          : { total: 0, access: 0, checkable: 0, contactOnly: 0, stale: 0, blocked: 0 },
        accounts: Array.isArray(data.accounts) ? data.accounts : [],
        fetchedAt: String(data.fetchedAt || new Date().toISOString()),
        error: data.error ? String(data.error) : undefined,
      });
    } catch (err: any) {
      setTelegramAccounts({
        configured: true,
        chatIds: [],
        summary: { total: 0, access: 0, checkable: 0, contactOnly: 0, stale: 0, blocked: 0 },
        accounts: [],
        fetchedAt: new Date().toISOString(),
        error: err?.message || 'Не удалось загрузить Telegram-аккаунты',
      });
    } finally {
      setTelegramAccountsLoading(false);
    }
  }, [hasFullAdminAccess]);

  const loadMailingOverview = useCallback(async (options?: { quiet?: boolean }) => {
    if (!hasFullAdminAccess) return;
    if (!options?.quiet) setMailingLoading(true);
    try {
      const res = await fetch(`/api/admin/mailings/overview?t=${Date.now()}`, {
        headers: authJsonHeaders(),
        cache: 'no-store',
        credentials: SAME_ORIGIN,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Не удалось загрузить рассылку');
      setMailingOverview(data as MailingOverview);
    } catch (err: any) {
      if (!options?.quiet) setMessage({ type: 'err', text: err?.message || 'Не удалось загрузить рассылку' });
    } finally {
      if (!options?.quiet) setMailingLoading(false);
    }
  }, [hasFullAdminAccess]);

  const requestMailingPreview = useCallback(async (draft: MailingDraft, options?: { quiet?: boolean }) => {
    const requestId = ++mailingPreviewRequestRef.current;
    if (!options?.quiet) setMailingPreviewLoading(true);
    try {
      const res = await fetch('/api/admin/mailings/preview', {
        method: 'POST',
        headers: authJsonHeaders(),
        credentials: SAME_ORIGIN,
        body: JSON.stringify(draft),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Не удалось собрать предпросмотр');
      if (requestId === mailingPreviewRequestRef.current) {
        setMailingPreviewHtml(String(data.html || ''));
        setMailingPreviewCount(Number(data.recipientCount || 0));
      }
      return data as { html: string; recipientCount: number; sanitizedHtmlBody: string; previewDigest: string };
    } catch (err: any) {
      if (requestId === mailingPreviewRequestRef.current) {
        setMailingPreviewHtml('');
        setMailingPreviewCount(0);
        if (!options?.quiet) setMessage({ type: 'err', text: err?.message || 'Не удалось собрать предпросмотр' });
      }
      return null;
    } finally {
      if (requestId === mailingPreviewRequestRef.current) setMailingPreviewLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!hasFullAdminAccess) return;
    if (adminSection === 'articles' || adminSection === 'dashboard') void loadAdminArticles();
    if (adminSection === 'gallery' || adminSection === 'dashboard') void loadGalleryItems();
    if (adminSection === 'referrals' || adminSection === 'dashboard') void loadReferrals();
    if (adminSection === 'boosty' || adminSection === 'dashboard') void loadBoostyStatus();
    if (adminSection === 'boosty') void loadBoostySubscribers();
    if (adminSection === 'telegram' || adminSection === 'dashboard') void loadTelegramAccounts();
    if (adminSection === 'mailing' || adminSection === 'dashboard') void loadMailingOverview();
  }, [adminSection, hasFullAdminAccess, loadAdminArticles, loadBoostyStatus, loadBoostySubscribers, loadGalleryItems, loadMailingOverview, loadReferrals, loadTelegramAccounts]);

  useEffect(() => {
    if (adminSection !== 'mailing' || !mailingOverview?.campaigns.some(campaign => campaign.status === 'queued' || campaign.status === 'sending')) return;
    const timer = window.setInterval(() => void loadMailingOverview({ quiet: true }), 2500);
    return () => window.clearInterval(timer);
  }, [adminSection, loadMailingOverview, mailingOverview?.campaigns]);

  useEffect(() => {
    if (adminSection !== 'mailing') return;
    if (!mailingDraft.subject.trim() || !mailingDraft.htmlBody.trim()) return;
    const timer = window.setTimeout(() => void requestMailingPreview(mailingDraft, { quiet: true }), 450);
    return () => window.clearTimeout(timer);
  }, [adminSection, mailingDraft, requestMailingPreview]);

	  useEffect(() => {
    const requestId = ++entriesRequestRef.current;
    if (!allowed || adminSection !== 'contests' || !selectedContestId) {
      setEntries([]);
      setEntriesLoading(false);
      return;
    }
    const controller = new AbortController();
    setEntries([]);
    setEntriesLoading(true);
    fetch(`/api/admin/contests/${encodeURIComponent(selectedContestId)}/entries`, { headers: authJsonHeaders(), signal: controller.signal })
      .then(async res => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Не удалось загрузить заявки');
        if (requestId === entriesRequestRef.current && !controller.signal.aborted) {
          setEntries(Array.isArray(data.entries) ? data.entries : []);
        }
      })
      .catch((err: any) => {
        if (controller.signal.aborted || requestId !== entriesRequestRef.current) return;
        setMessage({ type: 'err', text: err.message });
      })
      .finally(() => {
        if (requestId === entriesRequestRef.current && !controller.signal.aborted) setEntriesLoading(false);
      });
    return () => controller.abort();
  }, [adminSection, allowed, selectedContestId]);

  useEffect(() => {
    if (!hasFullAdminAccess || adminSection !== 'users') {
      setUsers([]);
      setUsersTotal(0);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ limit: String(ADMIN_USERS_PAGE_SIZE), offset: String((usersPage - 1) * ADMIN_USERS_PAGE_SIZE) });
      const query = userQuery.trim();
      if (query) params.set('q', query);

      setUsersLoading(true);
      fetch(`/api/admin/users?${params.toString()}`, {
        headers: authJsonHeaders(),
        signal: controller.signal,
        credentials: SAME_ORIGIN,
      })
        .then(async res => {
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || 'Не удалось загрузить пользователей');
          setUsers(Array.isArray(data.users) ? data.users : []);
          setUsersTotal(Number(data.total || 0));
        })
        .catch((err: any) => {
          if (controller.signal.aborted) return;
          setUsers([]);
          setUsersTotal(0);
          setMessage({ type: 'err', text: err.message });
        })
        .finally(() => {
          if (!controller.signal.aborted) setUsersLoading(false);
        });
    }, userQuery.trim() ? 220 : 0);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [adminSection, hasFullAdminAccess, userQuery, usersPage, usersReloadKey]);

	  const submitContest = async (e: React.FormEvent) => {
    e.preventDefault();
    const startsAtDate = parseDateTimeInput(form.startsAt);
    const endsAtDate = parseDateTimeInput(form.endsAt);
    if ((form.startsAt && !startsAtDate) || (form.endsAt && !endsAtDate)) {
      setMessage({ type: 'err', text: 'Проверьте дату и время конкурса.' });
      return;
    }
    if (startsAtDate && endsAtDate && endsAtDate.getTime() <= startsAtDate.getTime()) {
      setMessage({ type: 'err', text: 'Финиш конкурса должен быть позже старта.' });
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/contests', {
        method: 'POST',
        headers: authJsonHeaders(),
        body: JSON.stringify({
          ...form,
          startsAt: dateTimeInputToIso(form.startsAt),
          endsAt: dateTimeInputToIso(form.endsAt),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Не удалось сохранить конкурс');
      setMessage({ type: 'ok', text: 'Конкурс сохранен.' });
      setForm({ id: '', title: '', prize: '', imageUrl: '', startsAt: '', endsAt: '', status: 'active', description: '' });
      await loadAdminContests(data.contest?.id ? String(data.contest.id) : undefined);
      setContestWorkspaceView('manage');
    } catch (err: any) {
      setMessage({ type: 'err', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const submitArticle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!articleForm.title.trim()) {
      setMessage({ type: 'err', text: 'Укажите название статьи.' });
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin-articles', {
        method: editingArticleId ? 'PATCH' : 'POST',
        headers: authJsonHeaders(),
        body: JSON.stringify({ id: editingArticleId, article: articleForm }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Не удалось сохранить статью');
      setMessage({ type: 'ok', text: editingArticleId ? 'Статья обновлена.' : 'Статья добавлена.' });
      setArticleForm({ title: '', tag: '', date: '', excerpt: '', mode: 'arena', image: '', url: '' });
      setEditingArticleId('');
      await loadAdminArticles();
    } catch (err: any) {
      setMessage({ type: 'err', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const deleteArticle = async (article: Article) => {
    if (!window.confirm(`Удалить «${article.title}»? Вместе со статьёй будут удалены её голоса. Это действие нельзя отменить.`)) return;
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin-articles', {
        method: 'DELETE',
        headers: authJsonHeaders(),
        body: JSON.stringify({ id: article.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Не удалось удалить статью');
      setMessage({ type: 'ok', text: 'Статья удалена.' });
      if (editingArticleId === article.id) {
        setEditingArticleId('');
        setArticleForm({ title: '', tag: '', date: '', excerpt: '', mode: 'arena', image: '', url: '' });
      }
      await loadAdminArticles();
    } catch (err: any) {
      setMessage({ type: 'err', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const editArticle = (article: Article) => {
    setEditingArticleId(article.id);
    setArticleForm({
      title: article.title || '',
      tag: article.tag || '',
      date: article.date || '',
      excerpt: article.excerpt || '',
      mode: article.mode || 'general',
      image: article.image || '',
      url: article.url || '',
    });
    changeAdminSection('articles');
    window.requestAnimationFrame(() => articleFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const cancelArticleEdit = () => {
    setEditingArticleId('');
    setArticleForm({ title: '', tag: '', date: '', excerpt: '', mode: 'arena', image: '', url: '' });
  };

  const submitGalleryItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!galleryForm.title.trim()) {
      setMessage({ type: 'err', text: 'Укажите название арта.' });
      return;
    }
    if (!galleryFile) {
      setMessage({ type: 'err', text: 'Выберите файл изображения.' });
      return;
    }
    setGalleryUploading(true);
    setMessage(null);
    try {
      await uploadGalleryArtFile(galleryFile, galleryForm);
      setMessage({ type: 'ok', text: 'Арт добавлен в галерею.' });
      setGalleryForm({ title: '', tag: '', description: '', source: '' });
      setGalleryFile(null);
      if (galleryFileInputRef.current) galleryFileInputRef.current.value = '';
      await loadGalleryItems();
    } catch (err: any) {
      setMessage({ type: 'err', text: err.message || 'Не удалось загрузить арт' });
    } finally {
      setGalleryUploading(false);
    }
  };

  const deleteGalleryItem = async (item: GalleryItem) => {
    if (!window.confirm(`Удалить «${item.title}» из галереи?`)) return;
    setGalleryDeletingId(item.id);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/gallery/${encodeURIComponent(item.id)}`, {
        method: 'DELETE',
        headers: authJsonHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Не удалось удалить арт');
      setMessage({ type: 'ok', text: 'Арт удален.' });
      await loadGalleryItems();
    } catch (err: any) {
      setMessage({ type: 'err', text: err.message || 'Не удалось удалить арт' });
    } finally {
      setGalleryDeletingId('');
    }
  };

  const submitReferral = async (draft: ReferralDraft): Promise<boolean> => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/referrals', {
        method: 'POST',
        headers: authJsonHeaders(),
        body: JSON.stringify(draft),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Не удалось создать ссылку');
      setMessage({ type: 'ok', text: 'Реферальная ссылка создана.' });
      await loadReferrals();
      return true;
    } catch (err: any) {
      setMessage({ type: 'err', text: err.message });
      return false;
    } finally {
      setLoading(false);
    }
  };

  const copyText = async (text: string, okText = 'Скопировано.') => {
    try {
      await navigator.clipboard.writeText(text);
      setMessage({ type: 'ok', text: okText });
    } catch {
      setMessage({ type: 'err', text: 'Не удалось скопировать в буфер обмена.' });
    }
  };

  const updateAdminUser = async (user: AdminUserSearchResult, patch: AdminUserPatch) => {
    const menuTrigger = userMenuTriggerMap.get(user.id);
    const willBlock = patch.blocked === true;
    const willPromote = patch.role === 'admin';
    const actionLabel = patch.manualAccess
      ? patch.manualAccess.enabled
        ? patch.manualAccess.expiresAt
          ? `дать полный доступ до ${formatDate(patch.manualAccess.expiresAt)}`
          : 'дать полный доступ навсегда'
        : 'отозвать полный доступ'
      : typeof patch.lifetimeAccess === 'boolean'
        ? patch.lifetimeAccess ? 'дать бессрочную подписку' : 'отозвать бессрочную подписку'
      : willBlock
        ? 'заблокировать'
        : patch.blocked === false
          ? 'разблокировать'
          : willPromote
            ? 'сделать администратором'
            : 'снять права администратора';
    const confirmed = window.confirm(`Точно ${actionLabel} пользователя ${user.name || user.email || user.id}?`);
    dispatchAdminWorkspace({ type: 'closeUserMenu' });
    menuTrigger?.focus({ preventScroll: true });
    if (!confirmed) return;
    setUserActionId(`${user.id}:${Object.keys(patch).join(',')}`);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}`, {
        method: 'PATCH',
        headers: authJsonHeaders(),
        credentials: SAME_ORIGIN,
        body: JSON.stringify(patch),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Не удалось обновить пользователя');
      setMessage({ type: 'ok', text: `Пользователь обновлен: ${user.name || user.email || user.id}.` });
      setUsersReloadKey(value => value + 1);
    } catch (err: any) {
      setMessage({ type: 'err', text: err.message });
    } finally {
      setUserActionId('');
    }
  };

  const applyMailingTemplate = (template: MailingTemplate) => {
    if (mailingDraftDirtyRef.current && !window.confirm('Заменить текущий текст выбранным шаблоном?')) return;
    setMailingDraft(current => ({
      subject: template.subject || EMPTY_MAILING_DRAFT.subject,
      preheader: template.preheader || EMPTY_MAILING_DRAFT.preheader,
      htmlBody: template.htmlBody || EMPTY_MAILING_DRAFT.htmlBody,
      segment: current.segment,
      templateKey: template.id,
    }));
    mailingDraftDirtyRef.current = false;
  };

  const invalidateMailingPreview = () => {
    mailingPreviewRequestRef.current += 1;
    setMailingPreviewHtml('');
    setMailingPreviewCount(0);
    setMailingPreviewLoading(false);
  };

  const updateMailingDraft = (patch: Partial<MailingDraft>, options?: { invalidatePreview?: boolean }) => {
    setMailingDraft(current => ({ ...current, ...patch }));
    mailingDraftDirtyRef.current = true;
    if (options?.invalidatePreview) invalidateMailingPreview();
  };

  const sendMailingTest = async () => {
    if (!mailingDraft.subject.trim() || !mailingDraft.htmlBody.trim()) {
      setMessage({ type: 'err', text: 'Заполните тему и HTML письма.' });
      return;
    }
    if (!window.confirm(`Отправить тестовое письмо только на адрес администратора ${authUser?.email || ''}?`)) return;
    setMailingTesting(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/mailings/test', {
        method: 'POST',
        headers: authJsonHeaders(),
        credentials: SAME_ORIGIN,
        body: JSON.stringify(mailingDraft),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Не удалось отправить тест');
      setMessage({ type: 'ok', text: data.message || 'Тестовое письмо отправлено администратору.' });
    } catch (err: any) {
      setMessage({ type: 'err', text: err?.message || 'Не удалось отправить тест' });
    } finally {
      setMailingTesting(false);
    }
  };

  const sendMailing = async () => {
    if (!mailingDraft.subject.trim() || !mailingDraft.htmlBody.trim()) {
      setMessage({ type: 'err', text: 'Заполните тему и HTML письма.' });
      return;
    }
    setMailingSending(true);
    setMessage(null);
    try {
      const preview = await requestMailingPreview(mailingDraft);
      if (!preview) return;
      const recipients = Number(preview.recipientCount || 0);
      if (!recipients) throw new Error('В выбранной аудитории нет адресов с подтверждённым согласием.');
      const includeFormer = mailingDraft.segment === 'former' || mailingDraft.segment === 'all-consented';
      const warning = includeFormer ? '\nВ выборку могут входить бывшие подписчики, которые не отписались от писем.' : '';
      if (!window.confirm(`Запустить рассылку «${mailingDraft.subject}» для ${recipients} получателей?${warning}\n\nОтправку нельзя отменить после запуска.`)) return;
      const res = await fetch('/api/admin/mailings/send', {
        method: 'POST',
        headers: authJsonHeaders(),
        credentials: SAME_ORIGIN,
        body: JSON.stringify({
          ...mailingDraft,
          confirmation: 'SEND',
          expectedRecipients: recipients,
          previewDigest: preview.previewDigest,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Не удалось запустить рассылку');
      setMessage({ type: 'ok', text: `Рассылка поставлена в очередь для ${recipients} получателей.` });
      await loadMailingOverview();
    } catch (err: any) {
      setMessage({ type: 'err', text: err?.message || 'Не удалось запустить рассылку' });
    } finally {
      setMailingSending(false);
    }
  };

  const saveWinners = async () => {
    if (!selectedContestId) return;
    const winners = parseWinnerIds(winnersText);
    if (winners.length === 0) {
      setMessage({ type: 'err', text: 'Укажите хотя бы одного победителя из заявок конкурса.' });
      return;
    }
    if (!window.confirm(`Опубликовать ${winners.length} победител${winners.length === 1 ? 'я' : 'ей'} и завершить конкурс?`)) return;
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/contests/${encodeURIComponent(selectedContestId)}/winners`, {
        method: 'POST',
        headers: authJsonHeaders(),
        body: JSON.stringify({ winners }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Не удалось сохранить победителей');
      setMessage({ type: 'ok', text: 'Победители опубликованы.' });
      await loadAdminContests();
    } catch (err: any) {
      setMessage({ type: 'err', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const deleteContest = async (contest: Contest) => {
    if (!window.confirm(`Удалить конкурс «${contest.title}» вместе со всеми заявками?`)) return;
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/contests/${encodeURIComponent(contest.id)}`, {
        method: 'DELETE',
        headers: authJsonHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Не удалось удалить конкурс');
      setMessage({ type: 'ok', text: 'Конкурс удален.' });
      if (selectedContestId === contest.id) dispatchContestSelection({ type: 'select' });
      if (form.id === contest.id) setForm({ id: '', title: '', prize: '', imageUrl: '', startsAt: '', endsAt: '', status: 'active', description: '' });
      await loadAdminContests();
    } catch (err: any) {
      setMessage({ type: 'err', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const selectedContest = contests.find(contest => contest.id === selectedContestId);
  const selectedWinnerIds = useMemo(() => parseWinnerIds(winnersText), [winnersText]);
  const selectedWinnerIdSet = useMemo(() => new Set(selectedWinnerIds), [selectedWinnerIds]);
  const approvedEntries = useMemo(() => entries.filter(entry => entry.status === 'approved'), [entries]);
  const entriesPageCount = Math.max(1, Math.ceil(entries.length / ADMIN_ENTRIES_PAGE_SIZE));
  const entriesPage = Math.min(contestSelection.entriesPage, entriesPageCount);
  const visibleEntries = useMemo(
    () => entries.slice((entriesPage - 1) * ADMIN_ENTRIES_PAGE_SIZE, entriesPage * ADMIN_ENTRIES_PAGE_SIZE),
    [entries, entriesPage],
  );
  const contestStats = useMemo(() => {
    const stats = { all: contests.length, active: 0, planned: 0, draft: 0, completed: 0, cancelled: 0 };
    contests.forEach(contest => {
      if (contest.status === 'active') stats.active += 1;
      else if (contest.status === 'planned') stats.planned += 1;
      else if (contest.status === 'draft') stats.draft += 1;
      else if (contest.status === 'completed') stats.completed += 1;
      else if (contest.status === 'cancelled') stats.cancelled += 1;
    });
    return stats;
  }, [contests]);
  const filteredContests = useMemo(
    () => contestStatusFilter === 'all' ? contests : contests.filter(contest => contest.status === contestStatusFilter),
    [contestStatusFilter, contests],
  );
  const filteredAdminArticles = useMemo(() => {
    const query = articleQuery.trim().toLocaleLowerCase('ru');
    if (!query) return adminArticles;
    return adminArticles.filter(article => [article.title, article.tag, article.excerpt, article.url]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase('ru')
      .includes(query));
  }, [adminArticles, articleQuery]);
  const articlePageCount = Math.max(1, Math.ceil(filteredAdminArticles.length / ADMIN_ARTICLES_PAGE_SIZE));
  const visibleAdminArticles = useMemo(
    () => filteredAdminArticles.slice((articlePage - 1) * ADMIN_ARTICLES_PAGE_SIZE, articlePage * ADMIN_ARTICLES_PAGE_SIZE),
    [articlePage, filteredAdminArticles],
  );

  useEffect(() => {
    setArticlePage(current => Math.min(current, articlePageCount));
  }, [articlePageCount]);
  const usersPageCount = Math.max(1, Math.ceil(usersTotal / ADMIN_USERS_PAGE_SIZE));

  useEffect(() => {
    setUsersPage(current => Math.min(current, usersPageCount));
  }, [usersPageCount]);
  const selectedContestEntryCount = selectedContest?.entriesCount ?? entries.length;
  const selectedContestWinnerCount = selectedWinnerIds.length;
  const selectedContestApprovedWinnerCount = approvedEntries.filter(entry => selectedWinnerIdSet.has(entry.profileId)).length;

  if (authChecking) {
    return (
      <section className="contest-admin-page admin-access-state">
        <RouteFallback minHeight={360} />
      </section>
    );
  }

  if (!allowed) {
    return (
      <section className="contest-admin-page admin-access-state">
        <div className="contest-empty">
          <ShieldCheck size={34} />
          <strong>Админ панель недоступна</strong>
          <span>Войдите в аккаунт администратора или запросите необходимые права.</span>
          <a className="contest-primary-button" href="/?login">Войти в профиль</a>
        </div>
      </section>
    );
  }

  const resetContestForm = () => {
    setForm({ id: '', title: '', prize: '', imageUrl: '', startsAt: '', endsAt: '', status: 'active', description: '' });
    setContestWorkspaceView('editor');
  };
  const editSelectedContest = () => {
    if (!selectedContest) return;
    setContestWorkspaceView('editor');
    setForm({
      id: selectedContest.id,
      title: selectedContest.title,
      prize: selectedContest.prize,
      imageUrl: selectedContest.imageUrl,
      startsAt: formatDateTimeInput(selectedContest.startsAt),
      endsAt: formatDateTimeInput(selectedContest.endsAt),
      status: selectedContest.status,
      description: selectedContest.description,
    });
    window.requestAnimationFrame(() => contestFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  const setContestStartNow = () => setForm(v => ({ ...v, startsAt: addHoursForDateInput(0) }));
  const setContestStartInHour = () => setForm(v => ({ ...v, startsAt: addHoursForDateInput(1) }));
  const setContestEndAfterStart = (minutes: number) => setForm(v => {
    const start = parseDateTimeInput(v.startsAt) || new Date();
    return { ...v, endsAt: formatDateTimeInput(new Date(start.getTime() + minutes * 60 * 1000).toISOString()) };
  });
  const setContestEndInTenMinutes = () => setContestEndAfterStart(10);
  const setContestEndInHour = () => setContestEndAfterStart(60);
  const setContestEndTomorrow = () => setContestEndAfterStart(24 * 60);
  const toggleWinner = (profileId: string) => {
    const winners = parseWinnerIds(winnersText);
    const nextWinnersText = winners.includes(profileId)
      ? winners.filter(id => id !== profileId).join('\n')
      : [...winners, profileId].join('\n');
    dispatchContestSelection({ type: 'setWinnersText', winnersText: nextWinnersText });
  };
  const clearWinnerSelection = () => dispatchContestSelection({ type: 'setWinnersText', winnersText: '' });
  const currentStatus = CONTEST_STATUS_OPTIONS.find(item => item.value === form.status) ?? CONTEST_STATUS_OPTIONS[0];
  const previewStartsAt = form.startsAt ? formatDate(form.startsAt) : 'сразу после публикации';
  const previewEndsAt = form.endsAt ? formatDate(form.endsAt) : 'без даты окончания';
  const totalReferralClicks = referrals.reduce((sum, item) => sum + (item.clicks || 0), 0);
  const totalContestEntries = contests.reduce((sum, item) => sum + (item.entriesCount || 0), 0);
  const adminNav = hasFullAdminAccess ? ADMIN_NAV_ITEMS : ADMIN_NAV_ITEMS.filter(item => item.id === 'contests');
  const activeAdminItem = adminNav.find(item => item.id === adminSection) || adminNav[0];

  return (
    <section className="contest-admin-page admin-workspace-page">
      <header className="admin-command-bar">
        <button
          ref={adminMenuButtonRef}
          type="button"
          className="admin-menu-toggle"
          onClick={() => dispatchAdminWorkspace({ type: 'toggleAdminMenu' })}
          aria-expanded={adminMenuOpen}
          aria-controls="admin-primary-navigation"
          aria-label={adminMenuOpen ? 'Закрыть меню' : 'Открыть меню'}
        >
          {adminMenuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        <a href="/" className="admin-command-brand" aria-label="Manacost Admin — открыть сайт">
          <span>Manacost</span>
          <em>Admin</em>
        </a>
        <div className="admin-command-actions">
          <span className="admin-system-pulse"><i />Доступ подтверждён</span>
          <a href="/" target="_blank" rel="noreferrer">
            Открыть сайт <ExternalLink size={15} />
          </a>
          <span className="admin-user-chip" title={authUser?.email || ''}>{authUser?.name || authUser?.email || 'Администратор'}</span>
        </div>
      </header>

      {message && (
        <div className={`contest-message contest-message-${message.type} admin-toast`} role={message.type === 'err' ? 'alert' : 'status'} aria-live="polite">
          <span>{message.text}</span>
          <button type="button" onClick={() => setMessage(null)} aria-label="Закрыть уведомление"><X size={17} /></button>
        </div>
      )}

      <div className="admin-workspace-layout">
        {adminMenuOpen && <button type="button" className="admin-nav-backdrop" onClick={() => dispatchAdminWorkspace({ type: 'closeAdminMenu' })} aria-label="Закрыть меню" />}
        <aside
          ref={adminNavRef}
          className={`admin-workspace-nav ${adminMenuOpen ? 'is-open' : ''}`}
          aria-label="Разделы админ панели"
          role={adminMenuOpen ? 'dialog' : undefined}
          aria-modal={adminMenuOpen ? true : undefined}
        >
          <div className="admin-nav-intro">
            <span className="admin-mana-crystal" aria-hidden="true" />
            <div><strong>Редакторская колода</strong><span>{hasFullAdminAccess ? 'Полный доступ' : 'Управление конкурсами'}</span></div>
          </div>
          <nav id="admin-primary-navigation" className="admin-workspace-nav-list">
            {adminNav.map((item, index) => {
              const Icon = item.icon;
              const showGroup = index === 0 || adminNav[index - 1]?.group !== item.group;
              return (
                <React.Fragment key={item.id}>
                  {showGroup && <span className="admin-nav-group">{item.group}</span>}
                  <button
                    type="button"
                    className={adminSection === item.id ? 'is-active' : ''}
                    aria-current={adminSection === item.id ? 'page' : undefined}
                    onClick={() => changeAdminSection(item.id)}
                  >
                    <Icon size={18} aria-hidden="true" />
                    <span><strong>{item.label}</strong><small>{item.caption}</small></span>
                  </button>
                </React.Fragment>
              );
            })}
          </nav>
          <a className="admin-nav-site-link" href="/" target="_blank" rel="noreferrer">
            <ExternalLink size={17} /> Открыть публичный сайт
          </a>
        </aside>

        <div className="admin-workspace-content" id={`admin-section-${adminSection}`} role="region" aria-labelledby="admin-section-title">
          <div className="admin-section-header">
            <div>
              <span>Manacost / Админка</span>
              <h1 id="admin-section-title">{activeAdminItem?.label}</h1>
              <p>{activeAdminItem?.caption}</p>
            </div>
            <div className="admin-section-status"><i />{activeAdminItem?.status}</div>
          </div>
          {hasFullAdminAccess && adminSection === 'dashboard' && (
            <ContestAdminDashboard
              articleCount={adminArticles.length}
              galleryCount={galleryItems.length}
              boostyPaidCount={boostyStatus?.summary?.boostyPaid ?? boostyStatus?.summary?.activePaid ?? '—'}
              telegramAccessCount={telegramAccounts?.summary?.access ?? '—'}
              contestCount={contests.length}
              contestEntryCount={totalContestEntries}
              referralCount={referrals.length}
              referralClickCount={totalReferralClicks}
              recentReferralClicks={referralClicks}
              formatDate={formatDate}
              onNavigate={changeAdminSection}
              onCreateContest={() => { changeAdminSection('contests'); resetContestForm(); }}
            />
          )}

          {hasFullAdminAccess && adminSection === 'users' && (
            <ContestAdminUsers
              currentUserId={authUser?.id}
              users={users}
              total={usersTotal}
              loading={usersLoading}
              query={userQuery}
              page={usersPage}
              pageCount={usersPageCount}
              actionId={userActionId}
              openMenuId={openUserMenuId}
              menuRef={userMenuRef}
              menuTriggerMap={userMenuTriggerMap}
              formatDate={formatDate}
              onRefresh={() => setUsersReloadKey(value => value + 1)}
              onQueryChange={query => { setUserQuery(query); setUsersPage(1); }}
              onPageChange={setUsersPage}
              onToggleMenu={userId => dispatchAdminWorkspace({ type: 'toggleUserMenu', userId })}
              onUpdateUser={(user, patch) => void updateAdminUser(user, patch)}
            />
          )}

          {hasFullAdminAccess && adminSection === 'mailing' && (
            <ContestAdminMailing
              overview={mailingOverview}
              loading={mailingLoading}
              draft={mailingDraft}
              previewHtml={mailingPreviewHtml}
              previewCount={mailingPreviewCount}
              previewMode={mailingPreviewMode}
              previewLoading={mailingPreviewLoading}
              sending={mailingSending}
              testing={mailingTesting}
              onReload={() => void loadMailingOverview()}
              onApplyTemplate={applyMailingTemplate}
              onDraftChange={updateMailingDraft}
              onPreviewModeChange={setMailingPreviewMode}
              onPreview={() => void requestMailingPreview(mailingDraft)}
              onTest={() => void sendMailingTest()}
              onSend={() => void sendMailing()}
              formatDate={formatDate}
            />
          )}

          {hasFullAdminAccess && adminSection === 'boosty' && (
            <ContestAdminBoosty
              status={boostyStatus}
              statusLoading={boostyStatusLoading}
              subscribers={boostySubscribers}
              subscribersLoading={boostySubscribersLoading}
              onReload={() => {
                void loadBoostyStatus();
                void loadBoostySubscribers();
              }}
              formatDate={formatDate}
              entitlementLabels={subscriber => subscriptionEntitlementLabels({
                hasAccess: subscriber.siteAccess,
                entitlements: subscriber.entitlements as SubscriptionStatus['entitlements'],
              })}
            />
          )}

          {hasFullAdminAccess && adminSection === 'analytics' && (
            <ContestAdminAnalytics />
          )}

          {hasFullAdminAccess && adminSection === 'telegram' && (
            <ContestAdminTelegram
              payload={telegramAccounts}
              loading={telegramAccountsLoading}
              onReload={() => void loadTelegramAccounts()}
              formatDate={formatDate}
              entitlementLabels={account => subscriptionEntitlementLabels({
                hasAccess: account.hasAccess,
                entitlements: account.entitlements as SubscriptionStatus['entitlements'],
              })}
            />
          )}

          {hasFullAdminAccess && adminSection === 'articles' && (
            <ContestAdminArticles
              articles={adminArticles}
              visibleArticles={visibleAdminArticles}
              filteredCount={filteredAdminArticles.length}
              draft={articleForm}
              editingId={editingArticleId}
              loading={loading}
              query={articleQuery}
              page={articlePage}
              pageCount={articlePageCount}
              formRef={articleFormRef}
              listRef={articleListRef}
              onSubmit={submitArticle}
              onCancelEdit={cancelArticleEdit}
              onDraftChange={patch => setArticleForm(current => ({ ...current, ...patch }))}
              onQueryChange={query => { setArticleQuery(query); setArticlePage(1); }}
              onEdit={editArticle}
              onDelete={article => void deleteArticle(article)}
              onPageChange={setArticlePage}
            />
          )}

          {hasFullAdminAccess && adminSection === 'gallery' && (
            <ContestAdminGallery
              items={galleryItems}
              draft={galleryForm}
              file={galleryFile}
              uploading={galleryUploading}
              deletingId={galleryDeletingId}
              fileInputRef={galleryFileInputRef}
              onSubmit={submitGalleryItem}
              onDraftChange={patch => setGalleryForm(current => ({ ...current, ...patch }))}
              onFileChange={setGalleryFile}
              onRefresh={() => void loadGalleryItems()}
              onDelete={item => void deleteGalleryItem(item)}
            />
          )}

          {hasFullAdminAccess && adminSection === 'translations' && (
            <React.Suspense fallback={<p className="contest-muted" role="status">Загружаем управление переводами…</p>}>
              <ContestAdminTranslations onMessage={setMessage} />
            </React.Suspense>
          )}

          {hasFullAdminAccess && adminSection === 'mechanics' && (
            <React.Suspense fallback={<p className="contest-muted" role="status">Загружаем переводы механик…</p>}>
              <ContestAdminMechanicTranslations onMessage={setMessage} />
            </React.Suspense>
          )}

          {hasFullAdminAccess && adminSection === 'standard-data' && (
            <React.Suspense fallback={<p className="contest-muted" role="status">Загружаем управление данными…</p>}>
              <ContestAdminStandardOperations onMessage={setMessage} />
            </React.Suspense>
          )}

          {hasFullAdminAccess && adminSection === 'fun-decks' && (
            <React.Suspense fallback={<p className="contest-muted" role="status">Загружаем фановые колоды…</p>}>
              <ContestAdminFunDecks />
            </React.Suspense>
          )}

          {adminSection === 'contests' && (
            <ContestAdminContests
              view={contestWorkspaceView}
              onViewChange={setContestWorkspaceView}
              form={form}
              formRef={contestFormRef}
              onFormChange={patch => setForm(current => ({ ...current, ...patch }))}
              onSubmit={submitContest}
              onReset={resetContestForm}
              onStartNow={setContestStartNow}
              onStartInHour={setContestStartInHour}
              onEndInTenMinutes={setContestEndInTenMinutes}
              onEndInHour={setContestEndInHour}
              onEndTomorrow={setContestEndTomorrow}
              currentStatusLabel={currentStatus.label}
              previewStartsAt={previewStartsAt}
              previewEndsAt={previewEndsAt}
              loading={loading}
              statusFilter={contestStatusFilter}
              onStatusFilterChange={setContestStatusFilter}
              stats={contestStats}
              contests={filteredContests}
              selectedContestId={selectedContestId}
              selectedContest={selectedContest}
              onSelectContest={contest => dispatchContestSelection({ type: 'select', contest })}
              onEditSelected={editSelectedContest}
              onReload={() => void loadAdminContests()}
              onDelete={contest => void deleteContest(contest)}
              selectedContestEntryCount={selectedContestEntryCount}
              approvedEntryCount={approvedEntries.length}
              selectedWinnerCount={selectedContestWinnerCount}
              entries={entries}
              visibleEntries={visibleEntries}
              entriesLoading={entriesLoading}
              selectedWinnerIds={selectedWinnerIds}
              selectedWinnerIdSet={selectedWinnerIdSet}
              onToggleWinner={toggleWinner}
              onClearWinners={clearWinnerSelection}
              entriesPage={entriesPage}
              entriesPageCount={entriesPageCount}
              onEntriesPageChange={entriesPage => dispatchContestSelection({ type: 'setEntriesPage', entriesPage })}
              approvedWinnerCount={selectedContestApprovedWinnerCount}
              onSaveWinners={() => void saveWinners()}
              winnersText={winnersText}
              onWinnersTextChange={nextWinnersText => dispatchContestSelection({ type: 'setWinnersText', winnersText: nextWinnersText })}
              onCopyProfileId={profileId => void copyText(profileId, 'ID участника скопирован.')}
              formatDate={formatDate}
              statusLabel={contestStatusLabel}
            />
          )}

          {hasFullAdminAccess && adminSection === 'referrals' && (
            <ContestAdminReferrals
              referrals={referrals}
              referralClicks={referralClicks}
              loading={loading}
              formatDate={formatDate}
              onCopy={copyText}
              onSubmit={submitReferral}
            />
          )}
        </div>
      </div>
    </section>
  );
}
