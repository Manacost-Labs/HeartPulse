import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import '../route-parchment.css';
import { ShieldCheck } from 'lucide-react';
import './contests.css';
import '../shared/ui/LoadingSurface.css';
import { LoadingSurface } from '../shared/ui/LoadingSurface';
import {
  subscriptionEntitlementLabels,
  type SubscriptionStatus,
} from '../modules/subscriptions/public';
import {
  canAccessAdminWorkspace,
  canManageContests,
} from '../modules/identity/public';
import type { AuthUser } from '../modules/identity/public';
import {
  ContestAdminReferrals,
  type ReferralDraft,
} from './ContestAdminReferrals';
import { contestSelectionReducer, INITIAL_CONTEST_SELECTION } from './contestSelection';
import {
  ContestAdminUsers,
  type AdminUserPatch,
  type AdminUserSearchResult,
} from './ContestAdminUsers';
import {
  ContestAdminBoosty,
} from './ContestAdminBoosty';
import {
  ContestAdminTelegram,
} from './ContestAdminTelegram';
import {
  ContestAdminMailing,
  EMPTY_MAILING_DRAFT,
  mailingAudienceWarning,
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
import { preloadAdminUsers, useAdminUsersList } from './useAdminUsersList';
import { loadAdminOverviewPage, preloadAdminOverview, type AdminCrmSegmentId } from '../modules/adminCrm/public';
import {
  adminWorkspaceReducer,
  createAdminWorkspaceState,
  type AdminMessage,
  type AdminWorkspaceSection,
} from './adminWorkspaceState';
import { prefetchAdminResource, useAdminResource } from '../modules/adminWorkspace/public';
import { AdminConsoleShell } from './adminConsole/AdminConsoleShell';
import {
  ADMIN_NAV_ITEMS,
  CONTEST_ADMIN_NAV_ITEMS,
  adminSectionFromSearch,
  isAdminSection,
} from './adminConsole/adminNavigation';
import {
  ADMIN_READS,
  boostyStatusFailure,
  boostySubscribersFailure,
  telegramAccountsFailure,
} from './adminConsole/adminPanelRequests';
import { fetchWithDeadline } from '../shared/http/fetchWithDeadline';
import { preferredScrollBehavior } from '../shared/ui/scrollBehavior';
import { AdminSectionFrame } from './AdminSectionFrame';
export { ContestsPage } from '../modules/contests/public';

// One loader per lazy section, so the idle prefetch and React.lazy share the same chunk request.
const SECTION_CHUNKS = {
  dashboard: loadAdminOverviewPage,
  articles: () => import('./ContestAdminArticles'),
  gallery: () => import('./ContestAdminGallery'),
  translations: () => import('./ContestAdminTranslations'),
  mechanics: () => import('./ContestAdminMechanicTranslations'),
  operations: () => import('./ContestAdminStandardOperations'),
  apiKeys: () => import('../modules/developerApi/public'),
} as const;

const AdminOverviewPage = React.lazy(SECTION_CHUNKS.dashboard);
const ContestAdminArticles = React.lazy(async () => ({ default: (await SECTION_CHUNKS.articles()).ContestAdminArticles }));
const ContestAdminGallery = React.lazy(async () => ({ default: (await SECTION_CHUNKS.gallery()).ContestAdminGallery }));
const ContestAdminTranslations = React.lazy(async () => ({ default: (await SECTION_CHUNKS.translations()).ContestAdminTranslations }));
const ContestAdminMechanicTranslations = React.lazy(async () => ({ default: (await SECTION_CHUNKS.mechanics()).ContestAdminMechanicTranslations }));
const ContestAdminStandardOperations = React.lazy(async () => ({ default: (await SECTION_CHUNKS.operations()).ContestAdminStandardOperations }));
const ContestAdminFunDecks = React.lazy(async () => ({ default: (await SECTION_CHUNKS.operations()).ContestAdminFunDecks }));
const AdminApiKeys = React.lazy(async () => ({ default: (await SECTION_CHUNKS.apiKeys()).AdminApiKeys }));
const SECTION_CODE: Partial<Record<AdminWorkspaceSection, () => Promise<unknown>>> = {
  dashboard: SECTION_CHUNKS.dashboard,
  articles: SECTION_CHUNKS.articles,
  gallery: SECTION_CHUNKS.gallery,
  translations: SECTION_CHUNKS.translations,
  mechanics: SECTION_CHUNKS.mechanics,
  'fun-decks': SECTION_CHUNKS.operations,
  'standard-data': SECTION_CHUNKS.operations,
  'api-keys': SECTION_CHUNKS.apiKeys,
};

/** Pointing at a menu item starts downloading that section's code, ahead of the click. */
function prefetchSectionCode(section: AdminWorkspaceSection) {
  void SECTION_CODE[section]?.().catch(() => { /* the section shows its own error when it is opened */ });
}

const prefetchRead = (read: { key: string; load: () => Promise<unknown> }) => prefetchAdminResource(read.key, read.load);
const SECTION_PRELOADS: Partial<Record<AdminWorkspaceSection, () => void>> = {
  dashboard: () => { prefetchSectionCode('dashboard'); preloadAdminOverview(); },
  users: preloadAdminUsers,
  articles: () => prefetchSectionCode('articles'),
  gallery: () => prefetchSectionCode('gallery'),
  translations: () => prefetchSectionCode('translations'),
  mechanics: () => prefetchSectionCode('mechanics'),
  'fun-decks': () => prefetchSectionCode('fun-decks'),
  'standard-data': () => prefetchSectionCode('standard-data'),
  'api-keys': () => prefetchSectionCode('api-keys'),
  contests: () => prefetchRead(ADMIN_READS.contests),
  referrals: () => prefetchRead(ADMIN_READS.referrals),
  boosty: () => { prefetchRead(ADMIN_READS.boostyStatus); prefetchRead(ADMIN_READS.boostySubscribers); },
  telegram: () => prefetchRead(ADMIN_READS.telegram),
};

/**
 * Starts the code and data of the section the address opens while the panel itself is still
 * mounting, so its first screen does not wait for a second round of requests. Called only after
 * the browser confirmed the session; the API checks every request again.
 */
export function preloadAdminSection(search: string, fullAccess: boolean): void {
  const section = fullAccess ? adminSectionFromSearch(search, 'dashboard') : 'contests';
  SECTION_PRELOADS[section]?.();
}

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

/** The shared loading panel, holding the height of the admin section that replaces it. */
function RouteFallback({ minHeight = 520 }: { minHeight?: number }) {
  return <div style={{ width: '100%', ['--loading-surface-min-block' as string]: `${minHeight}px` }}>
    <LoadingSurface label="Загружаем раздел" />
  </div>;
}

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

const ADMIN_ENTRIES_PAGE_SIZE = 20;
const NO_CONTESTS: Contest[] = [];

function adminSectionFromLocation(defaultSection: AdminWorkspaceSection): AdminWorkspaceSection {
  return adminSectionFromSearch(window.location.search, defaultSection);
}

export function ContestAdminPanel({ authUser, authChecking = false }: { authUser: AuthUser | null; authChecking?: boolean }) {
  const allowed = canManageContests(authUser);
  const hasFullAdminAccess = canAccessAdminWorkspace(authUser);
  const [entries, setEntries] = useState<ContestEntry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [contestSelection, dispatchContestSelection] = useReducer(contestSelectionReducer, INITIAL_CONTEST_SELECTION);
  const { contestId: selectedContestId, winnersText } = contestSelection;
  const [contestStatusFilter, setContestStatusFilter] = useState('all');
  const [contestWorkspaceView, setContestWorkspaceView] = useState<ContestWorkspaceView>('manage');
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
    openUserMenuId,
    message,
  } = adminWorkspace;
  const setMessage = useCallback((nextMessage: AdminMessage | null) => {
    dispatchAdminWorkspace({ type: 'setMessage', message: nextMessage });
  }, []);
  // A success toast covers the page toolbar on narrow screens, so it leaves on its own; errors stay until dismissed.
  useEffect(() => {
    if (message?.type !== 'ok') return undefined;
    const timer = window.setTimeout(() => setMessage(null), 6_000);
    return () => window.clearTimeout(timer);
  }, [message, setMessage]);
  const usersList = useAdminUsersList(hasFullAdminAccess && adminSection === 'users', text => setMessage({ type: 'err', text }));
  const openUserSegment = (segment: AdminCrmSegmentId) => { usersList.changeSegment({ segment, tag: '' }); changeAdminSection('users'); };
  // Section data is read through the tab-wide cache: a section opened before shows its last answer at once.
  const fullSection = (section: AdminWorkspaceSection) => hasFullAdminAccess && adminSection === section;
  const { contests: contestsRead, referrals: referralsRead, boostyStatus: statusRead, boostySubscribers: subscribersRead, telegram: telegramRead } = ADMIN_READS;
  const contestsResource = useAdminResource(allowed && adminSection === 'contests' ? contestsRead.key : null, contestsRead.load);
  const referralsResource = useAdminResource(fullSection('referrals') ? referralsRead.key : null, referralsRead.load);
  const boostyStatusResource = useAdminResource(fullSection('boosty') ? statusRead.key : null, statusRead.load);
  const boostySubscribersResource = useAdminResource(fullSection('boosty') ? subscribersRead.key : null, subscribersRead.load);
  const telegramResource = useAdminResource(fullSection('telegram') ? telegramRead.key : null, telegramRead.load);
  const contests = contestsResource.data ?? NO_CONTESTS;
  const preferredContestRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    dispatchContestSelection({ type: 'sync', contests, preferredContestId: preferredContestRef.current });
    preferredContestRef.current = undefined;
  }, [contests]);
  useEffect(() => {
    const error = contestsResource.error ?? referralsResource.error;
    if (error) setMessage({ type: 'err', text: error.message });
  }, [contestsResource.error, referralsResource.error, setMessage]);
  const { reload: reloadContestList } = contestsResource;
  const reloadContests = useCallback(async (preferredContestId?: string) => {
    preferredContestRef.current = preferredContestId;
    await reloadContestList();
  }, [reloadContestList]);

  const entriesRequestRef = useRef(0);
  const contestFormRef = useRef<HTMLFormElement | null>(null);
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
    const label = ADMIN_NAV_ITEMS.find(item => item.id === adminSection)?.label ?? 'Админка';
    document.title = `${label} — Админка | HearthPulse`;
  }, [adminSection, allowed]);

  const loadMailingOverview = useCallback(async (options?: { quiet?: boolean }) => {
    if (!hasFullAdminAccess) return;
    if (!options?.quiet) setMailingLoading(true);
    try {
      const res = await fetchWithDeadline(`/api/admin/mailings/overview?t=${Date.now()}`, {
        headers: authJsonHeaders(),
        cache: 'no-store',
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
      const res = await fetchWithDeadline('/api/admin/mailings/preview', {
        method: 'POST',
        headers: authJsonHeaders(),
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
    if (hasFullAdminAccess && adminSection === 'mailing') void loadMailingOverview();
  }, [adminSection, hasFullAdminAccess, loadMailingOverview]);

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
    fetchWithDeadline(`/api/admin/contests/${encodeURIComponent(selectedContestId)}/entries`, { headers: authJsonHeaders(), signal: controller.signal })
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
      const res = await fetchWithDeadline('/api/admin/contests', {
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
      await reloadContests(data.contest?.id ? String(data.contest.id) : undefined);
      setContestWorkspaceView('manage');
    } catch (err: any) {
      setMessage({ type: 'err', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const submitReferral = async (draft: ReferralDraft): Promise<boolean> => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetchWithDeadline('/api/admin/referrals', {
        method: 'POST',
        headers: authJsonHeaders(),
        body: JSON.stringify(draft),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Не удалось создать ссылку');
      setMessage({ type: 'ok', text: 'Реферальная ссылка создана.' });
      await referralsResource.reload();
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
      const res = await fetchWithDeadline(`/api/admin/users/${encodeURIComponent(user.id)}`, {
        method: 'PATCH',
        headers: authJsonHeaders(),
        body: JSON.stringify(patch),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Не удалось обновить пользователя');
      setMessage({ type: 'ok', text: `Пользователь обновлен: ${user.name || user.email || user.id}.` });
      usersList.reload();
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
      const res = await fetchWithDeadline('/api/admin/mailings/test', {
        method: 'POST',
        deadlineMs: 60_000, // the test letter is handed to the mail server before the answer
        headers: authJsonHeaders(),
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
      if (!recipients) throw new Error('В выбранной аудитории нет адресов для отправки.');
      const warning = mailingAudienceWarning(mailingDraft.segment);
      if (!window.confirm(`Запустить рассылку «${mailingDraft.subject}» для ${recipients} получателей?${warning}\n\nОтправку нельзя отменить после запуска.`)) return;
      const res = await fetchWithDeadline('/api/admin/mailings/send', {
        method: 'POST',
        deadlineMs: 60_000, // queuing writes one delivery row per recipient
        headers: authJsonHeaders(),
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
      const res = await fetchWithDeadline(`/api/admin/contests/${encodeURIComponent(selectedContestId)}/winners`, {
        method: 'POST',
        headers: authJsonHeaders(),
        body: JSON.stringify({ winners }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Не удалось сохранить победителей');
      setMessage({ type: 'ok', text: 'Победители опубликованы.' });
      await reloadContests();
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
      const res = await fetchWithDeadline(`/api/admin/contests/${encodeURIComponent(contest.id)}`, {
        method: 'DELETE',
        headers: authJsonHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Не удалось удалить конкурс');
      setMessage({ type: 'ok', text: 'Конкурс удален.' });
      if (selectedContestId === contest.id) dispatchContestSelection({ type: 'select' });
      if (form.id === contest.id) setForm({ id: '', title: '', prize: '', imageUrl: '', startsAt: '', endsAt: '', status: 'active', description: '' });
      await reloadContests();
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
    window.requestAnimationFrame(() => contestFormRef.current?.scrollIntoView({ behavior: preferredScrollBehavior(), block: 'start' }));
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
  const adminNav = hasFullAdminAccess ? ADMIN_NAV_ITEMS : CONTEST_ADMIN_NAV_ITEMS;

  const boostyStatus = boostyStatusResource.error ? boostyStatusFailure(boostyStatusResource.error) : boostyStatusResource.data ?? null;
  const boostySubscribers = boostySubscribersResource.error
    ? boostySubscribersFailure(boostySubscribersResource.error)
    : boostySubscribersResource.data ?? null;
  const telegramAccounts = telegramResource.error ? telegramAccountsFailure(telegramResource.error) : telegramResource.data ?? null;

  return (
    <AdminConsoleShell
      navigation={adminNav}
      activeSection={adminSection}
      accessLabel={hasFullAdminAccess ? 'Полный доступ' : 'Управление конкурсами'}
      userLabel={authUser?.name || authUser?.email || 'Администратор'}
      userTitle={authUser?.email || undefined}
      message={message}
      onNavigate={changeAdminSection}
      onIntent={hasFullAdminAccess ? prefetchSectionCode : undefined}
      onDismissMessage={() => setMessage(null)}
    >
        <AdminSectionFrame section={adminSection}>
          {hasFullAdminAccess && adminSection === 'dashboard' && (
            <React.Suspense fallback={<RouteFallback minHeight={420} />}>
              <AdminOverviewPage onNavigate={section => { if (isAdminSection(section)) changeAdminSection(section); }} onOpenSegment={openUserSegment} />
            </React.Suspense>
          )}

          {hasFullAdminAccess && adminSection === 'users' && (
            <ContestAdminUsers
              currentUserId={authUser?.id}
              users={usersList.users}
              total={usersList.total}
              loading={usersList.loading}
              query={usersList.query}
              page={usersList.page}
              pageCount={usersList.pageCount}
              actionId={userActionId}
              openMenuId={openUserMenuId}
              menuRef={userMenuRef}
              menuTriggerMap={userMenuTriggerMap}
              onRefresh={usersList.reload}
              onQueryChange={usersList.setQuery}
              onPageChange={usersList.setPage}
              onToggleMenu={userId => dispatchAdminWorkspace({ type: 'toggleUserMenu', userId })}
              onUpdateUser={(user, patch) => void updateAdminUser(user, patch)}
              segments={usersList.segments}
              segment={usersList.segment}
              tag={usersList.tag}
              onSegmentChange={usersList.changeSegment}
              onPersonChanged={usersList.reload}
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
              statusLoading={boostyStatusResource.loading || boostyStatusResource.refreshing}
              subscribers={boostySubscribers}
              subscribersLoading={boostySubscribersResource.loading || boostySubscribersResource.refreshing}
              onReload={() => {
                void boostyStatusResource.reload();
                void boostySubscribersResource.reload();
              }}
              formatDate={formatDate}
              entitlementLabels={subscriber => subscriptionEntitlementLabels({
                hasAccess: subscriber.siteAccess,
                entitlements: subscriber.entitlements as SubscriptionStatus['entitlements'],
              })}
            />
          )}

          {hasFullAdminAccess && adminSection === 'api-keys' && (
            <React.Suspense fallback={<RouteFallback minHeight={440} />}><AdminApiKeys /></React.Suspense>
          )}

          {hasFullAdminAccess && adminSection === 'telegram' && (
            <ContestAdminTelegram
              payload={telegramAccounts}
              loading={telegramResource.loading || telegramResource.refreshing}
              onReload={() => void telegramResource.reload()}
              formatDate={formatDate}
              entitlementLabels={account => subscriptionEntitlementLabels({
                hasAccess: account.hasAccess,
                entitlements: account.entitlements as SubscriptionStatus['entitlements'],
              })}
            />
          )}

          {hasFullAdminAccess && adminSection === 'articles' && (
            <React.Suspense fallback={<p className="contest-muted" role="status">Загружаем статьи…</p>}>
              <ContestAdminArticles onMessage={setMessage} />
            </React.Suspense>
          )}

          {hasFullAdminAccess && adminSection === 'gallery' && (
            <React.Suspense fallback={<p className="contest-muted" role="status">Загружаем галерею…</p>}>
              <ContestAdminGallery onMessage={setMessage} />
            </React.Suspense>
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
              loading={loading || contestsResource.loading || contestsResource.refreshing}
              statusFilter={contestStatusFilter}
              onStatusFilterChange={setContestStatusFilter}
              stats={contestStats}
              contests={filteredContests}
              selectedContestId={selectedContestId}
              selectedContest={selectedContest}
              onSelectContest={contest => dispatchContestSelection({ type: 'select', contest })}
              onEditSelected={editSelectedContest}
              onReload={() => void reloadContests()}
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
              referrals={referralsResource.data?.referrals ?? []}
              referralClicks={referralsResource.data?.recentClicks ?? []}
              loading={loading || referralsResource.loading || referralsResource.refreshing}
              formatDate={formatDate}
              onCopy={copyText}
              onSubmit={submitReferral}
            />
          )}
        </AdminSectionFrame>
    </AdminConsoleShell>
  );
}
