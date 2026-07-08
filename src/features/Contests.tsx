import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Download, Gift, Image as ImageIcon, ShieldCheck, Trash2, Trophy } from 'lucide-react';
import './contests.css';

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

interface Article {
  id: string;
  title: string;
  date: string;
  image?: string;
  excerpt?: string;
  tag?: string;
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

const ADMIN_INPUT: React.CSSProperties = { width: '100%', border: '1px solid rgba(160,121,55,0.35)', borderRadius: 12, padding: '10px 12px', background: '#fffaf0', color: '#2f1b10', outline: 'none' };

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

function isDateTimeInputNear(value: string, offsetMinutes: number): boolean {
  const parsed = parseDateTimeInput(value);
  if (!parsed) return false;
  return Math.abs(parsed.getTime() - (Date.now() + offsetMinutes * 60 * 1000)) < 65 * 1000;
}

function addHoursForDateInput(hours: number): string {
  return formatDateTimeInput(new Date(Date.now() + hours * 60 * 60 * 1000).toISOString());
}

function addMinutesForDateInput(minutes: number): string {
  return formatDateTimeInput(new Date(Date.now() + minutes * 60 * 1000).toISOString());
}

function addDaysForDateInput(days: number): string {
  return addHoursForDateInput(days * 24);
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
  subscription: { hasAccess: boolean; source: string; checkedAt: string; message?: string };
  contestEntriesCount?: number;
  blockedAt?: string;
  createdAt?: string;
  updatedAt?: string;
};

function authJsonHeaders(): HeadersInit {
  return { 'Content-Type': 'application/json' };
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

type AdminWorkspaceSection = 'dashboard' | 'users' | 'telegram' | 'articles' | 'gallery' | 'contests' | 'referrals' | 'boosty';

type AdminReferralLink = {
  id: string;
  slug: string;
  label: string;
  campaign: string;
  targetPath: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  url: string;
  clicks: number;
  uniqueClicks: number;
  lastClickAt: string;
};

type AdminReferralClick = {
  referralId: string;
  slug: string;
  clickedAt: string;
  userAgent: string;
  referrer: string;
  landingPath: string;
};

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

function subscriptionEntitlementLabels(subscription: { hasAccess?: boolean; entitlements?: SubscriptionStatus['entitlements'] } | null | undefined): string[] {
  if (!subscription?.entitlements) return subscription?.hasAccess ? ['Все разделы'] : [];
  const labels: Array<[SubscriptionEntitlementKey, string]> = [
    ['arena', 'Арена'],
    ['battlegrounds', 'Поля Сражений'],
    ['standard', 'Стандарт'],
    ['contests', 'Конкурсы'],
    ['guidesArchive', 'Архив гайдов'],
    ['arenaArticles', 'Статьи Арены'],
    ['battlegroundsArticles', 'Статьи Полей'],
  ];
  return labels.filter(([key]) => subscription.entitlements?.[key]).map(([, label]) => label);
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
}: {
  label: string;
  value: string;
  onChange: (url: string) => void;
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
        onChange={event => void uploadFile(firstImageFile(event.target.files))}
      />
      <input value={value} onChange={event => onChange(event.target.value)} placeholder="URL или загрузка через Ctrl+V / drag and drop" style={ADMIN_INPUT} />
      <div className="admin-image-uploader-body">
        {value ? <img src={value} alt="" /> : <span><ImageIcon size={24} /> Вставьте картинку, перетащите сюда или загрузите с компьютера</span>}
      </div>
      {error && <small className="admin-inline-error">{error}</small>}
    </div>
  );
}

export function ContestAdminPanel({ authUser, authChecking = false }: { authUser: AuthUser | null; authChecking?: boolean }) {
  const [contests, setContests] = useState<Contest[]>([]);
  const [entries, setEntries] = useState<ContestEntry[]>([]);
  const [selectedContestId, setSelectedContestId] = useState('');
  const [contestStatusFilter, setContestStatusFilter] = useState('all');
  const [userQuery, setUserQuery] = useState('');
  const [users, setUsers] = useState<AdminUserSearchResult[]>([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersReloadKey, setUsersReloadKey] = useState(0);
  const [userActionId, setUserActionId] = useState('');
  const [winnersText, setWinnersText] = useState('');
  const [message, setMessage] = useState<AdminMessage | null>(null);
  const [loading, setLoading] = useState(false);
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
    const params = new URLSearchParams(window.location.search);
    const requestedSection = params.get('section');
    if (
      requestedSection === 'users' ||
      requestedSection === 'articles' ||
      requestedSection === 'gallery' ||
      requestedSection === 'contests' ||
      requestedSection === 'referrals' ||
      requestedSection === 'boosty'
    ) return requestedSection;
    if (requestedSection === 'list') return 'articles';
    if (params.has('contest') || params.has('contests')) return 'contests';
    return 'contests';
  });
  const [adminArticles, setAdminArticles] = useState<Article[]>([]);
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
  const [referralForm, setReferralForm] = useState({
    label: '',
    slug: '',
    campaign: '',
    targetPath: '/',
    status: 'active',
  });
  const [boostyStatus, setBoostyStatus] = useState<BoostyAdminStatus | null>(null);
  const [boostyStatusLoading, setBoostyStatusLoading] = useState(false);
  const [boostySubscribers, setBoostySubscribers] = useState<BoostySubscribersPayload | null>(null);
  const [boostySubscribersLoading, setBoostySubscribersLoading] = useState(false);
  const [boostySubscribersSearch, setBoostySubscribersSearch] = useState('');
  const [boostyLevelFilter, setBoostyLevelFilter] = useState('all');
  const [boostyAccessFilter, setBoostyAccessFilter] = useState<'all' | 'site' | 'paid' | 'free' | 'inactive'>('all');
  const [telegramAccounts, setTelegramAccounts] = useState<TelegramAccountsPayload | null>(null);
  const [telegramAccountsLoading, setTelegramAccountsLoading] = useState(false);
  const [telegramAccountsSearch, setTelegramAccountsSearch] = useState('');
  const [telegramAccessFilter, setTelegramAccessFilter] = useState<'all' | 'access' | 'checkable' | 'contact-only' | 'stale' | 'blocked'>('all');

  const allowed = isContestAdminUser(authUser);
  const entriesRequestRef = useRef(0);

  const loadAdminContests = useCallback(async () => {
    if (!allowed) return;
    setLoading(true);
    try {
      const res = await fetch('/api/admin/contests', { headers: authJsonHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Не удалось загрузить конкурсы');
      const list = Array.isArray(data.contests) ? data.contests : [];
      setContests(list);
      if (!selectedContestId && list[0]?.id) setSelectedContestId(list[0].id);
    } catch (err: any) {
      setMessage({ type: 'err', text: err.message });
    } finally {
      setLoading(false);
    }
  }, [allowed, selectedContestId]);

  useEffect(() => { void loadAdminContests(); }, [loadAdminContests]);

  const loadAdminArticles = useCallback(async () => {
    if (!allowed) return;
    try {
      const res = await fetch(`/api/articles?t=${Date.now()}`, { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Не удалось загрузить статьи');
      setAdminArticles(Array.isArray(data.articles) ? data.articles : []);
    } catch (err: any) {
      setMessage({ type: 'err', text: err.message });
    }
  }, [allowed]);

  const loadGalleryItems = useCallback(async () => {
    if (!allowed) return;
    try {
      const res = await fetch(`/api/admin/gallery?t=${Date.now()}`, { headers: authJsonHeaders(), cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Не удалось загрузить галерею');
      setGalleryItems(Array.isArray(data.items) ? data.items : []);
    } catch (err: any) {
      setMessage({ type: 'err', text: err.message });
    }
  }, [allowed]);

  const loadReferrals = useCallback(async () => {
    if (!allowed) return;
    try {
      const res = await fetch(`/api/admin/referrals?t=${Date.now()}`, { headers: authJsonHeaders(), cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Не удалось загрузить реферальные ссылки');
      setReferrals(Array.isArray(data.referrals) ? data.referrals : []);
      setReferralClicks(Array.isArray(data.recentClicks) ? data.recentClicks : []);
    } catch (err: any) {
      setMessage({ type: 'err', text: err.message });
    }
  }, [allowed]);

  const loadBoostyStatus = useCallback(async () => {
    if (!allowed) return;
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
  }, [allowed]);

  const loadBoostySubscribers = useCallback(async () => {
    if (!allowed) return;
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
  }, [allowed]);

  const loadTelegramAccounts = useCallback(async () => {
    if (!allowed) return;
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
        configured: false,
        chatIds: [],
        summary: { total: 0, access: 0, checkable: 0, contactOnly: 0, stale: 0, blocked: 0 },
        accounts: [],
        fetchedAt: new Date().toISOString(),
        error: err?.message || 'Не удалось загрузить Telegram-аккаунты',
      });
    } finally {
      setTelegramAccountsLoading(false);
    }
  }, [allowed]);

  useEffect(() => {
    if (!allowed) return;
    if (adminSection === 'articles' || adminSection === 'dashboard') void loadAdminArticles();
    if (adminSection === 'gallery' || adminSection === 'dashboard') void loadGalleryItems();
    if (adminSection === 'referrals' || adminSection === 'dashboard') void loadReferrals();
    if (adminSection === 'boosty' || adminSection === 'dashboard') void loadBoostyStatus();
    if (adminSection === 'boosty') void loadBoostySubscribers();
    if (adminSection === 'telegram' || adminSection === 'dashboard') void loadTelegramAccounts();
  }, [adminSection, allowed, loadAdminArticles, loadBoostyStatus, loadBoostySubscribers, loadGalleryItems, loadReferrals, loadTelegramAccounts]);

	  useEffect(() => {
    const requestId = ++entriesRequestRef.current;
    if (!allowed || !selectedContestId) {
      setEntries([]);
      return;
    }
    const controller = new AbortController();
    setEntries([]);
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
      });
    return () => controller.abort();
  }, [allowed, selectedContestId]);

  useEffect(() => {
    if (!allowed || adminSection !== 'users') {
      setUsers([]);
      setUsersTotal(0);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ limit: '200' });
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
  }, [adminSection, allowed, userQuery, usersReloadKey]);

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
      await loadAdminContests();
      if (data.contest?.id) setSelectedContestId(data.contest.id);
    } catch (err: any) {
      setMessage({ type: 'err', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const submitArticle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!articleForm.title.trim()) return;
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
      setArticleForm({ title: '', tag: '', date: '', excerpt: '', image: '', url: '' });
      setEditingArticleId('');
      await loadAdminArticles();
    } catch (err: any) {
      setMessage({ type: 'err', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const deleteArticle = async (article: Article) => {
    if (!window.confirm(`Удалить «${article.title}»?`)) return;
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
        setArticleForm({ title: '', tag: '', date: '', excerpt: '', image: '', url: '' });
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
      image: article.image || '',
      url: article.url || '',
    });
    setAdminSection('articles');
  };

  const cancelArticleEdit = () => {
    setEditingArticleId('');
    setArticleForm({ title: '', tag: '', date: '', excerpt: '', image: '', url: '' });
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

  const submitReferral = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!referralForm.label.trim()) return;
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/referrals', {
        method: 'POST',
        headers: authJsonHeaders(),
        body: JSON.stringify(referralForm),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Не удалось создать ссылку');
      setMessage({ type: 'ok', text: 'Реферальная ссылка создана.' });
      setReferralForm({ label: '', slug: '', campaign: '', targetPath: '/', status: 'active' });
      await loadReferrals();
    } catch (err: any) {
      setMessage({ type: 'err', text: err.message });
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

  const updateAdminUser = async (user: AdminUserSearchResult, patch: { role?: 'admin' | 'user'; blocked?: boolean }) => {
    const willBlock = patch.blocked === true;
    const willPromote = patch.role === 'admin';
    const actionLabel = willBlock
      ? 'заблокировать'
      : patch.blocked === false
        ? 'разблокировать'
        : willPromote
          ? 'сделать администратором'
          : 'снять права администратора';
    if ((willBlock || willPromote) && !window.confirm(`Точно ${actionLabel} пользователя ${user.name || user.email || user.id}?`)) return;
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

  const saveWinners = async () => {
    if (!selectedContestId) return;
    const winners = parseWinnerIds(winnersText);
    if (winners.length === 0) {
      setMessage({ type: 'err', text: 'Укажите хотя бы одного победителя из заявок конкурса.' });
      return;
    }
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
      if (selectedContestId === contest.id) setSelectedContestId('');
      if (form.id === contest.id) setForm({ id: '', title: '', prize: '', imageUrl: '', startsAt: '', endsAt: '', status: 'active', description: '' });
      await loadAdminContests();
    } catch (err: any) {
      setMessage({ type: 'err', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const selectedContest = contests.find(contest => contest.id === selectedContestId);
  const selectedContestWinnersText = selectedContest?.winners?.join('\n') ?? '';
  const selectedWinnerIds = useMemo(() => parseWinnerIds(winnersText), [winnersText]);
  const selectedWinnerIdSet = useMemo(() => new Set(selectedWinnerIds), [selectedWinnerIds]);
  const approvedEntries = useMemo(() => entries.filter(entry => entry.status === 'approved'), [entries]);
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
  const selectedContestEntryCount = selectedContest?.entriesCount ?? entries.length;
  const selectedContestWinnerCount = selectedWinnerIds.length;
  const selectedContestApprovedWinnerCount = approvedEntries.filter(entry => selectedWinnerIdSet.has(entry.profileId)).length;

  useEffect(() => {
    setWinnersText(selectedContestWinnersText);
  }, [selectedContestId, selectedContestWinnersText]);

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
      <section className="contest-admin-page">
        <RouteFallback minHeight={360} />
      </section>
    );
  }

  if (!allowed) {
    return (
      <section className="contest-admin-page">
        <div className="contest-empty">
          <ShieldCheck size={34} />
          <strong>Админ панель недоступна</strong>
          <span>Этот раздел открыт только для администратора конкурсов.</span>
        </div>
      </section>
    );
  }

  const resetContestForm = () => setForm({ id: '', title: '', prize: '', imageUrl: '', startsAt: '', endsAt: '', status: 'active', description: '' });
  const editSelectedContest = () => {
    if (!selectedContest) return;
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
  };
  const setContestStartNow = () => setForm(v => ({ ...v, startsAt: addHoursForDateInput(0) }));
  const setContestStartInHour = () => setForm(v => ({ ...v, startsAt: addHoursForDateInput(1) }));
  const setContestEndInTenMinutes = () => setForm(v => ({ ...v, endsAt: addMinutesForDateInput(10) }));
  const setContestEndInHour = () => setForm(v => ({ ...v, endsAt: addHoursForDateInput(1) }));
  const setContestEndTomorrow = () => setForm(v => ({ ...v, endsAt: addDaysForDateInput(1) }));
  const toggleWinner = (profileId: string) => {
    setWinnersText(previous => {
      const winners = parseWinnerIds(previous);
      if (winners.includes(profileId)) return winners.filter(id => id !== profileId).join('\n');
      return [...winners, profileId].join('\n');
    });
  };
  const clearWinnerSelection = () => setWinnersText('');
  const contestStatusOptions = [
    { value: 'active', label: 'Опубликовать', caption: 'Конкурс виден на сайте' },
    { value: 'planned', label: 'Запланировать', caption: 'Виден как ближайший конкурс' },
    { value: 'draft', label: 'Черновик', caption: 'Не показывать участникам' },
    { value: 'completed', label: 'Завершить', caption: 'Перенести в прошлые конкурсы' },
    { value: 'cancelled', label: 'Отменить', caption: 'Скрыть без удаления' },
  ];
  const currentStatus = contestStatusOptions.find(item => item.value === form.status) ?? contestStatusOptions[0];
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
  const adminNav: Array<{ id: AdminWorkspaceSection; label: string; caption: string }> = [
    { id: 'dashboard', label: 'Обзор', caption: 'Главные метрики' },
    { id: 'users', label: 'Пользователи', caption: 'Поиск и контакты' },
    { id: 'boosty', label: 'Boosty', caption: 'Подписчики и уровни' },
    { id: 'telegram', label: 'Telegram', caption: 'Аккаунты и доступ' },
    { id: 'articles', label: 'Статьи', caption: 'Публикации сайта' },
    { id: 'gallery', label: 'Галерея', caption: 'Арты и скачивания' },
    { id: 'contests', label: 'Конкурсы', caption: 'Заявки и победители' },
    { id: 'referrals', label: 'Реферальные ссылки', caption: 'Реклама и клики' },
  ];

  return (
    <section className="contest-admin-page admin-workspace-page">
      <div className="contest-admin-head admin-workspace-head">
        <div>
          <p className="contest-eyebrow">Администрирование</p>
          <h1>Админ панель</h1>
          <p>Пользователи, статьи, конкурсы, загрузка изображений и рекламные ссылки со статистикой.</p>
        </div>
        <ShieldCheck size={42} />
      </div>

      {message && <div className={`contest-message contest-message-${message.type}`}>{message.text}</div>}

      <div className="admin-workspace-layout">
	              <aside className="admin-workspace-nav" aria-label="Разделы админ панели" role="tablist">
	          {adminNav.map(item => (
	            <button
	              key={item.id}
	              type="button"
	              className={adminSection === item.id ? 'is-active' : ''}
	              role="tab"
	              aria-selected={adminSection === item.id}
	              onClick={() => setAdminSection(item.id)}
	            >
              <strong>{item.label}</strong>
              <span>{item.caption}</span>
            </button>
          ))}
        </aside>

        <div className="admin-workspace-content">
          {adminSection === 'dashboard' && (
            <>
              <div className="admin-stat-grid">
                <div><span>Конкурсы</span><strong>{contests.length}</strong><small>{totalContestEntries} заявок</small></div>
                <div><span>Статьи</span><strong>{adminArticles.length}</strong><small>в текущем списке</small></div>
                <div><span>Галерея</span><strong>{galleryItems.length}</strong><small>публичных артов</small></div>
                <div><span>Boosty</span><strong>{boostyStatus?.summary?.boostyPaid ?? boostyStatus?.summary?.activePaid ?? '—'}</strong><small>платные Boosty · {boostyApiLabel}</small></div>
                <div><span>Telegram</span><strong>{telegramAccounts?.summary?.access ?? '—'}</strong><small>VIP доступ из {telegramAccounts?.summary?.total ?? '—'}</small></div>
                <div><span>Реклама</span><strong>{referrals.length}</strong><small>{totalReferralClicks} кликов</small></div>
                <div><span>Пользователь</span><strong>{authUser?.profileId || authUser?.id}</strong><small>администратор</small></div>
              </div>
              <div className="contest-admin-grid admin-dashboard-grid">
                <div className="contest-admin-card">
                  <h2>Быстрый доступ</h2>
                  <div className="admin-quick-actions">
                    <button type="button" onClick={() => setAdminSection('contests')}>Создать конкурс</button>
                    <button type="button" onClick={() => setAdminSection('articles')}>Добавить статью</button>
                    <button type="button" onClick={() => setAdminSection('gallery')}>Загрузить арт</button>
                    <button type="button" onClick={() => setAdminSection('boosty')}>Проверить Boosty</button>
                    <button type="button" onClick={() => setAdminSection('telegram')}>Проверить Telegram</button>
                    <button type="button" onClick={() => setAdminSection('referrals')}>Новая рекламная ссылка</button>
                    <button type="button" onClick={() => setAdminSection('users')}>Найти пользователя</button>
                  </div>
                </div>
                <div className="contest-admin-card">
                  <h2>Последние переходы</h2>
                  <div className="admin-referral-clicks">
                    {referralClicks.slice(0, 8).map((click, index) => (
                      <div key={`${click.slug}-${click.clickedAt}-${index}`}>
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

          {adminSection === 'users' && (
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
              <label>
                Фильтр по ID, почте, имени, Telegram или VK
                <input value={userQuery} onChange={e => setUserQuery(e.target.value)} placeholder="user_..., email, имя или username" style={ADMIN_INPUT} />
              </label>
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
                        {user.subscription?.hasAccess ? 'подписка' : 'нет доступа'}
                      </span>
                      <div className="contest-user-actions">
                        <button
                          type="button"
                          className="contest-secondary-button"
                          disabled={Boolean(userActionId) || authUser?.id === user.id}
                          onClick={() => updateAdminUser(user, { role: user.role === 'admin' ? 'user' : 'admin' })}
                        >
                          {user.role === 'admin' ? 'Снять админа' : 'Сделать админом'}
                        </button>
                        <button
                          type="button"
                          className="contest-secondary-button contest-danger-button"
                          disabled={Boolean(userActionId) || authUser?.id === user.id}
                          onClick={() => updateAdminUser(user, { blocked: !user.blockedAt })}
                        >
                          {user.blockedAt ? 'Разблокировать' : 'Заблокировать'}
                        </button>
                      </div>
                    </div>
                  </div>
                )) : (
                  <p className="contest-muted">
                    {userQuery.trim() ? 'По этому фильтру пользователей нет.' : 'В единой базе пока нет пользователей.'}
                  </p>
                )}
              </div>
            </div>
          )}

          {adminSection === 'boosty' && (
            <div className="contest-admin-card admin-full-card">
              <div className="contest-users-head">
                <div>
                  <h2>Подписчики Boosty</h2>
                  <p className="contest-muted">
                    Полный список аудитории Boosty, распознанные уровни и доступы сайта. Показано {filteredBoostySubscribers.length} из {boostySubscribers?.subscribers.length || 0}.
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
                  </span>
                  {boostyStatus?.lastErrorMessage && <span>Ошибка: {boostyStatus.lastErrorMessage}</span>}
                </div>
              </div>

              <div className="admin-stat-grid admin-boosty-stats">
                <div><span>Всего Boosty</span><strong>{boostySubscriberStats.total}</strong><small>включая неактивных</small></div>
                <div><span>Платные Boosty</span><strong>{boostySubscriberStats.boostyPaid}</strong><small>как в кабинете Boosty</small></div>
                <div><span>Активный доступ</span><strong>{boostySubscriberStats.activePaid}</strong><small>оплачено, даже без автопродления</small></div>
                <div><span>Доступ на сайте</span><strong>{boostySubscriberStats.siteAccess}</strong><small>активная оплата + тариф распознан</small></div>
                <div><span>Без email</span><strong>{boostySubscriberStats.missingEmail}</strong><small>нужна привязка Telegram/почты</small></div>
              </div>

              <div className="admin-boosty-levels" aria-label="Уровни Boosty">
                {boostyLevelOptions.map(levelName => (
                  <button
                    key={levelName}
                    type="button"
                    className={boostyLevelFilter === levelName ? 'is-active' : ''}
                    onClick={() => setBoostyLevelFilter(boostyLevelFilter === levelName ? 'all' : levelName)}
                  >
                    <span>{levelName || 'Без уровня'}</span>
                    <b>{boostySubscribers?.levels?.[levelName] ?? 0}</b>
                  </button>
                ))}
                {!boostyLevelOptions.length && <p className="contest-muted">Уровни появятся после загрузки Boosty.</p>}
              </div>

              <div className="admin-boosty-filters">
                <label>
                  Поиск
                  <input
                    value={boostySubscribersSearch}
                    onChange={e => setBoostySubscribersSearch(e.target.value)}
                    placeholder="email, имя, Boosty ID или уровень"
                    style={ADMIN_INPUT}
                  />
                </label>
                <label>
                  Уровень
                  <select value={boostyLevelFilter} onChange={e => setBoostyLevelFilter(e.target.value)} style={ADMIN_INPUT}>
                    <option value="all">Все уровни</option>
                    {boostyLevelOptions.map(levelName => (
                      <option key={levelName} value={levelName}>{levelName || 'Без уровня'}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Статус
                  <select value={boostyAccessFilter} onChange={e => setBoostyAccessFilter(e.target.value as typeof boostyAccessFilter)} style={ADMIN_INPUT}>
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
                ) : filteredBoostySubscribers.length ? filteredBoostySubscribers.map(subscriber => {
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
            </div>
          )}

          {adminSection === 'telegram' && (
            <div className="contest-admin-card admin-full-card">
              <div className="contest-users-head">
                <div>
                  <h2>Telegram-аккаунты</h2>
                  <p className="contest-muted">
                    Все профили с привязанным Telegram, контактным username или историей Telegram-проверки. Показано {filteredTelegramAccounts.length} из {telegramAccounts?.accounts.length || 0}.
                  </p>
                </div>
                <button
                  type="button"
                  className="contest-secondary-button"
                  disabled={telegramAccountsLoading}
                  onClick={() => void loadTelegramAccounts()}
                >
                  {telegramAccountsLoading ? 'Загрузка...' : 'Обновить Telegram'}
                </button>
              </div>

              <div className={`admin-telegram-status ${telegramAccounts?.configured ? 'is-ok' : 'is-warning'}`}>
                <div>
                  <strong>{telegramAccounts?.configured ? 'Telegram bot настроен' : 'Telegram bot не настроен'}</strong>
                  <span>Каналы проверки: {telegramAccounts?.chatIds?.length ? telegramAccounts.chatIds.join(', ') : 'нет настроенных chat_id'}</span>
                  <span>Загружено: {telegramAccounts?.fetchedAt ? formatDate(telegramAccounts.fetchedAt) : '—'}</span>
                </div>
              </div>

              <div className="admin-stat-grid admin-telegram-stats">
                <div><span>Всего</span><strong>{telegramAccounts?.summary.total ?? 0}</strong><small>Telegram-связанные профили</small></div>
                <div><span>Доступ</span><strong>{telegramAccounts?.summary.access ?? 0}</strong><small>есть в VIP-каналах</small></div>
                <div><span>Можно проверить</span><strong>{telegramAccounts?.summary.checkable ?? 0}</strong><small>есть Telegram ID</small></div>
                <div><span>Только username</span><strong>{telegramAccounts?.summary.contactOnly ?? 0}</strong><small>нужна привязка Telegram</small></div>
                <div><span>Устарело</span><strong>{telegramAccounts?.summary.stale ?? 0}</strong><small>нужна повторная проверка</small></div>
              </div>

              <div className="admin-telegram-filters">
                <label>
                  Поиск
                  <input
                    value={telegramAccountsSearch}
                    onChange={e => setTelegramAccountsSearch(e.target.value)}
                    placeholder="email, имя, @username или Telegram ID"
                    style={ADMIN_INPUT}
                  />
                </label>
                <label>
                  Статус
                  <select value={telegramAccessFilter} onChange={e => setTelegramAccessFilter(e.target.value as typeof telegramAccessFilter)} style={ADMIN_INPUT}>
                    <option value="all">Все</option>
                    <option value="access">Есть Telegram-доступ</option>
                    <option value="checkable">Можно проверить</option>
                    <option value="contact-only">Только username</option>
                    <option value="stale">Устаревшая проверка</option>
                    <option value="blocked">Заблокированные</option>
                  </select>
                </label>
              </div>

              {telegramAccounts?.error && <div className="contest-message contest-message-err">{telegramAccounts.error}</div>}

              <div className="admin-telegram-list">
                {telegramAccountsLoading && !telegramAccounts?.accounts.length ? (
                  <p className="contest-muted">Загружаем Telegram-аккаунты...</p>
                ) : filteredTelegramAccounts.length ? filteredTelegramAccounts.map(account => {
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
            </div>
          )}

          {adminSection === 'articles' && (
            <div className="contest-admin-grid">
              <form className="contest-admin-card" onSubmit={submitArticle}>
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
                <label>Название<input value={articleForm.title} onChange={e => setArticleForm(v => ({ ...v, title: e.target.value }))} style={ADMIN_INPUT} /></label>
                <label>Раздел<input value={articleForm.tag} onChange={e => setArticleForm(v => ({ ...v, tag: e.target.value }))} placeholder="Гайд, Мета, Поля Сражений" style={ADMIN_INPUT} /></label>
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

              <div className="contest-admin-card">
                <h2>Список статей</h2>
                <div className="admin-article-list">
                  {adminArticles.slice(0, 24).map(article => (
                    <div key={article.id} className="admin-article-row">
                      {article.image ? <img src={article.image} alt="" /> : <div><BookOpen size={18} /></div>}
                      <span><strong>{article.title}</strong><small>{article.tag || 'Без раздела'} · {article.date}</small></span>
                      <div className="admin-article-actions">
                        <button type="button" onClick={() => editArticle(article)}>Редактировать</button>
                        <button type="button" onClick={() => void deleteArticle(article)}>Удалить</button>
                      </div>
                    </div>
                  ))}
                  {!adminArticles.length && <p className="contest-muted">Статей пока нет.</p>}
                </div>
              </div>
            </div>
          )}

          {adminSection === 'gallery' && (
            <div className="contest-admin-grid">
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
                        <a href={item.downloadUrl} title="Скачать оригинал"><Download size={17} /></a>
                        <button type="button" onClick={() => void deleteGalleryItem(item)} disabled={galleryDeletingId === item.id} title="Удалить">
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
              <form className="contest-admin-card admin-contest-form" onSubmit={submitContest}>
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
                      <AdminImageUploader label="Обложка конкурса" value={form.imageUrl} onChange={url => setForm(v => ({ ...v, imageUrl: url }))} />
                    </section>

                    <section className="admin-contest-section">
                      <div className="admin-section-title">
                        <span>3</span>
                        <div><strong>Расписание</strong><small>Если старт пустой, конкурс запускается сразу после публикации</small></div>
                      </div>
	                      <div className="admin-date-presets" aria-label="Быстрый выбор времени конкурса">
	                        <button type="button" aria-pressed={isDateTimeInputNear(form.startsAt, 0)} onClick={setContestStartNow}>Старт сейчас</button>
	                        <button type="button" aria-pressed={isDateTimeInputNear(form.startsAt, 60)} onClick={setContestStartInHour}>Через час</button>
	                        <button type="button" aria-pressed={isDateTimeInputNear(form.endsAt, 10)} onClick={setContestEndInTenMinutes}>Финиш через 10 минут</button>
	                        <button type="button" aria-pressed={isDateTimeInputNear(form.endsAt, 60)} onClick={setContestEndInHour}>Финиш через час</button>
	                        <button type="button" aria-pressed={isDateTimeInputNear(form.endsAt, 24 * 60)} onClick={setContestEndTomorrow}>Финиш завтра</button>
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
                        {contestStatusOptions.map(option => (
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
	                          <button type="button" aria-pressed={contest.id === selectedContestId} onClick={() => setSelectedContestId(contest.id)}>
                            <strong>{contest.title}</strong>
                            <span>{contestStatusLabel(contest.status)} · {contest.entriesCount ?? 0} заявок{contest.endsAt ? ` · ${formatDate(contest.endsAt)}` : ''}</span>
                          </button>
                          <button type="button" className="admin-danger-button" onClick={() => void deleteContest(contest)}>Удалить</button>
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
                          <button type="button" className="admin-danger-button" onClick={() => void deleteContest(selectedContest)}>Удалить конкурс</button>
                        </div>

                        <div className="admin-subsection-head">
                          <div>
                            <strong>2. Проверьте заявки</strong>
                            <span>Отмечайте победителей прямо в списке. Неодобренные заявки нельзя выбрать.</span>
                          </div>
                          <button type="button" className="contest-secondary-button" onClick={clearWinnerSelection} disabled={!selectedWinnerIds.length}>Сбросить выбор</button>
                        </div>

                        <div className="contest-entry-list">
                          {entries.length ? entries.map(entry => {
                            const isApproved = entry.status === 'approved';
                            const isWinner = selectedWinnerIdSet.has(entry.profileId);
                            return (
                              <div
                                key={entry.id}
                                className={`contest-entry-row admin-winner-entry ${isWinner ? 'is-winner' : ''} ${!isApproved ? 'is-disabled' : ''}`}
                                onClick={event => {
                                  if (!isApproved) return;
                                  if ((event.target as HTMLElement).closest('button,input')) return;
                                  toggleWinner(entry.profileId);
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={isWinner}
                                  disabled={!isApproved}
                                  onChange={() => toggleWinner(entry.profileId)}
                                  aria-label={`Выбрать победителем ${entry.name || entry.profileId}`}
                                />
                                <div>
                                  <strong>{entry.name || entry.profileId}</strong>
                                  <span>{entry.profileId} · {entry.email || 'email не указан'}</span>
                                  <span>VK: {entry.profileContacts?.vk || entry.contact?.vk || '—'} · TG: {entry.profileContacts?.telegram || entry.contact?.telegram || '—'}</span>
                                </div>
                                <div className="contest-entry-actions">
                                  <code>{contestStatusLabel(entry.status)}</code>
                                  <button type="button" className="contest-secondary-button" onClick={() => void copyText(entry.profileId, 'ID участника скопирован.')}>ID</button>
                                </div>
                              </div>
                            );
                          }) : <p className="contest-muted">Заявок пока нет. После первой заявки здесь появится список участников.</p>}
                        </div>

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
                          <textarea value={winnersText} onChange={e => setWinnersText(e.target.value)} rows={3} placeholder="Можно вставить ID через запятую или с новой строки" style={{ ...ADMIN_INPUT, resize: 'vertical' }} />
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
            </div>
          )}

          {adminSection === 'referrals' && (
            <div className="contest-admin-grid">
              <form className="contest-admin-card" onSubmit={submitReferral}>
                <h2>Новая рекламная ссылка</h2>
                <label>Название<input value={referralForm.label} onChange={e => setReferralForm(v => ({ ...v, label: e.target.value }))} placeholder="Telegram июль, VK пост, Boosty баннер" style={ADMIN_INPUT} /></label>
                <label>Slug<input value={referralForm.slug} onChange={e => setReferralForm(v => ({ ...v, slug: e.target.value }))} placeholder="tg-july" style={ADMIN_INPUT} /></label>
                <label>Кампания<input value={referralForm.campaign} onChange={e => setReferralForm(v => ({ ...v, campaign: e.target.value }))} placeholder="summer-2026" style={ADMIN_INPUT} /></label>
                <label>Куда вести<input value={referralForm.targetPath} onChange={e => setReferralForm(v => ({ ...v, targetPath: e.target.value }))} placeholder="/" style={ADMIN_INPUT} /></label>
                <label>Статус
                  <select value={referralForm.status} onChange={e => setReferralForm(v => ({ ...v, status: e.target.value }))} style={ADMIN_INPUT}>
                    <option value="active">Активна</option>
                    <option value="paused">Пауза</option>
                  </select>
                </label>
                <button type="submit" disabled={loading} className="contest-primary-button">Создать ссылку</button>
              </form>

              <div className="contest-admin-card admin-full-card">
                <h2>Статистика ссылок</h2>
                <div className="admin-referral-list">
                  {referrals.map(item => (
                    <div key={item.id} className="admin-referral-row">
                      <div>
                        <strong>{item.label}</strong>
                        <span>{item.campaign || 'без кампании'} · {item.status === 'active' ? 'активна' : 'пауза'}</span>
                        <code>{item.url}</code>
                      </div>
                      <div className="admin-referral-stats">
                        <span><strong>{item.clicks}</strong> кликов</span>
                        <span><strong>{item.uniqueClicks}</strong> уник.</span>
                        <span>{item.lastClickAt ? formatDate(item.lastClickAt) : 'нет кликов'}</span>
                      </div>
                      <button type="button" onClick={() => void copyText(item.url, 'Реферальная ссылка скопирована.')}>Копировать</button>
                    </div>
                  ))}
                  {!referrals.length && <p className="contest-muted">Реферальных ссылок пока нет.</p>}
                </div>
                <h3 className="admin-subtitle">Последние переходы</h3>
                <div className="admin-referral-clicks">
                  {referralClicks.map((click, index) => (
                    <div key={`${click.slug}-${click.clickedAt}-${index}`}>
                      <strong>/r/{click.slug}</strong>
                      <span>{click.clickedAt ? formatDate(click.clickedAt) : 'без даты'} · {click.referrer || 'прямой переход'}</span>
                    </div>
                  ))}
                  {!referralClicks.length && <p className="contest-muted">Переходов пока нет.</p>}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
