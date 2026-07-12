import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import '../route-parchment.css';
import {
  BookOpen,
  CircleDollarSign,
  Download,
  ExternalLink,
  Gift,
  Image as ImageIcon,
  LayoutDashboard,
  Link2,
  Mail,
  Menu,
  MessageCircle,
  Monitor,
  MoreVertical,
  Newspaper,
  Send,
  ShieldCheck,
  Smartphone,
  Trash2,
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

type AdminMessage = { type: 'ok' | 'err'; text: string };

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

interface Article {
  id: string;
  title: string;
  date: string;
  image?: string;
  excerpt?: string;
  tag?: string;
  mode?: 'arena' | 'battlegrounds' | 'general';
  url?: string;
}

interface GalleryItem {
  id: string;
  title: string;
  description?: string;
  tag?: string;
  source?: string;
  width?: number;
  height?: number;
  bytes?: number;
  format?: string;
  previewUrl: string;
  thumbUrl: string;
  imageUrl: string;
  downloadUrl: string;
  createdAt: string;
  updatedAt?: string;
}

const ADMIN_INPUT: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  minHeight: 40,
  border: '1px solid #c3c4c7',
  borderRadius: 6,
  padding: '9px 11px',
  background: '#fff',
  color: '#1d2327',
};

function formatDate(iso: string | null): string {
  if (!iso) return 'нет данных';
  const d = new Date(iso);
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatBytes(bytes?: number): string {
  const value = Number(bytes || 0);
  if (!value) return 'размер не указан';
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(value >= 10 * 1024 * 1024 ? 0 : 1)} МБ`;
  if (value >= 1024) return `${Math.round(value / 1024)} КБ`;
  return `${value} Б`;
}

function articleModeLabel(mode?: Article['mode']): string {
  if (mode === 'arena') return 'Арена';
  if (mode === 'battlegrounds') return 'Поля Сражений';
  return 'Общий';
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

type Contest = {
  id: string;
  title: string;
  description: string;
  prize: string;
  imageUrl: string;
  startsAt: string;
  endsAt: string;
  status: string;
  winners: string[];
  entry?: { status: string; createdAt: string } | null;
  entriesCount?: number;
};

type ContestEntry = {
  id: string;
  contestId: string;
  userId: string;
  profileId: string;
  name: string;
  email: string;
  status: string;
  createdAt: string;
  contact: Record<string, any>;
  subscription: Record<string, any>;
  profileContacts: Record<string, string>;
};

type AdminUserSearchResult = {
  id: string;
  profileId: string;
  name: string;
  email: string;
  role: string;
  country: string;
  telegramId?: string;
  telegramUsername: string;
  telegramOidcId?: string;
  contactVkUrl: string;
  contactTelegram: string;
  contactEmail: string;
  newsletterOptIn?: boolean;
  lifetimeAccess?: boolean;
  lifetimeGrantedAt?: string;
  subscription: { hasAccess: boolean; source: string; checkedAt: string; message?: string; entitlements?: SubscriptionStatus['entitlements'] };
  contestEntriesCount?: number;
  blockedAt?: string;
  createdAt?: string;
  updatedAt?: string;
};

function authJsonHeaders(): HeadersInit {
  return { 'Content-Type': 'application/json', 'X-CSRF-Request': '1' };
}

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

type AdminWorkspaceSection = 'dashboard' | 'users' | 'mailing' | 'telegram' | 'articles' | 'gallery' | 'contests' | 'referrals' | 'boosty';
type ContestWorkspaceView = 'manage' | 'editor';

const CONTEST_STATUS_OPTIONS = [
  { value: 'active', label: 'Опубликовать', caption: 'Конкурс виден на сайте' },
  { value: 'planned', label: 'Запланировать', caption: 'Виден как ближайший конкурс' },
  { value: 'draft', label: 'Черновик', caption: 'Не показывать участникам' },
  { value: 'completed', label: 'Завершить', caption: 'Перенести в прошлые конкурсы' },
  { value: 'cancelled', label: 'Отменить', caption: 'Скрыть без удаления' },
] as const;

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
  { id: 'users', label: 'Пользователи', caption: 'Права, блокировки и контакты', status: 'Действия с подтверждением', group: 'Аудитория', icon: Users },
  { id: 'mailing', label: 'Рассылка', caption: 'Письма, шаблоны и история отправок', status: 'Безопасная очередь отправки', group: 'Аудитория', icon: Mail },
  { id: 'boosty', label: 'Boosty', caption: 'Подписчики и уровни доступа', status: 'Данные только для просмотра', group: 'Аудитория', icon: CircleDollarSign },
  { id: 'telegram', label: 'Telegram', caption: 'Аккаунты и проверка доступа', status: 'Данные только для просмотра', group: 'Аудитория', icon: MessageCircle },
  { id: 'contests', label: 'Конкурсы', caption: 'Заявки, статусы и победители', status: 'Сохранение по кнопке', group: 'Рост', icon: Trophy },
  { id: 'referrals', label: 'Реферальные ссылки', caption: 'Кампании и статистика кликов', status: 'Сохранение по кнопке', group: 'Рост', icon: Link2 },
];

const ADMIN_USERS_PAGE_SIZE = 20;
const ADMIN_ARTICLES_PAGE_SIZE = 12;
const ADMIN_AUDIENCE_PAGE_SIZE = 20;

const ADMIN_WORKSPACE_SECTION_IDS: AdminWorkspaceSection[] = [
  'dashboard',
  'articles',
  'gallery',
  'users',
  'mailing',
  'boosty',
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

type BoostyAdminStatus = {
  configured: boolean;
  ok: boolean;
  importStatus: string;
  source: string;
  stale: boolean;
  snapshotAgeSeconds: number | null;
  lastErrorCategory: string | null;
  lastErrorMessage: string | null;
  warnings: string[];
  summary: {
    active?: number;
    activePaid?: number;
    boostyPaid?: number;
    total?: number;
    [key: string]: unknown;
  };
  checkedAt?: string;
  graceHours?: number;
};

type BoostySubscriberRow = {
  id: string;
  name: string;
  email: string;
  hasEmail: boolean;
  avatarUrl: string;
  status: string;
  subscribed: boolean;
  active: boolean;
  paid: boolean;
  hasActivePaidAccess: boolean;
  willRenew: boolean;
  blacklisted: boolean;
  canWrite: boolean;
  audienceType: string;
  contactStatus: string;
  level: { id: number | string | null; name: string; price: number; currency: string };
  money: { currentPrice: number; totalPayments: number; currency: string };
  dates: { subscribedAt: string | null; unsubscribedAt: string | null; nextPaymentAt: string | null };
  entitlements?: SubscriptionStatus['entitlements'];
  siteAccess: boolean;
};

type BoostySubscribersPayload = {
  configured: boolean;
  source: string;
  stale: boolean;
  summary: BoostyAdminStatus['summary'];
  levels: Record<string, number>;
  subscribers: BoostySubscriberRow[];
  fetchedAt: string;
  error?: string;
};

type TelegramAdminAccount = {
  id: string;
  profileId: string;
  name: string;
  email: string;
  role: string;
  blockedAt: string;
  telegramId: string;
  telegramOidcId: string;
  telegramUsername: string;
  contactTelegram: string;
  photoUrl: string;
  hasTelegramIdentity: boolean;
  hasContactOnly: boolean;
  canBeChecked: boolean;
  hasAccess: boolean;
  telegramHasAccess: boolean;
  accessState: 'access' | 'checkable' | 'contact-only' | 'no-access' | 'blocked';
  source: string;
  message: string;
  checkedAt: string;
  updatedAt: string;
  stale: boolean;
  entitlements?: SubscriptionStatus['entitlements'];
  chats: Array<Record<string, any>>;
  boostyHasAccess: boolean;
  createdAt: string;
  userUpdatedAt: string;
};

type TelegramAccountsPayload = {
  configured: boolean;
  chatIds: string[];
  summary: {
    total: number;
    access: number;
    checkable: number;
    contactOnly: number;
    stale: number;
    blocked: number;
  };
  accounts: TelegramAdminAccount[];
  fetchedAt: string;
  error?: string;
};

type MailingSegment = 'all-consented' | 'active' | 'former';
type MailingPreviewMode = 'desktop' | 'mobile';

type MailingTemplate = {
  id: string;
  label: string;
  description: string;
  subject: string;
  preheader: string;
  htmlBody: string;
};

type MailingContact = {
  id: string;
  email: string;
  name: string;
  consentStatus: 'unknown' | 'subscribed' | 'unsubscribed' | 'suppressed';
  consentSource: string;
  lifecycle: 'active' | 'former';
  accountState: 'current' | 'former';
  eligible: boolean;
  updatedAt: string;
};

type MailingCampaign = {
  id: string;
  subject: string;
  preheader: string;
  templateKey: string;
  segment: MailingSegment;
  status: string;
  recipientCount: number;
  acceptedCount: number;
  failedCount: number;
  skippedCount: number;
  createdAt: string;
  startedAt: string;
  completedAt: string;
  error: string;
};

type MailingOverview = {
  summary: {
    total: number;
    eligible: number;
    active: number;
    former: number;
    excluded: number;
    unsubscribed: number;
    pendingConsent: number;
    suppressed: number;
  };
  templates: MailingTemplate[];
  contacts: MailingContact[];
  campaigns: MailingCampaign[];
  transport: { configured: boolean; from: string };
};

type MailingDraft = {
  subject: string;
  preheader: string;
  htmlBody: string;
  segment: MailingSegment;
  templateKey: string;
};

const EMPTY_MAILING_DRAFT: MailingDraft = {
  subject: 'Новости Manacost',
  preheader: 'Свежие материалы и обновления HS-Arena.',
  htmlBody: '<h2>Заголовок письма</h2><p>Напишите здесь основной текст рассылки.</p>',
  segment: 'all-consented',
  templateKey: 'blank',
};

function mailingCampaignStatus(status: string): { label: string; tone: string } {
  if (status === 'completed') return { label: 'Отправлена', tone: 'ok' };
  if (status === 'completed-with-errors') return { label: 'С ошибками', tone: 'bad' };
  if (status === 'sending') return { label: 'Отправляется', tone: 'working' };
  if (status === 'queued') return { label: 'В очереди', tone: 'working' };
  if (status === 'failed') return { label: 'Ошибка', tone: 'bad' };
  return { label: status || 'Неизвестно', tone: 'muted' };
}

function mailingConsentLabel(contact: MailingContact): string {
  if (contact.consentStatus === 'subscribed' && contact.eligible) return 'Можно отправлять';
  if (contact.consentStatus === 'unsubscribed') return 'Отписан';
  if (contact.consentStatus === 'suppressed') return 'Исключён';
  if (contact.consentStatus === 'subscribed') return 'Временно исключён';
  return 'Ожидает согласия';
}

function subscriptionEntitlementLabels(subscription: { hasAccess?: boolean; entitlements?: SubscriptionStatus['entitlements'] } | null | undefined): string[] {
  if (!subscription?.entitlements) return subscription?.hasAccess ? ['Все разделы'] : [];
  const labels: string[] = [];
  for (const [key, label] of SUBSCRIPTION_ENTITLEMENT_LABELS) {
    if (subscription.entitlements[key]) labels.push(label);
  }
  return labels;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
    reader.readAsDataURL(file);
  });
}

async function uploadAdminImageFile(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Можно загружать только изображения');
  const dataUrl = await fileToDataUrl(file);
  const res = await fetch('/api/admin/uploads/image', {
    method: 'POST',
    headers: authJsonHeaders(),
    body: JSON.stringify({ dataUrl }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Не удалось загрузить картинку');
  return String(data.url || '');
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

function firstImageFile(files: FileList | File[] | null | undefined): File | null {
  if (!files) return null;
  return Array.from(files).find(file => file.type.startsWith('image/')) ?? null;
}

function AdminImageUploader({
  label,
  value,
  onChange,
  allowExternalUrl = true,
}: {
  label: string;
  value: string;
  onChange: (url: string) => void;
  allowExternalUrl?: boolean;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  const uploadFile = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const url = await uploadAdminImageFile(file);
      onChange(url);
    } catch (err: any) {
      setError(err.message || 'Не удалось загрузить картинку');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

	  return (
    <div
      className={`admin-image-uploader ${uploading ? 'admin-image-uploader-busy' : ''}`}
      onPaste={event => {
        const file = firstImageFile(Array.from(event.clipboardData.files));
        if (file) {
          event.preventDefault();
          void uploadFile(file);
        }
      }}
      onDragOver={event => {
        event.preventDefault();
        event.currentTarget.classList.add('admin-image-uploader-over');
      }}
      onDragLeave={event => event.currentTarget.classList.remove('admin-image-uploader-over')}
      onDrop={event => {
        event.preventDefault();
        event.currentTarget.classList.remove('admin-image-uploader-over');
        void uploadFile(firstImageFile(event.dataTransfer.files));
      }}
    >
      <div className="admin-image-uploader-head">
        <span>{label}</span>
        <div className="admin-image-uploader-actions">
          {value && (
            <button type="button" onClick={() => onChange('')} disabled={uploading}>
              Убрать
            </button>
          )}
          <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading}>
            {uploading ? 'Загружаем...' : 'Выбрать файл'}
          </button>
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        aria-label={`Файл: ${label}`}
        onChange={event => void uploadFile(firstImageFile(event.target.files))}
      />
      {allowExternalUrl ? (
        <input aria-label={`${label}: URL`} value={value} onChange={event => onChange(event.target.value)} placeholder="URL или загрузка через Ctrl+V / drag and drop" style={ADMIN_INPUT} />
      ) : (
        <small className="admin-field-hint">Используйте загрузку файла: конкурс принимает только изображения, сохранённые на этом сайте.</small>
      )}
      <div className="admin-image-uploader-body">
        {value ? <img src={value} alt="" /> : <span><ImageIcon size={24} /> Вставьте картинку, перетащите сюда или загрузите с компьютера</span>}
      </div>
      {error && <small className="admin-inline-error">{error}</small>}
    </div>
  );
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
  const [openUserMenuId, setOpenUserMenuId] = useState('');
  const [mailingOverview, setMailingOverview] = useState<MailingOverview | null>(null);
  const [mailingLoading, setMailingLoading] = useState(false);
  const [mailingDraft, setMailingDraft] = useState<MailingDraft>(EMPTY_MAILING_DRAFT);
  const [mailingPreviewHtml, setMailingPreviewHtml] = useState('');
  const [mailingPreviewCount, setMailingPreviewCount] = useState(0);
  const [mailingPreviewMode, setMailingPreviewMode] = useState<MailingPreviewMode>('desktop');
  const [mailingPreviewLoading, setMailingPreviewLoading] = useState(false);
  const [mailingSending, setMailingSending] = useState(false);
  const [mailingTesting, setMailingTesting] = useState(false);
  const [message, setMessage] = useState<AdminMessage | null>(null);
  const [loading, setLoading] = useState(false);
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);
  const [form, setForm] = useState({
    id: '',
    title: '',
    prize: '',
    imageUrl: '',
    startsAt: '',
    endsAt: '',
    status: 'active',
    description: '',
  });
  const [adminSection, setAdminSection] = useState<AdminWorkspaceSection>(() => {
    const requested = adminSectionFromLocation(hasFullAdminAccess ? 'dashboard' : 'contests');
    return hasFullAdminAccess || requested === 'contests' ? requested : 'contests';
  });
  const [adminArticles, setAdminArticles] = useState<Article[]>([]);
  const [articleQuery, setArticleQuery] = useState('');
  const [articlePage, setArticlePage] = useState(1);
  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([]);
  const [galleryFile, setGalleryFile] = useState<File | null>(null);
  const [galleryUploading, setGalleryUploading] = useState(false);
  const [galleryDeletingId, setGalleryDeletingId] = useState('');
  const [referrals, setReferrals] = useState<AdminReferralLink[]>([]);
  const [referralClicks, setReferralClicks] = useState<AdminReferralClick[]>([]);
  const [articleForm, setArticleForm] = useState({
    title: '',
    tag: '',
    date: '',
    excerpt: '',
    mode: 'arena' as Article['mode'],
    image: '',
    url: '',
  });
  const [galleryForm, setGalleryForm] = useState({
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
  const [boostySubscribersSearch, setBoostySubscribersSearch] = useState('');
  const [boostyLevelFilter, setBoostyLevelFilter] = useState('all');
  const [boostyAccessFilter, setBoostyAccessFilter] = useState<'all' | 'site' | 'paid' | 'free' | 'inactive'>('all');
  const [boostyPage, setBoostyPage] = useState(1);
  const [telegramAccounts, setTelegramAccounts] = useState<TelegramAccountsPayload | null>(null);
  const [telegramAccountsLoading, setTelegramAccountsLoading] = useState(false);
  const [telegramAccountsSearch, setTelegramAccountsSearch] = useState('');
  const [telegramAccessFilter, setTelegramAccessFilter] = useState<'all' | 'access' | 'checkable' | 'contact-only' | 'stale' | 'blocked'>('all');
  const [telegramPage, setTelegramPage] = useState(1);

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
    setAdminSection(nextSection);
    setAdminMenuOpen(false);
    setOpenUserMenuId('');
    setMessage(null);

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
      setAdminSection(hasFullAdminAccess || requested === 'contests' ? requested : 'contests');
      setAdminMenuOpen(false);
      setOpenUserMenuId('');
      setMessage(null);
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
        setAdminMenuOpen(false);
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
      setOpenUserMenuId('');
      if (restoreFocus) window.requestAnimationFrame(() => trigger?.focus());
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
        setOpenUserMenuId('');
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
        setOpenUserMenuId('');
        window.requestAnimationFrame(() => target?.focus());
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
      users: 'Пользователи',
      mailing: 'Рассылка',
      boosty: 'Boosty',
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
        credentials: 'same-origin',
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
        credentials: 'same-origin',
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
        credentials: 'same-origin',
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
        credentials: 'same-origin',
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
        credentials: 'same-origin',
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
        credentials: 'same-origin',
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

  const updateAdminUser = async (user: AdminUserSearchResult, patch: { role?: 'admin' | 'user'; blocked?: boolean; lifetimeAccess?: boolean }) => {
    const menuTrigger = userMenuTriggerMap.get(user.id);
    const willBlock = patch.blocked === true;
    const willPromote = patch.role === 'admin';
    const actionLabel = typeof patch.lifetimeAccess === 'boolean'
      ? patch.lifetimeAccess ? 'дать бессрочную подписку' : 'отозвать бессрочную подписку'
      : willBlock
        ? 'заблокировать'
        : patch.blocked === false
          ? 'разблокировать'
          : willPromote
            ? 'сделать администратором'
            : 'снять права администратора';
    const confirmed = window.confirm(`Точно ${actionLabel} пользователя ${user.name || user.email || user.id}?`);
    setOpenUserMenuId('');
    window.requestAnimationFrame(() => menuTrigger?.focus());
    if (!confirmed) return;
    setUserActionId(`${user.id}:${Object.keys(patch).join(',')}`);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}`, {
        method: 'PATCH',
        headers: authJsonHeaders(),
        credentials: 'same-origin',
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
        credentials: 'same-origin',
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
        credentials: 'same-origin',
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
  const entriesPageCount = Math.max(1, Math.ceil(entries.length / ADMIN_AUDIENCE_PAGE_SIZE));
  const entriesPage = Math.min(contestSelection.entriesPage, entriesPageCount);
  const visibleEntries = useMemo(
    () => entries.slice((entriesPage - 1) * ADMIN_AUDIENCE_PAGE_SIZE, entriesPage * ADMIN_AUDIENCE_PAGE_SIZE),
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

  const boostyLevelOptions = useMemo(
    () => Object.keys(boostySubscribers?.levels || {}).sort((a, b) => a.localeCompare(b, 'ru')),
    [boostySubscribers],
  );
  const filteredBoostySubscribers = useMemo(() => {
    const query = boostySubscribersSearch.trim().toLowerCase();
    return (boostySubscribers?.subscribers || []).filter(subscriber => {
      if (boostyLevelFilter !== 'all' && (subscriber.level?.name || 'Без уровня') !== boostyLevelFilter) return false;
      if (boostyAccessFilter === 'site' && !subscriber.siteAccess) return false;
      if (boostyAccessFilter === 'paid' && !subscriber.hasActivePaidAccess) return false;
      if (boostyAccessFilter === 'free' && subscriber.hasActivePaidAccess) return false;
      if (boostyAccessFilter === 'inactive' && subscriber.active) return false;
      if (!query) return true;
      const haystack = [
        subscriber.id,
        subscriber.name,
        subscriber.email,
        subscriber.level?.name,
        subscriber.status,
        subscriber.audienceType,
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(query);
    });
  }, [boostyAccessFilter, boostyLevelFilter, boostySubscribers, boostySubscribersSearch]);
  const boostyPageCount = Math.max(1, Math.ceil(filteredBoostySubscribers.length / ADMIN_AUDIENCE_PAGE_SIZE));
  const visibleBoostySubscribers = useMemo(
    () => filteredBoostySubscribers.slice((boostyPage - 1) * ADMIN_AUDIENCE_PAGE_SIZE, boostyPage * ADMIN_AUDIENCE_PAGE_SIZE),
    [boostyPage, filteredBoostySubscribers],
  );

  useEffect(() => {
    setBoostyPage(current => Math.min(current, boostyPageCount));
  }, [boostyPageCount]);

  const filteredTelegramAccounts = useMemo(() => {
    const query = telegramAccountsSearch.trim().toLowerCase();
    return (telegramAccounts?.accounts || []).filter(account => {
      if (telegramAccessFilter === 'access' && !account.telegramHasAccess) return false;
      if (telegramAccessFilter === 'checkable' && account.accessState !== 'checkable') return false;
      if (telegramAccessFilter === 'contact-only' && account.accessState !== 'contact-only') return false;
      if (telegramAccessFilter === 'stale' && !account.stale) return false;
      if (telegramAccessFilter === 'blocked' && account.accessState !== 'blocked') return false;
      if (!query) return true;
      const haystack = [
        account.id,
        account.profileId,
        account.name,
        account.email,
        account.telegramId,
        account.telegramOidcId,
        account.telegramUsername,
        account.contactTelegram,
        account.source,
        account.message,
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(query);
    });
  }, [telegramAccessFilter, telegramAccounts, telegramAccountsSearch]);
  const telegramPageCount = Math.max(1, Math.ceil(filteredTelegramAccounts.length / ADMIN_AUDIENCE_PAGE_SIZE));
  const visibleTelegramAccounts = useMemo(
    () => filteredTelegramAccounts.slice((telegramPage - 1) * ADMIN_AUDIENCE_PAGE_SIZE, telegramPage * ADMIN_AUDIENCE_PAGE_SIZE),
    [filteredTelegramAccounts, telegramPage],
  );

  useEffect(() => {
    setTelegramPage(current => Math.min(current, telegramPageCount));
  }, [telegramPageCount]);
  const boostySubscriberStats = useMemo(() => {
    const subscribers = boostySubscribers?.subscribers || [];
    const summaryBoostyPaid = Number(boostySubscribers?.summary?.boostyPaid);
    return {
      total: subscribers.length,
      siteAccess: subscribers.filter(subscriber => subscriber.siteAccess).length,
      activePaid: subscribers.filter(subscriber => subscriber.hasActivePaidAccess).length,
      boostyPaid: Number.isFinite(summaryBoostyPaid)
        ? summaryBoostyPaid
        : subscribers.filter(subscriber => subscriber.audienceType === 'boosty-paid').length,
      missingEmail: subscribers.filter(subscriber => !subscriber.hasEmail).length,
    };
  }, [boostySubscribers]);

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
  const boostyApiTone = boostyStatusLoading
    ? 'loading'
    : boostyStatus?.ok
      ? 'ok'
      : boostyStatus?.configured === false
        ? 'not-configured'
        : 'bad';
  const boostyApiLabel = boostyStatusLoading
    ? 'проверяем'
    : boostyApiTone === 'ok'
      ? 'работает'
      : boostyApiTone === 'not-configured'
        ? 'не настроен'
        : 'ошибка';
  const adminNav = hasFullAdminAccess ? ADMIN_NAV_ITEMS : ADMIN_NAV_ITEMS.filter(item => item.id === 'contests');
  const activeAdminItem = adminNav.find(item => item.id === adminSection) || adminNav[0];

  return (
    <section className="contest-admin-page admin-workspace-page">
      <header className="admin-command-bar">
        <button
          ref={adminMenuButtonRef}
          type="button"
          className="admin-menu-toggle"
          onClick={() => setAdminMenuOpen(value => !value)}
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
        {adminMenuOpen && <button type="button" className="admin-nav-backdrop" onClick={() => setAdminMenuOpen(false)} aria-label="Закрыть меню" />}
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
            <>
              <div className="admin-stat-grid">
                <div><span>Контент</span><strong>{adminArticles.length}</strong><small>статей · {galleryItems.length} артов</small></div>
                <div><span>Аудитория</span><strong>{boostyStatus?.summary?.boostyPaid ?? boostyStatus?.summary?.activePaid ?? '—'}</strong><small>платных Boosty · Telegram {telegramAccounts?.summary?.access ?? '—'}</small></div>
                <div><span>Конкурсы</span><strong>{contests.length}</strong><small>{totalContestEntries} заявок</small></div>
                <div><span>Кампании</span><strong>{referrals.length}</strong><small>{totalReferralClicks} переходов</small></div>
              </div>
              <div className="contest-admin-grid admin-dashboard-grid">
                <div className="contest-admin-card">
                  <h2>Быстрый доступ</h2>
                  <div className="admin-quick-actions">
                    <button type="button" onClick={() => { changeAdminSection('contests'); resetContestForm(); }}>Создать конкурс</button>
                    <button type="button" onClick={() => changeAdminSection('articles')}>Добавить статью</button>
                    <button type="button" onClick={() => changeAdminSection('gallery')}>Загрузить арт</button>
                    <button type="button" onClick={() => changeAdminSection('mailing')}>Создать рассылку</button>
                    <button type="button" onClick={() => changeAdminSection('boosty')}>Открыть Boosty</button>
                    <button type="button" onClick={() => changeAdminSection('telegram')}>Открыть Telegram</button>
                    <button type="button" onClick={() => changeAdminSection('referrals')}>Новая рекламная ссылка</button>
                    <button type="button" onClick={() => changeAdminSection('users')}>Найти пользователя</button>
                  </div>
                </div>
                <div className="contest-admin-card">
                  <h2>Последние переходы</h2>
                  <div className="admin-referral-clicks">
                    {referralClicks.slice(0, 8).map(click => (
                      <div key={click.id}>
                        <strong>/r/{click.slug}</strong>
                        <span>{click.clickedAt ? formatDate(click.clickedAt) : 'без даты'}</span>
                      </div>
                    ))}
                    {!referralClicks.length && <p className="contest-muted">Переходов пока нет.</p>}
                  </div>
                </div>
              </div>
            </>
          )}

          {hasFullAdminAccess && adminSection === 'users' && (
            <div className="contest-admin-card contest-admin-search admin-full-card">
              <div className="contest-users-head">
                <div>
                  <h2>Пользователи</h2>
                  <p className="contest-muted">
                    Единая база профилей Манакоста. Показано {users.length} из {usersTotal}.
                  </p>
                </div>
                <button
                  type="button"
                  className="contest-secondary-button"
                  disabled={usersLoading}
                  onClick={() => setUsersReloadKey(value => value + 1)}
                >
                  {usersLoading ? 'Загрузка...' : 'Обновить'}
                </button>
              </div>
              <div className="admin-page-toolbar admin-user-toolbar">
                <label>
                  Фильтр по ID, почте, имени, Telegram или VK
                  <input value={userQuery} onChange={e => { setUserQuery(e.target.value); setUsersPage(1); }} placeholder="user_..., email, имя или username" style={ADMIN_INPUT} />
                </label>
              </div>
              <div className="contest-user-results">
                {usersLoading && !users.length ? (
                  <p className="contest-muted">Загружаем список пользователей...</p>
                ) : users.length ? users.map(user => (
                  <div key={user.id} className="contest-user-row">
                    <div>
                      <strong>{user.name}</strong>
                      <span>ID: {user.profileId}</span>
                      <span>{user.email || 'email не указан'} · {user.country || 'страна не указана'} · {user.role === 'admin' ? 'администратор' : 'пользователь'}</span>
                      <span>
                        TG: {user.contactTelegram || user.telegramUsername || user.telegramId || '—'}
                        {' · '}
                        VK: {user.contactVkUrl || '—'}
                        {' · '}
                        связь: {user.contactEmail || '—'}
                      </span>
                      <span>
                        Конкурсы: {user.contestEntriesCount ?? 0}
                        {' · '}
                        создан: {user.createdAt ? formatDate(user.createdAt) : '—'}
                      </span>
                    </div>
                    <div className="contest-user-badges">
                      <span className={user.blockedAt ? 'contest-role-blocked' : user.role === 'admin' ? 'contest-role-admin' : 'contest-role-user'}>
                        {user.blockedAt ? 'заблокирован' : user.role === 'admin' ? 'админ' : 'участник'}
                      </span>
                      <span className={user.subscription?.hasAccess ? 'contest-access-ok' : 'contest-access-no'}>
                        {user.lifetimeAccess ? 'бессрочно' : user.subscription?.hasAccess ? 'подписка' : 'нет доступа'}
                      </span>
                      <div className="contest-user-actions contest-user-action-menu-wrap">
                        <button
                          ref={node => {
                            if (node) userMenuTriggerMap.set(user.id, node);
                            else userMenuTriggerMap.delete(user.id);
                          }}
                          type="button"
                          className="contest-user-menu-trigger"
                          disabled={Boolean(userActionId)}
                          aria-label={`Действия с пользователем ${user.name || user.email || user.id}`}
                          aria-haspopup="menu"
                          aria-expanded={openUserMenuId === user.id}
                          aria-controls={openUserMenuId === user.id ? `user-actions-${user.id}` : undefined}
                          onClick={() => setOpenUserMenuId(current => current === user.id ? '' : user.id)}
                        >
                          {userActionId.startsWith(`${user.id}:`) ? <span className="admin-action-spinner" aria-hidden="true" /> : <MoreVertical size={20} />}
                        </button>
                        {openUserMenuId === user.id && (
                          <div ref={userMenuRef} id={`user-actions-${user.id}`} className="contest-user-menu" role="menu" aria-label={`Действия: ${user.name || user.email}`}>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => void updateAdminUser(user, { lifetimeAccess: !user.lifetimeAccess })}
                            >
                              <ShieldCheck size={16} />
                              <span>{user.lifetimeAccess ? 'Отозвать бессрочную подписку' : 'Дать бессрочную подписку'}<small>Доступ ко всем закрытым разделам</small></span>
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              disabled={authUser?.id === user.id}
                              onClick={() => void updateAdminUser(user, { role: user.role === 'admin' ? 'user' : 'admin' })}
                            >
                              <Users size={16} />
                              <span>{user.role === 'admin' ? 'Снять права администратора' : 'Сделать администратором'}<small>Изменить уровень управления</small></span>
                            </button>
                            <hr className="contest-user-menu-divider" />
                            <button
                              type="button"
                              role="menuitem"
                              className={!user.blockedAt ? 'is-danger' : undefined}
                              disabled={authUser?.id === user.id}
                              onClick={() => void updateAdminUser(user, { blocked: !user.blockedAt })}
                            >
                              <Trash2 size={16} />
                              <span>{user.blockedAt ? 'Разблокировать' : 'Заблокировать'}<small>{user.blockedAt ? 'Вернуть доступ к аккаунту' : 'Закрыть вход и исключить из рассылки'}</small></span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )) : (
                  <p className="contest-muted">
                    {userQuery.trim() ? 'По этому фильтру пользователей нет.' : 'В единой базе пока нет пользователей.'}
                  </p>
                )}
              </div>
              {usersPageCount > 1 && (
                <nav className="admin-pagination" aria-label="Страницы списка пользователей">
                  <button type="button" disabled={usersPage === 1 || usersLoading} onClick={() => setUsersPage(page => Math.max(1, page - 1))}>Назад</button>
                  <span>Страница {usersPage} из {usersPageCount}</span>
                  <button type="button" disabled={usersPage === usersPageCount || usersLoading} onClick={() => setUsersPage(page => Math.min(usersPageCount, page + 1))}>Далее</button>
                </nav>
              )}
            </div>
          )}

          {hasFullAdminAccess && adminSection === 'mailing' && (
            <div className="admin-mailing-page">
              <div className="admin-stat-grid admin-mailing-stats">
                <div><span>Доступно для отправки</span><strong>{mailingOverview?.summary.eligible ?? '—'}</strong><small>только с подтверждённым согласием</small></div>
                <div><span>Активные</span><strong>{mailingOverview?.summary.active ?? '—'}</strong><small>с действующим доступом</small></div>
                <div><span>Бывшие</span><strong>{mailingOverview?.summary.former ?? '—'}</strong><small>адрес сохранён, отписки не было</small></div>
                <div><span>Исключены</span><strong>{mailingOverview?.summary.excluded ?? '—'}</strong><small>отписаны, без согласия или заблокированы</small></div>
              </div>

              <section className="contest-admin-card admin-mailing-templates" aria-labelledby="mailing-templates-title">
                <div className="contest-users-head">
                  <div>
                    <h2 id="mailing-templates-title">Начать с шаблона</h2>
                    <p className="contest-muted">Шаблон заполнит тему и HTML. Всё можно отредактировать перед отправкой.</p>
                  </div>
                  <button type="button" className="contest-secondary-button" disabled={mailingLoading} onClick={() => void loadMailingOverview()}>
                    {mailingLoading ? 'Обновляем…' : 'Обновить данные'}
                  </button>
                </div>
                <div className="admin-mailing-template-grid">
                  {(mailingOverview?.templates || []).map(template => {
                    const TemplateIcon = template.id === 'latest-article' ? Newspaper : template.id === 'tier-list-update' ? Trophy : Mail;
                    return (
                      <button
                        type="button"
                        key={template.id}
                        className={mailingDraft.templateKey === template.id ? 'is-selected' : ''}
                        aria-pressed={mailingDraft.templateKey === template.id}
                        onClick={() => applyMailingTemplate(template)}
                      >
                        <span><TemplateIcon size={20} /></span>
                        <strong>{template.label}</strong>
                        <small>{template.description}</small>
                      </button>
                    );
                  })}
                  {!mailingLoading && !mailingOverview?.templates.length && <p className="contest-muted">Шаблоны пока недоступны.</p>}
                </div>
              </section>

              <div className="admin-mailing-layout">
                <section className="contest-admin-card admin-mailing-editor" aria-labelledby="mailing-editor-title">
                  <div className="admin-card-heading">
                    <span className="admin-card-heading-icon"><Mail size={19} /></span>
                    <div><h2 id="mailing-editor-title">Содержание письма</h2><p>Сначала выберите аудиторию, затем проверьте письмо справа.</p></div>
                  </div>

                  <fieldset className="admin-mailing-audience">
                    <legend>Получатели</legend>
                    {([
                      { id: 'all-consented', label: 'Все согласившиеся', count: mailingOverview?.summary.eligible ?? 0, caption: 'Активные и бывшие подписчики' },
                      { id: 'active', label: 'Только активные', count: mailingOverview?.summary.active ?? 0, caption: 'Есть подписка или бессрочный доступ' },
                      { id: 'former', label: 'Только бывшие', count: mailingOverview?.summary.former ?? 0, caption: 'Ушли, но не отписались от писем' },
                    ] as Array<{ id: MailingSegment; label: string; count: number; caption: string }>).map(segment => (
                      <label key={segment.id} className={mailingDraft.segment === segment.id ? 'is-selected' : ''}>
                        <input
                          type="radio"
                          name="mailing-segment"
                          value={segment.id}
                          checked={mailingDraft.segment === segment.id}
                          onChange={() => setMailingDraft(current => ({ ...current, segment: segment.id }))}
                        />
                        <span><strong>{segment.label}</strong><small>{segment.caption}</small></span>
                        <b>{segment.count}</b>
                      </label>
                    ))}
                  </fieldset>

                  <label className="admin-mailing-field">
                    <span>Тема письма <b>{mailingDraft.subject.length}/160</b></span>
                    <input
                      value={mailingDraft.subject}
                      maxLength={160}
                      onChange={event => {
                        const subject = event.target.value;
                        setMailingDraft(current => ({ ...current, subject, templateKey: 'custom' }));
                        mailingDraftDirtyRef.current = true;
                        if (!subject.trim()) invalidateMailingPreview();
                      }}
                      placeholder="Например: Тир-лист Арены обновлён"
                    />
                  </label>
                  <label className="admin-mailing-field">
                    <span>Короткое описание <b>{mailingDraft.preheader.length}/220</b></span>
                    <input
                      value={mailingDraft.preheader}
                      maxLength={220}
                      onChange={event => {
                        setMailingDraft(current => ({ ...current, preheader: event.target.value, templateKey: 'custom' }));
                        mailingDraftDirtyRef.current = true;
                      }}
                      placeholder="Этот текст виден рядом с темой во входящих"
                    />
                  </label>
                  <label className="admin-mailing-field admin-mailing-html-field">
                    <span>HTML статьи <b>{mailingDraft.htmlBody.length.toLocaleString('ru-RU')} знаков</b></span>
                    <textarea
                      value={mailingDraft.htmlBody}
                      maxLength={100000}
                      spellCheck={false}
                      onChange={event => {
                        const htmlBody = event.target.value;
                        setMailingDraft(current => ({ ...current, htmlBody, templateKey: 'custom' }));
                        mailingDraftDirtyRef.current = true;
                        if (!htmlBody.trim()) invalidateMailingPreview();
                      }}
                      aria-describedby="mailing-html-help"
                    />
                  </label>
                  <p id="mailing-html-help" className="admin-mailing-help">
                    Разрешены безопасные заголовки, абзацы, списки, ссылки, изображения и таблицы. Скрипты, формы, стили и опасные ссылки сервер удалит. Шапка и ссылка отписки добавляются автоматически.
                  </p>

                  <div className="admin-mailing-actions">
                    <button type="button" className="contest-secondary-button" disabled={mailingPreviewLoading} onClick={() => void requestMailingPreview(mailingDraft)}>
                      <Monitor size={17} /> {mailingPreviewLoading ? 'Собираем…' : 'Обновить предпросмотр'}
                    </button>
                    <button type="button" className="contest-secondary-button" disabled={mailingTesting || !mailingOverview?.transport.configured} onClick={() => void sendMailingTest()}>
                      <Send size={17} /> {mailingTesting ? 'Отправляем…' : 'Отправить тест себе'}
                    </button>
                    <button
                      type="button"
                      className="contest-primary-button admin-mailing-send-button"
                      disabled={mailingSending || mailingPreviewCount < 1 || !mailingOverview?.transport.configured}
                      onClick={() => void sendMailing()}
                    >
                      <Mail size={17} /> {mailingSending ? 'Ставим в очередь…' : `Разослать · ${mailingPreviewCount}`}
                    </button>
                  </div>
                  {mailingOverview && !mailingOverview.transport.configured && <p className="admin-inline-error">Почтовый транспорт или секрет ссылки отписки не настроен на сервере.</p>}
                </section>

                <section className="contest-admin-card admin-mailing-preview-card" aria-labelledby="mailing-preview-title">
                  <div className="admin-mailing-preview-toolbar">
                    <div><h2 id="mailing-preview-title">Предпросмотр</h2><p>Точная версия после серверной очистки HTML</p></div>
                    <fieldset aria-label="Размер предпросмотра">
                      <button type="button" className={mailingPreviewMode === 'desktop' ? 'is-active' : ''} aria-pressed={mailingPreviewMode === 'desktop'} onClick={() => setMailingPreviewMode('desktop')}><Monitor size={16} /><span>Экран</span></button>
                      <button type="button" className={mailingPreviewMode === 'mobile' ? 'is-active' : ''} aria-pressed={mailingPreviewMode === 'mobile'} onClick={() => setMailingPreviewMode('mobile')}><Smartphone size={16} /><span>Телефон</span></button>
                    </fieldset>
                  </div>
                  <div className={`admin-mailing-preview-stage is-${mailingPreviewMode}`} aria-busy={mailingPreviewLoading}>
                    {mailingPreviewHtml ? (
                      <iframe
                        title="Предпросмотр письма"
                        sandbox=""
                        referrerPolicy="no-referrer"
                        srcDoc={mailingPreviewHtml}
                      />
                    ) : (
                      <div className="admin-mailing-preview-empty"><Mail size={30} /><strong>Письмо появится здесь</strong><span>Заполните тему и HTML — предпросмотр обновится автоматически.</span></div>
                    )}
                  </div>
                  <div className="admin-mailing-preview-meta">
                    <span>Получателей после проверок</span><strong>{mailingPreviewCount}</strong>
                  </div>
                </section>
              </div>

              <div className="admin-mailing-bottom-grid">
                <section className="contest-admin-card" aria-labelledby="mailing-history-title">
                  <div className="contest-users-head"><div><h2 id="mailing-history-title">История рассылок</h2><p className="contest-muted">Очередь продолжит работу после перезапуска сервера.</p></div></div>
                  <div className="admin-mailing-history">
                    {(mailingOverview?.campaigns || []).map(campaign => {
                      const status = mailingCampaignStatus(campaign.status);
                      return (
                        <div key={campaign.id}>
                          <span className={`admin-mailing-status is-${status.tone}`}>{status.label}</span>
                          <div>
                            <strong>{campaign.subject}</strong>
                            <small>{formatDate(campaign.createdAt)} · {campaign.recipientCount} получателей</small>
                            {campaign.error && <small className="admin-mailing-campaign-error">{campaign.error}</small>}
                          </div>
                          <span>{campaign.acceptedCount} принято · {campaign.failedCount} ошибок · {campaign.skippedCount} пропущено</span>
                        </div>
                      );
                    })}
                    {!mailingLoading && !mailingOverview?.campaigns.length && <p className="contest-muted">Рассылок ещё не было.</p>}
                  </div>
                </section>

                <section className="contest-admin-card" aria-labelledby="mailing-contacts-title">
                  <div className="contest-users-head"><div><h2 id="mailing-contacts-title">Реестр адресов</h2><p className="contest-muted">Бывшие подписчики остаются в реестре; отписанные адреса хранятся как запрет отправки.</p></div></div>
                  <div className="admin-mailing-contacts">
                    {(mailingOverview?.contacts || []).slice(0, 10).map(contact => (
                      <div key={contact.id}>
                        <span className={contact.eligible ? 'is-ok' : 'is-muted'}><i />{mailingConsentLabel(contact)}</span>
                        <div><strong>{contact.name || contact.email}</strong><small>{contact.email} · {contact.lifecycle === 'active' ? 'активный' : 'бывший'}</small></div>
                      </div>
                    ))}
                    {!mailingLoading && !mailingOverview?.contacts.length && <p className="contest-muted">Сохранённых адресов пока нет.</p>}
                  </div>
                  {Boolean(mailingOverview?.contacts.length) && <p className="admin-mailing-register-note">Показаны последние 10 записей из {mailingOverview?.summary.total || 0}.</p>}
                </section>
              </div>
            </div>
          )}

          {hasFullAdminAccess && adminSection === 'boosty' && (
            <div className="contest-admin-card admin-full-card">
              <div className="contest-users-head">
                <div>
                  <h2>Подписчики Boosty</h2>
                  <p className="contest-muted">
                    Распознанные уровни и доступы сайта. Показано {visibleBoostySubscribers.length} из {filteredBoostySubscribers.length}{filteredBoostySubscribers.length !== (boostySubscribers?.subscribers.length || 0) ? ` · всего ${boostySubscribers?.subscribers.length || 0}` : ''}.
                  </p>
                </div>
                <button
                  type="button"
                  className="contest-secondary-button"
                  disabled={boostyStatusLoading || boostySubscribersLoading}
                  onClick={() => {
                    void loadBoostyStatus();
                    void loadBoostySubscribers();
                  }}
                >
                  {boostyStatusLoading || boostySubscribersLoading ? 'Загрузка...' : 'Обновить Boosty'}
                </button>
              </div>

              <div className={`admin-boosty-status admin-boosty-status-${boostyApiTone}`}>
                <div>
                  <strong>Boosty API: {boostyApiLabel}</strong>
                  <span>
                    Источник: {boostyStatus?.source || '—'}
                    {' · '}
                    Импорт: {boostyStatus?.importStatus || '—'}
                    {' · '}
                    Grace: {boostyStatus?.graceHours ?? 24} ч
                  </span>
                  <span>
                    Возраст снапшота: {typeof boostyStatus?.snapshotAgeSeconds === 'number' ? `${Math.round(boostyStatus.snapshotAgeSeconds / 60)} мин` : '—'}
                    {boostyStatus?.checkedAt ? ` · Проверено: ${formatDate(boostyStatus.checkedAt)}` : ''}
                    {` · Без email: ${boostySubscriberStats.missingEmail}`}
                  </span>
                  {boostyStatus?.lastErrorMessage && <span>Ошибка: {boostyStatus.lastErrorMessage}</span>}
                </div>
              </div>

              <div className="admin-stat-grid admin-boosty-stats">
                <div><span>Всего Boosty</span><strong>{boostySubscriberStats.total}</strong><small>включая неактивных</small></div>
                <div><span>Платные Boosty</span><strong>{boostySubscriberStats.boostyPaid}</strong><small>как в кабинете Boosty</small></div>
                <div><span>Активный доступ</span><strong>{boostySubscriberStats.activePaid}</strong><small>оплачено, даже без автопродления</small></div>
                <div><span>Доступ на сайте</span><strong>{boostySubscriberStats.siteAccess}</strong><small>активная оплата + тариф распознан</small></div>
              </div>

              <div className="admin-boosty-levels" aria-label="Уровни Boosty">
                {boostyLevelOptions.map(levelName => (
                  <button
                    key={levelName}
                    type="button"
                    className={boostyLevelFilter === levelName ? 'is-active' : ''}
                    onClick={() => { setBoostyLevelFilter(boostyLevelFilter === levelName ? 'all' : levelName); setBoostyPage(1); }}
                  >
                    <span>{levelName || 'Без уровня'}</span>
                    <b>{boostySubscribers?.levels?.[levelName] ?? 0}</b>
                  </button>
                ))}
                {!boostyLevelOptions.length && <p className="contest-muted">Уровни появятся после загрузки Boosty.</p>}
              </div>

              <div className="admin-boosty-filters admin-page-toolbar">
                <label>
                  Поиск
                  <input
                    value={boostySubscribersSearch}
                    onChange={e => { setBoostySubscribersSearch(e.target.value); setBoostyPage(1); }}
                    placeholder="email, имя, Boosty ID или уровень"
                    style={ADMIN_INPUT}
                  />
                </label>
                <label>
                  Уровень
                  <select value={boostyLevelFilter} onChange={e => { setBoostyLevelFilter(e.target.value); setBoostyPage(1); }} style={ADMIN_INPUT}>
                    <option value="all">Все уровни</option>
                    {boostyLevelOptions.map(levelName => (
                      <option key={levelName} value={levelName}>{levelName || 'Без уровня'}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Статус
                  <select value={boostyAccessFilter} onChange={e => { setBoostyAccessFilter(e.target.value as typeof boostyAccessFilter); setBoostyPage(1); }} style={ADMIN_INPUT}>
                    <option value="all">Все</option>
                    <option value="site">Доступ на сайте</option>
                    <option value="paid">Активные платные</option>
                    <option value="free">Без платной подписки</option>
                    <option value="inactive">Неактивные</option>
                  </select>
                </label>
              </div>

              <p className="contest-muted">
                Источник списка: {boostySubscribers?.source || '—'}
                {' · '}
                Загружено: {boostySubscribers?.fetchedAt ? formatDate(boostySubscribers.fetchedAt) : '—'}
              </p>
              {boostySubscribers?.error && <div className="contest-message contest-message-err">{boostySubscribers.error}</div>}

              <div className="admin-boosty-list">
                {boostySubscribersLoading && !boostySubscribers?.subscribers.length ? (
                  <p className="contest-muted">Загружаем Boosty-аудиторию...</p>
                ) : visibleBoostySubscribers.length ? visibleBoostySubscribers.map(subscriber => {
                  const accessLabels = subscriptionEntitlementLabels({
                    hasAccess: subscriber.siteAccess,
                    entitlements: subscriber.entitlements,
                  });
                  return (
                    <article key={subscriber.id} className={`admin-boosty-row ${subscriber.siteAccess ? 'has-site-access' : subscriber.hasActivePaidAccess ? 'has-paid-access' : ''}`}>
                      <div className="admin-boosty-person">
                        {subscriber.avatarUrl ? (
                          <img src={subscriber.avatarUrl} alt="" />
                        ) : (
                          <span>{(subscriber.name || subscriber.email || '?').slice(0, 1).toUpperCase()}</span>
                        )}
                        <div>
                          <strong>{subscriber.name || 'Без имени'}</strong>
                          <small className={subscriber.hasEmail ? '' : 'is-warning'}>{subscriber.email || 'email не открыт'}</small>
                          <code>Boosty ID {subscriber.id}</code>
                        </div>
                      </div>
                      <div>
                        <strong>{subscriber.level?.name || 'Без уровня'}</strong>
                        <span>Цена: {subscriber.money?.currentPrice || subscriber.level?.price || 0} {subscriber.money?.currency || subscriber.level?.currency || 'RUB'}</span>
                        <span>Статус: {subscriber.active ? 'active' : subscriber.status || 'inactive'}</span>
                        <span>Продление: {subscriber.willRenew ? 'да' : 'нет'}</span>
                      </div>
                      <div>
                        <strong>{subscriber.siteAccess ? 'Открывает сайт' : subscriber.hasActivePaidAccess ? 'Платит, но тариф не сопоставлен' : 'Не открывает сайт'}</strong>
                        <span>Доступы: {accessLabels.join(', ') || 'нет'}</span>
                        <span>Следующий платеж: {subscriber.dates?.nextPaymentAt ? formatDate(subscriber.dates.nextPaymentAt) : '—'}</span>
                        <span>Подписан: {subscriber.dates?.subscribedAt ? formatDate(subscriber.dates.subscribedAt) : '—'}</span>
                      </div>
                    </article>
                  );
                }) : (
                  <p className="contest-muted">
                    {boostySubscribers ? 'Подписчики Boosty не найдены по текущим фильтрам.' : 'Нажмите “Обновить Boosty”, чтобы загрузить список подписчиков.'}
                  </p>
                )}
              </div>
              {boostyPageCount > 1 && (
                <nav className="admin-pagination" aria-label="Страницы списка подписчиков Boosty">
                  <button type="button" disabled={boostyPage === 1} onClick={() => setBoostyPage(page => Math.max(1, page - 1))}>Назад</button>
                  <span>Страница {boostyPage} из {boostyPageCount}</span>
                  <button type="button" disabled={boostyPage === boostyPageCount} onClick={() => setBoostyPage(page => Math.min(boostyPageCount, page + 1))}>Далее</button>
                </nav>
              )}
            </div>
          )}

          {hasFullAdminAccess && adminSection === 'telegram' && (
            <div className="contest-admin-card admin-full-card">
              <div className="contest-users-head">
                <div>
                  <h2>Telegram-аккаунты</h2>
                  <p className="contest-muted">
                    Профили с Telegram и историей проверки. Показано {visibleTelegramAccounts.length} из {filteredTelegramAccounts.length}{filteredTelegramAccounts.length !== (telegramAccounts?.accounts.length || 0) ? ` · всего ${telegramAccounts?.accounts.length || 0}` : ''}.
                  </p>
                </div>
                <button
                  type="button"
                  className="contest-secondary-button"
                  disabled={telegramAccountsLoading}
                  onClick={() => void loadTelegramAccounts()}
                >
                  {telegramAccountsLoading ? 'Загрузка...' : 'Обновить данные'}
                </button>
              </div>

              <div className={`admin-telegram-status ${telegramAccounts?.error ? 'is-error' : telegramAccounts?.configured ? 'is-ok' : 'is-warning'}`}>
                <div>
                  <strong>{telegramAccounts?.error ? 'Не удалось получить данные Telegram' : telegramAccounts?.configured ? 'Telegram bot настроен' : 'Telegram bot не настроен'}</strong>
                  {telegramAccounts?.error && <span>{telegramAccounts.error}</span>}
                  <span>Каналы проверки: {telegramAccounts?.chatIds?.length ? telegramAccounts.chatIds.join(', ') : 'нет настроенных chat_id'}</span>
                  <span>Загружено: {telegramAccounts?.fetchedAt ? formatDate(telegramAccounts.fetchedAt) : '—'} · Устаревшие проверки: {telegramAccounts?.summary.stale ?? 0}</span>
                </div>
              </div>

              <div className="admin-stat-grid admin-telegram-stats">
                <div><span>Всего</span><strong>{telegramAccounts?.summary.total ?? 0}</strong><small>Telegram-связанные профили</small></div>
                <div><span>Доступ</span><strong>{telegramAccounts?.summary.access ?? 0}</strong><small>есть в VIP-каналах</small></div>
                <div><span>Можно проверить</span><strong>{telegramAccounts?.summary.checkable ?? 0}</strong><small>есть Telegram ID</small></div>
                <div><span>Только username</span><strong>{telegramAccounts?.summary.contactOnly ?? 0}</strong><small>нужна привязка Telegram</small></div>
              </div>

              <div className="admin-telegram-filters admin-page-toolbar">
                <label>
                  Поиск
                  <input
                    value={telegramAccountsSearch}
                    onChange={e => { setTelegramAccountsSearch(e.target.value); setTelegramPage(1); }}
                    placeholder="email, имя, @username или Telegram ID"
                    style={ADMIN_INPUT}
                  />
                </label>
                <label>
                  Статус
                  <select value={telegramAccessFilter} onChange={e => { setTelegramAccessFilter(e.target.value as typeof telegramAccessFilter); setTelegramPage(1); }} style={ADMIN_INPUT}>
                    <option value="all">Все</option>
                    <option value="access">Есть Telegram-доступ</option>
                    <option value="checkable">Можно проверить</option>
                    <option value="contact-only">Только username</option>
                    <option value="stale">Устаревшая проверка</option>
                    <option value="blocked">Заблокированные</option>
                  </select>
                </label>
              </div>

              <div className="admin-telegram-list">
                {telegramAccountsLoading && !telegramAccounts?.accounts.length ? (
                  <p className="contest-muted">Загружаем Telegram-аккаунты...</p>
                ) : visibleTelegramAccounts.length ? visibleTelegramAccounts.map(account => {
                  const accessLabels = subscriptionEntitlementLabels({
                    hasAccess: account.hasAccess,
                    entitlements: account.entitlements,
                  });
                  const stateLabel = account.accessState === 'access'
                    ? 'Есть доступ'
                    : account.accessState === 'checkable'
                      ? 'Можно проверить ботом'
                      : account.accessState === 'contact-only'
                        ? 'Только username'
                        : account.accessState === 'blocked'
                          ? 'Заблокирован'
                          : 'Нет доступа';
                  return (
                    <article key={account.id} className={`admin-telegram-row is-${account.accessState}`}>
                      <div className="admin-telegram-person">
                        {account.photoUrl ? (
                          <img src={account.photoUrl} alt="" />
                        ) : (
                          <span>{(account.name || account.telegramUsername || account.email || '?').slice(0, 1).toUpperCase()}</span>
                        )}
                        <div>
                          <strong>{account.name || account.telegramUsername || 'Без имени'}</strong>
                          <small>{account.email || 'email не указан'}</small>
                          <code>{account.profileId}</code>
                        </div>
                      </div>
                      <div>
                        <strong>{account.telegramUsername ? `@${account.telegramUsername}` : 'Telegram username не указан'}</strong>
                        <span>Telegram ID: {account.telegramId || '—'}</span>
                        <span>OIDC ID: {account.telegramOidcId || '—'}</span>
                        <span>Контакт в профиле: {account.contactTelegram ? `@${account.contactTelegram}` : '—'}</span>
                      </div>
                      <div>
                        <strong>{stateLabel}</strong>
                        <span>Источник: {account.source || '—'}</span>
                        <span>Доступы: {accessLabels.join(', ') || 'нет'}</span>
                        <span>Проверка: {account.checkedAt ? formatDate(account.checkedAt) : '—'}{account.stale ? ' · устарела' : ''}</span>
                        {account.message && <small>{account.message}</small>}
                      </div>
                      <div className="admin-telegram-chats">
                        <strong>Каналы</strong>
                        {account.chats.length ? account.chats.map((chat, index) => (
                          <span key={`${account.id}-${String(chat.chatId || index)}`} className={chat.isMember || chat.hasAccess ? 'is-member' : 'is-missing'}>
                            {String(chat.chatId || chat.id || 'chat')}
                            {' · '}
                            {String(chat.status || chat.error || (chat.isMember || chat.hasAccess ? 'member' : 'no access'))}
                          </span>
                        )) : (
                          <span>Истории проверки каналов нет</span>
                        )}
                      </div>
                    </article>
                  );
                }) : (
                  <p className="contest-muted">
                    {telegramAccounts ? 'Telegram-аккаунты не найдены по текущим фильтрам.' : 'Нажмите “Обновить Telegram”, чтобы загрузить список аккаунтов.'}
                  </p>
                )}
              </div>
              {telegramPageCount > 1 && (
                <nav className="admin-pagination" aria-label="Страницы списка Telegram-аккаунтов">
                  <button type="button" disabled={telegramPage === 1} onClick={() => setTelegramPage(page => Math.max(1, page - 1))}>Назад</button>
                  <span>Страница {telegramPage} из {telegramPageCount}</span>
                  <button type="button" disabled={telegramPage === telegramPageCount} onClick={() => setTelegramPage(page => Math.min(telegramPageCount, page + 1))}>Далее</button>
                </nav>
              )}
            </div>
          )}

          {hasFullAdminAccess && adminSection === 'articles' && (
            <div className="contest-admin-grid admin-article-layout">
              <form ref={articleFormRef} className="contest-admin-card admin-article-form" onSubmit={submitArticle}>
                <div className="admin-subsection-head">
                  <div>
                    <h2>{editingArticleId ? 'Редактирование статьи' : 'Новая статья'}</h2>
                    {editingArticleId && <p className="contest-muted">ID: {editingArticleId}</p>}
                  </div>
                  {editingArticleId && (
                    <button type="button" className="contest-secondary-button" onClick={cancelArticleEdit}>
                      Отменить
                    </button>
                  )}
                </div>
                <label>Название<input required value={articleForm.title} onChange={e => setArticleForm(v => ({ ...v, title: e.target.value }))} style={ADMIN_INPUT} /></label>
                <label>Раздел<input value={articleForm.tag} onChange={e => setArticleForm(v => ({ ...v, tag: e.target.value }))} placeholder="Гайд, Мета, Поля Сражений" style={ADMIN_INPUT} /></label>
                <label>Тип доступа
                  <select value={articleForm.mode} onChange={e => setArticleForm(v => ({ ...v, mode: e.target.value as Article['mode'] }))} style={ADMIN_INPUT}>
                    <option value="arena">Арена — подписка на статьи Арены</option>
                    <option value="battlegrounds">Поля Сражений — подписка на статьи БГ</option>
                    <option value="general">Общий материал</option>
                  </select>
                  <span className="admin-field-hint">Этот выбор определяет, какой доступ понадобится читателю.</span>
                </label>
                <label>Краткое описание
                  <textarea value={articleForm.excerpt} onChange={e => setArticleForm(v => ({ ...v, excerpt: e.target.value }))} rows={4} placeholder="Описание для карточки статьи" style={{ ...ADMIN_INPUT, resize: 'vertical' }} />
                </label>
                <label>Дата публикации
                  <input
                    type="date"
                    value={articleForm.date}
                    onChange={e => setArticleForm(v => ({ ...v, date: e.target.value }))}
                    style={ADMIN_INPUT}
                  />
                  <span className="admin-field-hint">Если оставить пустым, будет сохранена сегодняшняя дата.</span>
                </label>
                <label>Ссылка<input value={articleForm.url} onChange={e => setArticleForm(v => ({ ...v, url: e.target.value }))} placeholder="https://..." style={ADMIN_INPUT} /></label>
                <AdminImageUploader label="Картинка статьи" value={articleForm.image} onChange={url => setArticleForm(v => ({ ...v, image: url }))} />
                <button type="submit" disabled={loading} className="contest-primary-button">
                  {editingArticleId ? 'Обновить статью' : 'Сохранить статью'}
                </button>
              </form>

              <div ref={articleListRef} className="contest-admin-card admin-article-list-card">
                <div className="admin-subsection-head">
                  <div><h2>Список статей</h2><p className="contest-muted">Показано {visibleAdminArticles.length} из {filteredAdminArticles.length}{filteredAdminArticles.length !== adminArticles.length ? ` · всего ${adminArticles.length}` : ''}</p></div>
                </div>
                <div className="admin-list-toolbar admin-page-toolbar">
                  <label>
                    <span>Поиск по статьям</span>
                    <input value={articleQuery} onChange={event => { setArticleQuery(event.target.value); setArticlePage(1); }} placeholder="Название, раздел или описание" style={ADMIN_INPUT} />
                  </label>
                </div>
                <div className="admin-article-list">
                  {visibleAdminArticles.map(article => (
                    <div key={article.id} className="admin-article-row">
                      {article.image ? <img src={article.image} alt="" /> : <div><BookOpen size={18} /></div>}
                      <span><strong>{article.title}</strong><small>{article.tag || 'Без раздела'} · {article.date} · <b>{articleModeLabel(article.mode)}</b></small></span>
                      <div className="admin-article-actions">
                        {article.url && article.url !== '#' && <a href={article.url} target="_blank" rel="noreferrer" aria-label={`Открыть статью: ${article.title}`}><ExternalLink size={14} /> Просмотр</a>}
                        <button type="button" onClick={() => editArticle(article)} disabled={loading}>Редактировать</button>
                        <button type="button" className="admin-danger-button" onClick={() => void deleteArticle(article)} disabled={loading}>Удалить</button>
                      </div>
                    </div>
                  ))}
                  {!filteredAdminArticles.length && <p className="contest-muted">{adminArticles.length ? 'По вашему запросу ничего не найдено.' : 'Статей пока нет.'}</p>}
                </div>
                {articlePageCount > 1 && (
                  <nav className="admin-pagination" aria-label="Страницы списка статей">
                    <button
                      type="button"
                      disabled={articlePage === 1}
                      onClick={() => {
                        setArticlePage(page => Math.max(1, page - 1));
                        window.requestAnimationFrame(() => articleListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
                      }}
                    >
                      Назад
                    </button>
                    <span>Страница {articlePage} из {articlePageCount}</span>
                    <button
                      type="button"
                      disabled={articlePage === articlePageCount}
                      onClick={() => {
                        setArticlePage(page => Math.min(articlePageCount, page + 1));
                        window.requestAnimationFrame(() => articleListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
                      }}
                    >
                      Далее
                    </button>
                  </nav>
                )}
              </div>
            </div>
          )}

          {hasFullAdminAccess && adminSection === 'gallery' && (
            <div className="contest-admin-grid admin-gallery-layout">
              <form className="contest-admin-card admin-gallery-form" onSubmit={submitGalleryItem}>
                <div className="admin-subsection-head">
                  <div>
                    <h2>Новый арт</h2>
                    <p className="contest-muted">Оригинал сохранится для скачивания, а сайт сам создаст легкие превью.</p>
                  </div>
                  <ImageIcon size={28} />
                </div>
                <label>Название
                  <input value={galleryForm.title} onChange={e => setGalleryForm(v => ({ ...v, title: e.target.value }))} placeholder="Например: Легенда Арены" style={ADMIN_INPUT} />
                </label>
                <label>Раздел
                  <input value={galleryForm.tag} onChange={e => setGalleryForm(v => ({ ...v, tag: e.target.value }))} placeholder="Арт, Обложка, Fan art" style={ADMIN_INPUT} />
                </label>
                <label>Описание
                  <textarea value={galleryForm.description} onChange={e => setGalleryForm(v => ({ ...v, description: e.target.value }))} rows={4} placeholder="Короткое описание для карточки" style={{ ...ADMIN_INPUT, resize: 'vertical' }} />
                </label>
                <label>Источник или автор
                  <input value={galleryForm.source} onChange={e => setGalleryForm(v => ({ ...v, source: e.target.value }))} placeholder="Необязательно" style={ADMIN_INPUT} />
                </label>
                <label className="admin-gallery-file">
                  <span>{galleryFile ? galleryFile.name : 'Выберите изображение'}</span>
                  <input
                    ref={galleryFileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    onChange={event => setGalleryFile(firstImageFile(event.target.files))}
                  />
                </label>
                {galleryFile && (
                  <div className="admin-gallery-selected">
                    <ImageIcon size={18} />
                    <span>{galleryFile.name}</span>
                    <small>{formatBytes(galleryFile.size)}</small>
                  </div>
                )}
                <button type="submit" disabled={galleryUploading} className="contest-primary-button">
                  {galleryUploading ? 'Загружаем...' : 'Добавить в галерею'}
                </button>
              </form>

              <div className="contest-admin-card">
                <div className="admin-subsection-head">
                  <div>
                    <h2>Загруженные арты</h2>
                    <p className="contest-muted">Публичный раздел `/gallery`, доступен всем пользователям.</p>
                  </div>
                  <button type="button" className="contest-secondary-button" onClick={() => void loadGalleryItems()}>
                    Обновить
                  </button>
                </div>
                <div className="admin-gallery-list">
                  {galleryItems.map(item => (
                    <article key={item.id} className="admin-gallery-row">
                      <img src={item.thumbUrl || item.previewUrl} alt="" loading="lazy" decoding="async" />
                      <div>
                        <strong>{item.title}</strong>
                        <small>{[item.tag || 'без раздела', item.width && item.height ? `${item.width} x ${item.height}` : '', formatBytes(item.bytes)].filter(Boolean).join(' · ')}</small>
                        <span>{item.description || 'Описание не указано'}</span>
                      </div>
                      <div className="admin-gallery-actions">
                        <a href={item.downloadUrl} title="Скачать оригинал" aria-label={`Скачать оригинал: ${item.title}`}><Download size={17} /></a>
                        <button type="button" onClick={() => void deleteGalleryItem(item)} disabled={galleryDeletingId === item.id} title="Удалить" aria-label={`Удалить арт: ${item.title}`}>
                          <Trash2 size={17} />
                        </button>
                      </div>
                    </article>
                  ))}
                  {!galleryItems.length && <p className="contest-muted">В галерее пока нет артов.</p>}
                </div>
              </div>
            </div>
          )}

          {adminSection === 'contests' && (
            <div className="contest-admin-grid">
              <div className="admin-view-switch admin-full-card" role="group" aria-label="Режим работы с конкурсами">
                <button type="button" className={contestWorkspaceView === 'manage' ? 'is-active' : ''} aria-pressed={contestWorkspaceView === 'manage'} onClick={() => setContestWorkspaceView('manage')}>Управление</button>
                <button type="button" className={contestWorkspaceView === 'editor' ? 'is-active' : ''} aria-pressed={contestWorkspaceView === 'editor'} onClick={() => setContestWorkspaceView('editor')}>{form.id ? 'Редактирование' : 'Новый конкурс'}</button>
              </div>

              {contestWorkspaceView === 'editor' && (
                <form ref={contestFormRef} className="contest-admin-card admin-contest-form" onSubmit={submitContest}>
                <div className="admin-contest-form-head">
                  <div>
                    <span className="contest-eyebrow">Конкурс</span>
                    <h2>{form.id ? 'Редактирование конкурса' : 'Новый конкурс'}</h2>
                    {form.id ? <p>Изменения применятся к выбранному конкурсу и его публичной странице.</p> : <p>Заполни основные данные, проверь предпросмотр и выбери режим публикации.</p>}
                  </div>
                  <span className="admin-contest-mode">{form.id ? 'Изменение' : 'Создание'}</span>
                </div>

                <div className="admin-contest-editor">
                  <div className="admin-contest-sections">
                    <section className="admin-contest-section">
                      <div className="admin-section-title">
                        <span>1</span>
                        <div><strong>Основное</strong><small>Название, приз и описание для участников</small></div>
                      </div>
                      <label>Название конкурса<input value={form.title} onChange={e => setForm(v => ({ ...v, title: e.target.value }))} placeholder="Например: Розыгрыш рунических камней" style={ADMIN_INPUT} /></label>
                      <label>Приз<input value={form.prize} onChange={e => setForm(v => ({ ...v, prize: e.target.value }))} placeholder="Например: 3000 рунических камней" style={ADMIN_INPUT} /></label>
                      <label>Описание<textarea value={form.description} onChange={e => setForm(v => ({ ...v, description: e.target.value }))} rows={5} placeholder="Коротко объясни условия участия и что получит победитель." style={{ ...ADMIN_INPUT, resize: 'vertical' }} /></label>
                    </section>

                    <section className="admin-contest-section">
                      <div className="admin-section-title">
                        <span>2</span>
                        <div><strong>Картинка</strong><small>Можно вставить Ctrl+V, перетащить файл или указать URL</small></div>
                      </div>
                      <AdminImageUploader label="Обложка конкурса" value={form.imageUrl} onChange={url => setForm(v => ({ ...v, imageUrl: url }))} allowExternalUrl={false} />
                    </section>

                    <section className="admin-contest-section">
                      <div className="admin-section-title">
                        <span>3</span>
                        <div><strong>Расписание</strong><small>Если старт пустой, конкурс запускается сразу после публикации</small></div>
                      </div>
	                      <div className="admin-date-presets" aria-label="Быстрый выбор времени конкурса">
	                        <button type="button" onClick={setContestStartNow}>Старт сейчас</button>
	                        <button type="button" onClick={setContestStartInHour}>Старт через час</button>
	                        <button type="button" onClick={setContestEndInTenMinutes}>Финиш +10 минут</button>
	                        <button type="button" onClick={setContestEndInHour}>Финиш +1 час</button>
	                        <button type="button" onClick={setContestEndTomorrow}>Финиш +24 часа</button>
	                      </div>
                      <div className="contest-admin-two">
                        <label>Старт<input type="datetime-local" value={form.startsAt} onChange={e => setForm(v => ({ ...v, startsAt: e.target.value }))} style={ADMIN_INPUT} /></label>
                        <label>Финиш<input type="datetime-local" value={form.endsAt} onChange={e => setForm(v => ({ ...v, endsAt: e.target.value }))} style={ADMIN_INPUT} /></label>
                      </div>
                      <span className="admin-field-hint">После финиша конкурс останется в прошлых конкурсах. Удалять его можно вручную.</span>
                    </section>

                    <section className="admin-contest-section">
                      <div className="admin-section-title">
                        <span>4</span>
                        <div><strong>Публикация</strong><small>Выбери, что сайт должен сделать с конкурсом</small></div>
                      </div>
                      <div className="admin-status-grid">
                        {CONTEST_STATUS_OPTIONS.map(option => (
	                          <button
	                            key={option.value}
	                            type="button"
	                            className={form.status === option.value ? 'is-active' : ''}
	                            aria-pressed={form.status === option.value}
	                            onClick={() => setForm(v => ({ ...v, status: option.value }))}
	                          >
                            <strong>{option.label}</strong>
                            <span>{option.caption}</span>
                          </button>
                        ))}
                      </div>
                    </section>
                  </div>

                  <aside className="admin-contest-preview-panel" aria-label="Предпросмотр конкурса">
                    <div className="admin-contest-preview-card">
                      {form.imageUrl ? <img src={form.imageUrl} alt="" /> : <div className="admin-contest-preview-placeholder"><ImageIcon size={28} /><span>Обложка появится здесь</span></div>}
                      <div>
                        <span className="admin-contest-preview-status">{currentStatus.label}</span>
                        <h3>{form.title.trim() || 'Название конкурса'}</h3>
                        <p>{form.description.trim() || 'Описание будет видно участникам на странице конкурсов.'}</p>
                        <dl>
                          <div><dt>Приз</dt><dd>{form.prize.trim() || 'не указан'}</dd></div>
                          <div><dt>Старт</dt><dd>{previewStartsAt}</dd></div>
                          <div><dt>Финиш</dt><dd>{previewEndsAt}</dd></div>
                        </dl>
                      </div>
                    </div>
                    <div className="admin-form-actions admin-contest-submit-row">
                      <button type="submit" disabled={loading || !form.title.trim() || !form.prize.trim()} className="contest-primary-button">
                        {form.id ? 'Сохранить изменения' : 'Создать конкурс'}
                      </button>
                      <button type="button" className="contest-secondary-button" onClick={resetContestForm}>
                        {form.id ? 'Создать новый' : 'Очистить форму'}
                      </button>
                    </div>
                    {form.id && <p className="contest-muted">Редактируется: <code>{form.id}</code></p>}
                  </aside>
                </div>
                </form>
              )}

              {contestWorkspaceView === 'manage' && (
                <div className="contest-admin-card admin-contest-manage-card">
                <div className="admin-contest-form-head">
                  <div>
                    <span className="contest-eyebrow">Управление</span>
                    <h2>Рабочий стол конкурсов</h2>
                    <p>Один экран для проверки заявок, выбора победителей и завершения конкурса.</p>
                  </div>
                  <button type="button" className="contest-secondary-button" onClick={resetContestForm}>Новый конкурс</button>
                </div>

	                <div className="admin-contest-summary-grid" aria-label="Сводка конкурсов">
	                  <button type="button" className={contestStatusFilter === 'all' ? 'is-active' : ''} aria-pressed={contestStatusFilter === 'all'} onClick={() => setContestStatusFilter('all')}>
	                    <strong>{contestStats.all}</strong><span>Все</span>
	                  </button>
	                  <button type="button" className={contestStatusFilter === 'active' ? 'is-active' : ''} aria-pressed={contestStatusFilter === 'active'} onClick={() => setContestStatusFilter('active')}>
	                    <strong>{contestStats.active}</strong><span>Активные</span>
	                  </button>
	                  <button type="button" className={contestStatusFilter === 'planned' ? 'is-active' : ''} aria-pressed={contestStatusFilter === 'planned'} onClick={() => setContestStatusFilter('planned')}>
	                    <strong>{contestStats.planned}</strong><span>Скоро</span>
	                  </button>
	                  <button type="button" className={contestStatusFilter === 'draft' ? 'is-active' : ''} aria-pressed={contestStatusFilter === 'draft'} onClick={() => setContestStatusFilter('draft')}>
	                    <strong>{contestStats.draft}</strong><span>Черновики</span>
	                  </button>
	                  <button type="button" className={contestStatusFilter === 'completed' ? 'is-active' : ''} aria-pressed={contestStatusFilter === 'completed'} onClick={() => setContestStatusFilter('completed')}>
	                    <strong>{contestStats.completed}</strong><span>Завершены</span>
	                  </button>
	                  <button type="button" className={contestStatusFilter === 'cancelled' ? 'is-active' : ''} aria-pressed={contestStatusFilter === 'cancelled'} onClick={() => setContestStatusFilter('cancelled')}>
	                    <strong>{contestStats.cancelled}</strong><span>Отменены</span>
	                  </button>
                </div>

                <div className="admin-contest-workflow">
                  <div className="admin-contest-picker">
                    <div className="admin-subsection-head">
                      <div>
                        <strong>1. Выберите конкурс</strong>
                        <span>{filteredContests.length ? `${filteredContests.length} в текущем фильтре` : 'нет конкурсов в фильтре'}</span>
                      </div>
                    </div>
                    <div className="admin-contest-list">
                      {filteredContests.map(contest => (
                        <div key={contest.id} className={contest.id === selectedContestId ? 'is-selected' : ''}>
	                          <button type="button" aria-pressed={contest.id === selectedContestId} onClick={() => dispatchContestSelection({ type: 'select', contest })}>
                            <strong>{contest.title}</strong>
                            <span>{contestStatusLabel(contest.status)} · {contest.entriesCount ?? 0} заявок{contest.endsAt ? ` · ${formatDate(contest.endsAt)}` : ''}</span>
                          </button>
                        </div>
                      ))}
                      {!filteredContests.length && <p className="contest-muted">В этом фильтре конкурсов нет.</p>}
                    </div>
                  </div>

                  <div className="admin-contest-detail">
                    {selectedContest ? (
                      <>
                        <div className="admin-selected-contest">
                          <div>
                            <span className={`admin-status-badge admin-status-${selectedContest.status}`}>{contestStatusLabel(selectedContest.status)}</span>
                            <h3>{selectedContest.title}</h3>
                            <p>{selectedContest.prize}</p>
                          </div>
                          <dl>
                            <div><dt>Заявки</dt><dd>{selectedContestEntryCount}</dd></div>
                            <div><dt>Одобрены</dt><dd>{approvedEntries.length}</dd></div>
                            <div><dt>Победители</dt><dd>{selectedContestWinnerCount}</dd></div>
                          </dl>
                        </div>

                        <div className="admin-form-actions">
                          <button type="button" className="contest-secondary-button" onClick={editSelectedContest}>Редактировать настройки</button>
                          <button type="button" className="contest-secondary-button" onClick={() => void loadAdminContests()}>Обновить список</button>
                          <button type="button" className="admin-danger-button" onClick={() => void deleteContest(selectedContest)} disabled={loading}>Удалить конкурс</button>
                        </div>

                        <div className="admin-subsection-head">
                          <div>
                            <strong>2. Проверьте заявки</strong>
                            <span>Отмечайте победителей прямо в списке. Неодобренные заявки нельзя выбрать.</span>
                          </div>
                          <button type="button" className="contest-secondary-button" onClick={clearWinnerSelection} disabled={!selectedWinnerIds.length}>Сбросить выбор</button>
                        </div>

                        <div className="contest-entry-list">
                          {entriesLoading ? <p className="contest-muted">Загружаем заявки конкурса...</p> : entries.length ? visibleEntries.map(entry => {
                            const isApproved = entry.status === 'approved';
                            const isWinner = selectedWinnerIdSet.has(entry.profileId);
                            return (
                              <div
                                key={entry.id}
                                className={`contest-entry-row admin-winner-entry ${isWinner ? 'is-winner' : ''} ${!isApproved ? 'is-disabled' : ''}`}
                              >
                                <label className="admin-winner-select">
                                  <input
                                    type="checkbox"
                                    checked={isWinner}
                                    disabled={!isApproved}
                                    onChange={() => toggleWinner(entry.profileId)}
                                  />
                                  <span>
                                    <strong>{entry.name || entry.profileId}</strong>
                                    <small>{entry.profileId} · {entry.email || 'email не указан'}</small>
                                    <small>VK: {entry.profileContacts?.vk || entry.contact?.vk || '—'} · TG: {entry.profileContacts?.telegram || entry.contact?.telegram || '—'}</small>
                                  </span>
                                </label>
                                <div className="contest-entry-actions">
                                  <code>{contestStatusLabel(entry.status)}</code>
                                  <button type="button" className="contest-secondary-button" onClick={() => void copyText(entry.profileId, 'ID участника скопирован.')}>ID</button>
                                </div>
                              </div>
                            );
                          }) : <p className="contest-muted">Заявок пока нет. После первой заявки здесь появится список участников.</p>}
                        </div>
                        {entriesPageCount > 1 && (
                          <nav className="admin-pagination" aria-label="Страницы заявок конкурса">
                            <button type="button" disabled={entriesPage === 1 || entriesLoading} onClick={() => dispatchContestSelection({ type: 'setEntriesPage', entriesPage: entriesPage - 1 })}>Назад</button>
                            <span>Страница {entriesPage} из {entriesPageCount}</span>
                            <button type="button" disabled={entriesPage === entriesPageCount || entriesLoading} onClick={() => dispatchContestSelection({ type: 'setEntriesPage', entriesPage: Math.min(entriesPageCount, entriesPage + 1) })}>Далее</button>
                          </nav>
                        )}

                        <div className="admin-winner-publish">
                          <div>
                            <strong>3. Завершите конкурс</strong>
                            <span>{selectedContestApprovedWinnerCount} из {selectedContestWinnerCount} выбранных ID найдены среди одобренных заявок.</span>
                          </div>
                          <button type="button" disabled={loading || !selectedContestId || !selectedWinnerIds.length} onClick={saveWinners} className="contest-primary-button">
                            Опубликовать победителей
                          </button>
                        </div>

                        <label>Ручной список ID победителей
                          <textarea value={winnersText} onChange={event => dispatchContestSelection({ type: 'setWinnersText', winnersText: event.target.value })} rows={3} placeholder="Можно вставить ID через запятую или с новой строки" style={{ ...ADMIN_INPUT, resize: 'vertical' }} />
                        </label>
                      </>
                    ) : (
                      <div className="contest-empty">
                        <Trophy size={34} />
                        <strong>Выберите конкурс</strong>
                        <span>После выбора появятся заявки, быстрые действия и публикация победителей.</span>
                      </div>
                    )}
                  </div>
                </div>
                </div>
              )}
            </div>
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
