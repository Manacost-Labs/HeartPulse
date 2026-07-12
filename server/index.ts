import express from 'express';
import cron from 'node-cron';
import compression from 'compression';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import sharp from 'sharp';
import sanitizeHtml from 'sanitize-html';
import { createClient } from 'redis';
import { chmodSync, copyFileSync, createReadStream, mkdirSync, renameSync, unlinkSync, writeFileSync, readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { spawn } from 'child_process';
import { createHash, createHmac, createPublicKey, randomBytes, randomInt, scryptSync, timingSafeEqual, verify } from 'crypto';
// @ts-ignore: node:sqlite is available in the production Node 22 runtime.
import { DatabaseSync } from 'node:sqlite';
import { loadSnapshot } from './snapshots.js';
import { HSREPLAY_NO_ARENASMITH_TIER, normalizeArenasmithTier, tierFromArenasmithScore } from './hsreplayArenasmith.js';
import { createBlizzardCardImageClient, isBlizzardImageContentType } from './blizzardCards.js';
import { createOldGuideSanitizer } from './guides/sanitize.js';
import { evaluateDataHealth } from './health.js';
import { createHealthRouter } from './healthRoutes.js';
import { createMetricsRouter, HttpMetrics } from './metrics.js';
import { requestLoggingMiddleware, structuredErrorMiddleware } from './observability.js';
import { createScrapeQueueHandler } from './scrapeQueue.js';
import { decodeSignedStateCookie, encodeSignedStateCookie, safeAuthReturnTo } from './authRedirect.js';
import { csrfRequestAllowed } from './csrf.js';
import { configureLoopbackProxyTrust, corsOriginAllowed, getTrustedClientIp } from './networkBoundary.js';
import { createRouteAwareJsonParser, createUploadAuthorizationGuard } from './jsonBody.js';
import { createReferralRouter } from './referralRoutes.js';
import { createGalleryRouter } from './galleryRoutes.js';
import { detectAdminUploadFormat } from './imageFormat.js';
import { createBattlegroundProxyRouter } from './battlegroundProxyRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const DEFAULT_APP_ROOT_DIR = existsSync(join(__dirname, '..', '..', 'package.json'))
  ? join(__dirname, '..', '..')
  : join(__dirname, '..');
const APP_ROOT_DIR = resolve(process.env.APP_ROOT_DIR || DEFAULT_APP_ROOT_DIR);
const DATA_DIR = resolve(process.env.SERVER_DATA_DIR || join(APP_ROOT_DIR, 'server', 'data'));
const SNAPSHOT_PUBLICATION_FILE = join(DATA_DIR, '.snapshots-published');
const loadData = (filename: string): any | null => loadSnapshot(DATA_DIR, filename);
const RELEASE_SHA = (() => {
  const configured = process.env.RELEASE_SHA || process.env.GITHUB_SHA;
  if (configured) return configured;
  try {
    const manifest = JSON.parse(readFileSync(join(APP_ROOT_DIR, 'release.json'), 'utf8'));
    return /^[a-f0-9]{7,40}$/i.test(manifest?.sha) ? String(manifest.sha).toLowerCase() : 'development';
  } catch {
    return 'development';
  }
})();
const CARD_IMAGE_CACHE_DIR = join(DATA_DIR, 'card-images');
const ADMIN_UPLOAD_SOURCE_DIR = process.env.ADMIN_UPLOAD_SOURCE_DIR || join(DATA_DIR, 'uploads', 'admin');
const ADMIN_UPLOAD_DIR = process.env.ADMIN_UPLOAD_DIR || ADMIN_UPLOAD_SOURCE_DIR;
const GALLERY_UPLOAD_DIR = process.env.GALLERY_UPLOAD_DIR || join(DATA_DIR, 'uploads', 'gallery');
const CARD_IMAGE_CACHE_VERSION = 'card_img_v4';
const CARD_IMAGE_FALLBACK_RETRY_MS = 5 * 60_000;
const MAX_CARD_IMAGE_JOBS = 4;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const BG_DATA_CACHE_MS = Math.max(60_000, Number(process.env.BG_DATA_CACHE_MS || ONE_DAY_MS));
const BG_DATA_STALE_MS = Math.max(60_000, Number(process.env.BG_DATA_STALE_MS || 7 * ONE_DAY_MS));
const BG_JSON_CACHE_CONTROL = `public, max-age=${Math.floor(BG_DATA_CACHE_MS / 1000)}, stale-while-revalidate=${Math.floor(BG_DATA_STALE_MS / 1000)}`;
const BG_IMAGE_CACHE_CONTROL = 'public, max-age=2592000, immutable';
const blizzardCardImages = createBlizzardCardImageClient({
  clientId: process.env.BLIZZARD_CLIENT_ID,
  clientSecret: process.env.BLIZZARD_CLIENT_SECRET,
  region: process.env.BLIZZARD_API_REGION || process.env.BLIZZARD_REGION,
});
let lastBlizzardImageWarningAt = 0;

function ensureAdminUploadDirs() {
  mkdirSync(ADMIN_UPLOAD_DIR, { recursive: true });
  mkdirSync(ADMIN_UPLOAD_SOURCE_DIR, { recursive: true });

  for (const fileName of readdirSync(ADMIN_UPLOAD_SOURCE_DIR)) {
    if (!/^[a-z0-9-]+\.(?:webp|png|jpe?g|gif)$/i.test(fileName)) continue;
    const sourcePath = join(ADMIN_UPLOAD_SOURCE_DIR, fileName);
    const distPath = join(ADMIN_UPLOAD_DIR, fileName);
    try {
      if (!existsSync(distPath)) copyFileSync(sourcePath, distPath);
      chmodSync(distPath, 0o644);
    } catch (err) {
      console.warn('[admin-upload] failed to restore public upload', fileName, err);
    }
  }
}

// ─── In-memory data cache (avoids disk I/O on every request) ──────────────────
interface CacheEntry { data: any; etag: string; mtime: number }
const dataCache = new Map<string, CacheEntry>();
interface MemoryCacheEntry { data: any; etag: string; expiresAt: number }
interface ProxyBodyCacheEntry {
  body: Buffer;
  contentType: string;
  status: number;
  etag: string;
  expiresAt: number;
}
let classMatchupsCache: MemoryCacheEntry | null = null;
const winratesApiCache = new Map<string, MemoryCacheEntry>();
const tierlistApiCache = new Map<string, MemoryCacheEntry>();
const legendariesApiCache = new Map<string, MemoryCacheEntry>();
const standardMatchupsApiCache = new Map<string, MemoryCacheEntry>();
const battlegroundAppProxyCache = new Map<string, ProxyBodyCacheEntry>();
let homeSummaryApiCache: MemoryCacheEntry | null = null;
let arenaDecksCache: MemoryCacheEntry | null = null;
type CardImageSource = 'blizzard' | 'fallback' | 'placeholder';
type CachedCardImage = { path: string; source: CardImageSource };
const cardImageJobs = new Map<string, Promise<CachedCardImage>>();
let activeCardImageJobs = 0;
const cardImageQueue: Array<() => void> = [];

interface KolodahsCardIndexCache {
  mtime: number;
  byCardId: Map<string, string>;
  byDbf: Map<string, string>;
  fullArtByCardId: Map<string, string>;
  fullArtByDbf: Map<string, string>;
}

let kolodahsCardIndexCache: KolodahsCardIndexCache | null = null;

function loadDataCached(filename: string): CacheEntry | null {
  const filePath = join(DATA_DIR, filename);
  try {
    const mtime = statSync(filePath).mtimeMs;
    const cached = dataCache.get(filename);
    if (cached && cached.mtime === mtime) return cached;
    const data = loadData(filename);
    if (!data) return null;
    const entry: CacheEntry = { data, etag: `"${mtime.toString(36)}-${filename}"`, mtime };
    dataCache.set(filename, entry);
    return entry;
  } catch { return null; }
}

/** Call after scrape to invalidate stale cache entries */
function invalidateDataCache() {
  dataCache.clear();
  winratesApiCache.clear();
  tierlistApiCache.clear();
  legendariesApiCache.clear();
  standardMatchupsApiCache.clear();
  battlegroundAppProxyCache.clear();
  homeSummaryApiCache = null;
  classMatchupsCache = null;
  arenaDecksCache = null;
  void clearRedisDataCache();
}
let observedSnapshotPublicationMtime = 0;

function observeSnapshotPublication(): void {
  try {
    const mtime = statSync(SNAPSHOT_PUBLICATION_FILE).mtimeMs;
    if (mtime <= observedSnapshotPublicationMtime) return;
    observedSnapshotPublicationMtime = mtime;
    invalidateDataCache();
    console.log('[snapshots] activated newly published validated data');
  } catch {
    // The marker is optional until the first atomic publication.
  }
}
const AUTH_FILE = join(DATA_DIR, 'admin_auth.json');
const ECOSYSTEM_DIR = process.env.ECOSYSTEM_DIR || '/var/lib/manacost-ecosystem';
const ECOSYSTEM_DB_FILE = process.env.ECOSYSTEM_DB_FILE || join(ECOSYSTEM_DIR, 'users.sqlite');
const ECOSYSTEM_INTERNAL_KEY = process.env.ECOSYSTEM_INTERNAL_KEY || '';
const ADMIN_USER_IDS = new Set(
  (process.env.ADMIN_USER_IDS || 'user_42368c85b8de')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
);
const APP_URL = (process.env.APP_URL || 'https://arena.hs-manacost.ru').replace(/\/$/, '');
const KOLODAHS_DB_ROOT = process.env.KOLODAHS_DB_ROOT || '/var/www/koloda/data/www/db.kolodahs.ru';
const KOLODAHS_WIKI_CARD_INDEX_FILE = join(KOLODAHS_DB_ROOT, 'var/wiki-hs-cache/wiki-card-index-card.json');
const DECKVIEW_ARCHETYPES_API_URL = (process.env.DECKVIEW_ARCHETYPES_API_URL || process.env.DECKVIEW_API_URL || '').trim();
const DECKVIEW_ARCHETYPES_CSV_URL = process.env.DECKVIEW_ARCHETYPES_CSV_URL
  || 'https://raw.githubusercontent.com/Zulut30/deckview-telegram-bot/main/%D0%90%D1%80%D1%85%D0%B5%D1%82%D0%B8%D0%BF%D1%8B.csv';
const STANDARD_ARCHETYPE_TRANSLATION_CACHE_MS = Math.max(60_000, Number(process.env.STANDARD_ARCHETYPE_TRANSLATION_CACHE_MS || 6 * 60 * 60 * 1000));
const KOLODAHS_RELATED_CARD_PAGES_DIR = join(KOLODAHS_DB_ROOT, 'var/wiki-hs-cache/related-card-pages');
const AUTH_COOKIE_NAME = 'manacost_auth_token';
const AUTH_FROM = process.env.AUTH_FROM || 'noreply@hs-manacost.ru';
const NEWSLETTER_FROM = process.env.NEWSLETTER_FROM || AUTH_FROM;
const NEWSLETTER_FROM_NAME = (process.env.NEWSLETTER_FROM_NAME || 'Manacost').trim();
const NEWSLETTER_UNSUBSCRIBE_SECRET = (process.env.NEWSLETTER_UNSUBSCRIBE_SECRET || ECOSYSTEM_INTERNAL_KEY).trim();
const SENDMAIL_PATH = process.env.SENDMAIL_PATH || '/usr/sbin/sendmail';
const NEWSLETTER_HTML_MAX_LENGTH = Math.max(10_000, Number(process.env.NEWSLETTER_HTML_MAX_LENGTH || 120_000));
const NEWSLETTER_SENDMAIL_TIMEOUT_MS = 30_000;
const NEWSLETTER_LEGACY_MIGRATION_KEY = 'mailing_contacts_legacy_consent_migrated_v1';
const AUTH_SESSION_TTL_MS = Math.max(
  12 * 60 * 60 * 1000,
  Number(process.env.AUTH_SESSION_TTL_MS || 30 * 24 * 60 * 60 * 1000),
);
const AUTH_SESSION_REFRESH_WINDOW_MS = Math.max(
  60 * 60 * 1000,
  Math.min(
    AUTH_SESSION_TTL_MS / 2,
    Number(process.env.AUTH_SESSION_REFRESH_WINDOW_MS || 7 * 24 * 60 * 60 * 1000),
  ),
);
const AUTH_CODE_TTL_MS = 10 * 60 * 1000;
const AUTH_CODE_MAX_ATTEMPTS = 5;
const AUTH_CODE_REQUEST_COOLDOWN_MS = Math.max(30_000, Number(process.env.AUTH_CODE_REQUEST_COOLDOWN_MS || 60_000));
const AUTH_CODE_ISSUE_WINDOW_MS = Math.max(5 * 60_000, Number(process.env.AUTH_CODE_ISSUE_WINDOW_MS || 60 * 60 * 1000));
const AUTH_CODE_MAX_ISSUES_PER_WINDOW = Math.max(1, Number(process.env.AUTH_CODE_MAX_ISSUES_PER_WINDOW || 5));
const TELEGRAM_AUTH_BOT_TOKEN = process.env.TELEGRAM_AUTH_BOT_TOKEN || '';
const TELEGRAM_AUTH_BOT_USERNAME = (process.env.TELEGRAM_AUTH_BOT_USERNAME || '').trim().replace(/^@/, '');
const TELEGRAM_BOT_API_BASE = (process.env.TELEGRAM_BOT_API_BASE || process.env.TELEGRAM_AUTH_BOT_API_BASE || 'http://127.0.0.1:8081').replace(/\/+$/, '');
const TELEGRAM_PUBLIC_BOT_API_BASE = 'https://api.telegram.org';
const TELEGRAM_AUTH_BOT_WEBHOOK_SECRET = (process.env.TELEGRAM_AUTH_BOT_WEBHOOK_SECRET || (TELEGRAM_AUTH_BOT_TOKEN
  ? createHash('sha256').update(`auth-bot:${TELEGRAM_AUTH_BOT_TOKEN}`).digest('hex').slice(0, 32)
  : '')).trim();
const TELEGRAM_AUTH_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const TELEGRAM_LINK_CODE_TTL_MS = Math.max(5 * 60 * 1000, Number(process.env.TELEGRAM_LINK_CODE_TTL_MS || 15 * 60 * 1000));
const TELEGRAM_OIDC_CLIENT_ID = (process.env.TELEGRAM_OIDC_CLIENT_ID || process.env.TELEGRAM_AUTH_CLIENT_ID || '').trim();
const TELEGRAM_OIDC_CLIENT_SECRET = (process.env.TELEGRAM_OIDC_CLIENT_SECRET || process.env.TELEGRAM_AUTH_CLIENT_SECRET || '').trim();
const TELEGRAM_OIDC_ISSUER = 'https://oauth.telegram.org';
const TELEGRAM_OIDC_DISCOVERY_URL = `${TELEGRAM_OIDC_ISSUER}/.well-known/openid-configuration`;
const TELEGRAM_OIDC_COOKIE_NAME = 'manacost_tg_oidc';
const TELEGRAM_OIDC_STATE_TTL_MS = 10 * 60 * 1000;
const BOOSTY_AUTH_API_URL = (process.env.BOOSTY_AUTH_API_URL || 'http://127.0.0.1:18082').replace(/\/$/, '');
const BOOSTY_MIN_PRICE = Number(process.env.BOOSTY_MIN_PRICE || 99);
const BOOSTY_MIN_LEVEL_NAME = (process.env.BOOSTY_MIN_LEVEL_NAME || 'Любитель Арены').trim();
const BOOSTY_LEVEL_ORDER = (process.env.BOOSTY_LEVEL_ORDER || 'Любитель Арены,Алмаз')
  .split(',')
  .map(item => item.trim())
  .filter(Boolean);
const BOOSTY_ARENA_LEVEL_NAMES = (process.env.BOOSTY_ARENA_LEVEL_NAMES || 'Любитель Арены')
  .split(',')
  .map(item => item.trim())
  .filter(Boolean);
const BOOSTY_BATTLEGROUNDS_LEVEL_NAMES = (process.env.BOOSTY_BATTLEGROUNDS_LEVEL_NAMES || 'Таверна Боба')
  .split(',')
  .map(item => item.trim())
  .filter(Boolean);
const BOOSTY_ALL_ACCESS_LEVEL_NAMES = (process.env.BOOSTY_ALL_ACCESS_LEVEL_NAMES || 'Алмаз,Легенда,Топ-1 Легенды,Топ-1000 Легенды')
  .split(',')
  .map(item => item.trim())
  .filter(Boolean);
const KHA_VIP_BOT_TOKEN = process.env.KHA_VIP_BOT_TOKEN || '';
const KHA_VIP_PROFILES_FILE = process.env.KHA_VIP_PROFILES_FILE || '/var/lib/docker/volumes/kha-vip-bot_bot_cache/_data/profiles.json';
const KHA_VIP_WP_BASE_URL = (process.env.KHA_VIP_WP_BASE_URL || process.env.WP_BASE_URL || 'https://kolodahearthstone.ru').replace(/\/$/, '');
const KHA_VIP_WP_BEARER = process.env.KHA_VIP_WP_BEARER || process.env.WP_BEARER || '';
const KHA_VIP_LOCKERS_CACHE_MS = Math.max(60_000, Number(process.env.KHA_VIP_LOCKERS_CACHE_MS || 5 * 60 * 1000));
const KHA_VIP_ARTICLE_HOSTS = new Set(['kolodahearthstone.ru', 'www.kolodahearthstone.ru']);
const KOLODAHS_API_BASE_URL = (process.env.KOLODAHS_API_BASE_URL || 'https://db.kolodahs.ru/api/v1').replace(/\/$/, '');
const OLD_GUIDES_DB_FILE = process.env.OLD_GUIDES_DB_FILE || '/var/www/koloda/data/old-sites/kolodahearthstone.ru_old/db/guides.sqlite';
const OLD_GUIDES_PUBLIC_URL = (process.env.OLD_GUIDES_PUBLIC_URL || 'https://old.kolodahearthstone.ru').replace(/\/$/, '');
const oldGuideSanitizer = createOldGuideSanitizer(OLD_GUIDES_PUBLIC_URL);
const normalizeOldGuideAssetUrl = oldGuideSanitizer.normalizeAssetUrl;
const normalizeOldGuideLink = oldGuideSanitizer.normalizeLink;
const sanitizeOldGuideHtml = oldGuideSanitizer.sanitizeHtml;
const EXTRA_BG_LIBRARY_ENDPOINTS: Record<string, string> = {
  anomaly: '/anomalies',
  quest: '/quests',
  darkmoon_prize: '/darkmoon-prizes',
  reward: '/rewards',
  trinket: '/trinkets',
  timewarped: '/timewarped-cards',
};
const SUBSCRIPTION_TELEGRAM_CHAT_IDS = (process.env.SUBSCRIPTION_TELEGRAM_CHAT_IDS || '-5001968053,-1002311131780,-5077378176')
  .split(',')
  .map(item => item.trim())
  .filter(Boolean);
const SUBSCRIPTION_REFRESH_MS = 30 * 60 * 1000;
const SUBSCRIPTION_STALE_RETRY_MS = Math.max(
  60_000,
  Number(process.env.SUBSCRIPTION_STALE_RETRY_MS || 5 * 60 * 1000),
);
const BOOSTY_ACCESS_GRACE_MS = Math.max(
  60 * 60 * 1000,
  Number(process.env.BOOSTY_ACCESS_GRACE_MS || 24 * 60 * 60 * 1000),
);
const REDIS_URL = (process.env.REDIS_URL || 'redis://127.0.0.1:6379').trim();
const REDIS_ENABLED = process.env.REDIS_ENABLED !== '0' && REDIS_URL !== '';
const REDIS_CACHE_PREFIX = process.env.REDIS_CACHE_PREFIX || 'hs-arena:v2';
const REDIS_DATASET_TTL_SECONDS = Math.max(60, Number(process.env.REDIS_DATASET_TTL_SECONDS || 6 * 60 * 60));
const REDIS_HOME_SUMMARY_TTL_SECONDS = Math.max(60, Number(process.env.REDIS_HOME_SUMMARY_TTL_SECONDS || 5 * 60));
const DATASET_MEMORY_CACHE_MS = Math.max(60_000, Number(process.env.DATASET_MEMORY_CACHE_MS || 5 * 60 * 1000));
const HOME_SUMMARY_CACHE_MS = REDIS_HOME_SUMMARY_TTL_SECONDS * 1000;
const CONTEST_ADMIN_USER_ID = 'user_42368c85b8de';
const CONTEST_PUBLIC_ID_SECRET = process.env.CONTEST_PUBLIC_ID_SECRET || ECOSYSTEM_INTERNAL_KEY || 'manacost-contest-public-winner-v2';
const CONTEST_LOCAL_TIMEZONE_OFFSET_MINUTES = Number.isFinite(Number(process.env.CONTEST_LOCAL_TIMEZONE_OFFSET_MINUTES))
  ? Number(process.env.CONTEST_LOCAL_TIMEZONE_OFFSET_MINUTES)
  : 180;
const ADMIN_UPLOAD_MAX_BYTES = Math.max(1024 * 1024, Number(process.env.ADMIN_UPLOAD_MAX_BYTES || 12 * 1024 * 1024));
const ADMIN_UPLOAD_MAX_PIXELS = Math.max(1_000_000, Number(process.env.ADMIN_UPLOAD_MAX_PIXELS || 16_000_000));
const ADMIN_UPLOAD_MAX_WIDTH = Math.max(1000, Number(process.env.ADMIN_UPLOAD_MAX_WIDTH || 6000));
const ADMIN_UPLOAD_MAX_HEIGHT = Math.max(1000, Number(process.env.ADMIN_UPLOAD_MAX_HEIGHT || 6000));
const GALLERY_UPLOAD_MAX_BYTES = Math.max(5 * 1024 * 1024, Number(process.env.GALLERY_UPLOAD_MAX_BYTES || 32 * 1024 * 1024));
const GALLERY_UPLOAD_MAX_PIXELS = Math.max(4_000_000, Number(process.env.GALLERY_UPLOAD_MAX_PIXELS || 80_000_000));
const GALLERY_PREVIEW_MAX_WIDTH = Math.max(1200, Number(process.env.GALLERY_PREVIEW_MAX_WIDTH || 2400));
const GALLERY_THUMB_MAX_WIDTH = Math.max(360, Number(process.env.GALLERY_THUMB_MAX_WIDTH || 720));

interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
  country?: string;
  newsletterOptIn?: boolean;
  avatarInitials?: string;
  telegramId?: string;
  telegramUsername?: string;
  photoUrl?: string;
  contactVkUrl?: string;
  contactTelegram?: string;
  contactEmail?: string;
  blockedAt?: string;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
}

interface SubscriptionStatus {
  hasAccess: boolean;
  source: string;
  checkedAt: string | null;
  stale: boolean;
  message: string;
  entitlements: SubscriptionEntitlements;
  boosty: Record<string, any>;
  telegram: Record<string, any>;
}

type SubscriptionEntitlementKey =
  | 'arena'
  | 'battlegrounds'
  | 'standard'
  | 'contests'
  | 'guidesArchive'
  | 'arenaArticles'
  | 'battlegroundsArticles';

type SubscriptionEntitlements = Record<SubscriptionEntitlementKey, boolean>;

interface PendingCode {
  email: string;
  codeHash: string;
  expiresAt: number;
  attempts: number;
}

interface AdminSession {
  tokenHash: string;
  userId?: string;
  email: string;
  expiresAt: number;
  createdAt: string;
}

interface AdminAuthStore {
  users: AdminUser[];
  pendingCodes: PendingCode[];
  sessions: AdminSession[];
  updatedAt: string;
}

interface RedisCachePayload<T = any> {
  data: T;
  etag: string;
  cachedAt: string;
}

interface RedisProxyCachePayload {
  bodyBase64: string;
  contentType: string;
  status: number;
  etag: string;
  cachedAt: string;
}

interface KhaVipLocker {
  post_id: number;
  code: string;
  title: string;
  url: string;
  image?: string;
  excerpt?: string;
  date?: string;
  type?: string;
}

let redisClientPromise: Promise<any | null> | null = null;
let redisDisabledUntil = 0;
let redisWarningPrinted = false;
let khaVipLockersCache: { items: KhaVipLocker[]; expiresAt: number } | null = null;
let oldGuidesDb: DatabaseSync | null = null;

function redisDataKey(kind: string, source = 'default'): string {
  return `${REDIS_CACHE_PREFIX}:data:${kind}:${source}`;
}

async function getRedisClient(): Promise<any | null> {
  if (!REDIS_ENABLED || Date.now() < redisDisabledUntil) return null;
  if (!redisClientPromise) {
    redisClientPromise = (async () => {
      const client = createClient({ url: REDIS_URL });
      client.on('error', (err: any) => {
        if (!redisWarningPrinted) {
          console.warn('[redis] client error:', err?.message ?? err);
          redisWarningPrinted = true;
        }
      });
      client.on('end', () => {
        redisClientPromise = null;
      });
      await client.connect();
      return client;
    })().catch((err: any) => {
      console.warn('[redis] unavailable, falling back to memory cache:', err?.message ?? err);
      redisClientPromise = null;
      redisDisabledUntil = Date.now() + 60_000;
      return null;
    });
  }
  return redisClientPromise;
}

async function redisGetCache<T = any>(key: string): Promise<RedisCachePayload<T> | null> {
  try {
    const client = await getRedisClient();
    if (!client) return null;
    const raw = await client.get(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RedisCachePayload<T>;
    if (!parsed?.etag || parsed.data === undefined) return null;
    return parsed;
  } catch (err: any) {
    console.warn('[redis] read failed:', err?.message ?? err);
    return null;
  }
}

async function redisSetCache(key: string, data: any, etag: string, ttlSeconds: number): Promise<void> {
  try {
    const client = await getRedisClient();
    if (!client) return;
    const payload: RedisCachePayload = { data, etag, cachedAt: new Date().toISOString() };
    await client.set(key, JSON.stringify(payload), { EX: ttlSeconds });
  } catch (err: any) {
    console.warn('[redis] write failed:', err?.message ?? err);
  }
}

async function redisGetProxyCache(key: string): Promise<{
  body: Buffer;
  contentType: string;
  status: number;
  etag: string;
} | null> {
  try {
    const client = await getRedisClient();
    if (!client) return null;
    const raw = await client.get(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RedisProxyCachePayload;
    if (!parsed?.bodyBase64 || !parsed.etag || !parsed.contentType || !parsed.status) return null;
    return {
      body: Buffer.from(parsed.bodyBase64, 'base64'),
      contentType: parsed.contentType,
      status: parsed.status,
      etag: parsed.etag,
    };
  } catch (err: any) {
    console.warn('[redis] proxy read failed:', err?.message ?? err);
    return null;
  }
}

async function redisSetProxyCache(
  key: string,
  entry: { body: Buffer; contentType: string; status: number; etag: string },
  ttlSeconds: number,
): Promise<void> {
  try {
    const client = await getRedisClient();
    if (!client) return;
    const payload: RedisProxyCachePayload = {
      bodyBase64: entry.body.toString('base64'),
      contentType: entry.contentType,
      status: entry.status,
      etag: entry.etag,
      cachedAt: new Date().toISOString(),
    };
    await client.set(key, JSON.stringify(payload), { EX: ttlSeconds });
  } catch (err: any) {
    console.warn('[redis] proxy write failed:', err?.message ?? err);
  }
}

function redisHashedDataKey(kind: string, value: string): string {
  return redisDataKey(kind, createHash('sha1').update(value).digest('hex').slice(0, 32));
}

async function clearRedisDataCache(): Promise<void> {
  try {
    const client = await getRedisClient();
    if (!client) return;
    const keys = await client.keys(`${REDIS_CACHE_PREFIX}:data:*`);
    if (keys.length) await client.del(keys);
  } catch (err: any) {
    console.warn('[redis] clear failed:', err?.message ?? err);
  }
}

function normalizeKolodahsCardIdFromImage(value: unknown): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    const file = decodeURIComponent(url.pathname.split('/').pop() || '');
    return file.replace(/\.(png|jpe?g|webp)$/i, '');
  } catch {
    const file = decodeURIComponent(raw.split('?')[0].split('/').pop() || '');
    return file.replace(/\.(png|jpe?g|webp)$/i, '');
  }
}

function kolodahsRelatedPageFilename(pageTitle: string): string {
  return `${pageTitle
    .replace(/[\/\s]+/g, '_')
    .replace(/[^A-Za-z0-9_.-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')}.json`;
}

function kolodahsFullImageFromGalleryItem(item: any): string {
  const fileUrl = String(item?.file_url || '').trim();
  if (fileUrl) return fileUrl;

  const thumbUrl = String(item?.thumb_url || '').trim();
  if (!thumbUrl) return '';
  const match = thumbUrl.match(/^(.*?\/images\/)thumb\/(.+?)\/[^/?]+(\?.*)?$/);
  return match ? `${match[1]}${match[2]}${match[3] || ''}` : thumbUrl;
}

function loadKolodahsCardIndex(): KolodahsCardIndexCache | null {
  try {
    const fileStat = statSync(KOLODAHS_WIKI_CARD_INDEX_FILE);
    if (kolodahsCardIndexCache?.mtime === fileStat.mtimeMs) return kolodahsCardIndexCache;

    const parsed = JSON.parse(readFileSync(KOLODAHS_WIKI_CARD_INDEX_FILE, 'utf8'));
    const byCardId = new Map<string, string>();
    const byDbf = new Map<string, string>();
    const fullArtByCardId = new Map<string, string>();
    const fullArtByDbf = new Map<string, string>();
    const fullArtByPageTitle = new Map<string, string>();
    for (const entry of Array.isArray(parsed?.entries) ? parsed.entries : []) {
      const pageTitle = String(entry?.page_title || '').trim();
      if (!pageTitle) continue;
      const cardId = String(entry?.card_id || '').trim();
      if (cardId) byCardId.set(cardId, pageTitle);
      const dbf = entry?.dbf_id;
      if (dbf !== null && dbf !== undefined && String(dbf).trim()) {
        byDbf.set(String(dbf), pageTitle);
      }

      let fullArt = fullArtByPageTitle.get(pageTitle);
      if (fullArt === undefined) {
        fullArt = kolodahsFullArtFromRelatedPage(pageTitle);
        fullArtByPageTitle.set(pageTitle, fullArt);
      }
      if (fullArt && cardId) fullArtByCardId.set(cardId, fullArt);
      if (fullArt && dbf !== null && dbf !== undefined && String(dbf).trim()) {
        fullArtByDbf.set(String(dbf), fullArt);
      }
    }

    kolodahsCardIndexCache = { mtime: fileStat.mtimeMs, byCardId, byDbf, fullArtByCardId, fullArtByDbf };
    return kolodahsCardIndexCache;
  } catch (err: any) {
    console.warn('[kolodahs full-art] card index unavailable:', err?.message ?? err);
    return null;
  }
}

function kolodahsFullArtFromRelatedPage(pageTitle: string): string {
  try {
    const file = join(KOLODAHS_RELATED_CARD_PAGES_DIR, kolodahsRelatedPageFilename(pageTitle));
    if (!existsSync(file)) return '';
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    const gallery = Array.isArray(parsed?.gallery_images) ? parsed.gallery_images : [];
    const fullArt = gallery.find((item: any) => {
      const haystack = `${item?.caption || ''} ${item?.file_title || ''} ${item?.file_name || ''}`.toLowerCase();
      return kolodahsFullImageFromGalleryItem(item) && haystack.includes('full');
    }) || gallery.find((item: any) => kolodahsFullImageFromGalleryItem(item));
    return kolodahsFullImageFromGalleryItem(fullArt);
  } catch (err: any) {
    console.warn('[kolodahs full-art] related page unavailable:', pageTitle, err?.message ?? err);
    return '';
  }
}

function kolodahsFullArtForCard(card: any, fallbackDbf?: unknown): string {
  const index = loadKolodahsCardIndex();
  if (!index || !card) return '';
  const explicitCardId = String(card?.card_id || card?.cardId || '').trim();
  const imageCardId = normalizeKolodahsCardIdFromImage(card?.image || card?.image_gold || card?.crop_image);
  const dbf = card?.dbf ?? card?.dbf_id ?? card?.dbfId ?? fallbackDbf;
  return (explicitCardId && index.fullArtByCardId.get(explicitCardId))
    || (imageCardId && index.fullArtByCardId.get(imageCardId))
    || (dbf !== null && dbf !== undefined && index.fullArtByDbf.get(String(dbf)))
    || '';
}

function enrichBattlegroundHeroPayload(payload: any): any {
  const heroPower = payload?.libraryHero?.hero_power;
  const card = heroPower?.card;
  if (!card || card.full_art || card.fullArt) return payload;
  const fullArt = kolodahsFullArtForCard(card, heroPower?.dbf);
  if (!fullArt) return payload;

  return {
    ...payload,
    libraryHero: {
      ...payload.libraryHero,
      hero_power: {
        ...heroPower,
        card: {
          ...card,
          full_art: fullArt,
        },
      },
    },
  };
}

const kolodahsPrewarmTimer = setTimeout(() => {
  loadKolodahsCardIndex();
}, 1_000);
kolodahsPrewarmTimer.unref?.();

function normalizeEmail(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function hmacSha256(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('hex');
}

function safeEqualHex(leftHex: string, rightHex: string): boolean {
  if (!/^[a-f0-9]+$/i.test(leftHex) || !/^[a-f0-9]+$/i.test(rightHex)) return false;
  const left = Buffer.from(leftHex, 'hex');
  const right = Buffer.from(rightHex, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}

function safeEqualString(leftValue: unknown, rightValue: string): boolean {
  const left = Buffer.from(String(leftValue ?? ''));
  const right = Buffer.from(rightValue);
  return left.length === right.length && timingSafeEqual(left, right);
}

function hashSecret(secret: string, salt = randomBytes(16).toString('hex')): string {
  const hash = scryptSync(secret, salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

function verifySecret(secret: string, stored: string): boolean {
  const [, salt, expectedHex] = stored.split(':');
  if (!salt || !expectedHex) return false;
  const expected = Buffer.from(expectedHex, 'hex');
  const actual = scryptSync(secret, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

let ecosystemDb: DatabaseSync | null = null;

function db(): DatabaseSync {
  if (ecosystemDb) return ecosystemDb;
  mkdirSync(ECOSYSTEM_DIR, { recursive: true });
  ecosystemDb = new DatabaseSync(ECOSYSTEM_DB_FILE);
  ecosystemDb.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  ecosystemDb.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      country TEXT,
      newsletter_opt_in INTEGER NOT NULL DEFAULT 0,
      avatar_initials TEXT,
      contact_vk_url TEXT,
      contact_telegram TEXT,
      contact_email TEXT,
      blocked_at TEXT,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS identities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      provider_user_id TEXT NOT NULL,
      email TEXT,
      username TEXT,
      photo_url TEXT,
      verified_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(provider, provider_user_id),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS telegram_link_tokens (
      code TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      used_at TEXT,
      telegram_id TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_telegram_link_tokens_user ON telegram_link_tokens(user_id, expires_at);
    CREATE TABLE IF NOT EXISTS telegram_email_codes (
      telegram_id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS pending_codes (
      email TEXT PRIMARY KEY,
      code_hash TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      email TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS subscriptions (
      user_id TEXT PRIMARY KEY,
      has_access INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'none',
      message TEXT NOT NULL DEFAULT '',
      checked_at TEXT,
      stale INTEGER NOT NULL DEFAULT 0,
      boosty_json TEXT NOT NULL DEFAULT '{}',
      telegram_json TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS subscription_checks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      source TEXT NOT NULL,
      has_access INTEGER NOT NULL DEFAULT 0,
      detail_json TEXT NOT NULL DEFAULT '{}',
      checked_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS manual_subscription_grants (
      user_id TEXT PRIMARY KEY,
      active INTEGER NOT NULL DEFAULT 1,
      entitlements_json TEXT NOT NULL DEFAULT '{}',
      granted_by TEXT NOT NULL,
      granted_at TEXT NOT NULL,
      revoked_by TEXT,
      revoked_at TEXT,
      note TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS contests (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      prize TEXT NOT NULL DEFAULT '',
      image_url TEXT NOT NULL DEFAULT '',
      starts_at TEXT,
      ends_at TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      winners_json TEXT NOT NULL DEFAULT '[]',
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS contest_entries (
      id TEXT PRIMARY KEY,
      contest_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      email TEXT NOT NULL DEFAULT '',
      contact_json TEXT NOT NULL DEFAULT '{}',
      subscription_json TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      UNIQUE(contest_id, user_id),
      FOREIGN KEY(contest_id) REFERENCES contests(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS referral_links (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL,
      campaign TEXT NOT NULL DEFAULT '',
      target_path TEXT NOT NULL DEFAULT '/',
      status TEXT NOT NULL DEFAULT 'active',
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS referral_clicks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      referral_id TEXT NOT NULL,
      clicked_at TEXT NOT NULL,
      ip_hash TEXT NOT NULL DEFAULT '',
      user_agent TEXT NOT NULL DEFAULT '',
      referrer TEXT NOT NULL DEFAULT '',
      landing_path TEXT NOT NULL DEFAULT '',
      FOREIGN KEY(referral_id) REFERENCES referral_links(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS article_votes (
      article_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      vote INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(article_id, user_id),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS mailing_contacts (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      user_id TEXT,
      name TEXT NOT NULL DEFAULT '',
      consent_status TEXT NOT NULL DEFAULT 'unknown' CHECK(consent_status IN ('unknown', 'subscribed', 'unsubscribed', 'suppressed')),
      consent_source TEXT NOT NULL DEFAULT '',
      consented_at TEXT,
      verified_at TEXT,
      unsubscribed_at TEXT,
      suppressed_reason TEXT NOT NULL DEFAULT '',
      account_state TEXT NOT NULL DEFAULT 'current' CHECK(account_state IN ('current', 'former')),
      former_at TEXT,
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS mailing_campaigns (
      id TEXT PRIMARY KEY,
      subject TEXT NOT NULL,
      preheader TEXT NOT NULL DEFAULT '',
      html_body TEXT NOT NULL,
      text_body TEXT NOT NULL DEFAULT '',
      template_key TEXT NOT NULL DEFAULT 'custom',
      segment TEXT NOT NULL DEFAULT 'all-consented',
      status TEXT NOT NULL DEFAULT 'queued',
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      recipient_count INTEGER NOT NULL DEFAULT 0,
      accepted_count INTEGER NOT NULL DEFAULT 0,
      failed_count INTEGER NOT NULL DEFAULT 0,
      skipped_count INTEGER NOT NULL DEFAULT 0,
      error TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS mailing_deliveries (
      campaign_id TEXT NOT NULL,
      contact_id TEXT NOT NULL,
      email_snapshot TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT NOT NULL DEFAULT '',
      accepted_at TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(campaign_id, contact_id),
      FOREIGN KEY(campaign_id) REFERENCES mailing_campaigns(id) ON DELETE CASCADE,
      FOREIGN KEY(contact_id) REFERENCES mailing_contacts(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS admin_audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_user_id TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      details_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  ecosystemDb.exec('CREATE INDEX IF NOT EXISTS idx_referral_clicks_referral_time ON referral_clicks(referral_id, clicked_at DESC);');
  ecosystemDb.exec('CREATE INDEX IF NOT EXISTS idx_article_votes_article ON article_votes(article_id);');
  ecosystemDb.exec('CREATE INDEX IF NOT EXISTS idx_mailing_contacts_status ON mailing_contacts(consent_status, account_state);');
  ecosystemDb.exec('CREATE INDEX IF NOT EXISTS idx_mailing_contacts_user ON mailing_contacts(user_id);');
  ecosystemDb.exec('CREATE INDEX IF NOT EXISTS idx_mailing_campaigns_created ON mailing_campaigns(created_at DESC);');
  ecosystemDb.exec('CREATE INDEX IF NOT EXISTS idx_mailing_deliveries_status ON mailing_deliveries(campaign_id, status, attempts);');
  ecosystemDb.exec('CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit_log(created_at DESC);');
  const userColumns = new Set((ecosystemDb.prepare('PRAGMA table_info(users)').all() as any[]).map(row => String(row.name)));
  if (!userColumns.has('contact_vk_url')) ecosystemDb.exec('ALTER TABLE users ADD COLUMN contact_vk_url TEXT');
  if (!userColumns.has('contact_telegram')) ecosystemDb.exec('ALTER TABLE users ADD COLUMN contact_telegram TEXT');
  if (!userColumns.has('contact_email')) ecosystemDb.exec('ALTER TABLE users ADD COLUMN contact_email TEXT');
  if (!userColumns.has('blocked_at')) ecosystemDb.exec('ALTER TABLE users ADD COLUMN blocked_at TEXT');
  migrateLegacyAuthStore(ecosystemDb);
  syncKhaVipProfiles(ecosystemDb);
  syncExistingMailingContacts(ecosystemDb);
  return ecosystemDb;
}

function dbGet<T = any>(sql: string, ...params: any[]): T | undefined {
  return db().prepare(sql).get(...params) as T | undefined;
}

function dbAll<T = any>(sql: string, ...params: any[]): T[] {
  return db().prepare(sql).all(...params) as T[];
}

function dbRun(sql: string, ...params: any[]) {
  db().prepare(sql).run(...params);
}

function identityOwner(provider: string, providerUserId: string): { user_id: string } | undefined {
  const normalized = providerUserId.trim();
  if (!provider || !normalized) return undefined;
  return dbGet<{ user_id: string }>(
    'SELECT user_id FROM identities WHERE provider = ? AND provider_user_id = ?',
    provider,
    normalized,
  );
}

function identityBelongsToAnotherUser(provider: string, providerUserId: string, userId: string): boolean {
  const owner = identityOwner(provider, providerUserId);
  return Boolean(owner?.user_id && owner.user_id !== userId);
}

function assertIdentityAvailable(provider: string, providerUserId: string, userId: string, label: string) {
  if (identityBelongsToAnotherUser(provider, providerUserId, userId)) {
    throw new Error(`${label} уже привязан к другому аккаунту`);
  }
}

function migrateLegacyAuthStore(database: DatabaseSync) {
  const migrated = database.prepare('SELECT value FROM meta WHERE key = ?').get('legacy_auth_migrated') as { value?: string } | undefined;
  if (migrated?.value === '1') return;

  const legacy = existsSync(AUTH_FILE) ? loadData('admin_auth.json') as Partial<AdminAuthStore> | null : null;
  const nowIso = new Date().toISOString();
  try {
    database.exec('BEGIN IMMEDIATE');
    for (const user of Array.isArray(legacy?.users) ? legacy!.users as AdminUser[] : []) {
      upsertUserRow(database, user);
    }
    for (const code of Array.isArray(legacy?.pendingCodes) ? legacy!.pendingCodes as PendingCode[] : []) {
      if (code.expiresAt > Date.now() && code.attempts < AUTH_CODE_MAX_ATTEMPTS) {
        database.prepare(`
          INSERT INTO pending_codes (email, code_hash, expires_at, attempts)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(email) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = excluded.attempts
        `).run(code.email, code.codeHash, code.expiresAt, code.attempts);
      }
    }
    for (const session of Array.isArray(legacy?.sessions) ? legacy!.sessions as AdminSession[] : []) {
      if (session.expiresAt <= Date.now()) continue;
      const user = database.prepare('SELECT id FROM users WHERE email = ?').get(session.email) as { id?: string } | undefined;
      if (!user?.id) continue;
      database.prepare(`
        INSERT OR REPLACE INTO sessions (token_hash, user_id, email, expires_at, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(session.tokenHash, user.id, session.email, session.expiresAt, session.createdAt);
    }
    database.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run('legacy_auth_migrated', '1');
    database.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run('legacy_auth_migrated_at', nowIso);
    database.exec('COMMIT');
  } catch (err) {
    database.exec('ROLLBACK');
    throw err;
  }
}

function mailingContactId(email: string): string {
  return `mail_${sha256(normalizeEmail(email)).slice(0, 24)}`;
}

function syncMailingContactForUser(database: DatabaseSync, user: AdminUser, options: { confirmConsent?: boolean; source?: string } = {}) {
  const email = normalizeEmail(user.email);
  if (!isRealEmail(email)) return;
  const nowIso = new Date().toISOString();
  const source = normalizeOptionalText(options.source, 80) || 'user-sync';
  const consentKnown = Boolean(options.confirmConsent);
  const desiredStatus = user.newsletterOptIn ? (consentKnown ? 'subscribed' : 'unknown') : 'unsubscribed';
  const confirmedAt = options.confirmConsent && user.newsletterOptIn ? nowIso : null;

  database.prepare(`
    UPDATE mailing_contacts
    SET user_id = NULL,
        consent_status = 'suppressed',
        suppressed_reason = 'email-replaced',
        updated_at = ?
    WHERE user_id = ? AND lower(email) <> lower(?)
  `).run(nowIso, user.id, email);

  database.prepare(`
    INSERT INTO mailing_contacts (
      id, email, user_id, name, consent_status, consent_source, consented_at, verified_at,
      unsubscribed_at, suppressed_reason, account_state, former_at, first_seen_at, last_seen_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '', 'current', NULL, ?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET
      user_id = excluded.user_id,
      name = excluded.name,
      consent_status = CASE
        WHEN excluded.consent_status = 'unknown' THEN mailing_contacts.consent_status
        WHEN mailing_contacts.consent_status IN ('unsubscribed', 'suppressed') AND excluded.verified_at IS NULL
          THEN mailing_contacts.consent_status
        ELSE excluded.consent_status
      END,
      consent_source = CASE
        WHEN excluded.consent_status = 'unknown' THEN mailing_contacts.consent_source
        WHEN mailing_contacts.consent_status IN ('unsubscribed', 'suppressed') AND excluded.verified_at IS NULL
          THEN mailing_contacts.consent_source
        ELSE excluded.consent_source
      END,
      consented_at = CASE
        WHEN excluded.consent_status = 'subscribed' AND (excluded.verified_at IS NOT NULL OR mailing_contacts.consented_at IS NULL)
          THEN COALESCE(excluded.consented_at, mailing_contacts.consented_at)
        ELSE mailing_contacts.consented_at
      END,
      verified_at = COALESCE(excluded.verified_at, mailing_contacts.verified_at),
      unsubscribed_at = CASE WHEN excluded.verified_at IS NOT NULL THEN NULL ELSE mailing_contacts.unsubscribed_at END,
      suppressed_reason = CASE WHEN excluded.verified_at IS NOT NULL THEN '' ELSE mailing_contacts.suppressed_reason END,
      account_state = 'current',
      former_at = NULL,
      last_seen_at = excluded.last_seen_at,
      updated_at = excluded.updated_at
  `).run(
    mailingContactId(email),
    email,
    user.id,
    normalizeOptionalText(user.name, 120),
    desiredStatus,
    source,
    desiredStatus === 'subscribed' ? (confirmedAt || user.createdAt || nowIso) : null,
    confirmedAt,
    user.newsletterOptIn ? null : nowIso,
    user.createdAt || nowIso,
    nowIso,
    nowIso,
  );
}

function syncExistingMailingContacts(database: DatabaseSync) {
  const migrated = database.prepare('SELECT value FROM meta WHERE key = ?').get(NEWSLETTER_LEGACY_MIGRATION_KEY) as { value?: string } | undefined;
  if (migrated?.value === '1') return;

  try {
    database.exec('BEGIN IMMEDIATE');
    const rows = database.prepare('SELECT * FROM users').all() as any[];
    for (const row of rows) {
      const user = authUserFromRow(row);
      syncMailingContactForUser(database, user, {
        confirmConsent: Boolean(user.newsletterOptIn),
        source: 'legacy-registration',
      });
    }
    database.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run(NEWSLETTER_LEGACY_MIGRATION_KEY, '1');
    database.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run(`${NEWSLETTER_LEGACY_MIGRATION_KEY}_at`, new Date().toISOString());
    database.exec('COMMIT');
  } catch (err) {
    database.exec('ROLLBACK');
    throw err;
  }
}

function updateMailingConsent(user: AdminUser, subscribed: boolean, source: string) {
  user.newsletterOptIn = subscribed;
  syncMailingContactForUser(db(), user, { confirmConsent: subscribed, source });
  if (!subscribed) {
    const nowIso = new Date().toISOString();
    dbRun(`
      UPDATE mailing_contacts
      SET consent_status = 'unsubscribed', unsubscribed_at = ?, suppressed_reason = 'user-unsubscribed', updated_at = ?
      WHERE lower(email) = lower(?)
    `, nowIso, nowIso, normalizeEmail(user.email));
  }
}

function rememberBoostyMailingContact(emailValue: unknown, nameValue: unknown, active: boolean, formerAt?: unknown) {
  const email = normalizeEmail(emailValue);
  if (!isRealEmail(email)) return;
  const nowIso = new Date().toISOString();
  const formerAtIso = formerAt ? String(formerAt) : active ? null : nowIso;
  dbRun(`
    INSERT INTO mailing_contacts (
      id, email, user_id, name, consent_status, consent_source, consented_at, verified_at,
      unsubscribed_at, suppressed_reason, account_state, former_at, first_seen_at, last_seen_at, updated_at
    ) VALUES (?, ?, NULL, ?, 'unknown', 'boosty-observed', NULL, NULL, NULL, '', 'former', ?, ?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET
      name = CASE WHEN mailing_contacts.name = '' THEN excluded.name ELSE mailing_contacts.name END,
      former_at = CASE WHEN mailing_contacts.user_id IS NULL AND ? = 0 THEN COALESCE(mailing_contacts.former_at, excluded.former_at) ELSE mailing_contacts.former_at END,
      last_seen_at = excluded.last_seen_at,
      updated_at = excluded.updated_at
  `, mailingContactId(email), email, normalizeOptionalText(nameValue, 120), formerAtIso, nowIso, nowIso, nowIso, active ? 1 : 0);
}

function upsertUserRow(database: DatabaseSync, user: AdminUser) {
  const nowIso = new Date().toISOString();
  const createdAt = user.createdAt || nowIso;
  const updatedAt = user.updatedAt || nowIso;
  database.prepare(`
    INSERT INTO users (
      id, email, name, role, country, newsletter_opt_in, avatar_initials, contact_vk_url, contact_telegram, contact_email, blocked_at, password_hash, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      email = excluded.email,
      name = excluded.name,
      role = excluded.role,
      country = excluded.country,
      newsletter_opt_in = excluded.newsletter_opt_in,
      avatar_initials = excluded.avatar_initials,
      contact_vk_url = excluded.contact_vk_url,
      contact_telegram = excluded.contact_telegram,
      contact_email = excluded.contact_email,
      blocked_at = excluded.blocked_at,
      password_hash = excluded.password_hash,
      updated_at = excluded.updated_at
  `).run(
    user.id,
    user.email,
    user.name,
    user.role,
    user.country ?? '',
    user.newsletterOptIn ? 1 : 0,
    user.avatarInitials ?? '',
    user.contactVkUrl ?? '',
    user.contactTelegram ?? '',
    user.contactEmail ?? '',
    user.blockedAt ?? '',
    user.passwordHash,
    createdAt,
    updatedAt,
  );

  database.prepare("DELETE FROM identities WHERE user_id = ? AND provider = 'email' AND provider_user_id <> ?").run(user.id, user.email);
  database.prepare(`
    INSERT INTO identities (user_id, provider, provider_user_id, email, username, photo_url, verified_at, created_at, updated_at)
    VALUES (?, 'email', ?, ?, ?, '', ?, ?, ?)
    ON CONFLICT(provider, provider_user_id) DO UPDATE SET
      email = excluded.email,
      username = excluded.username,
      updated_at = excluded.updated_at
      WHERE identities.user_id = excluded.user_id
  `).run(user.id, user.email, user.email, user.email, createdAt, createdAt, updatedAt);

  if (user.telegramId) {
    database.prepare(`
      INSERT INTO identities (user_id, provider, provider_user_id, email, username, photo_url, verified_at, created_at, updated_at)
      VALUES (?, 'telegram', ?, '', ?, ?, ?, ?, ?)
      ON CONFLICT(provider, provider_user_id) DO UPDATE SET
        username = excluded.username,
        photo_url = excluded.photo_url,
        updated_at = excluded.updated_at
        WHERE identities.user_id = excluded.user_id
    `).run(user.id, user.telegramId, user.telegramUsername ?? '', user.photoUrl ?? '', createdAt, createdAt, updatedAt);
  }
  syncMailingContactForUser(database, user);
}

function authUserFromRow(row: any): AdminUser {
  return {
    id: String(row.id),
    email: String(row.email),
    name: String(row.name),
    role: row.role === 'admin' ? 'admin' : 'user',
    country: String(row.country ?? ''),
    newsletterOptIn: Boolean(row.newsletter_opt_in),
    avatarInitials: String(row.avatar_initials ?? ''),
    telegramId: row.telegram_id ? String(row.telegram_id) : undefined,
    telegramUsername: row.telegram_username ? String(row.telegram_username) : undefined,
    photoUrl: row.telegram_photo_url ? String(row.telegram_photo_url) : undefined,
    contactVkUrl: String(row.contact_vk_url ?? ''),
    contactTelegram: String(row.contact_telegram ?? ''),
    contactEmail: String(row.contact_email ?? ''),
    blockedAt: row.blocked_at ? String(row.blocked_at) : undefined,
    passwordHash: String(row.password_hash),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function loadAuthStore(): AdminAuthStore {
  const now = Date.now();
  dbRun('DELETE FROM pending_codes WHERE expires_at <= ? OR attempts >= ?', now, AUTH_CODE_MAX_ATTEMPTS);
  dbRun('DELETE FROM sessions WHERE expires_at <= ?', now);
  const users = dbAll(`
    SELECT
      u.*,
      tg.provider_user_id AS telegram_id,
      tg.username AS telegram_username,
      tg.photo_url AS telegram_photo_url
    FROM users u
    LEFT JOIN identities tg ON tg.user_id = u.id AND tg.provider = 'telegram'
    ORDER BY u.created_at ASC
  `).map(authUserFromRow);
  const pendingCodes = dbAll<any>('SELECT email, code_hash, expires_at, attempts FROM pending_codes')
    .map(row => ({
      email: String(row.email),
      codeHash: String(row.code_hash),
      expiresAt: Number(row.expires_at),
      attempts: Number(row.attempts),
    }));
  const sessions = dbAll<any>('SELECT token_hash, user_id, email, expires_at, created_at FROM sessions')
    .map(row => ({
      tokenHash: String(row.token_hash),
      userId: String(row.user_id || ''),
      email: String(row.email),
      expiresAt: Number(row.expires_at),
      createdAt: String(row.created_at),
    }));
  return { users, pendingCodes, sessions, updatedAt: new Date().toISOString() };
}

function saveAuthStore(store: AdminAuthStore) {
  const database = db();
  try {
    database.exec('BEGIN IMMEDIATE');
    const keepIds = store.users.map(user => user.id);
    if (keepIds.length) {
      const nowIso = new Date().toISOString();
      database.prepare(`
        UPDATE mailing_contacts
        SET user_id = NULL, account_state = 'former', former_at = COALESCE(former_at, ?), updated_at = ?
        WHERE user_id IS NOT NULL AND user_id NOT IN (${keepIds.map(() => '?').join(',')})
      `).run(nowIso, nowIso, ...keepIds);
      database.prepare(`DELETE FROM users WHERE id NOT IN (${keepIds.map(() => '?').join(',')})`).run(...keepIds);
    }
    for (const user of store.users) upsertUserRow(database, user);
    database.prepare('DELETE FROM pending_codes').run();
    for (const code of store.pendingCodes) {
      if (code.expiresAt <= Date.now() || code.attempts >= AUTH_CODE_MAX_ATTEMPTS) continue;
      database.prepare(`
        INSERT OR REPLACE INTO pending_codes (email, code_hash, expires_at, attempts)
        VALUES (?, ?, ?, ?)
      `).run(code.email, code.codeHash, code.expiresAt, code.attempts);
    }
    database.prepare('DELETE FROM sessions').run();
    for (const session of store.sessions) {
      if (session.expiresAt <= Date.now()) continue;
      const user = store.users.find(item => item.id === session.userId || item.email === session.email);
      if (!user) continue;
      database.prepare(`
        INSERT OR REPLACE INTO sessions (token_hash, user_id, email, expires_at, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(session.tokenHash, user.id, session.email, session.expiresAt, session.createdAt);
    }
    database.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run('auth_updated_at', new Date().toISOString());
    database.exec('COMMIT');
  } catch (err) {
    database.exec('ROLLBACK');
    throw err;
  }
}

const authCodeIssueHistory = new Map<string, number[]>();

function prepareAuthCode(store: AdminAuthStore, email: string): { ok: true; code: string } | { ok: false; status: number; error: string } {
  const now = Date.now();
  const windowStart = now - AUTH_CODE_ISSUE_WINDOW_MS;
  const recent = (authCodeIssueHistory.get(email) || []).filter(timestamp => timestamp > windowStart);
  const lastIssuedAt = recent.at(-1) || 0;
  if (lastIssuedAt && now - lastIssuedAt < AUTH_CODE_REQUEST_COOLDOWN_MS) {
    return { ok: false, status: 429, error: 'Код уже отправлен. Подождите минуту перед повторной отправкой.' };
  }
  if (recent.length >= AUTH_CODE_MAX_ISSUES_PER_WINDOW) {
    return { ok: false, status: 429, error: 'Слишком много кодов для этой почты. Попробуйте позже.' };
  }

  const code = randomInt(100000, 1000000).toString();
  const existing = store.pendingCodes.find(item => item.email === email && item.expiresAt > now);
  store.pendingCodes = store.pendingCodes.filter(item => item.email !== email && item.expiresAt > now);
  store.pendingCodes.push({
    email,
    codeHash: sha256(code),
    expiresAt: now + AUTH_CODE_TTL_MS,
    attempts: existing ? existing.attempts : 0,
  });
  authCodeIssueHistory.set(email, [...recent, now]);
  return { ok: true, code };
}

function verifyPendingCode(pending: PendingCode, code: string): boolean {
  return safeEqualHex(pending.codeHash, sha256(code));
}

function normalizeTelegramLinkCode(value: unknown): string {
  const raw = String(value ?? '').trim().toUpperCase();
  const compact = raw.replace(/\s+/g, '').replace(/^\/(?:START|LINK)/, '').replace(/[^A-Z0-9-]/g, '');
  const match = compact.match(/(?:TG-?)?(\d{6})/);
  return match ? `TG-${match[1]}` : '';
}

function createTelegramLinkCode(userId: string): { code: string; expiresAt: number } {
  const database = db();
  const now = Date.now();
  const expiresAt = now + TELEGRAM_LINK_CODE_TTL_MS;
  database.prepare('DELETE FROM telegram_link_tokens WHERE user_id = ? OR expires_at <= ? OR used_at IS NOT NULL').run(userId, now);

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = `TG-${randomInt(100000, 1000000)}`;
    try {
      database.prepare(`
        INSERT INTO telegram_link_tokens (code, user_id, expires_at, created_at)
        VALUES (?, ?, ?, ?)
      `).run(code, userId, expiresAt, new Date().toISOString());
      return { code, expiresAt };
    } catch {
      // Retry on a rare code collision.
    }
  }
  throw new Error('Не удалось создать Telegram-код');
}

function telegramLinkCodeFromMessage(text: unknown): string {
  const raw = String(text ?? '');
  const startPayload = raw.match(/^\/start\s+(.+)$/i)?.[1];
  const linkPayload = raw.match(/^\/link\s+(.+)$/i)?.[1];
  return normalizeTelegramLinkCode(startPayload || linkPayload || raw);
}

function extractEmailFromTelegramMessage(text: unknown): string {
  const raw = String(text ?? '').trim();
  const payload = raw.match(/^\/email\s+(.+)$/i)?.[1] || raw;
  const match = payload.match(/[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+/);
  return match ? normalizeEmail(match[0]) : '';
}

function telegramEmailCodeFromMessage(text: unknown): string {
  return String(text ?? '').replace(/\D/g, '').slice(0, 6);
}

function telegramEmailCodeHash(telegramId: string, email: string, code: string): string {
  return sha256(`telegram-email:${telegramId}:${normalizeEmail(email)}:${code}:${TELEGRAM_AUTH_BOT_TOKEN}`);
}

function pendingTelegramEmailCode(telegramId: string): { telegram_id: string; email: string; code_hash: string; expires_at: number; attempts: number } | undefined {
  return dbGet<{ telegram_id: string; email: string; code_hash: string; expires_at: number; attempts: number }>(
    'SELECT telegram_id, email, code_hash, expires_at, attempts FROM telegram_email_codes WHERE telegram_id = ?',
    telegramId,
  );
}

async function requestTelegramEmailCode(telegramId: string, email: string) {
  const normalizedTelegramId = String(telegramId || '').replace(/\D/g, '');
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedTelegramId) throw new Error('Telegram не передал ID пользователя');
  if (!isRealEmail(normalizedEmail)) throw new Error('Пришлите реальную почту в формате name@example.com');

  const existingTelegramId = findKhaVipTelegramByEmail(normalizedEmail);
  if (existingTelegramId && existingTelegramId !== normalizedTelegramId) {
    throw new Error('Эта почта уже привязана к другому Telegram');
  }
  const telegramIdentity = identityOwner('telegram', normalizedTelegramId);
  if (telegramIdentity?.user_id && identityBelongsToAnotherUser('boosty-email', normalizedEmail, telegramIdentity.user_id)) {
    throw new Error('Эта Boosty-почта уже привязана к другому аккаунту');
  }

  const code = randomInt(100000, 1000000).toString();
  const nowIso = new Date().toISOString();
  dbRun(`
    INSERT INTO telegram_email_codes (telegram_id, email, code_hash, expires_at, attempts, created_at)
    VALUES (?, ?, ?, ?, 0, ?)
    ON CONFLICT(telegram_id) DO UPDATE SET
      email = excluded.email,
      code_hash = excluded.code_hash,
      expires_at = excluded.expires_at,
      attempts = 0,
      created_at = excluded.created_at
  `, normalizedTelegramId, normalizedEmail, telegramEmailCodeHash(normalizedTelegramId, normalizedEmail, code), Date.now() + AUTH_CODE_TTL_MS, nowIso);
  await sendAuthCodeEmail(normalizedEmail, code);
}

async function confirmTelegramEmailCode(telegramId: string, code: string): Promise<{ email: string; linkedUser?: AdminUser; status?: SubscriptionStatus }> {
  const normalizedTelegramId = String(telegramId || '').replace(/\D/g, '');
  const normalizedCode = telegramEmailCodeFromMessage(code);
  const pending = pendingTelegramEmailCode(normalizedTelegramId);
  if (!pending) throw new Error('Активного кода нет. Отправьте /email ваша@почта');
  if (pending.expires_at <= Date.now()) {
    dbRun('DELETE FROM telegram_email_codes WHERE telegram_id = ?', normalizedTelegramId);
    throw new Error('Код истёк. Отправьте /email ещё раз.');
  }
  const attempts = Number(pending.attempts || 0) + 1;
  if (attempts > AUTH_CODE_MAX_ATTEMPTS || !safeEqualHex(pending.code_hash, telegramEmailCodeHash(normalizedTelegramId, pending.email, normalizedCode))) {
    dbRun('UPDATE telegram_email_codes SET attempts = ? WHERE telegram_id = ?', attempts, normalizedTelegramId);
    throw new Error(attempts >= AUTH_CODE_MAX_ATTEMPTS
      ? 'Слишком много неверных попыток. Отправьте /email ещё раз.'
      : `Неверный код. Осталось попыток: ${AUTH_CODE_MAX_ATTEMPTS - attempts}.`);
  }

  const existingTelegramId = findKhaVipTelegramByEmail(pending.email);
  if (existingTelegramId && existingTelegramId !== normalizedTelegramId) {
    throw new Error('Эта почта уже привязана к другому Telegram');
  }

  const store = loadAuthStore();
  const linkedUser = store.users.find(item => item.telegramId === normalizedTelegramId);
  setKhaVipVerifiedEmail(normalizedTelegramId, pending.email);
  if (linkedUser) {
    const existingEmailUser = store.users.find(item => item.email === pending.email && item.id !== linkedUser.id);
    if (existingEmailUser || identityBelongsToAnotherUser('boosty-email', pending.email, linkedUser.id)) {
      throw new Error('Эта Boosty-почта уже привязана к другому аккаунту');
    }
    const oldEmail = linkedUser.email;
    linkedUser.email = pending.email;
    linkedUser.contactEmail = linkedUser.contactEmail || pending.email;
    linkedUser.updatedAt = new Date().toISOString();
    store.sessions = store.sessions.map(session => session.email === oldEmail ? { ...session, email: pending.email } : session);
    saveAuthStore(store);
    const nowIso = new Date().toISOString();
    dbRun(`
      INSERT INTO identities (user_id, provider, provider_user_id, email, username, photo_url, verified_at, created_at, updated_at)
      VALUES (?, 'boosty-email', ?, ?, ?, '', ?, ?, ?)
      ON CONFLICT(provider, provider_user_id) DO UPDATE SET
        email = excluded.email,
        username = excluded.username,
        verified_at = excluded.verified_at,
        updated_at = excluded.updated_at
        WHERE identities.user_id = excluded.user_id
    `, linkedUser.id, pending.email, pending.email, pending.email, nowIso, nowIso, nowIso);
  }

  dbRun('DELETE FROM telegram_email_codes WHERE telegram_id = ?', normalizedTelegramId);
  const status = linkedUser ? await refreshSubscriptionForUser(linkedUser, true) : undefined;
  return { email: pending.email, linkedUser, status };
}

function publicUser(user: AdminUser) {
  return {
    id: user.id,
    profileId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    country: user.country ?? '',
    newsletterOptIn: Boolean(user.newsletterOptIn),
    avatarInitials: user.avatarInitials ?? user.name.slice(0, 2).toUpperCase(),
    telegramUsername: user.telegramUsername ?? '',
    photoUrl: user.photoUrl ?? '',
    contactVkUrl: user.contactVkUrl ?? '',
    contactTelegram: user.contactTelegram ?? '',
    contactEmail: user.contactEmail ?? '',
    blockedAt: user.blockedAt ?? '',
    adminAllowed: isAdminUser(user),
    contestAdminAllowed: isContestAdminUser(user),
  };
}

function normalizeOptionalText(value: unknown, maxLength = 240): string {
  return String(value ?? '').trim().slice(0, maxLength);
}

function normalizeDateOnlyInput(value: unknown): string {
  const raw = normalizeOptionalText(value, 40);
  if (!raw) return '';
  const direct = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (direct) return raw;
  const parsed = new Date(raw);
  if (!Number.isFinite(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

function normalizeDateTimeInput(value: unknown): string | null {
  const raw = normalizeOptionalText(value, 40);
  if (!raw) return null;
  if (!/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw)) {
    const localMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/);
    if (localMatch) {
      const [, year, month, day, hour, minute, second = '0', millis = '0'] = localMatch;
      const utcMs = Date.UTC(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour),
        Number(minute),
        Number(second),
        Number(millis.padEnd(3, '0')),
      ) - CONTEST_LOCAL_TIMEZONE_OFFSET_MINUTES * 60 * 1000;
      if (Number.isFinite(utcMs)) return new Date(utcMs).toISOString();
    }
  }
  const parsed = new Date(raw);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed.toISOString();
}

function normalizeContactTelegram(value: unknown): string {
  return normalizeOptionalText(value, 80).replace(/^@+/, '');
}

function normalizeContactEmail(value: unknown): string {
  const email = normalizeEmail(value);
  return email && isRealEmail(email) ? email : '';
}

function normalizeContactVkUrl(value: unknown): string {
  const raw = normalizeOptionalText(value, 240);
  if (!raw) return '';
  if (/^https?:\/\/(vk\.com|www\.vk\.com)\//i.test(raw)) return raw;
  if (/^[a-z0-9_.]{3,80}$/i.test(raw.replace(/^@/, ''))) return `https://vk.com/${raw.replace(/^@/, '')}`;
  return '';
}

function normalizeContestImageUrl(value: unknown): string {
  const raw = normalizeOptionalText(value, 500);
  if (!raw) return '';
  if (/^\/uploads\/admin\/[a-z0-9-]+\.(?:webp|png|jpe?g|gif)$/i.test(raw)) return raw;
  try {
    const url = new URL(raw);
    const appHost = new URL(APP_URL).host;
    if ((url.protocol === 'https:' || url.protocol === 'http:')
      && (url.host === appHost || url.hostname === 'arena.hs-manacost.ru')
      && /^\/uploads\/admin\/[a-z0-9-]+\.(?:webp|png|jpe?g|gif)$/i.test(url.pathname)) {
      return url.pathname;
    }
  } catch {
    return '';
  }
  return '';
}

function contestAdminAuth(req: import('express').Request): AdminUser | null {
  const user = userAuth(req);
  return user && isContestAdminUser(user) ? user : null;
}

function parseJsonArray(value: unknown): any[] {
  try {
    const parsed = JSON.parse(String(value || '[]'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function contestStatusFromDates(status: string, startsAt?: string | null, endsAt?: string | null): string {
  if (status === 'draft' || status === 'cancelled' || status === 'completed') return status;
  const now = Date.now();
  const startMs = startsAt ? Date.parse(startsAt) : Number.NaN;
  const endMs = endsAt ? Date.parse(endsAt) : Number.NaN;
  if (Number.isFinite(endMs) && now > endMs) return 'completed';
  if (Number.isFinite(startMs) && now < startMs) return 'planned';
  return 'active';
}

function publicWinnerId(contestId: string, value: string): string {
  const id = String(value || '').trim();
  if (!id) return '';
  const digest = hmacSha256(`${contestId}:${id}`, CONTEST_PUBLIC_ID_SECRET).slice(0, 12);
  return `win_${digest}`;
}

function contestFromRow(row: any, userEntry?: any, options: { includeRawWinners?: boolean } = {}) {
  const status = contestStatusFromDates(String(row.status || 'draft'), row.starts_at, row.ends_at);
  const winners = parseJsonArray(row.winners_json).map(String);
  return {
    id: String(row.id),
    title: String(row.title || ''),
    description: String(row.description || ''),
    prize: String(row.prize || ''),
    imageUrl: String(row.image_url || ''),
    startsAt: row.starts_at ? String(row.starts_at) : '',
    endsAt: row.ends_at ? String(row.ends_at) : '',
    status,
    winners: options.includeRawWinners ? winners : winners.map(id => publicWinnerId(String(row.id), id)).filter(Boolean),
    createdBy: String(row.created_by || ''),
    createdAt: String(row.created_at || ''),
    updatedAt: String(row.updated_at || ''),
    entry: userEntry ? {
      status: String(userEntry.status || 'pending'),
      createdAt: String(userEntry.created_at || ''),
    } : null,
  };
}

function isRealEmail(email: string): boolean {
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)
    && !email.endsWith('@telegram.local')
    && !email.endsWith('.local');
}

function readKhaVipProfile(telegramId: string): Record<string, any> | null {
  try {
    if (!telegramId || !existsSync(KHA_VIP_PROFILES_FILE)) return null;
    const data = JSON.parse(readFileSync(KHA_VIP_PROFILES_FILE, 'utf-8'));
    const profile = data?.[telegramId];
    return profile && typeof profile === 'object' ? profile : null;
  } catch (err: any) {
    console.warn('[ecosystem] KHA VIP profile read failed:', err?.message ?? err);
    return null;
  }
}

function readKhaVipProfiles(): Record<string, any> {
  try {
    if (!existsSync(KHA_VIP_PROFILES_FILE)) return {};
    const data = JSON.parse(readFileSync(KHA_VIP_PROFILES_FILE, 'utf-8'));
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  } catch (err: any) {
    console.warn('[ecosystem] KHA VIP profiles read failed:', err?.message ?? err);
    return {};
  }
}

function writeKhaVipProfiles(profiles: Record<string, any>) {
  mkdirSync(dirname(KHA_VIP_PROFILES_FILE), { recursive: true });
  const tmpFile = `${KHA_VIP_PROFILES_FILE}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmpFile, `${JSON.stringify(profiles, null, 2)}\n`);
  renameSync(tmpFile, KHA_VIP_PROFILES_FILE);
}

function khaVerifiedEmail(profile: Record<string, any> | null): string {
  if (!profile?.email_verified_at) return '';
  const email = normalizeEmail(profile.email);
  return isRealEmail(email) ? email : '';
}

function findKhaVipTelegramByEmail(email: string): string {
  const normalized = normalizeEmail(email);
  if (!normalized) return '';
  const profiles = readKhaVipProfiles();
  for (const [telegramIdRaw, profile] of Object.entries(profiles)) {
    if (!profile || typeof profile !== 'object') continue;
    if (khaVerifiedEmail(profile as Record<string, any>) === normalized) {
      return String(telegramIdRaw).replace(/\D/g, '');
    }
  }
  return '';
}

function setKhaVipVerifiedEmail(telegramId: string, email: string) {
  const normalizedTelegramId = String(telegramId || '').replace(/\D/g, '');
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedTelegramId || !isRealEmail(normalizedEmail)) throw new Error('Некорректные данные Telegram/email');

  const profiles = readKhaVipProfiles();
  const existingTelegramId = findKhaVipTelegramByEmail(normalizedEmail);
  if (existingTelegramId && existingTelegramId !== normalizedTelegramId) {
    throw new Error('Эта почта уже привязана к другому Telegram');
  }

  const profile = profiles[normalizedTelegramId] && typeof profiles[normalizedTelegramId] === 'object'
    ? profiles[normalizedTelegramId]
    : {};
  profile.email = normalizedEmail;
  profile.email_verified_at = new Date().toISOString();
  delete profile.boosty_access;
  delete profile.boosty_checked_at;
  profiles[normalizedTelegramId] = profile;
  writeKhaVipProfiles(profiles);
}


function khaProfileHasBoostyAccess(profile: Record<string, any> | null): boolean {
  if (!profile || profile.boosty_access !== true) return false;
  return hasBoostyContentAccess(String(profile.boosty_level || ''), Number(profile.boosty_price || 0));
}

function khaBoostySubscriptionDetail(user: AdminUser, profile: Record<string, any> | null): Record<string, any> | null {
  if (!khaProfileHasBoostyAccess(profile)) return null;
  const levelName = String(profile?.boosty_level || '');
  const rawPrice = Number(profile?.boosty_price || 0);
  const entitlements = boostyEntitlementsForLevel(levelName);
  const hasAccess = hasAnyEntitlement(entitlements);
  return {
    configured: true,
    checked: true,
    found: true,
    hasAccess,
    email: khaVerifiedEmail(profile) || user.email,
    levelName,
    price: rawPrice,
    entitlements,
    source: 'kha-vip-bot',
    message: hasAccess
      ? 'Boosty подписка подтверждена через Telegram-бот Манакоста.'
      : 'Boosty уровень найден, но он не открывает разделы HS-Arena.',
  };
}

function findKhaVipProfileForUser(user: AdminUser): Record<string, any> | null {
  if (user.telegramId) {
    const byTelegram = readKhaVipProfile(user.telegramId);
    if (byTelegram) return byTelegram;
  }
  if (!isRealEmail(user.email)) return null;
  const email = normalizeEmail(user.email);
  const profiles = readKhaVipProfiles();
  for (const profile of Object.values(profiles)) {
    if (!profile || typeof profile !== 'object') continue;
    if (khaVerifiedEmail(profile as Record<string, any>) === email) return profile as Record<string, any>;
  }
  return null;
}

function syncKhaVipProfiles(database: DatabaseSync) {
  const profiles = readKhaVipProfiles();
  const now = new Date().toISOString();
  for (const [telegramIdRaw, profile] of Object.entries(profiles)) {
    const telegramId = String(telegramIdRaw).replace(/\D/g, '');
    const email = khaVerifiedEmail(profile as Record<string, any>);
    if (!telegramId || !email) continue;

    const telegramIdentity = database.prepare("SELECT user_id FROM identities WHERE provider = 'telegram' AND provider_user_id = ?")
      .get(telegramId) as { user_id?: string } | undefined;
    const emailUser = database.prepare('SELECT id FROM users WHERE email = ?')
      .get(email) as { id?: string } | undefined;

    if (telegramIdentity?.user_id && emailUser?.id && telegramIdentity.user_id !== emailUser.id) {
      console.warn('[ecosystem] skipped KHA VIP identity merge because Telegram and email belong to different users', {
        telegramId,
        telegramUserId: telegramIdentity.user_id,
        emailUserId: emailUser.id,
      });
      continue;
    }

    if (telegramIdentity?.user_id && !emailUser?.id) {
      database.prepare('UPDATE users SET email = ?, updated_at = ? WHERE id = ?')
        .run(email, now, telegramIdentity.user_id);
      database.prepare("DELETE FROM identities WHERE user_id = ? AND provider = 'email'")
        .run(telegramIdentity.user_id);
      database.prepare(`
        INSERT INTO identities (user_id, provider, provider_user_id, email, username, photo_url, verified_at, created_at, updated_at)
        VALUES (?, 'email', ?, ?, ?, '', ?, ?, ?)
      `).run(telegramIdentity.user_id, email, email, email, now, now, now);
      database.prepare('UPDATE sessions SET email = ? WHERE user_id = ?').run(email, telegramIdentity.user_id);
      const user = loadAuthStore().users.find(item => item.id === telegramIdentity.user_id);
      if (user) applyKhaSubscriptionSnapshot(user, profile as Record<string, any>);
      continue;
    }

    if (!telegramIdentity?.user_id && emailUser?.id) {
      database.prepare(`
        INSERT INTO identities (user_id, provider, provider_user_id, email, username, photo_url, verified_at, created_at, updated_at)
        VALUES (?, 'telegram', ?, '', '', '', ?, ?, ?)
        ON CONFLICT(provider, provider_user_id) DO UPDATE SET
          updated_at = excluded.updated_at
          WHERE identities.user_id = excluded.user_id
      `).run(emailUser.id, telegramId, now, now, now);
      const user = loadAuthStore().users.find(item => item.id === emailUser.id);
      if (user) applyKhaSubscriptionSnapshot(user, profile as Record<string, any>);
      continue;
    }

    if (!telegramIdentity?.user_id && !emailUser?.id && khaProfileHasBoostyAccess(profile as Record<string, any>)) {
      const displayName = normalizeOptionalText((profile as Record<string, any>).boosty_name, 80)
        || email.split('@')[0]
        || `Telegram ${telegramId}`;
      const user: AdminUser = {
        id: `tg_${sha256(telegramId).slice(0, 12)}`,
        email,
        name: displayName,
        role: 'user',
        country: '',
        newsletterOptIn: false,
        avatarInitials: displayName.slice(0, 2).toUpperCase(),
        telegramId,
        telegramUsername: '',
        photoUrl: '',
        contactVkUrl: '',
        contactTelegram: '',
        contactEmail: email,
        passwordHash: hashSecret(randomBytes(24).toString('hex')),
        createdAt: now,
        updatedAt: now,
      };
      upsertUserRow(database, user);
      applyKhaSubscriptionSnapshot(user, profile as Record<string, any>);
    }
  }
}

function normalizeBoostyLevelName(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9]+/g, ' ')
    .trim();
}

function emptyEntitlements(): SubscriptionEntitlements {
  return {
    arena: false,
    battlegrounds: false,
    standard: false,
    contests: false,
    guidesArchive: false,
    arenaArticles: false,
    battlegroundsArticles: false,
  };
}

function allEntitlements(): SubscriptionEntitlements {
  return {
    arena: true,
    battlegrounds: true,
    standard: true,
    contests: true,
    guidesArchive: true,
    arenaArticles: true,
    battlegroundsArticles: true,
  };
}

function mergeEntitlements(...items: Array<Partial<SubscriptionEntitlements> | null | undefined>): SubscriptionEntitlements {
  const merged = emptyEntitlements();
  for (const item of items) {
    if (!item) continue;
    for (const key of Object.keys(merged) as SubscriptionEntitlementKey[]) {
      merged[key] ||= Boolean(item[key]);
    }
  }
  return merged;
}

function hasAnyEntitlement(entitlements: Partial<SubscriptionEntitlements> | null | undefined): boolean {
  return Boolean(entitlements && Object.values(entitlements).some(Boolean));
}

function boostyNameMatches(levelName: string, candidates: string[]): boolean {
  const normalized = normalizeBoostyLevelName(levelName);
  if (!normalized) return false;
  return candidates.some(candidate => {
    const normalizedCandidate = normalizeBoostyLevelName(candidate);
    return Boolean(normalizedCandidate && (normalized === normalizedCandidate || normalized.includes(normalizedCandidate)));
  });
}

function boostyEntitlementsForLevel(levelName: string): SubscriptionEntitlements {
  if (boostyNameMatches(levelName, BOOSTY_ALL_ACCESS_LEVEL_NAMES)) return allEntitlements();

  const entitlements = emptyEntitlements();
  if (boostyNameMatches(levelName, BOOSTY_ARENA_LEVEL_NAMES)) {
    entitlements.arena = true;
    entitlements.contests = true;
    entitlements.guidesArchive = true;
    entitlements.arenaArticles = true;
  }
  if (boostyNameMatches(levelName, BOOSTY_BATTLEGROUNDS_LEVEL_NAMES)) {
    entitlements.battlegrounds = true;
    entitlements.contests = true;
    entitlements.guidesArchive = true;
    entitlements.battlegroundsArticles = true;
  }
  return entitlements;
}

function normalizeEntitlements(value: unknown): SubscriptionEntitlements {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return emptyEntitlements();
  const source = value as Record<string, unknown>;
  const entitlements = emptyEntitlements();
  for (const key of Object.keys(entitlements) as SubscriptionEntitlementKey[]) {
    entitlements[key] = Boolean(source[key]);
  }
  return entitlements;
}

function normalizeBoostySubscriptionDetail(detail: Record<string, any>): Record<string, any> {
  if (!detail || typeof detail !== 'object' || Array.isArray(detail)) return {};
  const levelName = String(detail.levelName || '');
  const levelEntitlements = levelName ? boostyEntitlementsForLevel(levelName) : emptyEntitlements();
  const entitlements = hasAnyEntitlement(levelEntitlements)
    ? levelEntitlements
    : normalizeEntitlements(detail.entitlements);
  return {
    ...detail,
    entitlements,
    hasAccess: Boolean(detail.hasAccess) && hasAnyEntitlement(entitlements),
  };
}

function normalizeTelegramSubscriptionDetail(detail: Record<string, any>): Record<string, any> {
  if (!detail || typeof detail !== 'object' || Array.isArray(detail)) return {};
  const entitlements = mergeEntitlements(
    normalizeEntitlements(detail.entitlements),
    detail.hasAccess ? allEntitlements() : emptyEntitlements(),
  );
  return {
    ...detail,
    entitlements,
    hasAccess: Boolean(detail.hasAccess) && hasAnyEntitlement(entitlements),
  };
}

function boostyLevelRank(levelName: string): number {
  const normalized = normalizeBoostyLevelName(levelName);
  if (!normalized) return -1;
  return BOOSTY_LEVEL_ORDER.findIndex(item => {
    const candidate = normalizeBoostyLevelName(item);
    return normalized === candidate || normalized.includes(candidate);
  });
}

function hasRequiredBoostyLevel(levelName: string): boolean {
  const minRank = boostyLevelRank(BOOSTY_MIN_LEVEL_NAME);
  const rank = boostyLevelRank(levelName);
  return minRank >= 0 && rank >= minRank;
}

function hasBoostyContentAccess(levelName: string, price: number): boolean {
  void price;
  return hasAnyEntitlement(boostyEntitlementsForLevel(levelName));
}

function applyKhaSubscriptionSnapshot(user: AdminUser, profile: Record<string, any> | null) {
  const boosty = khaBoostySubscriptionDetail(user, profile);
  if (!boosty) return;
  const now = new Date().toISOString();
  const entitlements = normalizeEntitlements(boosty.entitlements);
  const hasAccess = hasAnyEntitlement(entitlements);
  const status: SubscriptionStatus = {
    hasAccess,
    source: 'boosty',
    checkedAt: now,
    stale: false,
    message: hasAccess
      ? 'Boosty подписка подтверждена через Telegram-бот Манакоста.'
      : 'Boosty уровень найден, но он не открывает разделы HS-Arena.',
    entitlements,
    boosty,
    telegram: {},
  };
  writeSubscriptionStatus(user, status);
  writeSubscriptionCheck(user, 'boosty:kha-vip-bot', hasAccess, boosty);
}

function mergeAuthUsers(store: AdminAuthStore, sourceUser: AdminUser, targetUser: AdminUser, patch: Partial<AdminUser> = {}): AdminUser {
  const mergedRoleWantsAdmin = targetUser.role === 'admin' || sourceUser.role === 'admin';
  const targetCanBeAdmin = ADMIN_USER_IDS.size === 0 || ADMIN_USER_IDS.has(targetUser.id);
  targetUser.role = mergedRoleWantsAdmin && targetCanBeAdmin ? 'admin' : 'user';
  targetUser.country = targetUser.country || sourceUser.country || '';
  targetUser.newsletterOptIn = Boolean(targetUser.newsletterOptIn || sourceUser.newsletterOptIn);
  targetUser.telegramId = patch.telegramId ?? targetUser.telegramId ?? sourceUser.telegramId;
  targetUser.telegramUsername = patch.telegramUsername ?? targetUser.telegramUsername ?? sourceUser.telegramUsername;
  targetUser.photoUrl = patch.photoUrl ?? targetUser.photoUrl ?? sourceUser.photoUrl;
  targetUser.avatarInitials = targetUser.avatarInitials || sourceUser.avatarInitials || targetUser.name.slice(0, 2).toUpperCase();
  targetUser.updatedAt = new Date().toISOString();
  store.sessions = store.sessions.map(session =>
    session.email === sourceUser.email ? { ...session, email: targetUser.email } : session
  );
  dbRun('UPDATE identities SET user_id = ?, updated_at = ? WHERE user_id = ?', targetUser.id, targetUser.updatedAt, sourceUser.id);
  dbRun('UPDATE subscription_checks SET user_id = ? WHERE user_id = ?', targetUser.id, sourceUser.id);
  dbRun('DELETE FROM subscriptions WHERE user_id = ?', sourceUser.id);
  dbRun(`
    UPDATE contest_entries
    SET user_id = ?
    WHERE user_id = ?
      AND NOT EXISTS (
        SELECT 1 FROM contest_entries existing
        WHERE existing.contest_id = contest_entries.contest_id
          AND existing.user_id = ?
      )
  `, targetUser.id, sourceUser.id, targetUser.id);
  dbRun(`
    DELETE FROM contest_entries
    WHERE user_id = ?
      AND EXISTS (
        SELECT 1 FROM contest_entries existing
        WHERE existing.contest_id = contest_entries.contest_id
          AND existing.user_id = ?
      )
  `, sourceUser.id, targetUser.id);
  store.users = store.users.filter(user => user.id !== sourceUser.id);
  return targetUser;
}

function telegramAuthEnabled(): boolean {
  return Boolean(telegramOidcEnabled() || (TELEGRAM_AUTH_BOT_TOKEN && TELEGRAM_AUTH_BOT_USERNAME));
}

function telegramLegacyWidgetEnabled(): boolean {
  return Boolean(TELEGRAM_AUTH_BOT_TOKEN && TELEGRAM_AUTH_BOT_USERNAME);
}

function telegramOidcEnabled(): boolean {
  return Boolean(TELEGRAM_OIDC_CLIENT_ID && TELEGRAM_OIDC_CLIENT_SECRET);
}

function base64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function base64UrlDecodeJson(value: string): any {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
}

function sha256Base64Url(value: string): string {
  return createHash('sha256').update(value).digest('base64url');
}

function verifyTelegramAuthPayload(payload: Record<string, unknown>): { ok: true } | { ok: false; error: string } {
  if (!TELEGRAM_AUTH_BOT_TOKEN || !TELEGRAM_AUTH_BOT_USERNAME) return { ok: false, error: 'Telegram-вход пока не настроен' };

  const hash = String(payload.hash ?? '');
  const authDate = Number(payload.auth_date ?? 0);
  if (!/^[a-f0-9]{64}$/i.test(hash) || !Number.isFinite(authDate) || authDate <= 0) {
    return { ok: false, error: 'Некорректные данные Telegram' };
  }
  if (Date.now() - authDate * 1000 > TELEGRAM_AUTH_MAX_AGE_MS) {
    return { ok: false, error: 'Сессия Telegram устарела. Попробуйте ещё раз.' };
  }

  const dataCheckString = Object.entries(payload)
    .filter(([key, value]) => key !== 'hash' && value !== undefined && value !== null && value !== '')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join('\n');

  const secretKey = createHash('sha256').update(TELEGRAM_AUTH_BOT_TOKEN).digest();
  const expectedHash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  const expected = Buffer.from(expectedHash, 'hex');
  const actual = Buffer.from(hash, 'hex');
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return { ok: false, error: 'Telegram не подтвердил вход' };
  }

  return { ok: true };
}

type TelegramOidcDiscovery = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
};

type TelegramOidcState = {
  state: string;
  nonce: string;
  codeVerifier: string;
  returnTo: string;
  expiresAt: number;
};

let telegramOidcDiscoveryCache: { data: TelegramOidcDiscovery; expiresAt: number } | null = null;
let telegramOidcJwksCache: { keys: any[]; expiresAt: number } | null = null;

async function fetchJsonWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 10_000): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error_description || data?.error || `HTTP ${res.status}`);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchTelegramBotApi(token: string, method: string, init: RequestInit = {}, timeoutMs = 5_000): Promise<Response> {
  const bases = TELEGRAM_BOT_API_BASE
    ? [TELEGRAM_BOT_API_BASE, TELEGRAM_PUBLIC_BOT_API_BASE]
    : [TELEGRAM_PUBLIC_BOT_API_BASE];
  let lastError: unknown;

  for (const base of bases) {
    try {
      const response = await fetch(`${base}/bot${token}/${method}`, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.ok || base === TELEGRAM_PUBLIC_BOT_API_BASE) return response;
      const data = await response.json().catch(() => ({}));
      lastError = new Error(data?.description || `HTTP ${response.status}`);
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Telegram Bot API unavailable');
}

async function telegramOidcDiscovery(): Promise<TelegramOidcDiscovery> {
  if (telegramOidcDiscoveryCache && telegramOidcDiscoveryCache.expiresAt > Date.now()) return telegramOidcDiscoveryCache.data;
  const data = await fetchJsonWithTimeout(TELEGRAM_OIDC_DISCOVERY_URL);
  if (data?.issuer !== TELEGRAM_OIDC_ISSUER || !data.authorization_endpoint || !data.token_endpoint || !data.jwks_uri) {
    throw new Error('Telegram OIDC discovery вернул неполные данные');
  }
  telegramOidcDiscoveryCache = { data, expiresAt: Date.now() + 12 * 60 * 60 * 1000 };
  return data;
}

async function telegramOidcJwks(force = false): Promise<any[]> {
  if (!force && telegramOidcJwksCache && telegramOidcJwksCache.expiresAt > Date.now()) return telegramOidcJwksCache.keys;
  const discovery = await telegramOidcDiscovery();
  const data = await fetchJsonWithTimeout(discovery.jwks_uri);
  const keys = Array.isArray(data?.keys) ? data.keys : [];
  if (!keys.length) throw new Error('Telegram JWKS пустой');
  telegramOidcJwksCache = { keys, expiresAt: Date.now() + 12 * 60 * 60 * 1000 };
  return keys;
}

function createAuthSession(store: AdminAuthStore, user: AdminUser): string {
  if (user.blockedAt) throw new Error('Пользователь заблокирован');
  const token = randomBytes(32).toString('hex');
  store.sessions = store.sessions
    .filter(item => item.expiresAt > Date.now() && item.email !== user.email)
    .concat({
      tokenHash: sha256(token),
      userId: user.id,
      email: user.email,
      expiresAt: Date.now() + AUTH_SESSION_TTL_MS,
      createdAt: new Date().toISOString(),
    });
  return token;
}

function cookieValue(req: import('express').Request, name: string): string {
  const cookie = String(req.headers.cookie ?? '');
  for (const part of cookie.split(';')) {
    const [rawKey, ...rawValue] = part.trim().split('=');
    if (rawKey === name) return decodeURIComponent(rawValue.join('=') || '');
  }
  return '';
}

function authCookieDomain(req: import('express').Request): string {
  const host = String(req.headers.host ?? '').split(':')[0].toLowerCase();
  return host === 'arena.hs-manacost.ru' || host.endsWith('.arena.hs-manacost.ru') ? 'Domain=.arena.hs-manacost.ru' : '';
}

function setAuthCookie(req: import('express').Request, res: import('express').Response, token: string) {
  const maxAgeSeconds = Math.floor(AUTH_SESSION_TTL_MS / 1000);
  const secure = String(req.headers['x-forwarded-proto'] ?? req.protocol).includes('https') || String(req.headers.host ?? '').includes('arena.hs-manacost.ru');
  const cookie = [
    `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    `Max-Age=${maxAgeSeconds}`,
    'HttpOnly',
    'SameSite=Lax',
    secure ? 'Secure' : '',
    authCookieDomain(req),
  ].filter(Boolean).join('; ');
  res.append('Set-Cookie', cookie);
}

function clearAuthCookie(req: import('express').Request, res: import('express').Response) {
  const secure = String(req.headers['x-forwarded-proto'] ?? req.protocol).includes('https') || String(req.headers.host ?? '').includes('arena.hs-manacost.ru');
  const cookie = [
    `${AUTH_COOKIE_NAME}=`,
    'Path=/',
    'Max-Age=0',
    'HttpOnly',
    'SameSite=Lax',
    secure ? 'Secure' : '',
    authCookieDomain(req),
  ].filter(Boolean).join('; ');
  res.append('Set-Cookie', cookie);
}

function telegramOidcCookieSecure(req: import('express').Request): boolean {
  return String(req.headers['x-forwarded-proto'] ?? req.protocol).includes('https')
    || String(req.headers.host ?? '').includes('arena.hs-manacost.ru')
    || String(req.headers.host ?? '').includes('hs-manacost.ru');
}

function telegramOidcStateFromValue(value: any): TelegramOidcState | null {
  if (!value?.state || !value?.nonce || !value?.codeVerifier || !value?.expiresAt) return null;
  if (Number(value.expiresAt) <= Date.now()) return null;
  return {
    state: String(value.state),
    nonce: String(value.nonce),
    codeVerifier: String(value.codeVerifier),
    returnTo: safeAuthReturnTo(value.returnTo),
    expiresAt: Number(value.expiresAt),
  };
}

function readTelegramOidcStates(req: import('express').Request): TelegramOidcState[] {
  const raw = cookieValue(req, TELEGRAM_OIDC_COOKIE_NAME);
  if (!raw) return [];
  try {
    const parsed = decodeSignedStateCookie(raw, TELEGRAM_OIDC_CLIENT_SECRET) as any;
    if (!parsed) return [];
    const values = Array.isArray(parsed?.states) ? parsed.states : [parsed];
    return values
      .map(telegramOidcStateFromValue)
      .filter((state): state is TelegramOidcState => Boolean(state));
  } catch {
    return [];
  }
}

function writeTelegramOidcStates(req: import('express').Request, res: import('express').Response, states: TelegramOidcState[]) {
  const validStates = states
    .map(telegramOidcStateFromValue)
    .filter((state): state is TelegramOidcState => Boolean(state))
    .slice(-5);
  if (!validStates.length) {
    clearTelegramOidcCookie(req, res);
    return;
  }
  const maxAgeSeconds = Math.max(1, Math.ceil((Math.max(...validStates.map(state => state.expiresAt)) - Date.now()) / 1000));
  const cookie = [
    `${TELEGRAM_OIDC_COOKIE_NAME}=${encodeURIComponent(encodeSignedStateCookie({ states: validStates }, TELEGRAM_OIDC_CLIENT_SECRET))}`,
    'Path=/api/auth/telegram',
    `Max-Age=${maxAgeSeconds}`,
    'HttpOnly',
    'SameSite=Lax',
    telegramOidcCookieSecure(req) ? 'Secure' : '',
    authCookieDomain(req),
  ].filter(Boolean).join('; ');
  res.append('Set-Cookie', cookie);
}

function setTelegramOidcCookie(req: import('express').Request, res: import('express').Response, state: TelegramOidcState) {
  const states = readTelegramOidcStates(req).filter(item => item.state !== state.state);
  states.push(state);
  writeTelegramOidcStates(req, res, states);
}

function clearTelegramOidcCookie(req: import('express').Request, res: import('express').Response, stateValue?: string) {
  if (stateValue) {
    writeTelegramOidcStates(req, res, readTelegramOidcStates(req).filter(item => item.state !== stateValue));
    return;
  }
  const cookie = [
    `${TELEGRAM_OIDC_COOKIE_NAME}=`,
    'Path=/api/auth/telegram',
    'Max-Age=0',
    'HttpOnly',
    'SameSite=Lax',
    telegramOidcCookieSecure(req) ? 'Secure' : '',
    authCookieDomain(req),
  ].filter(Boolean).join('; ');
  res.append('Set-Cookie', cookie);
}

function readTelegramOidcState(req: import('express').Request, stateValue = ''): TelegramOidcState | null {
  const states = readTelegramOidcStates(req);
  if (stateValue) return states.find(item => item.state === stateValue) ?? null;
  return states[states.length - 1] ?? null;
}

async function verifyTelegramOidcIdToken(idToken: string, expectedNonce: string): Promise<Record<string, any>> {
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new Error('Telegram вернул некорректный id_token');
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = base64UrlDecodeJson(encodedHeader);
  const payload = base64UrlDecodeJson(encodedPayload);
  if (header?.alg !== 'RS256') throw new Error('Telegram id_token подписан неподдерживаемым алгоритмом');

  let keys = await telegramOidcJwks(false);
  let jwk = keys.find(key => key.kid === header.kid && key.kty === 'RSA');
  if (!jwk) {
    keys = await telegramOidcJwks(true);
    jwk = keys.find(key => key.kid === header.kid && key.kty === 'RSA');
  }
  if (!jwk) throw new Error('Не найден ключ Telegram для проверки id_token');

  const publicKey = createPublicKey({ key: jwk, format: 'jwk' });
  const ok = verify('RSA-SHA256', Buffer.from(`${encodedHeader}.${encodedPayload}`), publicKey, Buffer.from(encodedSignature, 'base64url'));
  if (!ok) throw new Error('Telegram id_token не прошёл проверку подписи');

  const now = Math.floor(Date.now() / 1000);
  const aud = (Array.isArray(payload.aud) ? payload.aud : [payload.aud]).map(String);
  if (payload.iss !== TELEGRAM_OIDC_ISSUER) throw new Error('Некорректный issuer Telegram');
  if (!aud.includes(TELEGRAM_OIDC_CLIENT_ID)) throw new Error('Некорректный audience Telegram');
  if (typeof payload.exp !== 'number' || payload.exp <= now) throw new Error('Telegram id_token устарел');
  if (typeof payload.iat === 'number' && payload.iat > now + 300) throw new Error('Telegram id_token из будущего');
  if (payload.nonce !== expectedNonce) throw new Error('Telegram nonce не совпал');
  if (!payload.sub) throw new Error('Telegram не передал ID пользователя');
  return payload;
}

function encodeMailHeader(value: string): string {
  return `=?UTF-8?B?${Buffer.from(value, 'utf-8').toString('base64')}?=`;
}

function sendAuthCodeEmail(to: string, code: string): Promise<void> {
  const recipient = normalizeEmail(to);
  if (!isRealEmail(recipient)) {
    return Promise.reject(new Error('Некорректный email получателя'));
  }
  const brandName = 'Экосистема Манакоста';
  const subject = 'Код входа в Экосистему Манакоста';
  const avatarUrl = 'https://arena.hs-manacost.ru/assets/manacost-avatar.jpeg';
  const artUrl = 'https://arena.hs-manacost.ru/wallpaper/wallpaper.jpg';
  const codeCells = code.split('').map(char => `
                    <td align="center" style="padding:0 3px;">
                      <div style="width:42px;height:50px;line-height:50px;background:#f8faff;border:1px solid #cbd7ea;border-radius:10px;color:#0f172a;font-size:25px;font-weight:800;font-family:Arial,Helvetica,sans-serif;text-align:center;box-shadow:0 6px 18px rgba(15,23,42,.10);">${char}</div>
                    </td>`).join('');
  const textBody = [
    `${brandName}`,
    '',
    `Ваш код входа: ${code}`,
    '',
    'Код действует 10 минут.',
    'Если вы не запрашивали вход, просто проигнорируйте это письмо.',
  ].join('\n');
  const htmlBody = `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${subject}</title>
  </head>
  <body style="margin:0;padding:0;background:#040a14;color:#1e293b;font-family:Arial,Helvetica,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">Ваш код входа: ${code}. Он действует 10 минут.</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#040a14;padding:24px 10px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;border-collapse:separate;border-spacing:0;background:#f8faff;border:1px solid #223655;border-radius:18px;overflow:hidden;box-shadow:0 24px 54px rgba(0,0,0,.34);">
            <tr>
              <td style="height:128px;background:#081020;">
                <img src="${artUrl}" width="560" height="128" alt="" style="display:block;width:100%;height:128px;object-fit:cover;object-position:center 47%;">
              </td>
            </tr>
            <tr>
              <td style="background:#081020;padding:18px 22px;border-bottom:1px solid #1d3557;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td width="58" valign="middle">
                      <img src="${avatarUrl}" width="46" height="46" alt="" style="display:block;width:46px;height:46px;border-radius:12px;border:1px solid rgba(56,189,248,.55);object-fit:cover;">
                    </td>
                    <td valign="middle" style="padding-left:14px;">
                      <div style="font-size:12px;line-height:1.2;color:#93c5fd;text-transform:uppercase;letter-spacing:1px;">Manacost ID</div>
                      <div style="margin-top:4px;font-size:20px;line-height:1.15;font-weight:700;color:#e5eefc;">${brandName}</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 28px 8px;background:#f8faff;">
                <div style="font-size:20px;line-height:1.3;color:#1e293b;font-weight:700;">Код подтверждения</div>
                <div style="margin-top:8px;font-size:14px;line-height:1.6;color:#475569;">Введите его на сайте, чтобы завершить вход или восстановление пароля.</div>
                <table role="presentation" cellspacing="0" cellpadding="0" align="center" style="margin:24px auto 22px;">
                  <tr>${codeCells}
                  </tr>
                </table>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:4px;background:#ebf1fc;border:1px solid #cbd7ea;border-radius:14px;">
                  <tr>
                    <td style="padding:13px 15px;font-size:13px;line-height:1.55;color:#334155;">
                      Код действует <b>10 минут</b>. Никому его не передавайте, даже если человек представляется поддержкой.
                    </td>
                  </tr>
                </table>
                <div style="margin-top:15px;font-size:12px;line-height:1.55;color:#64748b;">Если запрос был не ваш, просто проигнорируйте письмо.</div>
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px 24px;background:#f8faff;">
                <div style="height:1px;background:#dbe6f5;margin:8px 0 14px;font-size:0;line-height:0;">&nbsp;</div>
                <div style="font-size:12px;line-height:1.5;color:#64748b;">HS-Arena · Hearthstone statistics · Manacost</div>
              </td>
            </tr>
            <tr>
              <td style="padding:13px 20px;background:#081020;border-top:1px solid #1d3557;font-size:11px;line-height:1.45;color:#9fb1ca;text-align:center;">
                Автоматическое письмо. Отвечать на него не нужно.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
  const boundary = `hsarena_${randomBytes(12).toString('hex')}`;
  const message = [
    `From: ${encodeMailHeader(brandName)} <${AUTH_FROM}>`,
    `To: ${recipient}`,
    `Subject: ${encodeMailHeader(subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    textBody,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    htmlBody,
    '',
    `--${boundary}--`,
    '',
  ].join('\n');

  return new Promise((resolve, reject) => {
    const child = spawn(SENDMAIL_PATH, ['-f', AUTH_FROM, '-t'], { stdio: ['pipe', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code: number) => code === 0 ? resolve() : reject(new Error(stderr || `sendmail exited ${code}`)));
    child.stdin.end(message);
  });
}

type MailingSegment = 'all-consented' | 'active' | 'former';

interface NewsletterDraft {
  subject: string;
  preheader: string;
  htmlBody: string;
  textBody: string;
  segment: MailingSegment;
  templateKey: string;
}

function escapeNewsletterHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeNewsletterUrl(value: unknown, fallback = `${APP_URL}/`): string {
  const raw = String(value ?? '').trim();
  if (!raw || raw === '#') return fallback;
  try {
    const url = raw.startsWith('/') ? new URL(raw, APP_URL) : new URL(raw);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : fallback;
  } catch {
    return fallback;
  }
}

function sanitizeNewsletterFragment(value: unknown): string {
  const raw = String(value ?? '').slice(0, NEWSLETTER_HTML_MAX_LENGTH);
  return sanitizeHtml(raw, {
    allowedTags: [
      'p', 'h1', 'h2', 'h3', 'a', 'img', 'ul', 'ol', 'li', 'strong', 'b', 'em', 'i',
      'blockquote', 'br', 'hr', 'table', 'tbody', 'thead', 'tfoot', 'tr', 'td', 'th',
    ],
    allowedAttributes: {
      a: ['href', 'title'],
      img: ['src', 'alt', 'width', 'height'],
      td: ['colspan', 'rowspan', 'align'],
      th: ['colspan', 'rowspan', 'align'],
    },
    allowedSchemes: ['https', 'http', 'mailto'],
    allowedSchemesByTag: { img: ['https', 'http'] },
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
    enforceHtmlBoundary: true,
  }).trim();
}

function newsletterTextFromHtml(htmlBody: string): string {
  return sanitizeHtml(htmlBody, { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function normalizeNewsletterDraft(value: any): NewsletterDraft {
  const subject = normalizeOptionalText(value?.subject, 160);
  const preheader = normalizeOptionalText(value?.preheader, 220);
  const segmentRaw = normalizeOptionalText(value?.segment, 40);
  const segment: MailingSegment = segmentRaw === 'active' || segmentRaw === 'former' ? segmentRaw : 'all-consented';
  const templateKey = normalizeOptionalText(value?.templateKey, 60) || 'custom';
  const htmlBody = sanitizeNewsletterFragment(value?.htmlBody ?? value?.html);
  const suppliedText = normalizeOptionalText(value?.textBody, 100_000);
  const textBody = suppliedText || newsletterTextFromHtml(htmlBody);
  if (!subject) throw new Error('Укажите тему письма');
  if (!htmlBody) throw new Error('HTML письма пуст');
  return { subject, preheader, htmlBody, textBody, segment, templateKey };
}

function newsletterPreviewDigest(draft: NewsletterDraft, contacts: Array<{ id?: unknown }>): string {
  if (!NEWSLETTER_UNSUBSCRIBE_SECRET) throw new Error('NEWSLETTER_UNSUBSCRIBE_SECRET не настроен');
  const audienceIds = contacts.map(contact => String(contact.id || '')).filter(Boolean).sort();
  const normalized = JSON.stringify({
    subject: draft.subject,
    preheader: draft.preheader,
    htmlBody: draft.htmlBody,
    textBody: draft.textBody,
    segment: draft.segment,
    templateKey: draft.templateKey,
    recipientCount: audienceIds.length,
    audienceHash: sha256(audienceIds.join('\n')),
  });
  return hmacSha256(`newsletter-preview:${normalized}`, NEWSLETTER_UNSUBSCRIBE_SECRET);
}

function newsletterUnsubscribeToken(contactId: string): string {
  if (!NEWSLETTER_UNSUBSCRIBE_SECRET) throw new Error('NEWSLETTER_UNSUBSCRIBE_SECRET не настроен');
  const payload = Buffer.from(contactId, 'utf8').toString('base64url');
  const signature = hmacSha256(`newsletter-unsubscribe:${payload}`, NEWSLETTER_UNSUBSCRIBE_SECRET);
  return `${payload}.${signature}`;
}

function mailingContactFromUnsubscribeToken(token: unknown): any | null {
  if (!NEWSLETTER_UNSUBSCRIBE_SECRET) return null;
  const [payload, signature] = String(token ?? '').trim().split('.');
  if (!payload || !signature) return null;
  const expected = hmacSha256(`newsletter-unsubscribe:${payload}`, NEWSLETTER_UNSUBSCRIBE_SECRET);
  if (!safeEqualHex(signature, expected)) return null;
  try {
    const contactId = Buffer.from(payload, 'base64url').toString('utf8');
    if (!/^mail_[a-f0-9]{24}$/.test(contactId)) return null;
    return dbGet<any>('SELECT * FROM mailing_contacts WHERE id = ?', contactId) ?? null;
  } catch {
    return null;
  }
}

function renderNewsletterHtml(draft: NewsletterDraft, unsubscribeUrl: string, preview = false): string {
  const csp = preview
    ? `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'">`
    : '';
  const safeSubject = escapeNewsletterHtml(draft.subject);
  const safePreheader = escapeNewsletterHtml(draft.preheader);
  const safeUnsubscribeUrl = escapeNewsletterHtml(unsubscribeUrl);
  return `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    ${csp}
    <title>${safeSubject}</title>
    <style>
      body{margin:0;padding:0;background:#eef3f8;color:#1d2c3a;font-family:Arial,Helvetica,sans-serif}
      .mail-wrap{width:100%;padding:24px 10px;background:#eef3f8}
      .mail-card{width:100%;max-width:640px;margin:0 auto;border:1px solid #cad7e4;border-radius:14px;background:#fff;overflow:hidden}
      .mail-head{padding:22px 28px;background:#0b1f36;color:#fff}
      .mail-head small{display:block;color:#80dff3;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
      .mail-head strong{display:block;margin-top:5px;font-size:22px}
      .mail-content{padding:28px;color:#26394c;font-size:16px;line-height:1.65}
      .mail-content h1,.mail-content h2,.mail-content h3{margin:0 0 14px;color:#162b40;line-height:1.25}
      .mail-content p{margin:0 0 16px}.mail-content a{color:#087fbd;font-weight:700}.mail-content img{display:block;max-width:100%;height:auto;margin:18px auto;border-radius:10px}
      .mail-content blockquote{margin:18px 0;padding:14px 18px;border-left:4px solid #22b6db;background:#f1f8fc}
      .mail-content table{max-width:100%;border-collapse:collapse}.mail-content td,.mail-content th{padding:8px;border:1px solid #d7e0ea}
      .mail-foot{padding:20px 28px;border-top:1px solid #d7e0ea;background:#f7f9fb;color:#687888;font-size:12px;line-height:1.55}
      .mail-foot a{color:#526d83}
      @media(max-width:520px){.mail-wrap{padding:0}.mail-card{border-radius:0;border-left:0;border-right:0}.mail-head,.mail-content,.mail-foot{padding-left:18px;padding-right:18px}}
    </style>
  </head>
  <body>
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${safePreheader}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" class="mail-wrap"><tr><td>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" class="mail-card">
        <tr><td class="mail-head"><small>HS-Arena · Manacost</small><strong>${safeSubject}</strong></td></tr>
        <tr><td class="mail-content">${draft.htmlBody}</td></tr>
        <tr><td class="mail-foot">Вы получили письмо, потому что согласились на рассылку Manacost. <a href="${safeUnsubscribeUrl}">Отписаться от рассылки</a>.</td></tr>
      </table>
    </td></tr></table>
  </body>
</html>`;
}

function sendMimeEmail(input: { to: string; subject: string; text: string; html: string; messageId: string; headers?: string[] }): Promise<void> {
  const recipient = normalizeEmail(input.to);
  if (!isRealEmail(recipient)) return Promise.reject(new Error('Некорректный email получателя'));
  const subject = normalizeOptionalText(input.subject, 160);
  const boundary = `hsarena_${randomBytes(12).toString('hex')}`;
  const message = [
    `From: ${encodeMailHeader(NEWSLETTER_FROM_NAME)} <${NEWSLETTER_FROM}>`,
    `To: ${recipient}`,
    `Subject: ${encodeMailHeader(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${input.messageId}>`,
    'MIME-Version: 1.0',
    ...(input.headers ?? []),
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    input.text,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    input.html,
    '',
    `--${boundary}--`,
    '',
  ].join('\r\n');
  return new Promise((resolve, reject) => {
    const child = spawn(SENDMAIL_PATH, ['-oi', '-f', NEWSLETTER_FROM, '-t'], { stdio: ['pipe', 'ignore', 'pipe'] });
    let settled = false;
    let stderr = '';
    let timeout: NodeJS.Timeout | undefined;
    const settle = (error?: Error) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      if (error) reject(error);
      else resolve();
    };
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString()}`.slice(-2000);
    });
    child.on('error', (error: Error) => settle(error));
    child.stdin.on('error', (error: Error) => settle(error));
    child.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
      if (code === 0) settle();
      else settle(new Error(stderr || `sendmail exited ${code ?? 'without code'}${signal ? ` (${signal})` : ''}`));
    });
    timeout = setTimeout(() => {
      child.kill('SIGKILL');
      settle(new Error('sendmail timeout after 30 seconds'));
    }, NEWSLETTER_SENDMAIL_TIMEOUT_MS);
    timeout.unref?.();
    child.stdin.end(message);
  });
}

function mailingContactRows(): any[] {
  return dbAll<any>(`
    SELECT
      mc.*,
      u.blocked_at,
      COALESCE(s.has_access, 0) AS provider_access,
      COALESCE(g.active, 0) AS lifetime_access
    FROM mailing_contacts mc
    LEFT JOIN users u ON u.id = mc.user_id
    LEFT JOIN subscriptions s ON s.user_id = mc.user_id
    LEFT JOIN manual_subscription_grants g ON g.user_id = mc.user_id
    ORDER BY mc.updated_at DESC
  `).map(row => {
    const active = Boolean(row.provider_access || row.lifetime_access);
    const eligible = row.consent_status === 'subscribed'
      && Boolean(row.consented_at)
      && Boolean(row.verified_at)
      && isRealEmail(String(row.email || ''))
      && !row.blocked_at
      && !row.suppressed_reason;
    return {
      ...row,
      eligible,
      lifecycle: active ? 'active' : 'former',
    };
  });
}

function eligibleMailingContacts(segment: MailingSegment): any[] {
  return mailingContactRows().filter(row => row.eligible && (segment === 'all-consented' || row.lifecycle === segment));
}

function mailingSummary() {
  const contacts = mailingContactRows();
  const eligible = contacts.filter(row => row.eligible);
  return {
    total: contacts.length,
    eligible: eligible.length,
    active: eligible.filter(row => row.lifecycle === 'active').length,
    former: eligible.filter(row => row.lifecycle === 'former').length,
    excluded: contacts.length - eligible.length,
    unsubscribed: contacts.filter(row => row.consent_status === 'unsubscribed').length,
    pendingConsent: contacts.filter(row => row.consent_status === 'unknown').length,
    suppressed: contacts.filter(row => row.consent_status === 'suppressed' || Boolean(row.suppressed_reason)).length,
  };
}

function newsletterTemplates() {
  const articlesData: any = loadData('articles.json') ?? { articles: [] };
  const articles = Array.isArray(articlesData.articles) ? articlesData.articles : [];
  const latest = articles
    .slice()
    .sort((a: any, b: any) => articleDateMs(b) - articleDateMs(a) || String(b?.id || '').localeCompare(String(a?.id || '')))[0];
  const latestUrl = safeNewsletterUrl(latest?.url, `${APP_URL}/articles`);
  const latestImage = latest?.image ? safeNewsletterUrl(latest.image, '') : '';
  const latestTitle = normalizeOptionalText(latest?.title, 180) || 'Новая статья Manacost';
  const latestExcerpt = normalizeOptionalText(latest?.excerpt, 500) || 'Читайте новый материал на HS-Arena.';
  return [
    {
      id: 'blank',
      label: 'Пустое письмо',
      description: 'Начните с чистого текста и своей структуры.',
      subject: 'Новости Manacost',
      preheader: 'Свежие материалы и обновления HS-Arena.',
      htmlBody: '<h2>Заголовок письма</h2><p>Напишите здесь основной текст рассылки.</p>',
    },
    {
      id: 'latest-article',
      label: 'Последняя статья',
      description: latest ? latestTitle : 'Шаблон анонса нового материала.',
      subject: `Новая статья: ${latestTitle}`,
      preheader: latestExcerpt,
      htmlBody: sanitizeNewsletterFragment(`
        ${latestImage ? `<img src="${escapeNewsletterHtml(latestImage)}" alt="">` : ''}
        <h2>${escapeNewsletterHtml(latestTitle)}</h2>
        <p>${escapeNewsletterHtml(latestExcerpt)}</p>
        <p><a href="${escapeNewsletterHtml(latestUrl)}">Читать статью на HS-Arena →</a></p>
      `),
    },
    {
      id: 'tier-list-update',
      label: 'Обновился тир-лист',
      description: 'Короткое письмо об актуальных данных Арены.',
      subject: 'Тир-лист Арены обновлён',
      preheader: 'Свежие позиции классов и актуальные данные уже на HS-Arena.',
      htmlBody: sanitizeNewsletterFragment(`
        <h2>Тир-лист Арены обновлён</h2>
        <p>Мы пересчитали актуальные позиции классов по свежей статистике. Проверьте лидеров и подготовьтесь к следующему забегу.</p>
        <p><a href="${escapeNewsletterHtml(`${APP_URL}/tierlist`)}">Открыть новый тир-лист →</a></p>
      `),
    },
  ];
}

function mailingCampaignFromRow(row: any) {
  return {
    id: String(row.id),
    subject: String(row.subject || ''),
    preheader: String(row.preheader || ''),
    templateKey: String(row.template_key || 'custom'),
    segment: String(row.segment || 'all-consented'),
    status: String(row.status || 'queued'),
    recipientCount: Number(row.recipient_count || 0),
    acceptedCount: Number(row.accepted_count || 0),
    failedCount: Number(row.failed_count || 0),
    skippedCount: Number(row.skipped_count || 0),
    createdAt: String(row.created_at || ''),
    startedAt: String(row.started_at || ''),
    completedAt: String(row.completed_at || ''),
    error: String(row.error || ''),
  };
}

function mailingOverviewPayload() {
  const contacts = mailingContactRows();
  const campaigns = dbAll<any>('SELECT * FROM mailing_campaigns ORDER BY created_at DESC LIMIT 20').map(mailingCampaignFromRow);
  return {
    summary: mailingSummary(),
    templates: newsletterTemplates(),
    contacts: contacts.slice(0, 50).map(row => ({
      id: String(row.id),
      email: String(row.email || ''),
      name: String(row.name || ''),
      consentStatus: String(row.consent_status || 'unknown'),
      consentSource: String(row.consent_source || ''),
      lifecycle: String(row.lifecycle || 'former'),
      accountState: String(row.account_state || 'current'),
      eligible: Boolean(row.eligible),
      updatedAt: String(row.updated_at || ''),
    })),
    campaigns,
    transport: {
      configured: Boolean(NEWSLETTER_FROM && NEWSLETTER_UNSUBSCRIBE_SECRET && SENDMAIL_PATH),
      from: NEWSLETTER_FROM,
    },
  };
}

async function sendNewsletterToContact(campaign: any, contact: any) {
  const draft: NewsletterDraft = {
    subject: String(campaign.subject || ''),
    preheader: String(campaign.preheader || ''),
    htmlBody: sanitizeNewsletterFragment(campaign.html_body),
    textBody: String(campaign.text_body || ''),
    segment: campaign.segment as MailingSegment,
    templateKey: String(campaign.template_key || 'custom'),
  };
  const token = newsletterUnsubscribeToken(String(contact.id));
  const unsubscribeUrl = `${APP_URL}/api/newsletter/unsubscribe?token=${encodeURIComponent(token)}`;
  const html = renderNewsletterHtml(draft, unsubscribeUrl);
  const text = `${draft.textBody}\n\nОтписаться от рассылки: ${unsubscribeUrl}`;
  const host = new URL(APP_URL).hostname;
  const messageId = `${sha256(`${campaign.id}:${contact.id}`).slice(0, 32)}@${host}`;
  await sendMimeEmail({
    to: String(contact.email),
    subject: draft.subject,
    text,
    html,
    messageId,
    headers: [
      'Precedence: bulk',
      `List-Unsubscribe: <${unsubscribeUrl}>`,
      'List-Unsubscribe-Post: List-Unsubscribe=One-Click',
      `X-Campaign-ID: ${campaign.id}`,
    ],
  });
}

const newsletterCampaignJobs = new Set<string>();

function recordNewsletterCampaignTerminalAudit(campaign: any, action: string, details: Record<string, unknown>) {
  try {
    recordAdminAuditByActorId(String(campaign?.created_by || 'system'), action, 'mailing_campaign', String(campaign?.id || ''), details);
  } catch (err: any) {
    console.error('[mailing] failed to write terminal audit:', err?.message || err);
  }
}

async function runNewsletterCampaign(campaignId: string) {
  if (newsletterCampaignJobs.has(campaignId)) return;
  newsletterCampaignJobs.add(campaignId);
  const startedAt = new Date().toISOString();
  let campaign: any = null;
  try {
    campaign = dbGet<any>('SELECT * FROM mailing_campaigns WHERE id = ?', campaignId);
    if (!campaign || !['queued', 'sending'].includes(String(campaign.status))) return;
    dbRun("UPDATE mailing_campaigns SET status = 'sending', started_at = COALESCE(started_at, ?), error = '' WHERE id = ?", startedAt, campaignId);

    while (true) {
      const delivery = dbGet<any>(`
        SELECT d.*, mc.email, mc.consent_status, mc.consented_at, mc.verified_at, mc.suppressed_reason, u.blocked_at
        FROM mailing_deliveries d
        LEFT JOIN mailing_contacts mc ON mc.id = d.contact_id
        LEFT JOIN users u ON u.id = mc.user_id
        WHERE d.campaign_id = ? AND d.status IN ('pending', 'failed') AND d.attempts < 3
        ORDER BY d.updated_at ASC
        LIMIT 1
      `, campaignId);
      if (!delivery) break;
      const nowIso = new Date().toISOString();
      const stillEligible = delivery.consent_status === 'subscribed'
        && Boolean(delivery.consented_at)
        && Boolean(delivery.verified_at)
        && !delivery.suppressed_reason
        && !delivery.blocked_at
        && isRealEmail(String(delivery.email || ''));
      if (!stillEligible) {
        dbRun("UPDATE mailing_deliveries SET status = 'skipped', last_error = 'contact-suppressed', updated_at = ? WHERE campaign_id = ? AND contact_id = ?",
          nowIso, campaignId, delivery.contact_id);
        continue;
      }
      const claim = db().prepare(`
        UPDATE mailing_deliveries
        SET status = 'processing', attempts = attempts + 1, last_error = '', updated_at = ?
        WHERE campaign_id = ? AND contact_id = ? AND status = ? AND attempts = ? AND attempts < 3
      `).run(nowIso, campaignId, delivery.contact_id, String(delivery.status), Number(delivery.attempts || 0));
      if (Number(claim.changes || 0) !== 1) continue;
      let sendError: any = null;
      try {
        await sendNewsletterToContact(campaign, delivery);
      } catch (err: any) {
        sendError = err;
      }
      if (sendError) {
        const failedAt = new Date().toISOString();
        dbRun("UPDATE mailing_deliveries SET status = 'failed', last_error = ?, updated_at = ? WHERE campaign_id = ? AND contact_id = ? AND status = 'processing'",
          normalizeOptionalText(sendError?.message || 'sendmail failed', 500), failedAt, campaignId, delivery.contact_id);
        continue;
      }
      const acceptedAt = new Date().toISOString();
      const accepted = db().prepare("UPDATE mailing_deliveries SET status = 'accepted', last_error = '', accepted_at = ?, updated_at = ? WHERE campaign_id = ? AND contact_id = ? AND status = 'processing'")
        .run(acceptedAt, acceptedAt, campaignId, delivery.contact_id);
      if (Number(accepted.changes || 0) !== 1) {
        throw new Error('Локальный почтовый транспорт принял письмо, но его статус не удалось зафиксировать');
      }
    }

    const counts = dbGet<any>(`
      SELECT
        SUM(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END) AS accepted_count,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_count,
        SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) AS skipped_count,
        SUM(CASE WHEN status = 'uncertain' THEN 1 ELSE 0 END) AS uncertain_count,
        SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) AS processing_count
      FROM mailing_deliveries WHERE campaign_id = ?
    `, campaignId) || {};
    if (Number(counts.processing_count || 0) > 0) return;
    const completedAt = new Date().toISOString();
    const acceptedCount = Number(counts.accepted_count || 0);
    const skippedCount = Number(counts.skipped_count || 0);
    const uncertainCount = Number(counts.uncertain_count || 0);
    const failedCount = Number(counts.failed_count || 0) + uncertainCount;
    const errorMessage = uncertainCount
      ? 'Состояние части писем после перезапуска неизвестно; они не были отправлены повторно.'
      : failedCount
        ? 'Часть писем не принята локальным почтовым транспортом.'
        : '';
    const finalStatus = failedCount ? 'completed-with-errors' : 'completed';
    dbRun(`
      UPDATE mailing_campaigns
      SET status = ?, completed_at = ?, accepted_count = ?, failed_count = ?, skipped_count = ?, error = ?
      WHERE id = ?
    `, finalStatus, completedAt, acceptedCount, failedCount, skippedCount, errorMessage, campaignId);
    recordNewsletterCampaignTerminalAudit(campaign, `mailing.${finalStatus}`, {
      acceptedCount,
      failedCount,
      skippedCount,
      uncertainCount,
    });
  } catch (err: any) {
    const errorMessage = normalizeOptionalText(err?.message || 'campaign failed', 500);
    try {
      dbRun(`
        UPDATE mailing_deliveries
        SET status = 'uncertain', last_error = 'delivery-state-unknown-after-worker-error', updated_at = ?
        WHERE campaign_id = ? AND status = 'processing'
      `, new Date().toISOString(), campaignId);
      dbRun("UPDATE mailing_campaigns SET status = 'failed', completed_at = ?, error = ? WHERE id = ?",
        new Date().toISOString(), errorMessage, campaignId);
    } catch (statusErr: any) {
      console.error('[mailing] failed to persist campaign failure:', statusErr?.message || statusErr);
    }
    if (campaign) recordNewsletterCampaignTerminalAudit(campaign, 'mailing.failed', { error: errorMessage });
  } finally {
    newsletterCampaignJobs.delete(campaignId);
  }
}

function resumeNewsletterCampaigns() {
  const resumedAt = new Date().toISOString();
  dbRun(`
    UPDATE mailing_deliveries
    SET status = 'uncertain', last_error = 'delivery-state-unknown-after-restart', updated_at = ?
    WHERE status = 'processing'
      AND campaign_id IN (
        SELECT id FROM mailing_campaigns WHERE status IN ('queued', 'sending', 'failed')
      )
  `, resumedAt);
  const rows = dbAll<any>("SELECT id FROM mailing_campaigns WHERE status IN ('queued', 'sending') ORDER BY created_at ASC");
  for (const row of rows) void runNewsletterCampaign(String(row.id));
}

function adminTokenFromReq(req: import('express').Request): string {
  const header = String(req.headers.authorization ?? '');
  if (header.toLowerCase().startsWith('bearer ')) return header.slice(7).trim();
  const cookieToken = cookieValue(req, AUTH_COOKIE_NAME);
  if (cookieToken) return cookieToken;
  return String(req.body?.token ?? '').trim();
}

function userAuth(req: import('express').Request): AdminUser | null {
  const token = adminTokenFromReq(req);
  if (!token) return null;
  const store = loadAuthStore();
  const tokenHash = sha256(token);
  const session = store.sessions.find(item => item.tokenHash === tokenHash && item.expiresAt > Date.now());
  if (!session) return null;
  const user = store.users.find(item => item.id === session.userId || item.email === session.email) ?? null;
  if (!user) return null;
  if (user.blockedAt) {
    store.sessions = store.sessions.filter(item => item.tokenHash !== tokenHash);
    saveAuthStore(store);
    return null;
  }
  return user;
}

function authenticatedSessionFromToken(token: string): { store: AdminAuthStore; session: AdminSession; user: AdminUser } | null {
  if (!token) return null;
  const store = loadAuthStore();
  const tokenHash = sha256(token);
  const session = store.sessions.find(item => item.tokenHash === tokenHash && item.expiresAt > Date.now());
  if (!session) return null;
  const user = store.users.find(item => item.id === session.userId || item.email === session.email);
  if (user?.blockedAt) {
    store.sessions = store.sessions.filter(item => item.tokenHash !== tokenHash);
    saveAuthStore(store);
    return null;
  }
  return user ? { store, session, user } : null;
}

function refreshAuthSessionIfNeeded(store: AdminAuthStore, session: AdminSession): boolean {
  const nextExpiresAt = Date.now() + AUTH_SESSION_TTL_MS;
  if (session.expiresAt > nextExpiresAt - AUTH_SESSION_REFRESH_WINDOW_MS) return false;
  session.expiresAt = nextExpiresAt;
  return true;
}

function adminAuth(req: import('express').Request): AdminUser | null {
  const user = userAuth(req);
  return user && isAdminUser(user) ? user : null;
}

function recordAdminAuditByActorId(actorUserId: string, action: string, entityType: string, entityId: string, details: Record<string, unknown> = {}) {
  dbRun(`
    INSERT INTO admin_audit_log (actor_user_id, action, entity_type, entity_id, details_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `, actorUserId, action, entityType, entityId, JSON.stringify(details), new Date().toISOString());
}

function recordAdminAudit(actor: AdminUser, action: string, entityType: string, entityId: string, details: Record<string, unknown> = {}) {
  recordAdminAuditByActorId(actor.id, action, entityType, entityId, details);
}

function cookieMutationCsrfAllowed(req: import('express').Request): boolean {
  const requestPath = new URL(req.originalUrl, 'http://localhost').pathname;
  return csrfRequestAllowed({
    method: req.method,
    path: requestPath,
    authorization: req.headers.authorization,
    authCookiePresent: Boolean(cookieValue(req, AUTH_COOKIE_NAME)),
    csrfHeader: req.headers['x-csrf-request'],
    origin: req.headers.origin,
    referer: req.headers.referer,
    secFetchSite: req.headers['sec-fetch-site'],
    appUrl: APP_URL,
    allowLocalDevelopmentOrigins: process.env.NODE_ENV !== 'production',
  });
}

function isAdminUser(user: AdminUser | null | undefined): user is AdminUser {
  return Boolean(user && !user.blockedAt && user.role === 'admin');
}

function isContestAdminUser(user: AdminUser | null | undefined): user is AdminUser {
  if (!user) return false;
  const userId = user.id;
  return isAdminUser(user) || userId === CONTEST_ADMIN_USER_ID;
}

function rateLimitClientKey(req: import('express').Request): string {
  return ipKeyGenerator(getTrustedClientIp(req) || 'unknown');
}

function rateLimitEmailKey(req: import('express').Request): string {
  return `${rateLimitClientKey(req)}:${normalizeEmail(req.body?.email) || 'unknown'}`;
}

function newsletterAdminRateLimitKey(req: import('express').Request): string {
  const admin = adminAuth(req);
  return admin ? `admin:${admin.id}` : `unauthenticated:${rateLimitClientKey(req)}`;
}

function emptySubscriptionStatus(message = 'Подписка пока не подтверждена'): SubscriptionStatus {
  return {
    hasAccess: false,
    source: 'none',
    checkedAt: null,
    stale: true,
    message,
    entitlements: emptyEntitlements(),
    boosty: {},
    telegram: {},
  };
}

function deriveStoredEntitlements(
  hasAccess: boolean,
  source: string,
  boosty: Record<string, any>,
  telegram: Record<string, any>,
): SubscriptionEntitlements {
  void hasAccess;
  const normalizedBoosty = normalizeBoostySubscriptionDetail(boosty);
  const normalizedTelegram = normalizeTelegramSubscriptionDetail(telegram);
  const stored = mergeEntitlements(
    normalizeEntitlements(normalizedBoosty.entitlements),
    normalizeEntitlements(normalizedTelegram.entitlements),
  );
  if (hasAnyEntitlement(stored)) return stored;

  const derivedBoosty = normalizedBoosty.levelName ? boostyEntitlementsForLevel(String(normalizedBoosty.levelName)) : emptyEntitlements();
  const derivedTelegram = normalizedTelegram.hasAccess || source.includes('telegram') ? allEntitlements() : emptyEntitlements();
  const derived = mergeEntitlements(derivedBoosty, derivedTelegram);
  if (hasAnyEntitlement(derived)) return derived;

  return emptyEntitlements();
}

const subscriptionRefreshInFlight = new Map<string, Promise<SubscriptionStatus>>();

function activeManualSubscriptionGrant(userId: string): { grantedBy: string; grantedAt: string } | null {
  const row = dbGet<any>(`
    SELECT granted_by, granted_at
    FROM manual_subscription_grants
    WHERE user_id = ? AND active = 1
  `, userId);
  return row ? { grantedBy: String(row.granted_by || ''), grantedAt: String(row.granted_at || '') } : null;
}

function applyManualSubscriptionGrant(userId: string, status: SubscriptionStatus | null): SubscriptionStatus | null {
  const grant = activeManualSubscriptionGrant(userId);
  if (!grant) return status;
  const base = status ?? emptySubscriptionStatus();
  const source = base.source && base.source !== 'none'
    ? `${base.source},manual-lifetime`
    : 'manual-lifetime';
  return {
    ...base,
    hasAccess: true,
    source,
    stale: false,
    message: 'Бессрочный доступ выдан администратором.',
    entitlements: allEntitlements(),
  };
}

function readSubscriptionStatus(userId: string): SubscriptionStatus | null {
  const row = dbGet<any>('SELECT * FROM subscriptions WHERE user_id = ?', userId);
  if (!row) return applyManualSubscriptionGrant(userId, null);
  const checkedAt = row.checked_at ? String(row.checked_at) : null;
  const age = checkedAt ? Date.now() - Date.parse(checkedAt) : Number.POSITIVE_INFINITY;
  const providerMarkedStale = Boolean(row.stale);
  const shouldRetryStaleProvider = providerMarkedStale && age > SUBSCRIPTION_STALE_RETRY_MS;
  const boosty = normalizeBoostySubscriptionDetail(safeJsonObject(row.boosty_json));
  const telegram = normalizeTelegramSubscriptionDetail(safeJsonObject(row.telegram_json));
  const hasAccess = Boolean(row.has_access);
  const source = String(row.source || 'none');
  const entitlements = deriveStoredEntitlements(hasAccess, source, boosty, telegram);
  return applyManualSubscriptionGrant(userId, {
    hasAccess: hasAnyEntitlement(entitlements),
    source,
    checkedAt,
    stale: age > SUBSCRIPTION_REFRESH_MS || shouldRetryStaleProvider,
    message: String(row.message || ''),
    entitlements,
    boosty,
    telegram,
  });
}

function safeJsonObject(value: unknown): Record<string, any> {
  try {
    const parsed = JSON.parse(String(value || '{}'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeSubscriptionStatus(user: AdminUser, status: SubscriptionStatus) {
  const nowIso = new Date().toISOString();
  const boosty = normalizeBoostySubscriptionDetail(status.boosty);
  const telegram = normalizeTelegramSubscriptionDetail(status.telegram);
  const entitlements = mergeEntitlements(status.entitlements, boosty.entitlements, telegram.entitlements);
  const hasAccess = hasAnyEntitlement(entitlements);
  dbRun(`
    INSERT INTO subscriptions (
      user_id, has_access, source, message, checked_at, stale, boosty_json, telegram_json, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      has_access = excluded.has_access,
      source = excluded.source,
      message = excluded.message,
      checked_at = excluded.checked_at,
      stale = excluded.stale,
      boosty_json = excluded.boosty_json,
      telegram_json = excluded.telegram_json,
      updated_at = excluded.updated_at
  `, user.id, hasAccess ? 1 : 0, status.source, status.message, status.checkedAt, status.stale ? 1 : 0,
    JSON.stringify(boosty), JSON.stringify(telegram), nowIso);
}

function writeSubscriptionCheck(user: AdminUser, source: string, hasAccess: boolean, detail: Record<string, any>) {
  dbRun(`
    INSERT INTO subscription_checks (user_id, source, has_access, detail_json, checked_at)
    VALUES (?, ?, ?, ?, ?)
  `, user.id, source, hasAccess ? 1 : 0, JSON.stringify(detail), new Date().toISOString());
}

function boostyProviderUnavailable(boosty: Record<string, any>): boolean {
  return Boolean(boosty.stale || boosty.checked === false || boosty.providerUnavailable);
}

function applyBoostyGracePeriod(boosty: Record<string, any>, previous: SubscriptionStatus | null): Record<string, any> {
  const current = normalizeBoostySubscriptionDetail(boosty);
  if (!boostyProviderUnavailable(current)) return current;
  if (!previous?.checkedAt) {
    return {
      ...current,
      hasAccess: false,
      entitlements: emptyEntitlements(),
      message: current.message || 'Boosty временно недоступен, последней успешной проверки нет.',
    };
  }

  const previousBoosty = normalizeBoostySubscriptionDetail(previous.boosty);
  const previousEntitlements = normalizeEntitlements(previousBoosty.entitlements);
  if (!previousBoosty.hasAccess || !hasAnyEntitlement(previousEntitlements)) {
    return {
      ...current,
      hasAccess: false,
      entitlements: emptyEntitlements(),
    };
  }

  const graceStartedAt = String(previousBoosty.graceStartedAt || previous.checkedAt);
  const checkedAtMs = Date.parse(graceStartedAt);
  if (!Number.isFinite(checkedAtMs)) return current;
  const graceUntilMs = checkedAtMs + BOOSTY_ACCESS_GRACE_MS;
  if (Date.now() > graceUntilMs) {
    return {
      ...current,
      hasAccess: false,
      entitlements: emptyEntitlements(),
      graceExpiredAt: new Date(graceUntilMs).toISOString(),
      message: 'Boosty временно недоступен, 24-часовой резервный доступ истёк.',
    };
  }

  return {
    ...previousBoosty,
    hasAccess: true,
    entitlements: previousEntitlements,
    stale: true,
    grace: true,
    graceStartedAt,
    graceUntil: new Date(graceUntilMs).toISOString(),
    providerMessage: current.message || '',
    message: 'Boosty временно недоступен, доступ сохранён на 24 часа по последней успешной проверке.',
  };
}

async function fetchBoostyServiceStatus(): Promise<Record<string, any>> {
  if (!BOOSTY_AUTH_API_URL) {
    return {
      configured: false,
      ok: false,
      importStatus: 'not-configured',
      source: 'none',
      stale: true,
      checkedAt: new Date().toISOString(),
      graceHours: Math.round(BOOSTY_ACCESS_GRACE_MS / (60 * 60 * 1000)),
      message: 'Boosty API не настроен.',
    };
  }
  try {
    const response = await fetch(`${BOOSTY_AUTH_API_URL}/api/audit`, { signal: AbortSignal.timeout(12000) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.detail || data?.error || `HTTP ${response.status}`);
    const importStatus = String(data?.importStatus || '');
    const stale = Boolean(data?.subscriberStale ?? data?.stale ?? importStatus === 'stale');
    return {
      configured: true,
      ok: !stale && importStatus !== 'stale' && importStatus !== 'quarantined',
      importStatus: importStatus || (stale ? 'stale' : 'unknown'),
      source: String(data?.subscriberSource || data?.source || ''),
      stale,
      snapshotAgeSeconds: data?.snapshotAgeSeconds ?? null,
      lastErrorCategory: data?.lastErrorCategory || null,
      lastErrorMessage: data?.lastErrorMessage || null,
      warnings: Array.isArray(data?.warnings) ? data.warnings : [],
      summary: data?.summary && typeof data.summary === 'object' ? data.summary : {},
      checkedAt: new Date().toISOString(),
      graceHours: Math.round(BOOSTY_ACCESS_GRACE_MS / (60 * 60 * 1000)),
    };
  } catch (err: any) {
    return {
      configured: true,
      ok: false,
      importStatus: 'error',
      source: 'unavailable',
      stale: true,
      snapshotAgeSeconds: null,
      lastErrorCategory: 'request-failed',
      lastErrorMessage: err?.message || 'Boosty API временно недоступен.',
      warnings: ['boosty-api-unavailable'],
      summary: {},
      checkedAt: new Date().toISOString(),
      graceHours: Math.round(BOOSTY_ACCESS_GRACE_MS / (60 * 60 * 1000)),
    };
  }
}

async function fetchBoostySubscribers(includeInactive = true): Promise<Record<string, any>> {
  if (!BOOSTY_AUTH_API_URL) {
    return {
      configured: false,
      source: 'none',
      stale: true,
      subscribers: [],
      summary: {},
      levels: {},
      message: 'Boosty API не настроен.',
    };
  }
  const url = `${BOOSTY_AUTH_API_URL}/api/subscribers?include_inactive=${includeInactive ? 'true' : 'false'}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(25000) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.detail || data?.error || `HTTP ${response.status}`);
  const subscribers = Array.isArray(data?.subscribers) ? data.subscribers : [];
  const rows = subscribers.map((subscriber: Record<string, any>) => {
    const money = subscriber?.money && typeof subscriber.money === 'object' ? subscriber.money : {};
    const level = subscriber?.level && typeof subscriber.level === 'object' ? subscriber.level : {};
    const dates = subscriber?.dates && typeof subscriber.dates === 'object' ? subscriber.dates : {};
    const levelName = String(level.name || '');
    const levelEntitlements = boostyEntitlementsForLevel(levelName);
    const siteAccess = Boolean(subscriber.hasActivePaidAccess) && hasAnyEntitlement(levelEntitlements);
    return {
      id: String(subscriber.id || ''),
      name: String(subscriber.name || ''),
      email: String(subscriber.email || ''),
      hasEmail: Boolean(subscriber.hasEmail),
      avatarUrl: String(subscriber.avatarUrl || ''),
      status: String(subscriber.status || ''),
      subscribed: Boolean(subscriber.subscribed),
      active: Boolean(subscriber.active),
      paid: Boolean(subscriber.paid),
      hasActivePaidAccess: Boolean(subscriber.hasActivePaidAccess),
      willRenew: Boolean(subscriber.willRenew),
      blacklisted: Boolean(subscriber.blacklisted),
      canWrite: Boolean(subscriber.canWrite),
      audienceType: String(subscriber.audienceType || ''),
      contactStatus: String(subscriber.contactStatus || ''),
      mailingSegment: String(subscriber.mailingSegment || ''),
      level: {
        id: level.id ?? null,
        name: levelName,
        price: Number(level.price || 0),
        currency: String(level.currency || money.currency || 'RUB'),
      },
      money: {
        currentPrice: Number(money.currentPrice || 0),
        totalPayments: Number(money.totalPayments || 0),
        currency: String(money.currency || level.currency || 'RUB'),
      },
      dates: {
        subscribedAt: dates.subscribedAt || null,
        unsubscribedAt: dates.unsubscribedAt || null,
        nextPaymentAt: dates.nextPaymentAt || null,
      },
      entitlements: siteAccess ? levelEntitlements : emptyEntitlements(),
      siteAccess,
    };
  });
  for (const row of rows) {
    rememberBoostyMailingContact(row.email, row.name, Boolean(row.active || row.hasActivePaidAccess), row.dates?.unsubscribedAt);
  }
  const levels = rows.reduce((acc: Record<string, number>, row: any) => {
    const key = row.level.name || 'Без уровня';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  return {
    configured: true,
    source: String(data?.source || ''),
    stale: Boolean(data?.stale),
    summary: data?.summary && typeof data.summary === 'object' ? data.summary : {},
    levels,
    subscribers: rows,
    fetchedAt: new Date().toISOString(),
  };
}

async function checkBoostySubscription(user: AdminUser): Promise<Record<string, any>> {
  const khaBoosty = khaBoostySubscriptionDetail(user, findKhaVipProfileForUser(user));
  if (khaBoosty) return khaBoosty;

  if (!isRealEmail(user.email)) {
    return {
      configured: Boolean(BOOSTY_AUTH_API_URL),
      checked: false,
      hasAccess: false,
      found: false,
      message: 'Для проверки Boosty привяжите реальную почту в профиле.',
    };
  }
  try {
    const url = `${BOOSTY_AUTH_API_URL}/api/access/check?email=${encodeURIComponent(user.email)}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.detail || data?.error || `HTTP ${response.status}`);
    const subscriber = data?.subscriber && typeof data.subscriber === 'object' ? data.subscriber : null;
    const money = subscriber?.money && typeof subscriber.money === 'object' ? subscriber.money : {};
    const level = subscriber?.level && typeof subscriber.level === 'object' ? subscriber.level : {};
    const price = Number(money.currentPrice ?? level.price ?? 0) || 0;
    const active = Boolean(data?.hasAccess ?? subscriber?.hasActivePaidAccess);
    const levelName = String(level.name || '');
    const entitlements = data?.found && active ? boostyEntitlementsForLevel(levelName) : emptyEntitlements();
    const hasAccess = hasAnyEntitlement(entitlements);
    return {
      configured: true,
      checked: true,
      found: Boolean(data?.found),
      hasAccess,
      stale: Boolean(data?.stale),
      email: user.email,
      minPrice: BOOSTY_MIN_PRICE,
      minLevelName: BOOSTY_MIN_LEVEL_NAME,
      price,
      levelName,
      entitlements,
      message: hasAccess
        ? 'Boosty подписка подтверждена.'
        : data?.found
          ? 'Этот уровень Boosty не открывает разделы HS-Arena.'
          : 'Boosty не нашёл эту почту. Зайдите на Boosty и привяжите/откройте email, затем обновите проверку.',
    };
  } catch (err: any) {
    console.warn('[subscription] Boosty check failed:', err?.message ?? err);
    return {
      configured: true,
      checked: false,
      hasAccess: false,
      found: false,
      stale: true,
      providerUnavailable: true,
      email: user.email,
      message: err?.message ?? 'Boosty временно недоступен.',
    };
  }
}

async function checkTelegramSubscription(user: AdminUser): Promise<Record<string, any>> {
  if (!KHA_VIP_BOT_TOKEN) {
    return { configured: false, checked: false, hasAccess: false, message: 'VIP Telegram-бот не настроен.' };
  }
  if (!user.telegramId) {
    return { configured: true, checked: false, hasAccess: false, message: 'Для проверки Telegram войдите через Telegram.' };
  }

  const chats: Array<Record<string, any>> = [];
  let hasAccess = false;
  for (const chatId of SUBSCRIPTION_TELEGRAM_CHAT_IDS) {
    try {
      const method = `getChatMember?chat_id=${encodeURIComponent(chatId)}&user_id=${encodeURIComponent(user.telegramId)}`;
      const response = await fetchTelegramBotApi(KHA_VIP_BOT_TOKEN, method, {}, 5_000);
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.ok === false) throw new Error(data?.description || `HTTP ${response.status}`);
      const member = data?.result ?? {};
      const status = String(member.status || '');
      const isMember = ['member', 'administrator', 'creator'].includes(status)
        || (status === 'restricted' && Boolean(member.is_member));
      hasAccess ||= isMember;
      chats.push({ chatId, ok: true, status, isMember });
    } catch (err: any) {
      console.warn(`[subscription] Telegram chat check failed chat=${chatId} user=${user.telegramId}:`, err?.message ?? err);
      chats.push({ chatId, ok: false, isMember: false, error: err?.message ?? 'Telegram check failed' });
    }
  }

  return {
    configured: true,
    checked: true,
    hasAccess,
    entitlements: hasAccess ? allEntitlements() : emptyEntitlements(),
    telegramId: user.telegramId,
    username: user.telegramUsername ?? '',
    chats,
    message: hasAccess
      ? 'Telegram VIP-канал подтверждён.'
      : 'Пользователь не найден в VIP Telegram-каналах.',
  };
}

async function refreshSubscriptionForUserNow(user: AdminUser): Promise<SubscriptionStatus> {
  const previous = readSubscriptionStatus(user.id);
  const [rawBoosty, rawTelegram] = await Promise.all([
    checkBoostySubscription(user),
    checkTelegramSubscription(user),
  ]);
  const boosty = applyBoostyGracePeriod(rawBoosty, previous);
  const telegram = normalizeTelegramSubscriptionDetail(rawTelegram);
  writeSubscriptionCheck(user, 'boosty', Boolean(boosty.hasAccess), boosty);
  writeSubscriptionCheck(user, 'telegram', Boolean(telegram.hasAccess), telegram);

  const entitlements = mergeEntitlements(
    normalizeEntitlements(boosty.entitlements),
    normalizeEntitlements(telegram.entitlements),
  );
  const sources = [
    boosty.hasAccess ? 'boosty' : '',
    telegram.hasAccess ? 'telegram' : '',
  ].filter(Boolean);
  const hasAccess = hasAnyEntitlement(entitlements);
  const status: SubscriptionStatus = {
    hasAccess,
    source: hasAccess ? sources.join(',') : 'none',
    checkedAt: new Date().toISOString(),
    stale: Boolean(boosty.stale || telegram.stale),
    message: hasAccess
      ? boosty.grace
        ? 'Boosty временно недоступен, доступ сохранён на 24 часа.'
        : 'Подписка Манакоста подтверждена.'
      : boosty.message || telegram.message || 'Подписка пока не подтверждена.',
    entitlements,
    boosty,
    telegram,
  };
  writeSubscriptionStatus(user, status);
  return applyManualSubscriptionGrant(user.id, status) ?? status;
}

async function refreshSubscriptionForUser(user: AdminUser, force = false): Promise<SubscriptionStatus> {
  if (!force) {
    const cached = readSubscriptionStatus(user.id);
    if (cached && !cached.stale) return cached;
    const pending = subscriptionRefreshInFlight.get(user.id);
    if (pending) return pending;
  }

  const promise = refreshSubscriptionForUserNow(user)
    .finally(() => subscriptionRefreshInFlight.delete(user.id));
  if (!force) subscriptionRefreshInFlight.set(user.id, promise);
  return promise;
}

async function refreshSubscriptionAfterTelegramAuth(user: AdminUser): Promise<void> {
  try {
    await refreshSubscriptionForUser(user, true);
  } catch (err: any) {
    console.warn(`[subscription] Telegram auth refresh failed user=${user.id}:`, err?.message ?? err);
  }
}

async function requireSubscriptionAccess(req: express.Request, res: express.Response, next: express.NextFunction) {
  return requireEntitlementAccess(null)(req, res, next);
}

function requireEntitlementAccess(entitlement: SubscriptionEntitlementKey | null, label = 'этому разделу') {
  return async function subscriptionEntitlementGuard(req: express.Request, res: express.Response, next: express.NextFunction) {
  res.vary('Cookie');
  res.vary('Authorization');
  const user = userAuth(req);
  if (!user) {
    setPrivateNoStore(res);
    return res.status(401).json({ error: 'Требуется вход в профиль Манакоста' });
  }
  if (isAdminUser(user)) {
    res.locals.subscriptionGuarded = true;
    return next();
  }

  try {
    const subscription = await refreshSubscriptionForUser(user, false);
    const allowed = entitlement ? Boolean(subscription.entitlements?.[entitlement]) : subscription.hasAccess;
    if (!allowed) {
      setPrivateNoStore(res);
      return res.status(403).json({
        error: `Для доступа к ${label} нужна подходящая подписка Манакоста`,
        subscription,
      });
    }
    res.locals.subscriptionGuarded = true;
    return next();
  } catch (err: any) {
    console.error('[subscription] access guard failed:', err?.message ?? err);
    setPrivateNoStore(res);
    return res.status(502).json({ error: 'Не удалось проверить подписку' });
  }
  };
}

const requireArenaAccess = requireEntitlementAccess('arena', 'разделам Арены');
const requireBattlegroundsAccess = requireEntitlementAccess('battlegrounds', 'разделам Полей Сражений');
const requireStandardAccess = requireEntitlementAccess('standard', 'разделу Стандарт');
const requireGuidesArchiveAccess = requireEntitlementAccess('guidesArchive', 'архиву гайдов');

function parseHttpUrl(rawUrl: unknown): URL | null {
  try {
    const url = new URL(String(rawUrl ?? '').trim());
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return url;
  } catch {
    return null;
  }
}

function normalizeArticleUrlKey(rawUrl: unknown): string {
  const url = parseHttpUrl(rawUrl);
  if (!url) return '';
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const pathname = decodeURIComponent(url.pathname)
    .replace(/\/index\.html?$/i, '')
    .replace(/\/+$/, '');
  return `${host}${pathname || '/'}`;
}

function articleSlug(rawUrl: unknown): string {
  const url = parseHttpUrl(rawUrl);
  if (!url) return '';
  const parts = url.pathname.split('/').filter(Boolean);
  return decodeURIComponent(parts.at(-1) || '').toLowerCase();
}

function normalizeArticleTitle(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function isKhaVipArticleUrl(rawUrl: unknown): boolean {
  const url = parseHttpUrl(rawUrl);
  return Boolean(url && KHA_VIP_ARTICLE_HOSTS.has(url.hostname.toLowerCase()));
}

function dateOnly(value: unknown): string | null {
  const raw = String(value ?? '').trim();
  const direct = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (direct) return direct[1];
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString().slice(0, 10);
}

async function fetchKhaVipLockers(force = false): Promise<KhaVipLocker[]> {
  if (!KHA_VIP_WP_BEARER) throw new Error('Koloda VIP API bearer is not configured');
  const now = Date.now();
  if (!force && khaVipLockersCache && khaVipLockersCache.expiresAt > now) {
    return khaVipLockersCache.items;
  }

  const response = await fetch(`${KHA_VIP_WP_BASE_URL}/wp-json/vip/v1/lockers`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${KHA_VIP_WP_BEARER}`,
      'User-Agent': 'HS-Arena VIP article bridge/1.0',
    },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Koloda lockers unavailable: HTTP ${response.status}${text ? ` ${text.slice(0, 120)}` : ''}`);
  }

  const data = await response.json().catch(() => null);
  if (!Array.isArray(data)) throw new Error('Koloda lockers returned invalid payload');
  const items = data
    .map((item: any): KhaVipLocker => ({
      post_id: Number(item?.post_id || 0),
      code: String(item?.code || ''),
      title: String(item?.title || ''),
      url: String(item?.url || ''),
      image: item?.image ? String(item.image) : '',
      excerpt: item?.excerpt ? String(item.excerpt) : '',
      date: item?.date ? String(item.date) : '',
      type: item?.type ? String(item.type) : '',
    }))
    .filter((item: KhaVipLocker) => item.post_id > 0 && item.code && item.url);

  khaVipLockersCache = { items, expiresAt: now + KHA_VIP_LOCKERS_CACHE_MS };
  return items;
}

async function findKhaVipLockerForArticle(rawUrl: unknown, title?: unknown): Promise<KhaVipLocker | null> {
  if (!isKhaVipArticleUrl(rawUrl)) return null;
  const lockers = await fetchKhaVipLockers();
  const wantedUrl = normalizeArticleUrlKey(rawUrl);
  const wantedSlug = articleSlug(rawUrl);
  const wantedTitle = normalizeArticleTitle(title);

  return lockers.find(item => normalizeArticleUrlKey(item.url) === wantedUrl)
    ?? lockers.find(item => wantedSlug && articleSlug(item.url) === wantedSlug)
    ?? lockers.find(item => wantedTitle && normalizeArticleTitle(item.title) === wantedTitle)
    ?? lockers.find(item => {
      const lockerTitle = normalizeArticleTitle(item.title);
      return Boolean(wantedTitle && lockerTitle && (lockerTitle.includes(wantedTitle) || wantedTitle.includes(lockerTitle)));
    })
    ?? null;
}

function wordpressIssueUserId(user: AdminUser): number {
  const telegramId = Number.parseInt(String(user.telegramId || ''), 10);
  if (Number.isFinite(telegramId) && telegramId > 0) return telegramId;
  const digest = Number.parseInt(sha256(user.id).slice(0, 8), 16);
  return 2_000_000_000 + (digest % 1_000_000_000);
}

async function issueKhaVipArticleLink(locker: KhaVipLocker, user: AdminUser): Promise<Record<string, any>> {
  if (!KHA_VIP_WP_BEARER) throw new Error('Koloda VIP API bearer is not configured');
  const response = await fetch(`${KHA_VIP_WP_BASE_URL}/wp-json/vip/v1/issue`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${KHA_VIP_WP_BEARER}`,
      'User-Agent': 'HS-Arena VIP article bridge/1.0',
    },
    body: JSON.stringify({
      post_id: locker.post_id,
      code: locker.code,
      telegram_user_id: wordpressIssueUserId(user),
      ttl: 900,
    }),
    signal: AbortSignal.timeout(12_000),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.message || data?.error || `Koloda issue failed: HTTP ${response.status}`);
  }
  if (!data?.url) throw new Error('Koloda issue did not return URL');
  return data;
}

async function resolveArticlePublishedDate(rawUrl: unknown, title?: unknown): Promise<string | null> {
  try {
    const locker = await findKhaVipLockerForArticle(rawUrl, title);
    const lockerDate = dateOnly(locker?.date);
    if (lockerDate) return lockerDate;
  } catch (err: any) {
    console.warn('[articles] Koloda publish date lookup failed:', err?.message ?? err);
  }

  const url = parseHttpUrl(rawUrl);
  if (!url) return null;
  try {
    const response = await fetch(url.href, {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'HS-Arena article metadata lookup/1.0',
      },
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) return null;
    const html = await response.text();
    const patterns = [
      /property=["']article:published_time["'][^>]*content=["']([^"']+)["']/i,
      /content=["']([^"']+)["'][^>]*property=["']article:published_time["']/i,
      /itemprop=["']datePublished["'][^>]*content=["']([^"']+)["']/i,
      /<time[^>]+datetime=["']([^"']+)["']/i,
      /"datePublished"\s*:\s*"([^"]+)"/i,
    ];
    for (const pattern of patterns) {
      const matched = html.match(pattern);
      const resolved = dateOnly(matched?.[1]);
      if (resolved) return resolved;
    }
  } catch (err: any) {
    console.warn('[articles] publish date lookup failed:', err?.message ?? err);
  }
  return null;
}

async function refreshAllSubscriptions() {
  syncKhaVipProfiles(db());
  const store = loadAuthStore();
  for (const user of store.users) {
    try {
      await refreshSubscriptionForUser(user, true);
    } catch (err: any) {
      console.warn(`[subscription] scheduled refresh failed user=${user.id}:`, err?.message ?? err);
    }
  }
}

function internalApiGuard(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) {
  if (!ECOSYSTEM_INTERNAL_KEY) return res.status(503).json({ error: 'Internal ecosystem API is not configured' });
  if (!safeEqualString(req.headers['x-ecosystem-key'], ECOSYSTEM_INTERNAL_KEY)) {
    return res.status(401).json({ error: 'Invalid ecosystem key' });
  }
  next();
}

function manualScrapeGuard(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) {
  if (ECOSYSTEM_INTERNAL_KEY && safeEqualString(req.headers['x-ecosystem-key'], ECOSYSTEM_INTERNAL_KEY)) {
    return next();
  }
  const user = userAuth(req);
  if (!user) return res.status(401).json({ error: 'Требуется вход администратора' });
  if (!isAdminUser(user)) return res.status(403).json({ error: 'Доступ запрещён для этого ID' });
  return next();
}

function resolveUserFromRequest(req: import('express').Request): AdminUser | null {
  const userId = String(req.query.userId ?? req.body?.userId ?? '').trim();
  const email = normalizeEmail(req.query.email ?? req.body?.email);
  const telegramId = String(req.query.telegramId ?? req.body?.telegramId ?? '').replace(/\D/g, '');
  const store = loadAuthStore();
  return store.users.find(user =>
    (userId && user.id === userId)
    || (email && user.email === email)
    || (telegramId && user.telegramId === telegramId)
  ) ?? null;
}

function loadClassPositionsData() {
  return loadData('class_positions.json') ?? { positions: {}, updatedAt: null };
}

function withClassPositions(data: any) {
  const positionsData = loadClassPositionsData();
  const positions = positionsData?.positions ?? {};
  return {
    ...data,
    classPositions: positions,
    sections: (data?.sections ?? []).map((section: any) => ({
      ...section,
      classPosition: positions[section.id] ?? '',
    })),
  };
}

const HSREPLAY_ARENA_DATASET_URL = 'https://api.hs-manacost.ru/datasets/hsreplay_arena';
const CLASS_MATCHUPS_CACHE_MS = 30 * 60 * 1000;
const CLASS_WINRATES_CACHE_MS = 5 * 60 * 1000;
const KOLODA_ARENA_DECKS_URL = 'https://kolodahs.ru/arena/winning';
const ARENA_DECKS_CACHE_MS = 30 * 60 * 1000;
const ARENA_DECKS_MAX_LIMIT = 500;
const HSREPLAY_CLASS_ID: Record<string, string> = {
  deathknight: 'death-knight',
  demonhunter: 'demon-hunter',
  druid: 'druid',
  hunter: 'hunter',
  mage: 'mage',
  paladin: 'paladin',
  priest: 'priest',
  rogue: 'rogue',
  shaman: 'shaman',
  warlock: 'warlock',
  warrior: 'warrior',
};
const HSREPLAY_CLASS_INFO: Record<string, { id: string; name: string; color: string; textDark?: boolean }> = {
  deathknight: { id: 'death-knight', name: 'Рыцарь смерти',     color: '#1f252d' },
  demonhunter: { id: 'demon-hunter', name: 'Охотник на демонов', color: '#224722' },
  druid:       { id: 'druid',        name: 'Друид',              color: '#704a16' },
  hunter:      { id: 'hunter',       name: 'Охотник',            color: '#1d5921' },
  mage:        { id: 'mage',         name: 'Маг',                color: '#2b5c85' },
  paladin:     { id: 'paladin',      name: 'Паладин',            color: '#a88a45' },
  priest:      { id: 'priest',       name: 'Жрец',               color: '#d1d1d1', textDark: true },
  rogue:       { id: 'rogue',        name: 'Разбойник',          color: '#333333' },
  shaman:      { id: 'shaman',       name: 'Шаман',              color: '#2a2e6b' },
  warlock:     { id: 'warlock',      name: 'Чернокнижник',       color: '#5c265c' },
  warrior:     { id: 'warrior',      name: 'Воин',               color: '#7a1e1e' },
};

function normalizeHsReplayClassId(value: unknown): string | null {
  const key = String(value ?? '').toLowerCase().replace(/[^a-z]/g, '');
  return HSREPLAY_CLASS_ID[key] ?? null;
}

function parseWinrate(value: unknown): number | null {
  const raw = typeof value === 'string' ? value.replace('%', '').trim() : value;
  const num = Number(raw);
  if (!Number.isFinite(num)) return null;
  const pct = num > 0 && num <= 1 ? num * 100 : num;
  return Math.round(pct * 100) / 100;
}

async function fetchClassWinratesData() {
  const upstream = await fetch(HSREPLAY_ARENA_DATASET_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ManacostArena/1.0)' },
  });
  if (!upstream.ok) throw new Error(`Upstream HTTP ${upstream.status}`);

  const payload = await upstream.json() as any;
  const structured = payload?.data?.structured ?? payload?.structured ?? {};
  const rawClasses = Array.isArray(structured?.classes) ? structured.classes : [];
  const classes = rawClasses
    .map((row: any) => {
      const classId = normalizeHsReplayClassId(row.class ?? row.class_name ?? row.name);
      const infoKey = classId ? classId.replace(/-/g, '') : '';
      const info = HSREPLAY_CLASS_INFO[infoKey] ?? HSREPLAY_CLASS_INFO[classId ?? ''];
      const winrate = parseWinrate(row.win_rate ?? row.winrate);
      const games = Number(row.num_drafts ?? row.games ?? row.total_games ?? row.totalGames ?? 0);
      if (!info || winrate === null || !Number.isFinite(games) || games <= 0) return null;
      return { ...info, winrate: Math.round(winrate * 10) / 10, games };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => b.winrate - a.winrate);

  if (!classes.length) throw new Error('No classes in HSReplay arena dataset');

  return {
    classes,
    updatedAt: payload?.fetched_at ?? payload?.data?.updatedAt ?? payload?.data?.updated_at ?? null,
    source: 'api.hs-manacost.ru',
  };
}

async function fetchFreshestClassWinratesData() {
  const liveData = await fetchClassWinratesData();
  const snapshotData = loadDataCached('winrates.json')?.data;
  const liveTime = liveData.updatedAt ? Date.parse(liveData.updatedAt) : 0;
  const snapshotTime = snapshotData?.updatedAt ? Date.parse(snapshotData.updatedAt) : 0;

  if (
    snapshotData
    && Array.isArray(snapshotData.classes)
    && Number.isFinite(snapshotTime)
    && snapshotTime > liveTime
  ) {
    return { ...snapshotData, source: snapshotData.source ?? 'cached' };
  }

  return liveData;
}

async function fetchClassMatchupsData() {
  const upstream = await fetch(HSREPLAY_ARENA_DATASET_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ManacostArena/1.0)' },
  });
  if (!upstream.ok) throw new Error(`Upstream HTTP ${upstream.status}`);

  const payload = await upstream.json() as any;
  const structured = payload?.data?.structured ?? payload?.structured ?? {};
  const rawMatchups = Array.isArray(structured?.matchups) ? structured.matchups : [];
  const matchups = rawMatchups
    .map((row: any) => {
      const classAId = normalizeHsReplayClassId(row.class_a ?? row.classA);
      const classBId = normalizeHsReplayClassId(row.class_b ?? row.classB);
      const winrate = parseWinrate(row.win_rate ?? row.winrate);
      if (!classAId || !classBId || winrate === null) return null;
      return {
        classAId,
        classBId,
        winrate,
        classA: row.class_a ?? row.classA ?? classAId,
        classB: row.class_b ?? row.classB ?? classBId,
      };
    })
    .filter(Boolean);

  const updatedAt = payload?.fetched_at ?? payload?.data?.fetched_at ?? null;
  return {
    matchups,
    updatedAt,
    source: 'api.hs-manacost.ru',
  };
}

function decodeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

function htmlText(value: unknown): string {
  return decodeHtml(String(value ?? '').replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function htmlAttr(block: string, name: string): string {
  const match = block.match(new RegExp(`${name}=(["'])([\\s\\S]*?)\\1`, 'i'));
  return match ? decodeHtml(match[2]).trim() : '';
}

function absoluteKolodaUrl(url: string): string {
  if (!url) return '';
  if (url.startsWith('//')) return `https:${url}`;
  try {
    return new URL(url, KOLODA_ARENA_DECKS_URL).toString();
  } catch {
    return url;
  }
}

function cardIdFromImageUrl(url: string): string {
  const match = url.match(/\/(?:256x|512x)\/([^/.?]+)\.png/i)
    ?? url.match(/\/cards\/[^/]+\/([^/.?]+)\.png(?:[?#].*)?$/i);
  return match ? decodeURIComponent(match[1]) : '';
}

function parseDeckCards(block: string, ruCards: Record<string, any>) {
  const figures = block.match(/<figure\b[\s\S]*?<\/figure>/gi) ?? [];
  return figures
    .map((figure) => {
      const imgMatch = figure.match(/<img\b[\s\S]*?>/i);
      const img = imgMatch?.[0] ?? '';
      const sourceImage = absoluteKolodaUrl(htmlAttr(img, 'src'));
      const cardId = normalizeCardImageId(cardIdFromImageUrl(sourceImage)) ?? '';
      if (!cardId) return null;

      const fallbackName = htmlAttr(img, 'alt') || htmlAttr(figure, 'title') || cardId;
      const countMatch = figure.match(/<figcaption>\s*x?(\d+)\s*<\/figcaption>/i);
      const count = countMatch ? Math.max(1, Number(countMatch[1]) || 1) : 1;
      return {
        cardId,
        name: String(ruCards?.[cardId]?.name ?? htmlText(fallbackName) ?? cardId),
        cost: parseCount(ruCards?.[cardId]?.mana) ?? 0,
        count,
        image: cardImageProxyUrl(cardId),
      };
    })
    .filter(Boolean);
}

function sortDeckCardsByMana(cards: any[]) {
  return [...cards].sort((a, b) => {
    const aCost = typeof a?.cost === 'number' ? a.cost : 0;
    const bCost = typeof b?.cost === 'number' ? b.cost : 0;
    if (aCost !== bCost) return aCost - bCost;
    return String(a?.name ?? '').localeCompare(String(b?.name ?? ''), 'ru');
  });
}

function arenaDeckClassOptions(decks: any[]) {
  const map = new Map<string, any>();
  for (const deck of decks) {
    for (const cls of deck.classes ?? []) {
      if (cls?.name && !map.has(cls.name)) map.set(cls.name, cls);
    }
  }
  return Array.from(map.values()).sort((a, b) => String(a.name).localeCompare(String(b.name), 'ru'));
}

function shapeArenaDecksPage(data: any, page: number, pageSize: number, className: string) {
  const allDecks = Array.isArray(data?.decks) ? data.decks : [];
  const filtered = className
    ? allDecks.filter((deck: any) => (deck.classes ?? []).some((cls: any) => cls?.name === className))
    : allDecks;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(totalPages, Math.max(1, page));
  const start = (safePage - 1) * pageSize;

  return {
    decks: filtered.slice(start, start + pageSize),
    totalDecks: data.totalDecks ?? allDecks.length,
    filteredDecks: filtered.length,
    page: safePage,
    pageSize,
    totalPages,
    activeClass: className || '',
    classOptions: arenaDeckClassOptions(allDecks),
    updatedAt: data.updatedAt ?? null,
    source: 'arena-decks',
    sourceUrl: '',
    warning: data.warning,
  };
}

function etagToken(value: string) {
  return encodeURIComponent(value).replace(/[^a-z0-9_.~-]/gi, '_') || 'all';
}

function parseKolodaUtcDate(value: string): string | null {
  const match = value.match(/(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})\s+UTC/i);
  if (!match) return null;
  const [, day, month, year, hour, minute] = match;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute))).toISOString();
}

function extractFirstBlock(html: string, className: string): string {
  return html.match(new RegExp(`<section[^>]*class=["'][^"']*${className}[^"']*["'][^>]*>[\\s\\S]*?<\\/section>`, 'i'))?.[0] ?? '';
}

function parseArenaDeckArticle(article: string, index: number, ruCards: Record<string, any>) {
  const header = article.match(/<header[^>]*class=["'][^"']*arena-deck-head[^"']*["'][^>]*>[\s\S]*?<\/header>/i)?.[0] ?? '';
  const id = header.match(/\/arena\/generate\/(\d+)/i)?.[1] ?? `deck-${index + 1}`;
  const classIcons = (header.match(/<img\b[^>]*class=["'][^"']*arena-class-icon[^"']*["'][^>]*>/gi) ?? [])
    .map((img) => ({
      name: htmlAttr(img, 'alt'),
      icon: absoluteKolodaUrl(htmlAttr(img, 'src')),
    }))
    .filter(cls => cls.name);

  const resultMatch = header.match(/<strong>\s*(\d+)\s*[-–]\s*(\d+)\s*<\/strong>\s*<span>\s*([\s\S]*?)\s*<\/span>/i);
  const wins = resultMatch ? Number(resultMatch[1]) : null;
  const losses = resultMatch ? Number(resultMatch[2]) : null;
  const player = htmlText(resultMatch?.[3] ?? '');

  const finalBlock = extractFirstBlock(article, 'arena-section-final');
  const legendaryBlock = extractFirstBlock(article, 'arena-block-legendary');
  const removedBlock = extractFirstBlock(article, 'arena-block-remove');
  const addedBlock = extractFirstBlock(article, 'arena-block-add');
  const finalCards = sortDeckCardsByMana(parseDeckCards(finalBlock, ruCards));

  return {
    id,
    rank: index + 1,
    classes: classIcons,
    classNames: classIcons.map(cls => cls.name).join(' / '),
    wins,
    losses,
    score: wins !== null && losses !== null ? `${wins}-${losses}` : null,
    player,
    cardCount: finalCards.reduce((sum: number, card: any) => sum + (card?.count ?? 1), 0),
    sourceUrl: '',
    generateUrl: '',
    finalCards,
    legendaryCards: sortDeckCardsByMana(parseDeckCards(legendaryBlock, ruCards)),
    removedCards: sortDeckCardsByMana(parseDeckCards(removedBlock, ruCards)),
    addedCards: sortDeckCardsByMana(parseDeckCards(addedBlock, ruCards)),
  };
}

async function fetchArenaDecksData(limit = ARENA_DECKS_MAX_LIMIT) {
  const safeLimit = Math.min(ARENA_DECKS_MAX_LIMIT, Math.max(1, Math.round(limit)));
  const url = `${KOLODA_ARENA_DECKS_URL}?limit=${safeLimit}`;
  const [ruCards, upstream] = await Promise.all([
    ensureRuCardsData(),
    fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36 ManacostArena/1.0',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
      },
    }),
  ]);
  if (!upstream.ok) throw new Error(`KolodaHS HTTP ${upstream.status}`);

  const html = await upstream.text();
  const totalDecks = parseCount(html.match(/Колод:\s*([\d\s]+)/i)?.[1]) ?? null;
  const updatedAtText = htmlText(html.match(/<div[^>]*class=["'][^"']*arena-source[^"']*["'][^>]*>[\s\S]*?<span>\s*([\s\S]*?)\s*<\/span>/i)?.[1] ?? '');
  const updatedAt = updatedAtText ? parseKolodaUtcDate(updatedAtText) : null;
  const articles = html.match(/<article\b[^>]*class=["'][^"']*arena-deck[^"']*["'][^>]*>[\s\S]*?<\/article>/gi) ?? [];
  const decks = articles
    .map((article, index) => parseArenaDeckArticle(article, index, ruCards))
    .filter((deck: any) => deck.finalCards.length > 0);

  return {
    decks,
    totalDecks,
    updatedAt,
    source: 'arena-decks',
    sourceUrl: '',
  };
}

const DATASET_API_ORIGIN = 'https://api.hs-manacost.ru';
const DATASET_API_BASE = `${DATASET_API_ORIGIN}/datasets`;
const HEARTHSTONEJSON_RU_CARDS_URL = 'https://api.hearthstonejson.com/v1/latest/ruRU/cards.collectible.json';
const EXTERNAL_DATASET_CACHE_MS = DATASET_MEMORY_CACHE_MS;
const TIERLIST_API_CACHE_MS = DATASET_MEMORY_CACHE_MS;
const TIERLIST_DATASET_BY_SOURCE = {
  hsreplay: 'demo/view/hsreplay_arena_cards_advanced',
  heartharena: 'heartharena_tierlist',
  firestone: 'firestone_arena_cards_normal',
} as const;
const LEGENDARIES_DATASET_BY_SOURCE = {
  hsreplay: 'hsreplay_arena_legendaries',
  firestone: 'firestone_arena_legendaries_normal',
} as const;
const STANDARD_MATCHUPS_DATASET_BY_RANK = {
  legend: 'hsguru_matchups_legend',
  diamond: 'hsguru_matchups_diamond_4to1',
} as const;
const STANDARD_MATCHUPS_RANK_LABEL: Record<keyof typeof STANDARD_MATCHUPS_DATASET_BY_RANK, string> = {
  legend: 'Легенда',
  diamond: 'Алмаз 4-1',
};
const STANDARD_ARCHETYPE_RU: Record<string, string> = {
  'Ace Hunter': 'Эйс Охотник',
  'Aggro Paladin': 'Агро Паладин',
  'Ashamane Rogue': 'Ашамейн Разбойник',
  'Aura Paladin': 'Аура Паладин',
  'Azshara Druid': 'Азшара Друид',
  'Briarspawn Warrior': 'Брайарспаун Воин',
  'Broxigar DH': 'Броксигар Охотник на демонов',
  'Burn Mage': 'Берн Маг',
  'Burn Rogue': 'Берн Разбойник',
  'Burn Warrior': 'Берн Воин',
  'Companion Hunter': 'Компаньон Охотник',
  'Control Priest': 'Контроль Жрец',
  'Dino Egglock': 'Дино Кхелос Чернокнижник',
  'Divergence Warlock': 'Дивергенция Чернокнижник',
  'Dragon Druid': 'Дракон Друид',
  'Dragon Hunter': 'Дракон Охотник',
  'Dragon Warrior': 'Дракон Воин',
  'Dude Paladin': 'Токен Паладин',
  'Egg Warrior': 'Кхелос Воин',
  'Egglock': 'Кхелос Чернокнижник',
  'Elemental Mage': 'Элементаль Маг',
  'End of Turnadin': 'Ноздорму Паладин',
  'Enrage Warrior': 'Исступление Воин',
  'Frost DK': 'Фрост Рыцарь смерти',
  'Glacial Shaman': 'Ледяной Шаман',
  'Gladiator Warrior': 'Гладиатор Воин',
  'Harold DH': 'Охотник на демонов на возвещении',
  'Harold DK': 'Рыцарь смерти на возвещении',
  'Harold Egglock': 'Кхелос Чернокнижник на возвещении',
  'Harold Rogue': 'Разбойник на возвещении',
  'Harold Shaman': 'Шаман на возвещении',
  'Harold Warrior': 'Воин на возвещении',
  'Herald DH': 'Охотник на демонов на возвещении',
  'Herald DK': 'Рыцарь смерти на возвещении',
  'Herald Rogue': 'Разбойник на возвещении',
  'Herald Shaman': 'Шаман на возвещении',
  'Herald Warrior': 'Воин на возвещении',
  'Hostage Druid': 'Заложник Друид',
  'Imbue Paladin': 'Паладин на силе героя',
  'Imbue Priest': 'Жрец на силе героя',
  'Imbue Rogue': 'Разбойник на силе героя',
  'Krona Druid': 'Крона Друид',
  'Leyline Mage': 'Лейлайн Маг',
  'Merithra Druid': 'Меритра Друид',
  'No Hand Hunter': 'Охотник без руки',
  'No Minion DH': 'Спелл Охотник на демонов',
  'Quest DH': 'Квест Охотник на демонов',
  'Quest Druid': 'Квест Друид',
  'Quest Hunter': 'Квест Охотник',
  'Quest Mage': 'Квест Маг',
  'Quest Rogue': 'Квест Разбойник',
  'Quest Shaman': 'Квест Шаман',
  'Quest Warrior': 'Квест Воин',
  'Rafaamlock': 'Рафаам Чернокнижник',
  'Token Druid': 'Токен Друид',
  'Unholy DK': 'Нечестивый Рыцарь смерти',
  'Vanessa Rogue': 'Ванесса Разбойник',
  'Wallow Warlock': 'Валлоу Чернокнижник',
};
interface StandardArchetypeTranslations {
  map: Record<string, string>;
  source: 'deckview-api' | 'deckview-csv' | 'fallback';
}
let standardArchetypeTranslationsCache: (StandardArchetypeTranslations & { expiresAt: number }) | null = null;
let standardArchetypeTranslationsPromise: Promise<StandardArchetypeTranslations> | null = null;
const TIER_SOURCE_LABEL: Record<keyof typeof TIERLIST_DATASET_BY_SOURCE, string> = {
  hsreplay: 'hsreplay.net',
  heartharena: 'heartharena.com',
  firestone: 'firestoneapp.com',
};
const LEGENDARY_SOURCE_LABEL: Record<keyof typeof LEGENDARIES_DATASET_BY_SOURCE, string> = {
  hsreplay: 'hsreplay.net',
  firestone: 'firestoneapp.com',
};

const ARENA_CLASSES = [
  { id: 'death-knight', name: 'Рыцарь смерти', color: '#1f252d', textDark: false },
  { id: 'demon-hunter', name: 'Охотник на демонов', color: '#224722', textDark: false },
  { id: 'druid', name: 'Друид', color: '#704a16', textDark: false },
  { id: 'hunter', name: 'Охотник', color: '#1d5921', textDark: false },
  { id: 'mage', name: 'Маг', color: '#2b5c85', textDark: false },
  { id: 'paladin', name: 'Паладин', color: '#a88a45', textDark: false },
  { id: 'priest', name: 'Жрец', color: '#d1d1d1', textDark: true },
  { id: 'rogue', name: 'Разбойник', color: '#333333', textDark: false },
  { id: 'shaman', name: 'Шаман', color: '#2a2e6b', textDark: false },
  { id: 'warlock', name: 'Чернокнижник', color: '#5c265c', textDark: false },
  { id: 'warrior', name: 'Воин', color: '#7a1e1e', textDark: false },
  { id: 'any', name: 'Нейтральные', color: '#4a4a4a', textDark: false },
];
const ARENA_CLASS_BY_ID = Object.fromEntries(ARENA_CLASSES.map(cls => [cls.id, cls]));
const CARD_CLASS_TO_ID: Record<string, string> = {
  DEATHKNIGHT: 'death-knight',
  DEATHKNIGHTCARD: 'death-knight',
  DEATH_KNIGHT: 'death-knight',
  DEMONHUNTER: 'demon-hunter',
  DEMON_HUNTER: 'demon-hunter',
  DRUID: 'druid',
  HUNTER: 'hunter',
  MAGE: 'mage',
  PALADIN: 'paladin',
  PRIEST: 'priest',
  ROGUE: 'rogue',
  SHAMAN: 'shaman',
  WARLOCK: 'warlock',
  WARRIOR: 'warrior',
  NEUTRAL: 'any',
  ALL: 'any',
};
const TIER_ORDER = ['S', 'A', 'B', 'C', 'D', 'E', 'F', HSREPLAY_NO_ARENASMITH_TIER];
const HEARTHARENA_TIER_TO_LETTER: Record<string, string> = {
  great: 'S',
  good: 'A',
  'above-average': 'B',
  aboveaverage: 'B',
  average: 'C',
  'below-average': 'D',
  belowaverage: 'D',
  bad: 'E',
  terrible: 'F',
};
const TIER_LABEL_FULL: Record<string, string> = {
  S: 'Отлично',
  A: 'Хорошо',
  B: 'Выше среднего',
  C: 'Средне',
  D: 'Ниже среднего',
  E: 'Плохо',
  F: 'Ужасно',
  [HSREPLAY_NO_ARENASMITH_TIER]: 'Без тира',
};
const TIER_DESC_MAP: Record<string, string> = {
  S: 'Авто-пик — доминирующие карты текущего метагейма.',
  A: 'Отличные карты, очень сильны в большинстве ситуаций.',
  B: 'Выше среднего — хороший выбор для стабильной колоды.',
  C: 'Средние карты, полезны при нехватке лучших вариантов.',
  D: 'Ниже среднего — берите только если нет лучших карт.',
  E: 'Плохие карты — последний выбор.',
  F: 'Ужасные карты — никогда не стоит брать.',
  [HSREPLAY_NO_ARENASMITH_TIER]: 'Карты без Arenasmith Score в текущем срезе HSReplay.',
};
const TIER_ALIAS_TO_LETTER: Record<string, string> = {
  GREAT: 'S',
  EXCELLENT: 'S',
  'AUTO-PICK': 'S',
  'AUTO-PICKS': 'S',
  'TIER-1': 'S',
  'TIER-2': 'A',
  'TIER-3': 'B',
  'TIER-4': 'C',
  'TIER-5': 'D',
  'TIER-6': 'E',
  'TIER-7': 'F',
  GOOD: 'A',
  'ABOVE-AVERAGE': 'B',
  ABOVEAVERAGE: 'B',
  AVERAGE: 'C',
  'BELOW-AVERAGE': 'D',
  BELOWAVERAGE: 'D',
  BAD: 'E',
  TERRIBLE: 'F',
};
let hearthstoneJsonRuCards: Record<string, any> | null = null;
let hearthstoneJsonRuCardsPromise: Promise<Record<string, any>> | null = null;

async function ensureRuCardsData(): Promise<Record<string, any>> {
  if (hearthstoneJsonRuCards) return hearthstoneJsonRuCards;
  if (!hearthstoneJsonRuCardsPromise) {
    hearthstoneJsonRuCardsPromise = fetch(HEARTHSTONEJSON_RU_CARDS_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ManacostArena/1.0)' },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HearthstoneJSON HTTP ${res.status}`);
        const cards = await res.json() as any[];
        return Object.fromEntries((Array.isArray(cards) ? cards : []).map((card: any) => [card.id, {
          name: card.name,
          mana: card.cost,
          attack: card.attack,
          health: card.health,
          type: card.type,
          rarity: card.rarity,
          playerClass: card.cardClass,
          dbf: card.dbfId,
        }]));
      })
      .then((map) => {
        hearthstoneJsonRuCards = map;
        return map;
      })
      .catch((err) => {
        hearthstoneJsonRuCardsPromise = null;
        console.error('[Server] Failed to load ru card dictionary:', err?.message ?? err);
        return {};
      });
  }
  return hearthstoneJsonRuCardsPromise;
}

function normalizeSource<T extends Record<string, string>>(source: string | undefined, known: T, fallback: keyof T): keyof T {
  return Object.prototype.hasOwnProperty.call(known, source ?? '') ? source as keyof T : fallback;
}

function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const raw = typeof value === 'string' ? value.replace('%', '').replace(/\s+/g, '').replace(',', '.') : value;
  const num = Number(raw);
  if (!Number.isFinite(num)) return null;
  return Math.round(num * 100) / 100;
}

function parsePercentish(value: unknown): number | null {
  return parseWinrate(value);
}

function parseCount(value: unknown): number | null {
  const num = parseNumber(value);
  if (num === null) return null;
  return Math.round(num);
}

function normalizeArenaClassId(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (raw && ARENA_CLASS_BY_ID[raw]) return raw;
  const hsReplayId = normalizeHsReplayClassId(raw);
  if (hsReplayId) return hsReplayId;
  const compact = raw.toUpperCase().replace(/[^A-Z]/g, '');
  return CARD_CLASS_TO_ID[compact] ?? 'any';
}

function normalizeRarity(value: unknown): string {
  const rarity = String(value ?? '').toLowerCase().replace(/[^a-z-]/g, '');
  return rarity || 'common';
}

function normalizeType(value: unknown): string | undefined {
  const type = String(value ?? '').toLowerCase().replace(/[^a-z-]/g, '');
  return type || undefined;
}

function safeCardId(row: any): string {
  return String(row?.card_id ?? row?.cardId ?? row?.id ?? '').trim();
}

function getRuCard(cardId: string): any | null {
  if (!cardId) return null;
  return hearthstoneJsonRuCards?.[cardId] ?? loadDataCached('cards_ru.json')?.data?.[cardId] ?? null;
}

function hsRenderUrl(cardId: string, size: '256x' | '512x' = '256x', locale = 'ruRU'): string {
  return `https://art.hearthstonejson.com/v1/render/latest/${locale}/${size}/${cardId}.png`;
}

function cardImageProxyUrl(cardId: string, variant: 'thumb' | 'full' = 'thumb'): string {
  return `/api/card-image/${encodeURIComponent(cardId)}/${variant}.webp?v=${CARD_IMAGE_CACHE_VERSION}`;
}

function normalizeCardImageId(value: unknown): string | null {
  const cardId = String(value ?? '').trim();
  if (!/^[A-Za-z0-9_]+$/.test(cardId) || cardId.length > 80) return null;
  return cardId;
}

function cardImageCachePath(cardId: string, variant: 'thumb' | 'full', source: CardImageSource): string {
  return join(CARD_IMAGE_CACHE_DIR, `${cardId}-${variant}-${source}-${CARD_IMAGE_CACHE_VERSION}.webp`);
}

function normalizeResolvedCardId(cardId: string): string {
  return cardId.trim().replace(/^\/+/, '').replace(/\s+/g, '');
}

async function resolveCardImageId(cardId: string): Promise<string> {
  if (!/^\d+$/.test(cardId)) return cardId;

  const findByDbf = (cards: Record<string, any> | null | undefined) => {
    for (const [id, card] of Object.entries(cards ?? {})) {
      if (String(card?.dbf ?? card?.dbfId ?? '') === cardId) {
        const resolved = normalizeResolvedCardId(id);
        if (resolved) return resolved;
      }
    }
    return null;
  };

  return findByDbf(loadDataCached('cards_ru.json')?.data)
    ?? findByDbf(await ensureRuCardsData())
    ?? cardId;
}

async function resolveCardDbfId(cardId: string): Promise<number | null> {
  if (/^\d+$/.test(cardId)) {
    const numericId = Number(cardId);
    return Number.isInteger(numericId) && numericId > 0 ? numericId : null;
  }

  const findDbfId = (cards: Record<string, any> | null | undefined) => {
    const card = cards?.[cardId];
    const dbfId = Number(card?.dbf ?? card?.dbfId);
    return Number.isInteger(dbfId) && dbfId > 0 ? dbfId : null;
  };

  return findDbfId(loadDataCached('cards_ru.json')?.data)
    ?? findDbfId(await ensureRuCardsData());
}

async function ensureCardImagePlaceholder(cardId: string, variant: 'thumb' | 'full', message = 'Нет изображения'): Promise<CachedCardImage> {
  mkdirSync(CARD_IMAGE_CACHE_DIR, { recursive: true });
  const outPath = cardImageCachePath(`missing-${cardId}`, variant, 'placeholder');
  if (existsSync(outPath)) return { path: outPath, source: 'placeholder' };

  const width = variant === 'full' ? 360 : 180;
  const height = Math.round(width * 1.516);
  const safeId = cardId.replace(/[^A-Za-z0-9_/-]/g, '').slice(0, 32);
  const svg = `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#edf4ff"/>
          <stop offset="0.55" stop-color="#dbe8f8"/>
          <stop offset="1" stop-color="#fff4cf"/>
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" rx="${Math.round(width * 0.08)}" fill="url(#bg)"/>
      <rect x="10" y="10" width="${width - 20}" height="${height - 20}" rx="${Math.round(width * 0.06)}" fill="none" stroke="#94a3b8" stroke-width="2"/>
      <circle cx="${width / 2}" cy="${height * 0.38}" r="${width * 0.18}" fill="#1f3654" opacity="0.92"/>
      <text x="50%" y="${height * 0.39}" text-anchor="middle" dominant-baseline="middle" font-family="Arial, sans-serif" font-size="${Math.round(width * 0.18)}" font-weight="700" fill="#f8fbff">?</text>
      <text x="50%" y="${height * 0.62}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${Math.round(width * 0.08)}" font-weight="700" fill="#1f3654">${message}</text>
      <text x="50%" y="${height * 0.72}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${Math.round(width * 0.07)}" fill="#64748b">${safeId}</text>
    </svg>`;

  await sharp(Buffer.from(svg))
    .webp({ quality: variant === 'full' ? 82 : 76, effort: 4 })
    .toFile(outPath);
  return { path: outPath, source: 'placeholder' };
}

async function withCardImageSlot<T>(task: () => Promise<T>): Promise<T> {
  if (activeCardImageJobs >= MAX_CARD_IMAGE_JOBS) {
    await new Promise<void>(resolve => cardImageQueue.push(resolve));
  }

  activeCardImageJobs += 1;
  try {
    return await task();
  } finally {
    activeCardImageJobs -= 1;
    const next = cardImageQueue.shift();
    if (next) next();
  }
}

async function fetchRemoteCardImage(cardId: string, variant: 'thumb' | 'full'): Promise<{ buffer: Buffer; source: Exclude<CardImageSource, 'placeholder'> }> {
  const sourceSize = variant === 'full' ? '512x' : '256x';
  const locales = ['ruRU', 'enUS'];
  let lastError: Error | null = null;

  if (blizzardCardImages.configured) {
    try {
      const dbfId = await resolveCardDbfId(cardId);
      const imageUrl = dbfId ? await blizzardCardImages.getImageUrl(dbfId) : null;
      if (imageUrl) {
        const upstream = await fetch(imageUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ManacostArena/1.0)' },
          signal: AbortSignal.timeout(15_000),
        });
        const contentType = upstream.headers.get('content-type') ?? '';
        if (!upstream.ok) throw new Error(`Blizzard image HTTP ${upstream.status}`);
        if (!isBlizzardImageContentType(contentType)) {
          throw new Error(`Blizzard image returned ${contentType || 'unknown content type'}`);
        }
        return { buffer: Buffer.from(await upstream.arrayBuffer()), source: 'blizzard' };
      }
    } catch (err: any) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (Date.now() - lastBlizzardImageWarningAt > 5 * 60_000) {
        lastBlizzardImageWarningAt = Date.now();
        console.warn('[api/card-image] Blizzard API unavailable, using HearthstoneJSON fallback:', lastError.message);
      }
    }
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    for (const locale of locales) {
      try {
        const upstream = await fetch(hsRenderUrl(cardId, sourceSize, locale), {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ManacostArena/1.0)' },
          signal: AbortSignal.timeout(15_000),
        });
        if (!upstream.ok) {
          lastError = new Error(`Hearthstone image ${locale} HTTP ${upstream.status}`);
          continue;
        }
        return { buffer: Buffer.from(await upstream.arrayBuffer()), source: 'fallback' };
      } catch (err: any) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }
  }

  throw lastError ?? new Error('Card image unavailable');
}

async function ensureCardImage(cardId: string, variant: 'thumb' | 'full'): Promise<CachedCardImage> {
  mkdirSync(CARD_IMAGE_CACHE_DIR, { recursive: true });
  const resolvedCardId = await resolveCardImageId(cardId);
  const preferredSource: CardImageSource = blizzardCardImages.configured ? 'blizzard' : 'fallback';
  const preferredPath = cardImageCachePath(resolvedCardId, variant, preferredSource);
  if (existsSync(preferredPath)) return { path: preferredPath, source: preferredSource };

  const recentFallbackPath = cardImageCachePath(resolvedCardId, variant, 'fallback');
  if (blizzardCardImages.configured && existsSync(recentFallbackPath)) {
    const fallbackAge = Date.now() - statSync(recentFallbackPath).mtimeMs;
    if (fallbackAge < CARD_IMAGE_FALLBACK_RETRY_MS) {
      return { path: recentFallbackPath, source: 'fallback' };
    }
  }

  const jobKey = `${resolvedCardId}:${variant}:${preferredSource}`;
  const existingJob = cardImageJobs.get(jobKey);
  if (existingJob) return existingJob;

  const job = (async () => {
    return withCardImageSlot(async () => {
      try {
        const remoteImage = await fetchRemoteCardImage(resolvedCardId, variant);
        const outPath = cardImageCachePath(resolvedCardId, variant, remoteImage.source);
        const width = variant === 'full' ? 360 : 180;
        await sharp(remoteImage.buffer)
          .resize({ width, withoutEnlargement: true })
          .webp({ quality: variant === 'full' ? 82 : 76, effort: 4 })
          .toFile(outPath);
        return { path: outPath, source: remoteImage.source };
      } catch (err: any) {
        console.warn('[api/card-image] fallback placeholder:', resolvedCardId, err?.message ?? err);
        return ensureCardImagePlaceholder(resolvedCardId, variant);
      }
    });
  })().finally(() => cardImageJobs.delete(jobKey));

  cardImageJobs.set(jobKey, job);
  return job;
}

function displayCardName(row: any): string {
  const cardId = safeCardId(row);
  const ruCard = getRuCard(cardId);
  return String(ruCard?.name ?? row?.heartharena_name ?? row?.name ?? row?.card_name ?? cardId).trim();
}

function normalizeTierLetter(value: any): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;

  const upper = raw.toUpperCase();
  if (TIER_ORDER.includes(upper)) return upper;

  const normalized = upper
    .replace(/[._\s]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (TIER_ORDER.includes(normalized)) return normalized;
  if (TIER_ALIAS_TO_LETTER[normalized]) return TIER_ALIAS_TO_LETTER[normalized];
  if (TIER_ALIAS_TO_LETTER[normalized.replace(/-/g, '')]) return TIER_ALIAS_TO_LETTER[normalized.replace(/-/g, '')];

  const letterMatch = normalized.match(/(?:^|-)TIER-([SABCDEF])(?:-|$)/)
    ?? normalized.match(/(?:^|-)RANK-([SABCDEF])(?:-|$)/);
  if (letterMatch?.[1] && TIER_ORDER.includes(letterMatch[1])) return letterMatch[1];

  const numericMatch = normalized.match(/(?:^|-)TIER-([1-7])(?:-|$)/)
    ?? normalized.match(/(?:^|-)RANK-([1-7])(?:-|$)/)
    ?? normalized.match(/^([1-7])$/);
  if (numericMatch?.[1]) return TIER_ORDER[Number(numericMatch[1]) - 1] ?? null;

  return null;
}

function inferTier(row: any, deckWinrate: number | null, score: number | null, source: keyof typeof TIERLIST_DATASET_BY_SOURCE): string {
  if (source === 'hsreplay') {
    const directArenasmithTier = normalizeArenasmithTier(
      row?.arenasmith_tier
        ?? row?.arenasmithTier
        ?? row?.arenasmith_tier_position
        ?? row?.arenasmithTierPosition,
    );
    if (directArenasmithTier) return directArenasmithTier;
    return tierFromArenasmithScore(score) ?? HSREPLAY_NO_ARENASMITH_TIER;
  }

  const directTier = normalizeTierLetter(
    row?.tier
      ?? row?.tier_letter
      ?? row?.tierLetter
      ?? row?.card_tier
      ?? row?.cardTier
      ?? row?.hsreplay_tier
      ?? row?.hsreplayTier,
  );
  if (directTier) return directTier;

  if (source === 'heartharena') {
    const key = String(row?.tier_id ?? row?.tierName ?? row?.tier_name ?? '').trim().toLowerCase();
    const normalizedKey = key.replace(/\s+/g, '-');
    const tier = HEARTHARENA_TIER_TO_LETTER[normalizedKey] ?? HEARTHARENA_TIER_TO_LETTER[normalizedKey.replace(/-/g, '')];
    if (tier) return tier;
    if (score !== null) {
      if (score >= 85) return 'S';
      if (score >= 70) return 'A';
      if (score >= 55) return 'B';
      if (score >= 40) return 'C';
      if (score >= 25) return 'D';
      if (score >= 10) return 'E';
      return 'F';
    }
  }

  if (deckWinrate !== null) {
    if (deckWinrate >= 60) return 'S';
    if (deckWinrate >= 57) return 'A';
    if (deckWinrate >= 54) return 'B';
    if (deckWinrate >= 51) return 'C';
    if (deckWinrate >= 48) return 'D';
    if (deckWinrate >= 45) return 'E';
    return 'F';
  }
  return 'C';
}

function normalizeTierCard(row: any, source: keyof typeof TIERLIST_DATASET_BY_SOURCE): any | null {
  const cardId = safeCardId(row);
  if (!cardId) return null;
  const ruCard = getRuCard(cardId);
  const deckWinrate = parsePercentish(row?.win_rate ?? row?.deck_winrate ?? row?.deckWinrate);
  const arenaScore = source === 'hsreplay'
    ? parseNumber(row?.arenasmith_score ?? row?.arenasmithScore ?? row?.score)
    : parseNumber(row?.score ?? row?.arena_score ?? row?.arenaScore);
  const score = source === 'hsreplay'
    ? arenaScore
    : source === 'heartharena'
      ? arenaScore ?? 0
      : Math.round((deckWinrate ?? 0) * 10);
  return {
    name: displayCardName(row),
    score,
    rarity: normalizeRarity(ruCard?.rarity ?? row?.rarity),
    cardId,
    classKey: normalizeArenaClassId(row?.cardClass ?? row?.classKey ?? row?.arena_class),
    source,
    winrate: deckWinrate ?? undefined,
    deckWinrate,
    pickRate: parsePercentish(row?.pick_rate ?? row?.pickRate),
    playedWinrate: parsePercentish(row?.winrate_when_played ?? row?.played_winrate ?? row?.playedWinrate),
    inDecks: parsePercentish(row?.popularity ?? row?.in_runs ?? row?.inDecks),
    totalGames: parseCount(row?.total_games ?? row?.totalGames ?? row?.times_played ?? row?.timesPlayed),
    arenaScore,
    arenaSmithTier: normalizeArenasmithTier(row?.arenasmith_tier ?? row?.arenasmithTier),
    arenaSmithTierPosition: normalizeArenasmithTier(row?.arenasmith_tier_position ?? row?.arenasmithTierPosition),
    arenaSmithRank: parseCount(row?.arenasmith_rank ?? row?.arenasmithRank),
    offerRate: parsePercentish(row?.offer_rate ?? row?.offerRate),
    discardRate: parsePercentish(row?.discard_rate ?? row?.discardRate),
    drawnWinrate: parsePercentish(row?.winrate_when_drawn ?? row?.drawn_winrate ?? row?.drawnWinrate),
    mulliganWinrate: parsePercentish(row?.mulligan_winrate ?? row?.mulliganWinrate),
    keptRate: parsePercentish(row?.kept_rate ?? row?.keptRate),
    avgCopies: parseNumber(row?.avg_copies ?? row?.avgCopies),
  };
}

function normalizeCardLookup(row: any) {
  const cardId = safeCardId(row);
  const ruCard = getRuCard(cardId);
  const imageUrl = row?.image_url ?? row?.imageHa ?? row?.imageRu ?? '';
  const imageRu = cardId
    ? cardImageProxyUrl(cardId)
    : imageUrl && String(imageUrl).includes('/ruRU/')
      ? imageUrl
      : null;
  return {
    cost: parseCount(ruCard?.mana ?? row?.cost) ?? undefined,
    attack: parseCount(ruCard?.attack ?? row?.attack) ?? undefined,
    health: parseCount(ruCard?.health ?? row?.health) ?? undefined,
    type: normalizeType(ruCard?.type ?? row?.type),
    imageHa: imageUrl || '',
    imageRu,
    rarityDb: normalizeRarity(ruCard?.rarity ?? row?.rarity),
  };
}

function makeTierGroups(cards: any[], source: keyof typeof TIERLIST_DATASET_BY_SOURCE) {
  const grouped = new Map<string, any[]>();
  for (const card of cards) {
    const tier = inferTier(card.__raw ?? card, card.deckWinrate ?? null, card.arenaScore ?? null, source);
    if (!grouped.has(tier)) grouped.set(tier, []);
    grouped.get(tier)!.push(card);
  }

  return TIER_ORDER
    .filter(tier => grouped.has(tier))
    .map(tier => ({
      tier,
      label: TIER_LABEL_FULL[tier],
      description: TIER_DESC_MAP[tier],
      cards: grouped.get(tier)!.sort((a, b) => {
        if (source === 'heartharena') return (b.score ?? 0) - (a.score ?? 0);
        if (source === 'hsreplay') {
          return (b.arenaScore ?? Number.NEGATIVE_INFINITY) - (a.arenaScore ?? Number.NEGATIVE_INFINITY)
            || (a.arenaSmithRank ?? Number.POSITIVE_INFINITY) - (b.arenaSmithRank ?? Number.POSITIVE_INFINITY)
            || (b.deckWinrate ?? 0) - (a.deckWinrate ?? 0)
            || (b.totalGames ?? 0) - (a.totalGames ?? 0);
        }
        return (b.deckWinrate ?? 0) - (a.deckWinrate ?? 0)
          || (b.totalGames ?? 0) - (a.totalGames ?? 0)
          || (b.arenaScore ?? 0) - (a.arenaScore ?? 0);
      }).map(({ __raw, ...card }) => card),
    }));
}

function buildClassSections(sectionCards: Map<string, any[]>, source: keyof typeof TIERLIST_DATASET_BY_SOURCE) {
  return ARENA_CLASSES
    .map(cls => {
      const cards = sectionCards.get(cls.id) ?? [];
      return {
        ...cls,
        tiers: makeTierGroups(cards, source),
        totalCards: cards.length,
      };
    })
    .filter(section => section.totalCards > 0);
}

function normalizeFlatTierlist(structured: any, source: keyof typeof TIERLIST_DATASET_BY_SOURCE, updatedAt: string | null) {
  const rawCards = Array.isArray(structured?.cards) ? structured.cards : [];
  const cardsLookup: Record<string, any> = {};
  const sectionCards = new Map<string, any[]>();

  for (const row of rawCards) {
    const card = normalizeTierCard(row, source);
    if (!card) continue;
    const cardId = card.cardId;
    cardsLookup[cardId] = normalizeCardLookup(row);
    const classId = card.classKey;
    if (!sectionCards.has(classId)) sectionCards.set(classId, []);
    sectionCards.get(classId)!.push({ ...card, __raw: row });
  }

  return {
    sections: buildClassSections(sectionCards, source),
    cards: cardsLookup,
    updatedAt,
    source: TIER_SOURCE_LABEL[source],
  };
}

function normalizeHearthArenaTierlist(structured: any, updatedAt: string | null) {
  const classes = structured?.classes && typeof structured.classes === 'object' ? structured.classes : {};
  const classEntries = Array.isArray(classes)
    ? classes.map((classData: any) => [classData?.class_id ?? classData?.id ?? classData?.class_name, classData] as [string, any])
    : Object.entries(classes) as Array<[string, any]>;
  const cardsLookup: Record<string, any> = {};
  const sectionCards = new Map<string, any[]>();

  for (const [classIdRaw, classData] of classEntries) {
    const classId = normalizeArenaClassId(classIdRaw);
    const rawCards = Array.isArray(classData?.cards) ? classData.cards : [];
    for (const row of rawCards) {
      const card = normalizeTierCard(row, 'heartharena');
      if (!card) continue;
      cardsLookup[card.cardId] = normalizeCardLookup(row);
      if (!sectionCards.has(classId)) sectionCards.set(classId, []);
      sectionCards.get(classId)!.push({ ...card, __raw: row });
    }
  }

  return {
    sections: buildClassSections(sectionCards, 'heartharena'),
    cards: cardsLookup,
    updatedAt,
    source: TIER_SOURCE_LABEL.heartharena,
  };
}

function normalizeTierlistDataset(payload: any, source: keyof typeof TIERLIST_DATASET_BY_SOURCE) {
  const structured = payload?.view ?? payload?.data?.structured ?? payload?.data?.hsreplay_extracted ?? payload?.structured ?? {};
  const updatedAt = payload?.fetched_at ?? payload?.data?.fetched_at ?? structured?.last_update_date ?? null;
  if (source === 'heartharena') return normalizeHearthArenaTierlist(structured, updatedAt);
  return normalizeFlatTierlist(structured, source, updatedAt);
}

function normalizeLegendaryCard(row: any) {
  const cardId = safeCardId(row);
  const ruCard = getRuCard(cardId);
  const imageUrl = row?.image_url ?? row?.imageHa ?? '';
  const imageRu = cardId
    ? cardImageProxyUrl(cardId)
    : imageUrl && String(imageUrl).includes('/ruRU/')
      ? imageUrl
      : null;
  return {
    cardId,
    name: displayCardName(row),
    cost: parseCount(ruCard?.mana ?? row?.cost) ?? undefined,
    type: normalizeType(ruCard?.type ?? row?.type),
    rarity: normalizeRarity(ruCard?.rarity ?? row?.rarity),
    classKey: normalizeArenaClassId(row?.cardClass ?? row?.classKey),
    count: parseCount(row?.count) ?? undefined,
    imageHa: imageUrl,
    imageRu: row?.imageRu ?? imageRu,
  };
}

function normalizeLegendaryGroupStats(row: any, source: keyof typeof LEGENDARIES_DATASET_BY_SOURCE) {
  const winRate = parsePercentish(row?.winrate ?? row?.win_rate ?? row?.deck_winrate);
  return {
    source,
    winrate: winRate ?? undefined,
    deckWinrate: winRate,
    pickRate: parsePercentish(row?.pick_rate ?? row?.pickRate),
    offerRate: parsePercentish(row?.offer_rate ?? row?.offerRate),
    totalGames: parseCount(row?.total_games ?? row?.totalGames ?? row?.games),
    statsContext: 'legendary',
  };
}

function buildTierlistCardStatsMap(tierlistData: any) {
  const stats = new Map<string, any>();
  for (const section of tierlistData?.sections ?? []) {
    for (const tier of section?.tiers ?? []) {
      for (const card of tier?.cards ?? []) {
        if (!card?.cardId) continue;
        const lookup = tierlistData?.cards?.[card.cardId] ?? {};
        stats.set(card.cardId, {
          ...card,
          ...lookup,
          tier: tier.tier,
          source: 'hsreplay',
          statsContext: 'tierlist',
          rarity: lookup.rarityDb ?? card.rarity,
          classKey: card.classKey ?? section.id,
          imageHa: lookup.imageHa ?? card.imageHa ?? '',
          imageRu: lookup.imageRu ?? card.imageRu ?? null,
        });
      }
    }
  }
  return stats;
}

function enrichLegendaryCardWithTierlistStats(card: any, tierStatsByCardId: Map<string, any>) {
  const stats = card?.cardId ? tierStatsByCardId.get(card.cardId) : null;
  if (!stats) return card;
  return {
    ...card,
    ...stats,
    name: card.name ?? stats.name,
    cost: card.cost ?? stats.cost,
    imageHa: card.imageHa || stats.imageHa || '',
    imageRu: card.imageRu ?? stats.imageRu ?? null,
  };
}

function enrichLegendariesWithTierlistStats(legendariesData: any, tierlistData: any) {
  const tierStatsByCardId = buildTierlistCardStatsMap(tierlistData);
  if (!tierStatsByCardId.size) return legendariesData;
  return {
    ...legendariesData,
    groups: (legendariesData?.groups ?? []).map((group: any) => ({
      ...group,
      keyCard: enrichLegendaryCardWithTierlistStats(group.keyCard, tierStatsByCardId),
      cards: (group.cards ?? []).map((card: any) => enrichLegendaryCardWithTierlistStats(card, tierStatsByCardId)),
    })),
  };
}

function normalizeLegendariesDataset(
  payload: any,
  source: keyof typeof LEGENDARIES_DATASET_BY_SOURCE,
  packageCardsByKey = new Map<string, any[]>(),
) {
  const structured = payload?.data?.structured ?? payload?.structured ?? {};
  const updatedAt = payload?.fetched_at ?? payload?.data?.fetched_at ?? structured?.last_update_date ?? null;

  if (source === 'firestone') {
    const rawCards = Array.isArray(structured?.cards) ? structured.cards : [];
    return {
      groups: rawCards
        .map((row: any) => {
          const winRate = parsePercentish(row?.win_rate ?? row?.deck_winrate);
          const classKey = normalizeArenaClassId(row?.cardClass ?? row?.classKey);
          return {
            keyCard: {
              ...normalizeLegendaryCard(row),
              ...normalizeLegendaryGroupStats(row, source),
              winrate: winRate ?? undefined,
              deckWinrate: winRate,
              classKey,
            },
            cards: packageCardsByKey.get(safeCardId(row)) ?? [],
            winRate,
            pickRate: parsePercentish(row?.pick_rate ?? row?.pickRate),
            offerRate: parsePercentish(row?.offer_rate ?? row?.offerRate),
            classKey,
          };
        })
        .filter((group: any) => group.keyCard.cardId),
      updatedAt,
      source: LEGENDARY_SOURCE_LABEL.firestone,
    };
  }

  const rawGroups = Array.isArray(structured?.groups) ? structured.groups : [];
  return {
    groups: rawGroups
      .map((row: any) => {
        const keyCardRow = row?.key_card ?? row?.legendary_card ?? row?.keyCard;
        const winRate = parsePercentish(row?.winrate ?? row?.win_rate ?? row?.deck_winrate);
        const classKey = normalizeArenaClassId(row?.class ?? keyCardRow?.cardClass ?? row?.classKey);
        const keyCard = {
          ...normalizeLegendaryCard(keyCardRow),
          ...normalizeLegendaryGroupStats(row, source),
          winrate: winRate ?? undefined,
          deckWinrate: winRate,
          classKey,
        };
        return {
          keyCard,
          cards: (Array.isArray(row?.cards) ? row.cards : []).map(normalizeLegendaryCard).filter((card: any) => card.cardId),
          winRate,
          pickRate: parsePercentish(row?.pick_rate ?? row?.pickRate),
          offerRate: parsePercentish(row?.offer_rate ?? row?.offerRate),
          classKey,
        };
      })
      .filter((group: any) => group.keyCard.cardId),
    updatedAt,
    source: LEGENDARY_SOURCE_LABEL.hsreplay,
  };
}

function buildLegendaryPackageMap(payload: any) {
  const hsReplayData = normalizeLegendariesDataset(payload, 'hsreplay');
  return new Map<string, any[]>(
    (hsReplayData.groups ?? []).map((group: any) => [group.keyCard.cardId, group.cards ?? []]),
  );
}

function hasLegendaryGroups(data: any): boolean {
  return Array.isArray(data?.groups) && data.groups.length > 0;
}

function compactHomeTopCards(tierlistData: any) {
  const seen = new Set<string>();
  const result: any[] = [];
  for (const tier of ['S', 'A']) {
    for (const section of tierlistData?.sections ?? []) {
      const tierGroup = (section?.tiers ?? []).find((group: any) => group?.tier === tier);
      if (!tierGroup) continue;
      const cards = [...(tierGroup.cards ?? [])].sort((a: any, b: any) => (b.score ?? 0) - (a.score ?? 0));
      for (const card of cards) {
        if (!card?.cardId || seen.has(card.cardId)) continue;
        seen.add(card.cardId);
        const lookup = tierlistData?.cards?.[card.cardId] ?? {};
        result.push({
          cardId: card.cardId,
          name: card.name,
          score: card.score,
          rarity: card.rarity,
          tier,
          classKey: card.classKey,
          cost: lookup.cost,
          imageRu: lookup.imageRu ?? null,
          imageHa: lookup.imageHa ?? '',
        });
        if (result.length >= 10) return result;
      }
    }
  }
  return result;
}

function compactHomeTopLegendaries(legendariesData: any) {
  return [...(legendariesData?.groups ?? [])]
    .filter((group: any) => group?.keyCard?.cardId && group.winRate !== null && group.winRate !== undefined)
    .sort((a: any, b: any) => (b.winRate ?? 0) - (a.winRate ?? 0))
    .slice(0, 8)
    .map((group: any) => ({
      cardId: group.keyCard.cardId,
      name: group.keyCard.name,
      cost: group.keyCard.cost,
      imageRu: group.keyCard.imageRu ?? null,
      imageHa: group.keyCard.imageHa ?? '',
      winRate: group.winRate,
      classKey: group.classKey,
    }));
}

type ApiDataCacheSource = 'memory' | 'redis' | 'origin';

interface ApiDataResult<T = any> {
  data: T;
  etag: string;
  cacheSource: ApiDataCacheSource;
}

async function getTierlistApiData(
  source: keyof typeof TIERLIST_DATASET_BY_SOURCE,
  now: number,
  bypassCache = false,
): Promise<ApiDataResult> {
  const cached = tierlistApiCache.get(source);
  if (!bypassCache && cached && cached.expiresAt > now) {
    return { data: cached.data, etag: cached.etag, cacheSource: 'memory' };
  }

  const redisKey = redisDataKey('tierlist', source);
  if (!bypassCache) {
    const redisCached = await redisGetCache(redisKey);
    if (redisCached) {
      tierlistApiCache.set(source, {
        data: redisCached.data,
        etag: redisCached.etag,
        expiresAt: now + TIERLIST_API_CACHE_MS,
      });
      return { data: redisCached.data, etag: redisCached.etag, cacheSource: 'redis' };
    }
  }

  const [payload] = await Promise.all([
    fetchDataset(TIERLIST_DATASET_BY_SOURCE[source]),
    ensureRuCardsData(),
  ]);
  const data = normalizeTierlistDataset(payload, source);
  const etag = makeExternalEtag('tierlist', source, data, now);
  tierlistApiCache.set(source, { data, etag, expiresAt: now + TIERLIST_API_CACHE_MS });
  void redisSetCache(redisKey, data, etag, REDIS_DATASET_TTL_SECONDS);
  return { data, etag, cacheSource: 'origin' };
}

async function getLegendariesApiData(
  source: keyof typeof LEGENDARIES_DATASET_BY_SOURCE,
  now: number,
  bypassCache = false,
): Promise<ApiDataResult> {
  const cached = legendariesApiCache.get(source);
  if (!bypassCache && cached && cached.expiresAt > now && hasLegendaryGroups(cached.data)) {
    return { data: cached.data, etag: cached.etag, cacheSource: 'memory' };
  }
  if (cached && !hasLegendaryGroups(cached.data)) legendariesApiCache.delete(source);

  const redisKey = redisDataKey('legendaries', source);
  if (!bypassCache) {
    const redisCached = await redisGetCache(redisKey);
    if (redisCached && hasLegendaryGroups(redisCached.data)) {
      legendariesApiCache.set(source, {
        data: redisCached.data,
        etag: redisCached.etag,
        expiresAt: now + EXTERNAL_DATASET_CACHE_MS,
      });
      return { data: redisCached.data, etag: redisCached.etag, cacheSource: 'redis' };
    }
  }

  const dataBase = source === 'firestone'
    ? await (async () => {
        const [firestonePayload, hsReplayPayload] = await Promise.all([
          fetchDataset(LEGENDARIES_DATASET_BY_SOURCE.firestone),
          fetchDataset(LEGENDARIES_DATASET_BY_SOURCE.hsreplay),
          ensureRuCardsData(),
        ]);
        return normalizeLegendariesDataset(firestonePayload, source, buildLegendaryPackageMap(hsReplayPayload));
      })()
    : normalizeLegendariesDataset((await Promise.all([
        fetchDataset(LEGENDARIES_DATASET_BY_SOURCE[source]),
        ensureRuCardsData(),
      ]))[0], source);
  if (!hasLegendaryGroups(dataBase)) {
    throw new Error(`Empty legendaries dataset: ${source}`);
  }

  let data = dataBase;
  try {
    const tierlistData = (await getTierlistApiData('hsreplay', now)).data;
    data = enrichLegendariesWithTierlistStats(dataBase, tierlistData);
  } catch (err: any) {
    console.warn('[api/legendaries] tierlist stats enrichment failed:', err?.message ?? err);
  }
  const etag = makeExternalEtag('legendaries-v2', source, data, now);
  legendariesApiCache.set(source, { data, etag, expiresAt: now + EXTERNAL_DATASET_CACHE_MS });
  void redisSetCache(redisKey, data, etag, REDIS_DATASET_TTL_SECONDS);
  return { data, etag, cacheSource: 'origin' };
}

async function loadTierlistForHomeSummary(now: number) {
  const source = 'hsreplay' as const;
  try {
    return (await getTierlistApiData(source, now)).data;
  } catch (err: any) {
    console.warn('[api/home/summary] tierlist source failed:', err?.message ?? err);
    return loadDataCached('hsreplay_tierlist.json')?.data
      ?? loadDataCached('tierlist.json')?.data
      ?? { sections: [], cards: {}, updatedAt: null, source: 'unavailable' };
  }
}

async function loadLegendariesForHomeSummary(now: number) {
  const source = 'hsreplay' as const;
  try {
    return (await getLegendariesApiData(source, now)).data;
  } catch (err: any) {
    console.warn('[api/home/summary] legendaries source failed:', err?.message ?? err);
    return loadDataCached('legendaries.json')?.data
      ?? { groups: [], updatedAt: null, source: 'unavailable' };
  }
}

function homeSummaryPercent(value: unknown): number | null {
  const parsed = Number(String(value ?? '').replace('%', '').replace(',', '.').trim());
  return Number.isFinite(parsed) ? parsed : null;
}

async function loadBattlegroundSpotlightForHomeSummary() {
  try {
    const response = await fetch('http://127.0.0.1:3108/api/bg/heroes', {
      signal: AbortSignal.timeout(12_000),
      headers: { 'User-Agent': 'ManacostArena/HomeSummary' },
    });
    if (!response.ok) throw new Error(`BG heroes HTTP ${response.status}`);
    const payload = await response.json();
    const heroes = Array.isArray(payload?.view?.heroes) ? payload.view.heroes : [];
    const candidates = heroes
      .map((hero: any) => ({
        hero,
        avgPlacement: homeSummaryPercent(hero?.avg_placement),
        pickRate: homeSummaryPercent(hero?.pick_rate),
        placementDistribution: Array.isArray(hero?.placement_distribution)
          ? hero.placement_distribution.map(homeSummaryPercent)
          : [],
      }))
      .filter((entry: any) => entry.avgPlacement !== null
        && entry.placementDistribution.length === 8
        && entry.placementDistribution.every((value: number | null) => value !== null))
      .sort((a: any, b: any) => a.avgPlacement - b.avgPlacement);
    const selected = candidates[0];
    if (!selected) return null;

    return {
      dbfId: Number(selected.hero.dbfId),
      name: String(selected.hero.hero || 'Герой Полей Сражений'),
      image: String(selected.hero.image || ''),
      tier: String(selected.hero.tier || '—'),
      avgPlacement: selected.avgPlacement,
      pickRate: selected.pickRate,
      placementDistribution: selected.placementDistribution,
      heroPower: {
        name: String(selected.hero?.hero_power?.card?.name || ''),
        text: String(selected.hero?.hero_power?.card?.text || ''),
        image: String(selected.hero?.hero_power?.card?.image || ''),
      },
      updatedAt: payload?.fetched_at ?? null,
      source: payload?.site || 'hsreplay',
    };
  } catch (err: any) {
    console.warn('[api/home/summary] battlegrounds spotlight failed:', err?.message ?? err);
    return null;
  }
}

async function buildHomeSummary(now: number) {
  const [winratesData, tierlistData, legendariesData, battlegroundSpotlight] = await Promise.all([
    fetchFreshestClassWinratesData().catch((err: any) => {
      console.warn('[api/home/summary] winrates source failed:', err?.message ?? err);
      return loadDataCached('winrates.json')?.data
        ?? { classes: [], updatedAt: null, source: 'unavailable' };
    }),
    loadTierlistForHomeSummary(now),
    loadLegendariesForHomeSummary(now),
    loadBattlegroundSpotlightForHomeSummary(),
  ]);

  const topClasses = [...(winratesData?.classes ?? [])]
    .sort((a: any, b: any) => (b.winrate ?? 0) - (a.winrate ?? 0))
    .slice(0, 3);
  const topCards = compactHomeTopCards(tierlistData);
  const topLegendaries = compactHomeTopLegendaries(legendariesData);

  return {
    topClasses,
    topCards,
    topLegendaries,
    battlegroundSpotlight,
    updatedAt: {
      winrates: winratesData?.updatedAt ?? null,
      tierlist: tierlistData?.updatedAt ?? null,
      legendaries: legendariesData?.updatedAt ?? null,
      battlegrounds: battlegroundSpotlight?.updatedAt ?? null,
    },
    sources: {
      winrates: winratesData?.source ?? 'unknown',
      tierlist: tierlistData?.source ?? 'unknown',
      legendaries: legendariesData?.source ?? 'unknown',
      battlegrounds: battlegroundSpotlight?.source ?? 'unavailable',
    },
  };
}

function makeHomeSummaryEtag(data: any, now: number) {
  const updatedValues = Object.values(data?.updatedAt ?? {})
    .map(value => typeof value === 'string' ? Date.parse(value) : NaN)
    .filter(Number.isFinite) as number[];
  const updatedToken = (updatedValues.length ? Math.max(...updatedValues) : now).toString(36);
  return `"home-summary-v2-${updatedToken}-${data.topClasses?.length ?? 0}-${data.topCards?.length ?? 0}-${data.topLegendaries?.length ?? 0}-${data.battlegroundSpotlight?.dbfId ?? 0}"`;
}

function datasetApiUrl(datasetId: string): string {
  if (/^https?:\/\//i.test(datasetId)) return datasetId;
  const path = datasetId.replace(/^\/+/, '');
  if (path.includes('/')) return `${DATASET_API_ORIGIN}/${path}`;
  return `${DATASET_API_BASE}/${path}`;
}

async function fetchDataset(datasetId: string) {
  const upstream = await fetch(datasetApiUrl(datasetId), {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ManacostArena/1.0)' },
  });
  if (!upstream.ok) throw new Error(`Upstream HTTP ${upstream.status}`);
  return upstream.json();
}

function parseStandardMatchupNumber(value: unknown): number | null {
  const raw = String(value ?? '').replace('%', '').replace(',', '.').trim();
  if (!raw || raw === '—' || raw === '-') return null;
  const number = Number(raw);
  return Number.isFinite(number) ? Math.round(number * 10) / 10 : null;
}

function normalizeStandardArchetypeKey(name: string): string {
  return name.toLowerCase().trim();
}

function buildFallbackStandardArchetypeTranslations(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(STANDARD_ARCHETYPE_RU).map(([eng, rus]) => [normalizeStandardArchetypeKey(eng), rus.trim()]),
  );
}

function parseDeckviewArchetypeCsv(text: string): Record<string, string> {
  const translations: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith(',,') || line.includes('Англ. названия')) continue;
    const parts = line.split(',');
    if (parts.length < 3) continue;
    const eng = parts[1]?.trim().replace(/^"+|"+$/g, '');
    const rus = parts[2]?.trim().replace(/^"+|"+$/g, '');
    if (!eng || !rus) continue;
    translations[normalizeStandardArchetypeKey(eng)] = rus.trim();
  }
  return translations;
}

function deckviewArchetypesEndpoint(): string {
  if (!DECKVIEW_ARCHETYPES_API_URL) return '';
  const base = DECKVIEW_ARCHETYPES_API_URL.replace(/\/$/, '');
  return base.endsWith('/public/archetypes') ? base : `${base}/public/archetypes`;
}

function normalizeDeckviewArchetypesPayload(payload: any): Record<string, string> {
  const source = Array.isArray(payload?.archetypes)
    ? payload.archetypes
    : Array.isArray(payload)
      ? payload
      : [];
  const translations: Record<string, string> = {};
  for (const item of source) {
    const eng = Array.isArray(item) ? item[0] : item?.eng ?? item?.english ?? item?.name;
    const rus = Array.isArray(item) ? item[1] : item?.rus ?? item?.russian ?? item?.label;
    if (!eng || !rus) continue;
    translations[normalizeStandardArchetypeKey(String(eng))] = String(rus).trim();
  }
  return translations;
}

async function fetchDeckviewApiArchetypes(): Promise<Record<string, string> | null> {
  const endpoint = deckviewArchetypesEndpoint();
  if (!endpoint) return null;
  const response = await fetch(endpoint, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ManacostArena/1.0)' },
    signal: AbortSignal.timeout(2500),
  });
  if (!response.ok) throw new Error(`Deckview archetypes API HTTP ${response.status}`);
  const translations = normalizeDeckviewArchetypesPayload(await response.json());
  return Object.keys(translations).length ? translations : null;
}

async function fetchDeckviewCsvArchetypes(): Promise<Record<string, string> | null> {
  const response = await fetch(DECKVIEW_ARCHETYPES_CSV_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ManacostArena/1.0)' },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`Deckview archetypes CSV HTTP ${response.status}`);
  const translations = parseDeckviewArchetypeCsv(await response.text());
  return Object.keys(translations).length ? translations : null;
}

async function loadStandardArchetypeTranslations(): Promise<StandardArchetypeTranslations> {
  const fallback = buildFallbackStandardArchetypeTranslations();
  try {
    const apiTranslations = await fetchDeckviewApiArchetypes();
    if (apiTranslations) return { map: { ...fallback, ...apiTranslations }, source: 'deckview-api' };
  } catch (err: any) {
    console.warn('[standard-matchups] deckview archetypes API unavailable:', err?.message ?? err);
  }

  try {
    const csvTranslations = await fetchDeckviewCsvArchetypes();
    if (csvTranslations) return { map: { ...fallback, ...csvTranslations }, source: 'deckview-csv' };
  } catch (err: any) {
    console.warn('[standard-matchups] deckview archetypes CSV unavailable:', err?.message ?? err);
  }

  return { map: fallback, source: 'fallback' };
}

async function getStandardArchetypeTranslations(now = Date.now()): Promise<StandardArchetypeTranslations> {
  if (standardArchetypeTranslationsCache && standardArchetypeTranslationsCache.expiresAt > now) {
    return standardArchetypeTranslationsCache;
  }
  if (!standardArchetypeTranslationsPromise) {
    standardArchetypeTranslationsPromise = loadStandardArchetypeTranslations()
      .then((result) => {
        standardArchetypeTranslationsCache = { ...result, expiresAt: Date.now() + STANDARD_ARCHETYPE_TRANSLATION_CACHE_MS };
        return result;
      })
      .finally(() => {
        standardArchetypeTranslationsPromise = null;
      });
  }
  return standardArchetypeTranslationsPromise;
}

function translateStandardArchetype(name: string, translations: Record<string, string>): string {
  const normalizedName = normalizeStandardArchetypeKey(name);
  const exact = translations[normalizedName];
  if (exact) return exact;

  let bestMatch = '';
  let bestLength = 0;
  for (const [eng, rus] of Object.entries(translations)) {
    if (normalizedName.includes(eng) && eng.length > bestLength) {
      bestMatch = rus;
      bestLength = eng.length;
    }
  }
  return bestMatch || name;
}

function transformHsguruMatchups(
  payload: any,
  rank: keyof typeof STANDARD_MATCHUPS_DATASET_BY_RANK,
  archetypeTranslations: StandardArchetypeTranslations,
) {
  const table = payload?.data?.tables?.[0] ?? payload?.tables?.[0] ?? null;
  const headers = Array.isArray(table?.headers) ? table.headers.map((item: unknown) => String(item ?? '').trim()) : [];
  const rows = Array.isArray(table?.rows) ? table.rows : [];
  const popularityRow = Array.isArray(rows[0]) ? rows[0] : [];
  const translations = archetypeTranslations.map;
  const columns: Array<{ name: string; label: string; popularity: string | null }> = [];
  for (let index = 2; index < headers.length; index += 1) {
    const name = headers[index];
    if (!name) continue;
    columns.push({
      name,
      label: translateStandardArchetype(name, translations),
      popularity: String(popularityRow[index - 1] ?? '').trim() || null,
    });
  }

  const dataRows: Array<{
    archetype: string;
    archetypeLabel: string;
    winrate: number | null;
    cells: Array<{ opponent: string; opponentLabel: string; winrate: number | null }>;
  }> = [];
  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    if (!Array.isArray(row)) continue;
    const archetype = String(row[1] ?? '').trim();
    if (!archetype) continue;
    dataRows.push({
      archetype,
      archetypeLabel: translateStandardArchetype(archetype, translations),
      winrate: parseStandardMatchupNumber(row[0]),
      cells: columns.map((column, columnIndex) => ({
        opponent: column.name,
        opponentLabel: column.label,
        winrate: parseStandardMatchupNumber(row[columnIndex + 2]),
      })),
    });
  }

  return {
    rank,
    rankLabel: STANDARD_MATCHUPS_RANK_LABEL[rank],
    source: 'hsguru',
    sourceId: STANDARD_MATCHUPS_DATASET_BY_RANK[rank],
    sourceUrl: payload?.data?.url ?? payload?.url ?? '',
    translationSource: archetypeTranslations.source,
    updatedAt: payload?.fetched_at ?? payload?.data?.fetched_at ?? null,
    columns,
    rows: dataRows,
  };
}

function makeExternalEtag(prefix: string, source: string, data: any, now: number): string {
  const rawUpdatedAt = data?.updatedAt;
  const updatedMs = rawUpdatedAt ? Date.parse(rawUpdatedAt) : NaN;
  const token = Number.isFinite(updatedMs) ? updatedMs.toString(36) : now.toString(36);
  const count = data?.sections?.reduce?.((sum: number, section: any) => sum + (section?.totalCards ?? 0), 0)
    ?? data?.groups?.length
    ?? 0;
  return `"${prefix}-${source}-${token}-${count}"`;
}

const app = express();
configureLoopbackProxyTrust(app);
app.disable('x-powered-by');
app.set('etag', false);
const httpMetrics = new HttpMetrics();
app.use(requestLoggingMiddleware(undefined, httpMetrics));
app.use((_req, _res, next) => {
  observeSnapshotPublication();
  next();
});

ensureAdminUploadDirs();
const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST;

app.use(compression({ level: 6, threshold: 1024 }));
app.use('/uploads/admin', express.static(ADMIN_UPLOAD_DIR, {
  immutable: true,
  maxAge: '30d',
}));

app.use((req, res, next) => {
  if (!APP_SECURITY_HEADERS_ENABLED) return next();
  res.header('X-Content-Type-Options', 'nosniff');
  res.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  const proto = String(req.headers['x-forwarded-proto'] ?? req.protocol);
  if (proto.includes('https')) res.header('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  next();
});

// Rate limiting: max 120 req/min per IP for data API
const apiLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много запросов. Попробуйте через минуту.' },
  skip: (req) => (
    req.path.startsWith('/card-image/')
    || (req.method === 'GET' && req.originalUrl.startsWith('/api/gallery/'))
    || req.ip === '127.0.0.1'
    || req.ip === '::1'
  ),
});
app.use('/api/', apiLimiter);

const authCodeRequestLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: rateLimitEmailKey,
  message: { error: 'Слишком много запросов кода. Попробуйте позже.' },
});

const authCodeVerifyLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: rateLimitEmailKey,
  message: { error: 'Слишком много попыток проверки кода. Попробуйте позже.' },
});

const authPasswordLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: rateLimitEmailKey,
  message: { error: 'Слишком много попыток входа. Попробуйте позже.' },
});

const scrapeLimiter = rateLimit({
  windowMs: 60 * 60_000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много запусков обновления данных. Попробуйте позже.' },
});

const newsletterSendLimiter = rateLimit({
  windowMs: 60 * 60_000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: newsletterAdminRateLimitKey,
  message: { error: 'Слишком много запусков рассылки. Попробуйте позже.' },
});

const newsletterTestLimiter = rateLimit({
  windowMs: 60 * 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: newsletterAdminRateLimitKey,
  message: { error: 'Слишком много тестовых писем. Попробуйте позже.' },
});

// CORS for same-origin production and local Vite dev server
app.use((req, res, next) => {
  const origin = String(req.headers.origin || '');
  if (origin) {
    try {
      if (corsOriginAllowed(origin, APP_URL, process.env.NODE_ENV !== 'production')) {
        res.header('Access-Control-Allow-Origin', origin);
        res.header('Vary', 'Origin');
      }
    } catch {
      // Invalid Origin headers are ignored and handled as non-CORS requests.
    }
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Request');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use('/api/', (req, res, next) => {
  if (cookieMutationCsrfAllowed(req)) return next();
  return res.status(403).json({ error: 'Запрос отклонён: обновите страницу' });
});

app.use(createUploadAuthorizationGuard({
  galleryAccessStatus: req => {
    const user = userAuth(req);
    if (!user) return 401;
    return isAdminUser(user) ? null : 403;
  },
  adminImageAllowed: req => Boolean(adminAuth(req) || contestAdminAuth(req)),
}));
app.use(createRouteAwareJsonParser({
  defaultLimit: process.env.API_JSON_BODY_LIMIT || '1mb',
  adminUploadMaxBytes: ADMIN_UPLOAD_MAX_BYTES,
  galleryUploadMaxBytes: GALLERY_UPLOAD_MAX_BYTES,
}));
app.use(express.urlencoded({ extended: false, limit: '16kb' }));

// ─── API Routes ───────────────────────────────────────────────────────────────

// 6 h cache (aligns with scrape schedule) — stale-while-revalidate keeps UX snappy
const CACHE_6H  = 'public, max-age=21600, stale-while-revalidate=3600';
const CACHE_1H  = 'public, max-age=3600,  stale-while-revalidate=600';
const CACHE_5M  = 'public, max-age=300, stale-while-revalidate=300';
const CACHE_TIERLIST = 'public, max-age=3600, stale-while-revalidate=3600';
const CACHE_TIERLIST_STALE = 'public, max-age=300, stale-while-revalidate=600';
const ARTICLE_COVER_ALLOWED_HOSTS = new Set([
  'hs-manacost.ru',
  'www.hs-manacost.ru',
  'manacost.ru',
  'www.manacost.ru',
  'kolodahearthstone.ru',
  'www.kolodahearthstone.ru',
]);
const ARTICLE_COVER_MAX_BYTES = 8 * 1024 * 1024;
const APP_SECURITY_HEADERS_ENABLED = process.env.APP_SECURITY_HEADERS === '1';

// ─── ETag helper ──────────────────────────────────────────────────────────────
function responseCacheHeader(res: express.Response, cacheHeader: string): string {
  if (!res.locals.subscriptionGuarded) return cacheHeader;
  return cacheHeader.replace(/^public\b/i, 'private');
}

function setPrivateNoStore(res: express.Response) {
  res.set('Cache-Control', 'no-store');
  res.vary('Cookie');
  res.vary('Authorization');
}

function sendCached(req: express.Request, res: express.Response, entry: CacheEntry, cacheHeader: string) {
  res.set('Cache-Control', responseCacheHeader(res, cacheHeader));
  res.set('ETag', entry.etag);
  if (req.headers['if-none-match'] === entry.etag) return res.status(304).end();
  res.json(entry.data);
}

function sendJsonCached(req: express.Request, res: express.Response, data: any, etag: string, cacheHeader: string, cacheSource?: string) {
  res.set('Cache-Control', responseCacheHeader(res, cacheHeader));
  res.set('ETag', etag);
  if (cacheSource) res.set('X-Data-Cache', cacheSource);
  if (req.headers['if-none-match'] === etag) return res.status(304).end();
  res.json(data);
}

function oldGuidesDatabase(): DatabaseSync {
  if (oldGuidesDb) return oldGuidesDb;
  oldGuidesDb = new DatabaseSync(OLD_GUIDES_DB_FILE, { readOnly: true });
  return oldGuidesDb;
}

function plainText(value: any): string {
  return String(value ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function excerptText(value: any, maxLength = 220): string {
  const text = plainText(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).replace(/\s+\S*$/, '')}…`;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, match => `\\${match}`);
}

function oldGuideImageUrl(value: any): string | null {
  const url = normalizeOldGuideAssetUrl(value);
  return url || null;
}

function oldGuideRowToListItem(row: any) {
  return {
    id: Number(row.id),
    slug: String(row.slug),
    title: String(row.title ?? ''),
    description: excerptText(row.description || row.body_text || row.body_html, 220),
    image: oldGuideImageUrl(row.image),
    publishedAt: row.published_iso || (row.published_at ? new Date(Number(row.published_at) * 1000).toISOString() : null),
    menuName: row.menu_name || null,
    menuCode: row.menu_code || null,
    kind: row.kind || null,
    kindSlug: row.kind_slug || null,
    oldUrl: normalizeOldGuideLink(row.old_url),
  };
}

app.get('/api/home/summary', async (req, res) => {
  const now = Date.now();
  if (homeSummaryApiCache && homeSummaryApiCache.expiresAt > now) {
    return sendJsonCached(req, res, homeSummaryApiCache.data, homeSummaryApiCache.etag, CACHE_5M, 'memory');
  }

  const redisKey = redisDataKey('home-summary-v2');
  const redisCached = await redisGetCache(redisKey);
  if (redisCached) {
    homeSummaryApiCache = {
      data: redisCached.data,
      etag: redisCached.etag,
      expiresAt: now + HOME_SUMMARY_CACHE_MS,
    };
    return sendJsonCached(req, res, redisCached.data, redisCached.etag, CACHE_5M, 'redis');
  }

  try {
    const data = await buildHomeSummary(now);
    const etag = makeHomeSummaryEtag(data, now);
    homeSummaryApiCache = { data, etag, expiresAt: now + HOME_SUMMARY_CACHE_MS };
    void redisSetCache(redisKey, data, etag, REDIS_HOME_SUMMARY_TTL_SECONDS);
    return sendJsonCached(req, res, data, etag, CACHE_5M, 'origin');
  } catch (err: any) {
    if (homeSummaryApiCache) {
      return sendJsonCached(req, res, {
        ...homeSummaryApiCache.data,
        warning: 'stale',
      }, homeSummaryApiCache.etag, 'public, max-age=60, stale-while-revalidate=300', 'memory-stale');
    }
    return res.status(502).json({ error: err?.message ?? 'Home summary unavailable' });
  }
});

app.get('/api/card-image/:cardId/:variant.webp', async (req, res) => {
  const cardId = normalizeCardImageId(req.params.cardId);
  const variant = req.params.variant === 'full' ? 'full' : req.params.variant === 'thumb' ? 'thumb' : null;

  if (!cardId || !variant) {
    return res.status(400).json({ error: 'Invalid card image request' });
  }

  try {
    const image = await ensureCardImage(cardId, variant);
    const stat = statSync(image.path);
    const etag = `"${stat.mtimeMs.toString(36)}-${stat.size.toString(36)}"`;

    res.set('Content-Type', 'image/webp');
    res.set('X-Card-Image-Source', image.source);
    res.set('Cache-Control', image.source === 'blizzard'
      ? 'public, max-age=2592000, immutable'
      : 'public, max-age=300, stale-while-revalidate=3600');
    res.set('ETag', etag);
    if (req.headers['if-none-match'] === etag) return res.status(304).end();

    return createReadStream(image.path).pipe(res);
  } catch (err: any) {
    return res.status(502).json({ error: err?.message ?? 'Card image unavailable' });
  }
});

app.get('/api/winrates', requireArenaAccess, async (req, res) => {
  const source = (req.query.source as string) ?? 'hsreplay';
  const now = Date.now();
  const cached = winratesApiCache.get(source);
  if (cached && cached.expiresAt > now) {
    return sendJsonCached(req, res, cached.data, cached.etag, CACHE_5M, 'memory');
  }
  const redisKey = redisDataKey('winrates', source);
  const redisCached = await redisGetCache<any>(redisKey);
  if (redisCached) {
    winratesApiCache.set(source, { data: redisCached.data, etag: redisCached.etag, expiresAt: now + CLASS_WINRATES_CACHE_MS });
    return sendJsonCached(req, res, redisCached.data, redisCached.etag, CACHE_5M, 'redis');
  }
  const snapshotEntry = loadDataCached('winrates.json');
  const snapshotData = snapshotEntry?.data && Array.isArray(snapshotEntry.data.classes)
    ? snapshotEntry.data
    : null;

  // Firestone: proxy live zerotoheroes.com API
  if (source === 'firestone') {
    const CLASS_INFO: Record<string, { id: string; name: string; color: string; textDark?: boolean }> = {
      deathknight: { id: 'death-knight', name: 'Рыцарь смерти',     color: '#1f252d' },
      paladin:     { id: 'paladin',      name: 'Паладин',            color: '#a88a45' },
      shaman:      { id: 'shaman',       name: 'Шаман',              color: '#2a2e6b' },
      hunter:      { id: 'hunter',       name: 'Охотник',            color: '#1d5921' },
      mage:        { id: 'mage',         name: 'Маг',                color: '#2b5c85' },
      rogue:       { id: 'rogue',        name: 'Разбойник',          color: '#333333' },
      warlock:     { id: 'warlock',      name: 'Чернокнижник',       color: '#5c265c' },
      druid:       { id: 'druid',        name: 'Друид',              color: '#704a16' },
      warrior:     { id: 'warrior',      name: 'Воин',               color: '#7a1e1e' },
      priest:      { id: 'priest',       name: 'Жрец',               color: '#d1d1d1', textDark: true },
      demonhunter: { id: 'demon-hunter', name: 'Охотник на демонов', color: '#224722' },
    };
    try {
      const upstream = await fetch(
        'https://static.zerotoheroes.com/api/arena/stats/classes/arena/last-patch/overview.gz.json',
        { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ManacostArena/1.0)' } },
      );
      if (!upstream.ok) throw new Error(`HTTP ${upstream.status}`);
      const raw = await upstream.json() as any;
      const classes = ((raw.stats ?? []) as any[])
        .map((s: any) => {
          const key  = String(s.playerClass ?? '').toLowerCase().replace(/\s+/g, '');
          const info = CLASS_INFO[key];
          if (!info || !s.totalGames) return null;
          const winrate = Math.round((s.totalsWins / s.totalGames) * 1000) / 10;
          return { ...info, winrate, games: s.totalGames };
        })
        .filter(Boolean)
        .sort((a: any, b: any) => b.winrate - a.winrate);
      const data = { classes, updatedAt: raw.lastUpdated ?? null, source: 'firestoneapp.com' };
      const updatedToken = data.updatedAt ? Date.parse(data.updatedAt).toString(36) : now.toString(36);
      const etag = `"class-winrates-firestone-${updatedToken}-${classes.length}"`;
      winratesApiCache.set(source, { data, etag, expiresAt: now + CLASS_WINRATES_CACHE_MS });
      void redisSetCache(redisKey, data, etag, REDIS_DATASET_TTL_SECONDS);
      return sendJsonCached(req, res, data, etag, CACHE_5M, 'origin');
    } catch {
      // fallback to snapshot on error
    }
  }

  // HSReplay (default): use the same live Manacost API dataset as class matchups.
  try {
    const data = await fetchClassWinratesData();
    const liveTime = data.updatedAt ? Date.parse(data.updatedAt) : 0;
    const snapshotTime = snapshotData?.updatedAt ? Date.parse(snapshotData.updatedAt) : 0;
    if (snapshotData && Number.isFinite(snapshotTime) && snapshotTime > liveTime) {
      const localData = { ...snapshotData, source: snapshotData.source ?? 'cached' };
      const updatedToken = snapshotData.updatedAt ? new Date(snapshotData.updatedAt).getTime().toString(36) : now.toString(36);
      const etag = `"class-winrates-local-${updatedToken}-${snapshotData.classes.length}"`;
      winratesApiCache.set(source, { data: localData, etag, expiresAt: now + CLASS_WINRATES_CACHE_MS });
      void redisSetCache(redisKey, localData, etag, REDIS_DATASET_TTL_SECONDS);
      return sendJsonCached(req, res, localData, etag, CACHE_5M, 'local-fresher-than-upstream');
    }
    const updatedToken = data.updatedAt ? new Date(data.updatedAt).getTime().toString(36) : Date.now().toString(36);
    const etag = `"class-winrates-${updatedToken}-${data.classes.length}"`;
    winratesApiCache.set(source, { data, etag, expiresAt: now + CLASS_WINRATES_CACHE_MS });
    void redisSetCache(redisKey, data, etag, REDIS_DATASET_TTL_SECONDS);
    return sendJsonCached(req, res, data, etag, CACHE_5M, 'origin');
  } catch (err: any) {
    console.error('[api/winrates] HSReplay arena dataset failed:', err?.message ?? err);
  }

  // Fallback to the last scraper snapshot if the live dataset is unavailable.
  if (!snapshotEntry) return res.status(404).json({ error: 'No data available' });
  return sendCached(req, res, { ...snapshotEntry, data: { ...snapshotEntry.data, source: 'cached' } }, 'public, max-age=300, stale-while-revalidate=600');
});

app.get('/api/class-matchups', requireArenaAccess, async (req, res) => {
  const now = Date.now();
  if (classMatchupsCache && classMatchupsCache.expiresAt > now) {
    return sendJsonCached(req, res, classMatchupsCache.data, classMatchupsCache.etag, CACHE_1H, 'memory');
  }
  const redisKey = redisDataKey('class-matchups');
  const redisCached = await redisGetCache<any>(redisKey);
  if (redisCached) {
    classMatchupsCache = { data: redisCached.data, etag: redisCached.etag, expiresAt: now + CLASS_MATCHUPS_CACHE_MS };
    return sendJsonCached(req, res, redisCached.data, redisCached.etag, CACHE_1H, 'redis');
  }

  try {
    const data = await fetchClassMatchupsData();
    const updatedToken = data.updatedAt ? new Date(data.updatedAt).getTime().toString(36) : now.toString(36);
    const etag = `"class-matchups-${updatedToken}-${data.matchups.length}"`;
    classMatchupsCache = { data, etag, expiresAt: now + CLASS_MATCHUPS_CACHE_MS };
    void redisSetCache(redisKey, data, etag, REDIS_DATASET_TTL_SECONDS);
    return sendJsonCached(req, res, data, etag, CACHE_1H, 'origin');
  } catch (err: any) {
    if (classMatchupsCache) {
      return sendJsonCached(req, res, {
        ...classMatchupsCache.data,
        warning: 'stale',
      }, classMatchupsCache.etag, 'public, max-age=300, stale-while-revalidate=600');
    }
    return res.status(502).json({ error: err?.message ?? 'Class matchups unavailable' });
  }
});

app.get('/api/standard/matchups', requireStandardAccess, async (req, res) => {
  const rank = req.query.rank === 'diamond' ? 'diamond' : 'legend';
  const now = Date.now();
  const cached = standardMatchupsApiCache.get(rank);

  if (cached && cached.expiresAt > now) {
    return sendJsonCached(req, res, cached.data, cached.etag, CACHE_1H, 'memory');
  }
  const redisKey = redisDataKey('standard-matchups', rank);
  const redisCached = await redisGetCache<any>(redisKey);
  if (redisCached) {
    standardMatchupsApiCache.set(rank, { data: redisCached.data, etag: redisCached.etag, expiresAt: now + EXTERNAL_DATASET_CACHE_MS });
    return sendJsonCached(req, res, redisCached.data, redisCached.etag, CACHE_1H, 'redis');
  }

  try {
    const [payload, archetypeTranslations] = await Promise.all([
      fetchDataset(STANDARD_MATCHUPS_DATASET_BY_RANK[rank]),
      getStandardArchetypeTranslations(now),
    ]);
    const data = transformHsguruMatchups(payload, rank, archetypeTranslations);
    const updatedMs = data.updatedAt ? Date.parse(data.updatedAt) : NaN;
    const updatedToken = Number.isFinite(updatedMs) ? updatedMs.toString(36) : now.toString(36);
    const etag = `"standard-matchups-v4-${rank}-${updatedToken}-${data.rows.length}-${data.columns.length}-${data.translationSource}"`;
    standardMatchupsApiCache.set(rank, { data, etag, expiresAt: now + EXTERNAL_DATASET_CACHE_MS });
    void redisSetCache(redisKey, data, etag, REDIS_DATASET_TTL_SECONDS);
    return sendJsonCached(req, res, data, etag, CACHE_1H, 'origin');
  } catch (err: any) {
    if (cached) {
      return sendJsonCached(req, res, { ...cached.data, warning: 'stale' }, cached.etag, CACHE_1H, 'memory-stale');
    }
    return res.status(502).json({ error: err?.message ?? 'Standard matchups unavailable' });
  }
});

app.get('/api/tierlist', requireArenaAccess, async (req, res) => {
  const source = normalizeSource(req.query.source as string | undefined, TIERLIST_DATASET_BY_SOURCE, 'hsreplay');
  const now = Date.now();
  const cached = tierlistApiCache.get(source);
  const bypassCache = req.query.t !== undefined
    || req.query.bust === '1';
  if (!bypassCache && cached && cached.expiresAt > now) {
    return sendJsonCached(req, res, withClassPositions(cached.data), cached.etag, CACHE_TIERLIST, 'memory');
  }

  try {
    const result = await getTierlistApiData(source, now, bypassCache);
    return sendJsonCached(req, res, withClassPositions(result.data), result.etag, CACHE_TIERLIST, result.cacheSource);
  } catch (err: any) {
    if (cached) {
      return sendJsonCached(req, res, withClassPositions({
        ...cached.data,
        warning: 'stale',
      }), cached.etag, CACHE_TIERLIST_STALE, 'memory-stale');
    }

    const fallbackFilename = source === 'hsreplay' ? 'hsreplay_tierlist.json' : source === 'heartharena' ? 'tierlist.json' : null;
    const fallback = fallbackFilename ? loadDataCached(fallbackFilename) : null;
    if (fallback) {
      return sendCached(req, res, {
        ...fallback,
        data: withClassPositions({
          ...fallback.data,
          warning: 'fallback',
        }),
      }, CACHE_6H);
    }

    return res.status(502).json({ error: err?.message ?? 'Tierlist unavailable' });
  }
});

app.get('/api/legendaries', requireArenaAccess, async (req, res) => {
  const source = normalizeSource(req.query.source as string | undefined, LEGENDARIES_DATASET_BY_SOURCE, 'hsreplay');
  const now = Date.now();
  const cached = legendariesApiCache.get(source);
  const bypassCache = req.query.t !== undefined
    || req.query.bust === '1';
  if (!bypassCache && cached && cached.expiresAt > now) {
    return sendJsonCached(req, res, cached.data, cached.etag, CACHE_1H, 'memory');
  }

  try {
    const result = await getLegendariesApiData(source, now, bypassCache);
    return sendJsonCached(req, res, result.data, result.etag, CACHE_1H, result.cacheSource);
  } catch (err: any) {
    if (cached) {
      return sendJsonCached(req, res, {
        ...cached.data,
        warning: 'stale',
      }, cached.etag, 'public, max-age=300, stale-while-revalidate=600', 'memory-stale');
    }

    if (source === 'hsreplay') {
      const fallback = loadDataCached('legendaries.json');
      if (fallback) return sendCached(req, res, fallback, CACHE_6H);
    }

    return res.status(502).json({ error: err?.message ?? 'Legendaries unavailable' });
  }
});

app.get('/api/decks', requireArenaAccess, async (req, res) => {
  const page = Math.max(1, parseCount(req.query.page) ?? 1);
  const pageSize = Math.min(20, Math.max(1, parseCount(req.query.pageSize) ?? 10));
  const className = String(req.query.class ?? '').trim();
  const now = Date.now();
  if (arenaDecksCache && arenaDecksCache.expiresAt > now) {
    const pageData = shapeArenaDecksPage(arenaDecksCache.data, page, pageSize, className);
    const etag = `"${arenaDecksCache.etag.replace(/^"|"$/g, '')}-p${pageData.page}-s${pageSize}-c${etagToken(className)}"`;
    return sendJsonCached(req, res, pageData, etag, CACHE_1H);
  }

  try {
    const data = await fetchArenaDecksData(ARENA_DECKS_MAX_LIMIT);
    const updatedToken = data.updatedAt ? Date.parse(data.updatedAt).toString(36) : now.toString(36);
    const etag = `"arena-decks-${updatedToken}-${data.decks.length}-${data.totalDecks ?? 0}"`;
    arenaDecksCache = { data, etag, expiresAt: now + ARENA_DECKS_CACHE_MS };
    const pageData = shapeArenaDecksPage(data, page, pageSize, className);
    const pageEtag = `"${etag.replace(/^"|"$/g, '')}-p${pageData.page}-s${pageSize}-c${etagToken(className)}"`;
    return sendJsonCached(req, res, pageData, pageEtag, CACHE_1H);
  } catch (err: any) {
    if (arenaDecksCache) {
      const pageData = shapeArenaDecksPage({ ...arenaDecksCache.data, warning: 'stale' }, page, pageSize, className);
      const etag = `"${arenaDecksCache.etag.replace(/^"|"$/g, '')}-p${pageData.page}-s${pageSize}-c${etagToken(className)}-stale"`;
      return sendJsonCached(req, res, pageData, etag, 'public, max-age=300, stale-while-revalidate=600');
    }

    return res.status(502).json({ error: err?.message ?? 'Arena decks unavailable' });
  }
});

function articleDateMs(article: any): number {
  const parsed = Date.parse(String(article?.date ?? ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

type ArticleMode = 'arena' | 'battlegrounds' | 'general';

function articleMode(article: Record<string, any>): ArticleMode {
  const explicitMode = String(article.mode || '').trim().toLowerCase();
  if (explicitMode === 'arena' || explicitMode === 'battlegrounds' || explicitMode === 'general') {
    return explicitMode;
  }
  const haystack = [
    article.tag,
    article.title,
    article.excerpt,
    article.url,
  ].map(value => normalizeBoostyLevelName(String(value || ''))).join(' ');
  if (/(поля сражений|полей сражений|battleground|battle grounds|tavern|таверна|боб|bob|бг)/.test(haystack)) {
    return 'battlegrounds';
  }
  if (/(арена|arena)/.test(haystack)) return 'arena';
  return 'general';
}

function articleAccessEntitlement(mode: ArticleMode): SubscriptionEntitlementKey | null {
  if (mode === 'arena') return 'arenaArticles';
  if (mode === 'battlegrounds') return 'battlegroundsArticles';
  return null;
}

function normalizeArticleModeInput(value: unknown, fallbackArticle: Record<string, any>): ArticleMode {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'arena' || raw === 'battlegrounds' || raw === 'general') return raw;
  return articleMode(fallbackArticle);
}

function subscriptionAllowsArticle(subscription: SubscriptionStatus, article: Record<string, any>): boolean {
  const entitlement = articleAccessEntitlement(articleMode(article));
  return entitlement ? Boolean(subscription.entitlements?.[entitlement]) : subscription.hasAccess;
}

function findArticleById(articleId: string): Record<string, any> | null {
  const existing: any = loadData('articles.json') ?? { articles: [] };
  if (!Array.isArray(existing.articles)) return null;
  return existing.articles.find((article: any) => String(article.id) === articleId) ?? null;
}

function findArticleByUrlOrTitle(rawUrl: string, title: string): Record<string, any> | null {
  const existing: any = loadData('articles.json') ?? { articles: [] };
  if (!Array.isArray(existing.articles)) return null;
  const targetSlug = articleSlug(rawUrl);
  const normalizedTitle = normalizeBoostyLevelName(title);
  return existing.articles.find((article: any) => {
    const articleUrl = String(article.url || '');
    const articleTitle = normalizeBoostyLevelName(String(article.title || ''));
    return (targetSlug && articleSlug(articleUrl) === targetSlug)
      || (normalizedTitle && articleTitle === normalizedTitle);
  }) ?? null;
}

function shapeArticlesData(raw: any, userId = '') {
  const articles = Array.isArray(raw?.articles)
    ? [...raw.articles].sort((a, b) => articleDateMs(b) - articleDateMs(a) || String(b.id ?? '').localeCompare(String(a.id ?? '')))
    : [];
  const ids = articles.map(article => String(article.id ?? '')).filter(Boolean);
  const votesByArticle = new Map<string, { likes: number; dislikes: number }>();
  const userVotes = new Map<string, 'like' | 'dislike'>();
  if (ids.length) {
    const placeholders = ids.map(() => '?').join(',');
    dbAll<any>(`
      SELECT article_id,
             SUM(CASE WHEN vote = 1 THEN 1 ELSE 0 END) AS likes,
             SUM(CASE WHEN vote = -1 THEN 1 ELSE 0 END) AS dislikes
      FROM article_votes
      WHERE article_id IN (${placeholders})
      GROUP BY article_id
    `, ...ids).forEach(row => {
      votesByArticle.set(String(row.article_id), {
        likes: Number(row.likes || 0),
        dislikes: Number(row.dislikes || 0),
      });
    });
    if (userId) {
      dbAll<any>(`
        SELECT article_id, vote
        FROM article_votes
        WHERE user_id = ? AND article_id IN (${placeholders})
      `, userId, ...ids).forEach(row => {
        userVotes.set(String(row.article_id), Number(row.vote) === 1 ? 'like' : 'dislike');
      });
    }
  }
  return {
    ...raw,
    updatedAt: raw?.updatedAt ?? null,
    articles: articles.map(article => {
      const id = String(article.id ?? '');
      const votes = votesByArticle.get(id) ?? { likes: 0, dislikes: 0 };
      return {
        ...article,
        id,
        title: String(article.title ?? ''),
        date: String(article.date ?? ''),
        image: String(article.image ?? ''),
        excerpt: String(article.excerpt ?? ''),
        tag: String(article.tag ?? ''),
        mode: articleMode(article),
        url: String(article.url ?? '#'),
        likes: votes.likes,
        dislikes: votes.dislikes,
        userVote: userVotes.get(id) ?? null,
      };
    }),
  };
}

function articleExists(articleId: string): boolean {
  return Boolean(findArticleById(articleId));
}

app.use('/api', createGalleryRouter({
  dataDir: DATA_DIR,
  uploadDir: GALLERY_UPLOAD_DIR,
  uploadMaxBytes: GALLERY_UPLOAD_MAX_BYTES,
  uploadMaxPixels: GALLERY_UPLOAD_MAX_PIXELS,
  previewMaxWidth: GALLERY_PREVIEW_MAX_WIDTH,
  thumbMaxWidth: GALLERY_THUMB_MAX_WIDTH,
  loadData,
  loadDataCached,
  invalidateDataCache: filename => dataCache.delete(filename),
  sendJsonCached,
  publicCacheHeader: CACHE_5M,
  adminGuard: adminIdGuard,
  adminAuth,
  setPrivateNoStore,
}));

app.get('/api/articles', (req, res) => {
  const entry = loadDataCached('articles.json');
  if (!entry) return res.status(404).json({ error: 'No data' });
  const user = userAuth(req);
  const data = shapeArticlesData(entry.data, user?.id ?? '');
  if (user) {
    setPrivateNoStore(res);
    return res.json(data);
  }
  const etag = `"${entry.etag.replace(/^"|"$/g, '')}-articles-votes"`;
  return sendJsonCached(req, res, data, etag, CACHE_5M);
});

app.post('/api/articles/:articleId/vote', async (req, res) => {
  setPrivateNoStore(res);
  const user = userAuth(req);
  if (!user) return res.status(401).json({ error: 'Требуется вход в профиль Манакоста' });
  const subscription = await refreshSubscriptionForUser(user, false);
  const articleId = normalizeOptionalText(req.params.articleId, 160);
  const article = articleId ? findArticleById(articleId) : null;
  if (!articleId || !article) return res.status(404).json({ error: 'Статья не найдена' });
  if (!isAdminUser(user) && !subscriptionAllowsArticle(subscription, article)) {
    return res.status(403).json({ error: 'Голосовать за эту статью могут только подписчики подходящего режима', subscription });
  }
  const voteValue = String(req.body?.vote ?? '').toLowerCase();
  if (voteValue !== 'like' && voteValue !== 'dislike') return res.status(400).json({ error: 'Некорректный голос' });
  const numericVote = voteValue === 'like' ? 1 : -1;
  const existing = dbGet<{ vote: number }>('SELECT vote FROM article_votes WHERE article_id = ? AND user_id = ?', articleId, user.id);
  const nowIso = new Date().toISOString();
  if (existing && Number(existing.vote) === numericVote) {
    dbRun('DELETE FROM article_votes WHERE article_id = ? AND user_id = ?', articleId, user.id);
  } else {
    dbRun(`
      INSERT INTO article_votes (article_id, user_id, vote, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(article_id, user_id) DO UPDATE SET vote = excluded.vote, updated_at = excluded.updated_at
    `, articleId, user.id, numericVote, existing ? nowIso : nowIso, nowIso);
  }
  const counts = dbGet<any>(`
    SELECT
      SUM(CASE WHEN vote = 1 THEN 1 ELSE 0 END) AS likes,
      SUM(CASE WHEN vote = -1 THEN 1 ELSE 0 END) AS dislikes
    FROM article_votes
    WHERE article_id = ?
  `, articleId);
  const next = dbGet<{ vote: number }>('SELECT vote FROM article_votes WHERE article_id = ? AND user_id = ?', articleId, user.id);
  res.json({
    success: true,
    articleId,
    likes: Number(counts?.likes || 0),
    dislikes: Number(counts?.dislikes || 0),
    userVote: next ? (Number(next.vote) === 1 ? 'like' : 'dislike') : null,
  });
});

app.get('/api/guides-archive', requireGuidesArchiveAccess, (req, res) => {
  res.set('Cache-Control', CACHE_1H);
  try {
    const database = oldGuidesDatabase();
    const page = Math.max(1, Math.min(9999, Number(req.query.page || 1) || 1));
    const limit = Math.max(6, Math.min(48, Number(req.query.limit || 18) || 18));
    const offset = (page - 1) * limit;
    const search = String(req.query.q ?? '').trim();
    const kind = String(req.query.kind ?? '').trim();
    const menu = String(req.query.menu ?? '').trim();
    const where: string[] = ['1=1'];
    const params: any[] = [];

    if (search) {
      const like = `%${escapeLike(search)}%`;
      where.push('(title LIKE ? ESCAPE \'\\\' OR description LIKE ? ESCAPE \'\\\' OR keywords LIKE ? ESCAPE \'\\\' OR body_text LIKE ? ESCAPE \'\\\')');
      params.push(like, like, like, like);
    }
    if (kind) {
      where.push('kind_slug = ?');
      params.push(kind);
    }
    if (menu) {
      where.push('menu_code = ?');
      params.push(menu);
    }

    const whereSql = where.join(' AND ');
    const totalRow = database.prepare(`SELECT COUNT(*) AS total FROM guides WHERE ${whereSql}`).get(...params) as { total?: number } | undefined;
    const rows = database.prepare(`
      SELECT id, slug, old_url, published_at, published_iso, title, description, image, menu_name, menu_code, kind, kind_slug, body_text, body_html
      FROM guides
      WHERE ${whereSql}
      ORDER BY published_at DESC, id DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset) as any[];
    const kindRows = database.prepare(`
      SELECT COALESCE(kind_slug, 'other') AS slug, COALESCE(kind, 'Другое') AS label, COUNT(*) AS count
      FROM guides
      GROUP BY kind_slug, kind
      ORDER BY count DESC, label ASC
    `).all() as any[];
    const menuRows = database.prepare(`
      SELECT COALESCE(menu_code, '') AS slug, COALESCE(menu_name, 'Без раздела') AS label, COUNT(*) AS count
      FROM guides
      WHERE menu_name IS NOT NULL AND TRIM(menu_name) <> ''
      GROUP BY menu_code, menu_name
      ORDER BY count DESC, label ASC
      LIMIT 40
    `).all() as any[];

    return res.json({
      page,
      limit,
      total: Number(totalRow?.total ?? 0),
      totalPages: Math.max(1, Math.ceil(Number(totalRow?.total ?? 0) / limit)),
      items: rows.map(oldGuideRowToListItem),
      filters: {
        kinds: kindRows.map(row => ({ slug: String(row.slug || 'other'), label: String(row.label || 'Другое'), count: Number(row.count || 0) })),
        menus: menuRows.map(row => ({ slug: String(row.slug || ''), label: String(row.label || 'Без раздела'), count: Number(row.count || 0) })),
      },
    });
  } catch (err: any) {
    console.error('[guides-archive] list failed:', err?.message ?? err);
    return res.status(500).json({ error: 'Не удалось загрузить архив гайдов' });
  }
});

app.get('/api/guides-archive/:slug', requireGuidesArchiveAccess, (req, res) => {
  res.set('Cache-Control', CACHE_1H);
  try {
    const database = oldGuidesDatabase();
    const key = String(req.params.slug ?? '').trim();
    const row = database.prepare(`
      SELECT id, slug, old_url, published_at, published_iso, title, description, keywords, image, menu_name, menu_code, kind, kind_slug,
             short_html, free_html, body_html, body_text, reply_count
      FROM guides
      WHERE slug = ? OR CAST(id AS TEXT) = ?
      LIMIT 1
    `).get(key, key) as any | undefined;

    if (!row) return res.status(404).json({ error: 'Гайд не найден' });

    const htmlSource = row.body_html || row.free_html || row.short_html || '';
    return res.json({
      ...oldGuideRowToListItem(row),
      keywords: row.keywords || null,
      replyCount: Number(row.reply_count || 0),
      contentHtml: sanitizeOldGuideHtml(htmlSource),
      fallbackText: htmlSource ? '' : plainText(row.body_text),
      sourceUrl: normalizeOldGuideLink(row.old_url),
    });
  } catch (err: any) {
    console.error('[guides-archive] detail failed:', err?.message ?? err);
    return res.status(500).json({ error: 'Не удалось загрузить гайд' });
  }
});

app.post('/api/articles/access-link', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const user = userAuth(req);
  if (!user) return res.status(401).json({ error: 'Требуется вход в профиль Манакоста' });

  const rawUrl = String(req.body?.url ?? '').trim();
  const title = String(req.body?.title ?? '').trim();
  const target = parseHttpUrl(rawUrl);
  if (!target) return res.status(400).json({ error: 'Некорректная ссылка на статью' });

  if (!isKhaVipArticleUrl(target.href)) {
    return res.json({ url: target.href, passthrough: true });
  }

  try {
    const subscription = await refreshSubscriptionForUser(user, false);
    const article = findArticleByUrlOrTitle(target.href, title) ?? {
      title,
      url: target.href,
    };
    if (!isAdminUser(user) && !subscriptionAllowsArticle(subscription, article)) {
      return res.status(403).json({
        error: 'Для доступа к VIP-статье нужна подписка подходящего режима',
        subscription,
      });
    }

    const locker = await findKhaVipLockerForArticle(target.href, title);
    if (!locker) {
      return res.status(404).json({ error: 'VIP-материал не найден в каталоге Koloda' });
    }

    const issued = await issueKhaVipArticleLink(locker, user);
    return res.json({
      url: String(issued.url),
      target: String(issued.target || locker.url),
      expiresAt: issued.expires_at ?? null,
      ttl: Number(issued.ttl || 900),
      source: 'koloda-vip',
      article: {
        postId: locker.post_id,
        title: locker.title,
        url: locker.url,
      },
    });
  } catch (err: any) {
    console.error('[articles] access-link failed:', err?.message ?? err);
    return res.status(502).json({ error: err?.message ?? 'Не удалось выдать доступ к статье' });
  }
});

app.get('/api/article-cover', async (req, res) => {
  const rawUrl = String(req.query.url ?? '').trim();
  let target: URL;
  try {
    target = new URL(rawUrl);
  } catch {
    return res.status(400).json({ error: 'Некорректный URL обложки' });
  }

  if (!['https:', 'http:'].includes(target.protocol) || !ARTICLE_COVER_ALLOWED_HOSTS.has(target.hostname.toLowerCase())) {
    return res.status(400).json({ error: 'Домен обложки не разрешён' });
  }

  try {
    const upstream = await fetch(target.href, {
      headers: {
        Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*,*/*;q=0.8',
        'User-Agent': 'HS-Arena article cover proxy/1.0',
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!upstream.ok) return res.status(upstream.status).json({ error: 'Обложка недоступна' });

    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    if (!contentType.toLowerCase().startsWith('image/')) {
      return res.status(415).json({ error: 'URL не ведёт на изображение' });
    }

    const contentLength = Number(upstream.headers.get('content-length') || 0);
    if (contentLength > ARTICLE_COVER_MAX_BYTES) {
      return res.status(413).json({ error: 'Обложка слишком большая' });
    }

    const buffer = Buffer.from(await upstream.arrayBuffer());
    if (buffer.byteLength > ARTICLE_COVER_MAX_BYTES) {
      return res.status(413).json({ error: 'Обложка слишком большая' });
    }

    const etag = `"article-cover-${createHash('sha1').update(target.href).update(String(buffer.byteLength)).digest('hex')}"`;
    res.set('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
    res.set('ETag', etag);
    res.set('Content-Type', contentType);
    res.set('X-Content-Type-Options', 'nosniff');
    if (req.headers['if-none-match'] === etag) return res.status(304).end();
    return res.send(buffer);
  } catch (err: any) {
    return res.status(502).json({ error: err?.message ?? 'Не удалось загрузить обложку' });
  }
});

async function proxyLegacyBattlegroundEndpoint(req: express.Request, res: express.Response, upstreamPath: string) {
  try {
    const upstreamUrl = new URL(upstreamPath, 'http://127.0.0.1:3107');
    for (const [key, value] of Object.entries(req.query)) {
      if (Array.isArray(value)) {
        value.forEach(item => upstreamUrl.searchParams.append(key, String(item)));
      } else if (value !== undefined) {
        upstreamUrl.searchParams.set(key, String(value));
      }
    }

    const cacheKey = `legacy:${upstreamUrl.href}`;
    const redisKey = redisHashedDataKey('bg-legacy-proxy', cacheKey);
    const cached = battlegroundAppProxyCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      res.status(cached.status);
      res.setHeader('Content-Type', cached.contentType);
      res.setHeader('Cache-Control', cached.contentType.includes('image/')
        ? BG_IMAGE_CACHE_CONTROL
        : BG_JSON_CACHE_CONTROL);
      res.setHeader('ETag', cached.etag);
      res.setHeader('X-BG-Legacy-Cache', 'HIT');
      if (req.headers['if-none-match'] === cached.etag) return res.status(304).end();
      return res.send(cached.body);
    }
    const redisCached = await redisGetProxyCache(redisKey);
    if (redisCached) {
      battlegroundAppProxyCache.set(cacheKey, {
        ...redisCached,
        expiresAt: Date.now() + BG_DATA_CACHE_MS,
      });
      res.status(redisCached.status);
      res.setHeader('Content-Type', redisCached.contentType);
      res.setHeader('Cache-Control', redisCached.contentType.includes('image/')
        ? BG_IMAGE_CACHE_CONTROL
        : BG_JSON_CACHE_CONTROL);
      res.setHeader('ETag', redisCached.etag);
      res.setHeader('X-BG-Legacy-Cache', 'REDIS');
      if (req.headers['if-none-match'] === redisCached.etag) return res.status(304).end();
      return res.send(redisCached.body);
    }

    const upstream = await fetch(upstreamUrl, { signal: AbortSignal.timeout(20_000) });
    const body = Buffer.from(await upstream.arrayBuffer());
    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    const etag = `"bg-legacy-${createHash('sha1').update(cacheKey).update(body).digest('hex').slice(0, 16)}"`;
    if (upstream.status >= 200 && upstream.status < 300 && !contentType.toLowerCase().includes('image/')) {
      const cacheEntry = {
        body,
        contentType,
        status: upstream.status,
        etag,
      };
      battlegroundAppProxyCache.set(cacheKey, {
        ...cacheEntry,
        expiresAt: Date.now() + BG_DATA_CACHE_MS,
      });
      void redisSetProxyCache(redisKey, cacheEntry, Math.max(60, Math.ceil(BG_DATA_CACHE_MS / 1000)));
    }
    res.status(upstream.status);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', contentType.includes('image/')
      ? BG_IMAGE_CACHE_CONTROL
      : BG_JSON_CACHE_CONTROL);
    res.setHeader('ETag', etag);
    res.setHeader('X-BG-Legacy-Cache', 'MISS');
    res.send(body);
  } catch (err: any) {
    console.error('[bg legacy proxy] failed:', upstreamPath, err?.message ?? err);
    res.status(502).json({ error: 'BG legacy upstream unavailable' });
  }
}

async function proxyBattlegroundAppEndpoint(
  req: express.Request,
  res: express.Response,
  upstreamPath: string,
  transformJson?: (payload: any) => any,
) {
  try {
    const upstreamUrl = new URL(upstreamPath, 'http://127.0.0.1:3108');
    for (const [key, value] of Object.entries(req.query)) {
      if (Array.isArray(value)) {
        value.forEach(item => upstreamUrl.searchParams.append(key, String(item)));
      } else if (value !== undefined) {
        upstreamUrl.searchParams.set(key, String(value));
      }
    }

    const cacheKey = upstreamUrl.href;
    const redisKey = redisHashedDataKey('bg-app-proxy', cacheKey);
    const cached = battlegroundAppProxyCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      const clientCacheControl = res.locals.subscriptionGuarded && !cached.contentType.includes('image/')
        ? 'private, no-store, max-age=0, must-revalidate'
        : (cached.contentType.includes('image/') ? BG_IMAGE_CACHE_CONTROL : BG_JSON_CACHE_CONTROL);
      res.status(cached.status);
      res.setHeader('Content-Type', cached.contentType);
      res.setHeader('Cache-Control', clientCacheControl);
      res.setHeader('ETag', cached.etag);
      res.setHeader('X-BG-Proxy-Cache', 'HIT');
      if (req.headers['if-none-match'] === cached.etag) return res.status(304).end();
      return res.send(cached.body);
    }
    const redisCached = await redisGetProxyCache(redisKey);
    if (redisCached) {
      battlegroundAppProxyCache.set(cacheKey, {
        ...redisCached,
        expiresAt: Date.now() + BG_DATA_CACHE_MS,
      });
      const clientCacheControl = res.locals.subscriptionGuarded && !redisCached.contentType.includes('image/')
        ? 'private, no-store, max-age=0, must-revalidate'
        : (redisCached.contentType.includes('image/') ? BG_IMAGE_CACHE_CONTROL : BG_JSON_CACHE_CONTROL);
      res.status(redisCached.status);
      res.setHeader('Content-Type', redisCached.contentType);
      res.setHeader('Cache-Control', clientCacheControl);
      res.setHeader('ETag', redisCached.etag);
      res.setHeader('X-BG-Proxy-Cache', 'REDIS');
      if (req.headers['if-none-match'] === redisCached.etag) return res.status(304).end();
      return res.send(redisCached.body);
    }

    const upstream = await fetch(upstreamUrl, { signal: AbortSignal.timeout(25_000) });
    let body = Buffer.from(await upstream.arrayBuffer());
    let contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    if (transformJson && upstream.status >= 200 && upstream.status < 300 && contentType.includes('application/json')) {
      try {
        const payload = JSON.parse(body.toString('utf8'));
        body = Buffer.from(JSON.stringify(transformJson(payload)));
        contentType = 'application/json; charset=utf-8';
      } catch (err: any) {
        console.warn('[bg app proxy] JSON transform failed:', upstreamPath, err?.message ?? err);
      }
    }
    const etag = `"bg-app-${createHash('sha1').update(cacheKey).update(body).digest('hex').slice(0, 16)}"`;
    if (upstream.status >= 200 && upstream.status < 300) {
      const cacheEntry = {
        body,
        contentType,
        status: upstream.status,
        etag,
      };
      battlegroundAppProxyCache.set(cacheKey, {
        ...cacheEntry,
        expiresAt: Date.now() + BG_DATA_CACHE_MS,
      });
      void redisSetProxyCache(redisKey, cacheEntry, Math.max(60, Math.ceil(BG_DATA_CACHE_MS / 1000)));
    }
    res.status(upstream.status);
    const clientCacheControl = res.locals.subscriptionGuarded && !contentType.includes('image/')
      ? 'private, no-store, max-age=0, must-revalidate'
      : (contentType.includes('image/') ? BG_IMAGE_CACHE_CONTROL : BG_JSON_CACHE_CONTROL);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', clientCacheControl);
    res.setHeader('ETag', etag);
    res.setHeader('X-BG-Proxy-Cache', 'MISS');
    res.send(body);
  } catch (err: any) {
    console.error('[bg app proxy] failed:', upstreamPath, err?.message ?? err);
    res.status(502).json({ error: 'BG app upstream unavailable' });
  }
}

async function proxyExtraBattlegroundLibraryEndpoint(req: express.Request, res: express.Response, library: string) {
  const endpoint = EXTRA_BG_LIBRARY_ENDPOINTS[library];
  if (!endpoint) return res.status(404).json({ error: 'Unknown BG library' });

  try {
    const upstreamUrl = new URL(`${KOLODAHS_API_BASE_URL}${endpoint}`);
    for (const [key, value] of Object.entries(req.query)) {
      if (Array.isArray(value)) {
        value.forEach(item => upstreamUrl.searchParams.append(key, String(item)));
      } else if (value !== undefined) {
        upstreamUrl.searchParams.set(key, String(value));
      }
    }

    const cacheKey = `extra-library:${upstreamUrl.href}`;
    const redisKey = redisHashedDataKey('bg-extra-library', cacheKey);
    const cached = battlegroundAppProxyCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      res.status(cached.status);
      res.setHeader('Content-Type', cached.contentType);
      res.setHeader('Cache-Control', BG_JSON_CACHE_CONTROL);
      res.setHeader('ETag', cached.etag);
      res.setHeader('X-BG-Extra-Library-Cache', 'HIT');
      if (req.headers['if-none-match'] === cached.etag) return res.status(304).end();
      return res.send(cached.body);
    }
    const redisCached = await redisGetProxyCache(redisKey);
    if (redisCached) {
      battlegroundAppProxyCache.set(cacheKey, {
        ...redisCached,
        expiresAt: Date.now() + BG_DATA_CACHE_MS,
      });
      res.status(redisCached.status);
      res.setHeader('Content-Type', redisCached.contentType);
      res.setHeader('Cache-Control', BG_JSON_CACHE_CONTROL);
      res.setHeader('ETag', redisCached.etag);
      res.setHeader('X-BG-Extra-Library-Cache', 'REDIS');
      if (req.headers['if-none-match'] === redisCached.etag) return res.status(304).end();
      return res.send(redisCached.body);
    }

    const upstream = await fetch(upstreamUrl, { signal: AbortSignal.timeout(25_000) });
    const body = Buffer.from(await upstream.arrayBuffer());
    const contentType = upstream.headers.get('content-type') || 'application/json; charset=utf-8';
    const etag = `"bg-extra-${createHash('sha1').update(cacheKey).update(body).digest('hex').slice(0, 16)}"`;
    if (upstream.status >= 200 && upstream.status < 300) {
      const cacheEntry = {
        body,
        contentType,
        status: upstream.status,
        etag,
      };
      battlegroundAppProxyCache.set(cacheKey, {
        ...cacheEntry,
        expiresAt: Date.now() + BG_DATA_CACHE_MS,
      });
      void redisSetProxyCache(redisKey, cacheEntry, Math.max(60, Math.ceil(BG_DATA_CACHE_MS / 1000)));
    }

    res.status(upstream.status);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', BG_JSON_CACHE_CONTROL);
    res.setHeader('ETag', etag);
    res.setHeader('X-BG-Extra-Library-Cache', 'MISS');
    res.send(body);
  } catch (err: any) {
    console.error('[bg extra library proxy] failed:', library, err?.message ?? err);
    res.status(502).json({ error: 'BG extra library upstream unavailable' });
  }
}

app.use('/api', createBattlegroundProxyRouter({
  requireAccess: requireBattlegroundsAccess,
  proxyLegacy: proxyLegacyBattlegroundEndpoint,
  proxyApp: proxyBattlegroundAppEndpoint,
  proxyExtraLibrary: proxyExtraBattlegroundLibraryEndpoint,
  enrichHeroPayload: enrichBattlegroundHeroPayload,
}));

function criticalDataHealth() {
  const datasets = [
    { name: 'winrates', file: 'winrates.json', collection: 'classes' },
    { name: 'tierlist', file: 'tierlist.json', collection: 'sections' },
    { name: 'legendaries', file: 'legendaries.json', collection: 'groups' },
  ].map(definition => {
    const entry = loadDataCached(definition.file);
    const records = Array.isArray(entry?.data?.[definition.collection])
      ? entry.data[definition.collection].length
      : undefined;
    return {
      name: definition.name,
      updatedAt: entry?.data?.updatedAt,
      source: entry?.data?.source,
      records,
    };
  });
  return evaluateDataHealth(datasets);
}

const healthRouter = createHealthRouter({
  getDataHealth: criticalDataHealth,
  getRelease: () => RELEASE_SHA,
});
app.use('/health', healthRouter);
app.use('/api/health', healthRouter);
const metricsRouter = createMetricsRouter({
  metrics: httpMetrics,
  getDataHealth: criticalDataHealth,
  getRelease: () => RELEASE_SHA,
});
app.use('/metrics', metricsRouter);
app.use('/api/metrics', metricsRouter);

app.get('/api/status', (req, res) => {
  const wr = loadDataCached('winrates.json');
  const tl = loadDataCached('tierlist.json');
  const data = {
    winrates: { updatedAt: wr?.data?.updatedAt ?? null, source: wr?.data?.source ?? null },
    tierlist: { updatedAt: tl?.data?.updatedAt ?? null, source: tl?.data?.source ?? null },
    nextScrape: 'каждые 6 часов',
  };
  const etag = `"status-${wr?.mtime?.toString(36) ?? '0'}-${tl?.mtime?.toString(36) ?? '0'}"`;
  return sendJsonCached(req, res, data, etag, CACHE_5M);
});

app.post('/api/scrape', manualScrapeGuard, scrapeLimiter, createScrapeQueueHandler(DATA_DIR));

// ─── IP check endpoint (mirrors api/check-ip.js for Vercel) ──────────────────

app.get('/api/check-ip', (req, res) => {
  const user = userAuth(req);
  res.json({
    allowed: isAdminUser(user),
    id: user?.id ?? null,
    ip: getTrustedClientIp(req),
  });
});

app.post('/api/auth/register', authCodeRequestLimiter, async (req, res) => {
  setPrivateNoStore(res);
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password ?? '');
  const name = String(req.body?.name ?? '').trim() || 'Пользователь Манакоста';
  const country = String(req.body?.country ?? '').trim();
  if (typeof req.body?.newsletterOptIn !== 'boolean') {
    return res.status(400).json({ error: 'Некорректное значение согласия на рассылку' });
  }
  const newsletterOptIn = req.body.newsletterOptIn;
  if (!isRealEmail(email)) return res.status(400).json({ error: 'Укажите корректную почту' });
  if (password.length < 8) return res.status(400).json({ error: 'Пароль должен быть не короче 8 символов' });
  if (!country) return res.status(400).json({ error: 'Укажите страну' });
  if (!newsletterOptIn) return res.status(400).json({ error: 'Подтвердите согласие на получение рассылки' });

  const store = loadAuthStore();
  if (store.users.some(item => item.email === email)) {
    return res.status(409).json({ error: 'Пользователь с такой почтой уже есть' });
  }

  const now = new Date().toISOString();
  store.users.push({
    id: `user_${sha256(email).slice(0, 12)}`,
    email,
    name,
    role: 'user',
    country,
    newsletterOptIn,
    avatarInitials: name.slice(0, 2).toUpperCase(),
    passwordHash: hashSecret(password),
    createdAt: now,
    updatedAt: now,
  });

  const authCode = prepareAuthCode(store, email);
  if (authCode.ok === false) return res.status(authCode.status).json({ error: authCode.error });
  saveAuthStore(store);

  try {
    await sendAuthCodeEmail(email, authCode.code);
    res.json({ success: true, email, message: 'Аккаунт создан. Код отправлен на почту' });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Аккаунт создан, но код не удалось отправить' });
  }
});

app.post('/api/auth/login', authPasswordLimiter, authCodeRequestLimiter, async (req, res) => {
  setPrivateNoStore(res);
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password ?? '');
  if (!isRealEmail(email)) return res.status(400).json({ error: 'Укажите корректную почту' });
  const store = loadAuthStore();
  const user = store.users.find(item => item.email === email);
  if (!user || !password || !verifySecret(password, user.passwordHash)) {
    return res.status(401).json({ error: 'Неверная почта или пароль' });
  }

  const token = adminTokenFromReq(req);
  const activeSession = authenticatedSessionFromToken(token);
  if (activeSession?.user.email === email) {
    if (refreshAuthSessionIfNeeded(activeSession.store, activeSession.session)) {
      saveAuthStore(activeSession.store);
    }
    setAuthCookie(req, res, token);
    return res.json({
      success: true,
      authenticated: true,
      user: publicUser(activeSession.user),
      adminAllowed: isAdminUser(activeSession.user),
      contestAdminAllowed: isContestAdminUser(activeSession.user),
      message: 'Вы уже вошли в аккаунт.',
    });
  }

  const authCode = prepareAuthCode(store, email);
  if (authCode.ok === false) return res.status(authCode.status).json({ error: authCode.error });
  saveAuthStore(store);

  try {
    await sendAuthCodeEmail(email, authCode.code);
    res.json({ success: true, email, message: 'Код отправлен на почту' });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Не удалось отправить код' });
  }
});

app.post('/api/auth/password-reset/request', authCodeRequestLimiter, async (req, res) => {
  setPrivateNoStore(res);
  const email = normalizeEmail(req.body?.email);
  if (!isRealEmail(email)) return res.status(400).json({ error: 'Укажите корректную почту' });
  const store = loadAuthStore();
  const user = store.users.find(item => item.email === email);

  if (user) {
    const authCode = prepareAuthCode(store, email);
    if (authCode.ok === false) return res.status(authCode.status).json({ error: authCode.error });
    saveAuthStore(store);

    try {
      await sendAuthCodeEmail(email, authCode.code);
    } catch (err: any) {
      return res.status(500).json({ error: err?.message ?? 'Не удалось отправить код' });
    }
  }

  res.json({ success: true, email, message: 'Если аккаунт существует, код отправлен на почту' });
});

app.post('/api/auth/password-reset/confirm', authCodeVerifyLimiter, (req, res) => {
  setPrivateNoStore(res);
  const email = normalizeEmail(req.body?.email);
  const code = String(req.body?.code ?? '').replace(/\D/g, '');
  const password = String(req.body?.password ?? '');
  if (!isRealEmail(email)) return res.status(400).json({ error: 'Укажите корректную почту' });
  if (password.length < 8) return res.status(400).json({ error: 'Пароль должен быть не короче 8 символов' });

  const store = loadAuthStore();
  const user = store.users.find(item => item.email === email);
  const pending = store.pendingCodes.find(item => item.email === email && item.expiresAt > Date.now());
  if (!user || !pending) return res.status(401).json({ error: 'Код устарел. Запросите новый.' });

  pending.attempts += 1;
  if (pending.attempts > AUTH_CODE_MAX_ATTEMPTS || !verifyPendingCode(pending, code)) {
    saveAuthStore(store);
    return res.status(401).json({ error: 'Неверный код' });
  }

  user.passwordHash = hashSecret(password);
  user.updatedAt = new Date().toISOString();
  store.pendingCodes = store.pendingCodes.filter(item => item.email !== email);
  store.sessions = store.sessions.filter(item => item.email !== email);
  saveAuthStore(store);
  res.json({ success: true, message: 'Пароль обновлен' });
});

app.get('/api/auth/telegram/config', (_req, res) => {
  const enabled = telegramAuthEnabled();
  const useOidc = telegramOidcEnabled();
  const useLegacyWidget = !useOidc && telegramLegacyWidgetEnabled();
  res.json({
    enabled,
    mode: useOidc ? 'oidc' : useLegacyWidget ? 'legacy-widget' : 'disabled',
    botUsername: enabled ? TELEGRAM_AUTH_BOT_USERNAME : '',
    authUrl: enabled ? (useLegacyWidget ? `${APP_URL}/api/auth/telegram/callback` : `${APP_URL}/api/auth/telegram/start`) : '',
    callbackUrl: enabled ? `${APP_URL}/api/auth/telegram/callback` : '',
  });
});

async function sendTelegramAuthBotMessage(chatId: string | number, text: string): Promise<void> {
  if (!TELEGRAM_AUTH_BOT_TOKEN) return;
  const startedAt = Date.now();
  try {
    const response = await fetchTelegramBotApi(TELEGRAM_AUTH_BOT_TOKEN, 'sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      }),
    }, 5_000);
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      console.warn('[telegram auth bot] sendMessage failed:', data?.description || `HTTP ${response.status}`);
    }
    const elapsedMs = Date.now() - startedAt;
    if (elapsedMs > 1500) console.warn(`[telegram auth bot] sendMessage slow: ${elapsedMs}ms`);
  } catch (err: any) {
    console.warn('[telegram auth bot] sendMessage unavailable:', err?.message ?? err);
  }
}

app.post('/api/auth/telegram/link-code', (req, res) => {
  setPrivateNoStore(res);
  const user = userAuth(req);
  if (!user) return res.status(401).json({ error: 'Требуется вход' });
  if (!TELEGRAM_AUTH_BOT_TOKEN || !TELEGRAM_AUTH_BOT_USERNAME) {
    return res.status(503).json({ error: 'Telegram-бот пока не настроен' });
  }

  try {
    const result = createTelegramLinkCode(user.id);
    res.json({
      success: true,
      code: result.code,
      expiresAt: new Date(result.expiresAt).toISOString(),
      botUsername: TELEGRAM_AUTH_BOT_USERNAME,
      botUrl: `https://t.me/${TELEGRAM_AUTH_BOT_USERNAME}?start=${encodeURIComponent(result.code)}`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Не удалось создать Telegram-код' });
  }
});

app.post('/api/auth/telegram/bot/webhook', async (req, res) => {
  setPrivateNoStore(res);
  if (!TELEGRAM_AUTH_BOT_TOKEN || !TELEGRAM_AUTH_BOT_USERNAME) {
    return res.status(503).json({ ok: false, error: 'Telegram auth bot disabled' });
  }
  if (TELEGRAM_AUTH_BOT_WEBHOOK_SECRET) {
    const received = String(req.headers['x-telegram-bot-api-secret-token'] || '');
    if (!safeEqualString(received, TELEGRAM_AUTH_BOT_WEBHOOK_SECRET)) {
      return res.status(403).json({ ok: false, error: 'Forbidden' });
    }
  }

  const message = req.body?.message;
  const chatId = message?.chat?.id;
  const chatType = String(message?.chat?.type || '');
  const telegramUser = message?.from;
  const telegramId = telegramUser?.id ? String(telegramUser.id).replace(/\D/g, '') : '';
  const messageText = String(message?.text || '').trim();
  const requestedEmail = extractEmailFromTelegramMessage(messageText);
  const emailCode = telegramEmailCodeFromMessage(messageText);
  const hasPendingEmailCode = Boolean(telegramId && pendingTelegramEmailCode(telegramId));
  const linkCode = telegramLinkCodeFromMessage(messageText);
  res.json({ ok: true });

  if (!chatId || !telegramId) return;
  if (chatType && chatType !== 'private') return;
  if (requestedEmail) {
    try {
      await requestTelegramEmailCode(telegramId, requestedEmail);
      await sendTelegramAuthBotMessage(chatId, `Код подтверждения отправлен на ${requestedEmail}. Пришлите сюда 6 цифр из письма.`);
    } catch (err: any) {
      await sendTelegramAuthBotMessage(chatId, err?.message || 'Не удалось отправить код подтверждения на почту.');
    }
    return;
  }
  if (hasPendingEmailCode && emailCode.length === 6 && !/^\/(?:start|link)\b/i.test(messageText) && !/^TG-/i.test(messageText)) {
    try {
      const result = await confirmTelegramEmailCode(telegramId, emailCode);
      if (result.linkedUser) {
        await sendTelegramAuthBotMessage(chatId, result.status?.hasAccess
          ? `Почта ${result.email} подтверждена и привязана к сайту. Boosty-доступ обновлён.`
          : `Почта ${result.email} подтверждена и привязана к сайту. Boosty-доступ пока не найден, обновите проверку в профиле.`);
      } else {
        await sendTelegramAuthBotMessage(chatId, `Почта ${result.email} подтверждена в общей базе Telegram-бота. После привязки Telegram на сайте она будет использована для проверки Boosty.`);
      }
    } catch (err: any) {
      await sendTelegramAuthBotMessage(chatId, err?.message || 'Не удалось подтвердить почту.');
    }
    return;
  }
  if (!linkCode) {
    await sendTelegramAuthBotMessage(chatId, [
      'Отправьте сюда ID-код из профиля arena.hs-manacost.ru.',
      'Код создаётся в блоке Telegram в личном кабинете и действует ограниченное время.',
      '',
      'Чтобы привязать Boosty-почту через бота, отправьте /email name@example.com.',
    ].join('\n'));
    return;
  }

  try {
    const database = db();
    const token = database.prepare(`
      SELECT code, user_id, expires_at, used_at
      FROM telegram_link_tokens
      WHERE code = ?
    `).get(linkCode) as { code: string; user_id: string; expires_at: number; used_at?: string } | undefined;
    if (!token || token.used_at || token.expires_at <= Date.now()) {
      await sendTelegramAuthBotMessage(chatId, 'Код не найден или устарел. Создайте новый код в профиле.');
      return;
    }

    const store = loadAuthStore();
    const targetUser = store.users.find(item => item.id === token.user_id);
    if (!targetUser) {
      await sendTelegramAuthBotMessage(chatId, 'Профиль для этого кода не найден. Создайте новый код в профиле.');
      return;
    }
    if (targetUser.telegramId && targetUser.telegramId !== telegramId) {
      await sendTelegramAuthBotMessage(chatId, 'У этого аккаунта уже привязан другой Telegram. Напишите администратору, если нужна замена.');
      return;
    }
    const existingTelegramUser = store.users.find(item => item.telegramId === telegramId && item.id !== targetUser.id);
    if (existingTelegramUser || identityBelongsToAnotherUser('telegram', telegramId, targetUser.id)) {
      await sendTelegramAuthBotMessage(chatId, 'Этот Telegram уже привязан к другому аккаунту.');
      return;
    }

    const username = String(telegramUser?.username || '').trim().replace(/^@/, '');
    const nowIso = new Date().toISOString();
    targetUser.telegramId = telegramId;
    targetUser.telegramUsername = username || targetUser.telegramUsername;
    targetUser.updatedAt = nowIso;
    saveAuthStore(store);
    dbRun(`
      INSERT INTO identities (user_id, provider, provider_user_id, email, username, photo_url, verified_at, created_at, updated_at)
      VALUES (?, 'telegram', ?, '', ?, '', ?, ?, ?)
      ON CONFLICT(provider, provider_user_id) DO UPDATE SET
        username = excluded.username,
        verified_at = excluded.verified_at,
        updated_at = excluded.updated_at
        WHERE identities.user_id = excluded.user_id
    `, targetUser.id, telegramId, username, nowIso, nowIso, nowIso);
    const khaEmail = khaVerifiedEmail(readKhaVipProfile(telegramId));
    if (khaEmail && khaEmail !== targetUser.email) {
      const existingEmailUser = store.users.find(item => item.email === khaEmail && item.id !== targetUser.id);
      if (!existingEmailUser && !identityBelongsToAnotherUser('boosty-email', khaEmail, targetUser.id)) {
        const oldEmail = targetUser.email;
        targetUser.email = khaEmail;
        targetUser.contactEmail = targetUser.contactEmail || khaEmail;
        targetUser.updatedAt = nowIso;
        store.sessions = store.sessions.map(session => session.email === oldEmail ? { ...session, email: khaEmail } : session);
        saveAuthStore(store);
        dbRun(`
          INSERT INTO identities (user_id, provider, provider_user_id, email, username, photo_url, verified_at, created_at, updated_at)
          VALUES (?, 'boosty-email', ?, ?, ?, '', ?, ?, ?)
          ON CONFLICT(provider, provider_user_id) DO UPDATE SET
            email = excluded.email,
            username = excluded.username,
            verified_at = excluded.verified_at,
            updated_at = excluded.updated_at
            WHERE identities.user_id = excluded.user_id
        `, targetUser.id, khaEmail, khaEmail, khaEmail, nowIso, nowIso, nowIso);
      }
    }
    database.prepare('UPDATE telegram_link_tokens SET used_at = ?, telegram_id = ? WHERE code = ?').run(nowIso, telegramId, linkCode);

    await sendTelegramAuthBotMessage(chatId, 'Telegram привязан. Проверяю подписку и обновляю доступ на сайте...');
    const status = await refreshSubscriptionForUser(targetUser, true);
    await sendTelegramAuthBotMessage(chatId, status.hasAccess
      ? 'Telegram привязан. Подписка найдена, доступ на сайте обновлён.'
      : 'Telegram привязан, но бот не нашёл вас в VIP-каналах. Проверьте подписку и нажмите "Обновить" в профиле.');
  } catch (err: any) {
    console.warn('[telegram auth bot] link failed:', err?.message ?? err);
    await sendTelegramAuthBotMessage(chatId, 'Не удалось привязать Telegram. Создайте новый код в профиле и попробуйте ещё раз.');
  }
});

function upsertTelegramUser(payload: Record<string, unknown>, options: { linkUserId?: string } = {}) {
  const telegramId = String(payload.id ?? '').replace(/\D/g, '');
  const telegramOidcSub = String(payload.oidc_sub ?? '').trim();
  if (!telegramId && !telegramOidcSub) throw new Error('Telegram не передал ID пользователя');

  const khaProfile = readKhaVipProfile(telegramId);
  const verifiedBoostyEmail = khaVerifiedEmail(khaProfile);
  const firstName = String(payload.first_name ?? '').trim();
  const lastName = String(payload.last_name ?? '').trim();
  const username = String(payload.username ?? '').trim().replace(/^@/, '');
  const photoUrl = String(payload.photo_url ?? '').trim();
  const displayName = [firstName, lastName].filter(Boolean).join(' ').trim()
    || (username ? `@${username}` : `Telegram ${telegramId || sha256(telegramOidcSub).slice(0, 10)}`);
  const email = verifiedBoostyEmail || (telegramId
    ? `telegram_${telegramId}@telegram.local`
    : `telegram_oidc_${sha256(telegramOidcSub).slice(0, 16)}@telegram.local`);
  const now = new Date().toISOString();
  const store = loadAuthStore();
  const oidcIdentity = telegramOidcSub
    ? dbGet<{ user_id?: string }>("SELECT user_id FROM identities WHERE provider = 'telegram_oidc' AND provider_user_id = ?", telegramOidcSub)
    : null;
  const oidcUser = oidcIdentity?.user_id ? store.users.find(item => item.id === oidcIdentity.user_id) : undefined;
  const usernameOidcIdentity = username
    ? dbGet<{ user_id?: string }>("SELECT user_id FROM identities WHERE provider = 'telegram_oidc' AND lower(username) = lower(?)", username)
    : null;
  const usernameOidcUser = usernameOidcIdentity?.user_id ? store.users.find(item => item.id === usernameOidcIdentity.user_id) : undefined;
  const telegramUser = telegramId ? store.users.find(item => item.telegramId === telegramId) : undefined;
  const usernameTelegramUser = username
    ? store.users.find(item => String(item.telegramUsername || '').toLowerCase() === username.toLowerCase())
    : undefined;
  const emailUser = store.users.find(item => item.email === email);
  const linkUser = options.linkUserId ? store.users.find(item => item.id === options.linkUserId) : undefined;
  let user = oidcUser ?? telegramUser ?? usernameTelegramUser ?? usernameOidcUser ?? emailUser;

  if (linkUser) {
    if (telegramId) assertIdentityAvailable('telegram', telegramId, linkUser.id, 'Этот Telegram');
    if (telegramOidcSub) assertIdentityAvailable('telegram_oidc', telegramOidcSub, linkUser.id, 'Этот Telegram');
    if (verifiedBoostyEmail) assertIdentityAvailable('boosty-email', verifiedBoostyEmail, linkUser.id, 'Эта Boosty-почта');
    if (telegramUser && telegramUser.id !== linkUser.id) {
      throw new Error('Этот Telegram уже привязан к другому аккаунту');
    } else if (oidcUser && oidcUser.id !== linkUser.id) {
      throw new Error('Этот Telegram уже привязан к другому аккаунту');
    } else if (usernameOidcUser && usernameOidcUser.id !== linkUser.id) {
      throw new Error('Этот Telegram уже привязан к другому аккаунту');
    } else {
      user = linkUser;
      user.telegramId = telegramId || user.telegramId;
      user.telegramUsername = username || user.telegramUsername;
      user.photoUrl = photoUrl || user.photoUrl;
      user.updatedAt = now;
    }
  } else if (telegramUser && emailUser && telegramUser.id !== emailUser.id) {
    throw new Error('Эта Boosty-почта уже привязана к другому аккаунту');
  } else if (!telegramUser && emailUser) {
    user = emailUser;
    user.telegramId = telegramId || user.telegramId;
    user.telegramUsername = username;
    user.photoUrl = photoUrl || user.photoUrl;
    user.updatedAt = now;
  } else if (telegramUser && verifiedBoostyEmail && telegramUser.email !== verifiedBoostyEmail) {
    const emailOwner = store.users.find(item => item.email === verifiedBoostyEmail && item.id !== telegramUser.id);
    if (emailOwner || identityBelongsToAnotherUser('boosty-email', verifiedBoostyEmail, telegramUser.id)) {
      throw new Error('Эта Boosty-почта уже привязана к другому аккаунту');
    }
    telegramUser.email = verifiedBoostyEmail;
    telegramUser.updatedAt = now;
    user = telegramUser;
  }

  if (!user) {
    user = {
      id: `tg_${sha256(telegramId || telegramOidcSub).slice(0, 12)}`,
      email,
      name: displayName,
      role: 'user',
      country: '',
      newsletterOptIn: false,
      avatarInitials: displayName.slice(0, 2).toUpperCase(),
      telegramId: telegramId || undefined,
      telegramUsername: username,
      photoUrl,
      passwordHash: hashSecret(randomBytes(24).toString('hex')),
      createdAt: now,
      updatedAt: now,
    };
    store.users.push(user);
  } else {
    user.name = user.name && !user.name.startsWith('Telegram ') ? user.name : displayName;
    user.telegramId = telegramId || user.telegramId;
    user.telegramUsername = username;
    user.photoUrl = photoUrl || user.photoUrl;
    user.updatedAt = now;
  }
  return { store, user, khaProfile };
}

function linkTelegramOidcIdentity(user: AdminUser, claims: Record<string, any>) {
  const oidcSub = String(claims.sub ?? '').trim();
  if (!oidcSub) return;
  const now = new Date().toISOString();
  dbRun(`
    INSERT INTO identities (user_id, provider, provider_user_id, email, username, photo_url, verified_at, created_at, updated_at)
    VALUES (?, 'telegram_oidc', ?, '', ?, ?, ?, ?, ?)
    ON CONFLICT(provider, provider_user_id) DO UPDATE SET
      username = excluded.username,
      photo_url = excluded.photo_url,
      updated_at = excluded.updated_at
      WHERE identities.user_id = excluded.user_id
  `, user.id, oidcSub, String(claims.preferred_username || '').replace(/^@/, ''), String(claims.picture || ''), now, now, now);
}

app.get('/api/auth/telegram/start', async (req, res) => {
  setPrivateNoStore(res);
  if (!telegramOidcEnabled()) return res.redirect('/?login&telegram=error');
  try {
    const discovery = await telegramOidcDiscovery();
    const state = randomBytes(24).toString('base64url');
    const nonce = randomBytes(24).toString('base64url');
    const codeVerifier = randomBytes(48).toString('base64url');
    const returnTo = safeAuthReturnTo(req.query.returnTo);
    setTelegramOidcCookie(req, res, {
      state,
      nonce,
      codeVerifier,
      returnTo,
      expiresAt: Date.now() + TELEGRAM_OIDC_STATE_TTL_MS,
    });

    const params = new URLSearchParams({
      client_id: TELEGRAM_OIDC_CLIENT_ID,
      response_type: 'code',
      scope: 'openid profile',
      redirect_uri: `${APP_URL}/api/auth/telegram/callback`,
      state,
      nonce,
      code_challenge: sha256Base64Url(codeVerifier),
      code_challenge_method: 'S256',
    });
    return res.redirect(`${discovery.authorization_endpoint}?${params.toString()}`);
  } catch (err) {
    console.warn('[auth] Telegram OIDC start failed:', err);
    return res.redirect('/?login&telegram=error');
  }
});

app.get('/api/auth/telegram/callback', async (req, res) => {
  setPrivateNoStore(res);
  if (telegramOidcEnabled() && req.query.code) {
    const requestedState = String(req.query.state ?? '');
    const oidcState = readTelegramOidcState(req, requestedState);
    if (!oidcState) {
      console.warn('[auth] Telegram OIDC callback rejected: missing, expired, or mismatched state');
      return res.redirect('/?login&telegram=error');
    }
    clearTelegramOidcCookie(req, res, oidcState.state);
    try {
      const discovery = await telegramOidcDiscovery();
      const tokenParams = new URLSearchParams({
        grant_type: 'authorization_code',
        code: String(req.query.code),
        redirect_uri: `${APP_URL}/api/auth/telegram/callback`,
        client_id: TELEGRAM_OIDC_CLIENT_ID,
        code_verifier: oidcState.codeVerifier,
      });
      const basicAuth = Buffer.from(`${TELEGRAM_OIDC_CLIENT_ID}:${TELEGRAM_OIDC_CLIENT_SECRET}`).toString('base64');
      const tokenData = await fetchJsonWithTimeout(discovery.token_endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${basicAuth}`,
        },
        body: tokenParams,
      });
      const claims = await verifyTelegramOidcIdToken(String(tokenData.id_token || ''), oidcState.nonce);
      const nameParts = String(claims.name || '').trim().split(/\s+/).filter(Boolean);
      const payload: Record<string, unknown> = {
        id: String(claims.id ?? '').replace(/\D/g, ''),
        oidc_sub: String(claims.sub ?? ''),
        first_name: nameParts[0] || String(claims.name || '').trim(),
        last_name: nameParts.slice(1).join(' '),
        username: String(claims.preferred_username || '').replace(/^@/, ''),
        photo_url: String(claims.picture || ''),
      };
      const currentUser = userAuth(req);
      const { store, user, khaProfile } = upsertTelegramUser(payload, { linkUserId: currentUser?.id });
      const token = createAuthSession(store, user);
      saveAuthStore(store);
      linkTelegramOidcIdentity(user, claims);
      applyKhaSubscriptionSnapshot(user, khaProfile);
      await refreshSubscriptionAfterTelegramAuth(user);
      setAuthCookie(req, res, token);
      return res.redirect(safeAuthReturnTo(oidcState.returnTo));
    } catch (err) {
      console.warn('[auth] Telegram OIDC callback failed:', err);
      return res.redirect('/?login&telegram=error');
    }
  }

  const payload = req.query as Record<string, unknown>;
  const verification = verifyTelegramAuthPayload(payload);
  if (verification.ok === false) {
    return res.redirect('/?login&telegram=error');
  }
  try {
    const currentUser = userAuth(req);
    const { store, user, khaProfile } = upsertTelegramUser(payload, { linkUserId: currentUser?.id });
    const token = createAuthSession(store, user);
    saveAuthStore(store);
    applyKhaSubscriptionSnapshot(user, khaProfile);
    await refreshSubscriptionAfterTelegramAuth(user);
    setAuthCookie(req, res, token);
    return res.redirect(safeAuthReturnTo(req.query.returnTo));
  } catch (err) {
    console.warn('[auth] Telegram callback failed:', err);
    return res.redirect('/?login&telegram=error');
  }
});

app.post('/api/auth/telegram', async (req, res) => {
  setPrivateNoStore(res);
  const payload = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {};
  const verification = verifyTelegramAuthPayload(payload);
  if (verification.ok === false) return res.status(401).json({ error: verification.error });

  let store: AdminAuthStore;
  let user: AdminUser;
  let khaProfile: Record<string, any> | null;
  try {
    const currentUser = userAuth(req);
    ({ store, user, khaProfile } = upsertTelegramUser(payload, { linkUserId: currentUser?.id }));
  } catch (err: any) {
    return res.status(400).json({ error: err?.message ?? 'Telegram не передал пользователя' });
  }

  if (user.blockedAt) return res.status(403).json({ error: 'Пользователь заблокирован' });
  const token = createAuthSession(store, user);
  saveAuthStore(store);
  applyKhaSubscriptionSnapshot(user, khaProfile);
  await refreshSubscriptionAfterTelegramAuth(user);
  setAuthCookie(req, res, token);
  res.json({ success: true, token, user: publicUser(user), adminAllowed: isAdminUser(user), contestAdminAllowed: isContestAdminUser(user) });
});

app.post('/api/auth/verify', authCodeVerifyLimiter, (req, res) => {
  setPrivateNoStore(res);
  const email = normalizeEmail(req.body?.email);
  const code = String(req.body?.code ?? '').replace(/\D/g, '');
  if (!isRealEmail(email)) return res.status(400).json({ error: 'Укажите корректную почту' });
  const store = loadAuthStore();
  const pending = store.pendingCodes.find(item => item.email === email && item.expiresAt > Date.now());
  if (!pending) return res.status(401).json({ error: 'Код устарел. Запросите новый.' });
  pending.attempts += 1;
  if (pending.attempts > AUTH_CODE_MAX_ATTEMPTS || !verifyPendingCode(pending, code)) {
    saveAuthStore(store);
    return res.status(401).json({ error: 'Неверный код' });
  }

  const user = store.users.find(item => item.email === email);
  if (!user) return res.status(401).json({ error: 'Пользователь не найден' });
  if (user.blockedAt) return res.status(403).json({ error: 'Пользователь заблокирован' });

  store.pendingCodes = store.pendingCodes.filter(item => item.email !== email);
  const token = createAuthSession(store, user);
  saveAuthStore(store);
  if (user.newsletterOptIn) updateMailingConsent(user, true, 'email-code-verified');
  setAuthCookie(req, res, token);
  res.json({ success: true, token, user: publicUser(user), adminAllowed: isAdminUser(user), contestAdminAllowed: isContestAdminUser(user) });
});

app.get('/api/auth/me', (req, res) => {
  setPrivateNoStore(res);
  const token = adminTokenFromReq(req);
  const activeSession = authenticatedSessionFromToken(token);
  const user = activeSession?.user ?? null;
  if (activeSession && token) {
    if (refreshAuthSessionIfNeeded(activeSession.store, activeSession.session)) {
      saveAuthStore(activeSession.store);
    }
    setAuthCookie(req, res, token);
  }
  res.json({
    user: user ? publicUser(user) : null,
    adminAllowed: user ? isAdminUser(user) : false,
    contestAdminAllowed: user ? isContestAdminUser(user) : false,
  });
});

app.patch('/api/auth/profile', (req, res) => {
  setPrivateNoStore(res);
  const authedUser = userAuth(req);
  if (!authedUser) return res.status(401).json({ error: 'Требуется вход' });
  const store = loadAuthStore();
  const user = store.users.find(item => item.id === authedUser.id);
  if (!user) return res.status(401).json({ error: 'Пользователь не найден' });

  const newsletterValue = req.body?.newsletterOptIn;
  if (newsletterValue !== undefined && typeof newsletterValue !== 'boolean') {
    return res.status(400).json({ error: 'Некорректное значение согласия на рассылку' });
  }

  if (req.body?.country !== undefined) {
    user.country = String(req.body.country ?? '').trim();
  }
  const newsletterOptIn = newsletterValue === undefined ? undefined : newsletterValue;
  if (newsletterOptIn !== undefined) user.newsletterOptIn = newsletterOptIn;
  if (req.body?.contactVkUrl !== undefined) {
    user.contactVkUrl = normalizeContactVkUrl(req.body.contactVkUrl);
  }
  if (req.body?.contactTelegram !== undefined) {
    user.contactTelegram = normalizeContactTelegram(req.body.contactTelegram);
  }
  if (req.body?.contactEmail !== undefined) {
    user.contactEmail = normalizeContactEmail(req.body.contactEmail);
  }
  user.updatedAt = new Date().toISOString();
  saveAuthStore(store);
  if (newsletterOptIn !== undefined) updateMailingConsent(user, newsletterOptIn, 'profile-preference');
  res.json({ success: true, user: publicUser(user) });
});

app.post('/api/auth/logout', (req, res) => {
  setPrivateNoStore(res);
  const token = adminTokenFromReq(req);
  if (token) {
    const store = loadAuthStore();
    const tokenHash = sha256(token);
    store.sessions = store.sessions.filter(item => item.tokenHash !== tokenHash);
    saveAuthStore(store);
  }
  clearAuthCookie(req, res);
  res.json({ success: true });
});

app.get('/api/subscription/status', async (req, res) => {
  setPrivateNoStore(res);
  const user = userAuth(req);
  if (!user) return res.status(401).json({ error: 'Требуется вход' });
  try {
    const status = await refreshSubscriptionForUser(user, false);
    res.json(status);
  } catch (err: any) {
    res.status(500).json(emptySubscriptionStatus(err?.message ?? 'Не удалось проверить подписку'));
  }
});

app.post('/api/subscription/refresh', async (req, res) => {
  setPrivateNoStore(res);
  const user = userAuth(req);
  if (!user) return res.status(401).json({ error: 'Требуется вход' });
  try {
    const status = await refreshSubscriptionForUser(user, true);
    res.json(status);
  } catch (err: any) {
    res.status(500).json(emptySubscriptionStatus(err?.message ?? 'Не удалось проверить подписку'));
  }
});

app.get('/api/contests', (req, res) => {
  const user = userAuth(req);
  if (user) setPrivateNoStore(res);
  const rows = dbAll<any>("SELECT * FROM contests WHERE status NOT IN ('draft', 'cancelled') ORDER BY COALESCE(ends_at, created_at) DESC, created_at DESC");
  const entries = user
    ? new Map(dbAll<any>('SELECT contest_id, status, created_at FROM contest_entries WHERE user_id = ?', user.id).map(row => [String(row.contest_id), row]))
    : new Map<string, any>();
  res.json({
    contests: rows.map(row => contestFromRow(row, entries.get(String(row.id)))),
    user: user ? publicUser(user) : null,
  });
});

app.post('/api/contests/:contestId/join', async (req, res) => {
  setPrivateNoStore(res);
  const user = userAuth(req);
  if (!user) return res.status(401).json({ error: 'Войдите в профиль, чтобы участвовать в конкурсе' });
  const contest = dbGet<any>('SELECT * FROM contests WHERE id = ?', String(req.params.contestId));
  if (!contest || contest.status === 'draft' || contest.status === 'cancelled') {
    return res.status(404).json({ error: 'Конкурс не найден' });
  }
  const effectiveStatus = contestStatusFromDates(String(contest.status || ''), contest.starts_at, contest.ends_at);
  if (effectiveStatus === 'completed') return res.status(409).json({ error: 'Конкурс уже завершен' });
  if (effectiveStatus === 'planned') return res.status(409).json({ error: 'Конкурс еще не начался' });

  const subscription = await refreshSubscriptionForUser(user, false);
  if (!subscription.entitlements.contests && user.id !== CONTEST_ADMIN_USER_ID) {
    return res.status(403).json({
      error: 'Для участия нужна подписка Манакоста с доступом к конкурсам',
      subscription,
    });
  }

  const nowIso = new Date().toISOString();
  const contact = {
    vk: user.contactVkUrl ?? '',
    telegram: user.contactTelegram || user.telegramUsername || '',
    email: user.contactEmail || (isRealEmail(user.email) ? user.email : ''),
  };
  dbRun(`
    INSERT INTO contest_entries (id, contest_id, user_id, email, contact_json, subscription_json, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'approved', ?)
    ON CONFLICT(contest_id, user_id) DO UPDATE SET
      email = excluded.email,
      contact_json = excluded.contact_json,
      subscription_json = excluded.subscription_json,
      status = 'approved'
  `, `entry_${randomBytes(8).toString('hex')}`, contest.id, user.id, user.email, JSON.stringify(contact), JSON.stringify(subscription), nowIso);

  res.json({
    success: true,
    entry: { status: 'approved', createdAt: nowIso },
    subscription,
  });
});

app.get('/api/profile/contest-history', (req, res) => {
  setPrivateNoStore(res);
  const user = userAuth(req);
  if (!user) return res.status(401).json({ error: 'Требуется вход' });
  const rows = dbAll<any>(`
    SELECT
      e.id AS entry_id,
      e.contest_id,
      e.status AS entry_status,
      e.created_at AS joined_at,
      c.title,
      c.prize,
      c.image_url,
      c.starts_at,
      c.ends_at,
      c.status AS contest_status,
      c.winners_json
    FROM contest_entries e
    JOIN contests c ON c.id = e.contest_id
    WHERE e.user_id = ?
    ORDER BY e.created_at DESC
  `, user.id);

  res.json({
    entries: rows.map(row => {
      const winners = parseJsonArray(row.winners_json).map(String);
      const contestId = String(row.contest_id || '');
      return {
        id: String(row.entry_id || ''),
        contestId,
        title: String(row.title || ''),
        prize: String(row.prize || ''),
        imageUrl: String(row.image_url || ''),
        status: contestStatusFromDates(String(row.contest_status || ''), row.starts_at, row.ends_at),
        entryStatus: String(row.entry_status || ''),
        joinedAt: String(row.joined_at || ''),
        startsAt: row.starts_at ? String(row.starts_at) : '',
        endsAt: row.ends_at ? String(row.ends_at) : '',
        isWinner: winners.includes(user.id),
      };
    }),
  });
});

app.get('/api/admin/contests', (req, res) => {
  const admin = contestAdminAuth(req);
  if (!admin) return res.status(403).json({ error: 'Недостаточно прав' });
  const rows = dbAll<any>(`
    SELECT c.*, COUNT(e.id) AS entries_count
    FROM contests c
    LEFT JOIN contest_entries e ON e.contest_id = c.id
    GROUP BY c.id
    ORDER BY c.created_at DESC
  `);
  res.json({
    contests: rows.map(row => ({ ...contestFromRow(row, undefined, { includeRawWinners: true }), entriesCount: Number(row.entries_count || 0) })),
    admin: publicUser(admin),
  });
});

app.post('/api/admin/contests', (req, res) => {
  const admin = contestAdminAuth(req);
  if (!admin) return res.status(403).json({ error: 'Недостаточно прав' });
  const id = normalizeOptionalText(req.body?.id, 80) || `contest_${randomBytes(8).toString('hex')}`;
  const title = normalizeOptionalText(req.body?.title, 160);
  if (!title) return res.status(400).json({ error: 'Укажите название конкурса' });
  const nowIso = new Date().toISOString();
  const status = ['draft', 'active', 'planned', 'completed', 'cancelled'].includes(String(req.body?.status))
    ? String(req.body.status)
    : 'active';
  const startsAt = normalizeDateTimeInput(req.body?.startsAt);
  const endsAt = normalizeDateTimeInput(req.body?.endsAt);
  if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) {
    return res.status(400).json({ error: 'Финиш конкурса должен быть позже старта' });
  }
  const rawImageUrl = normalizeOptionalText(req.body?.imageUrl, 500);
  const imageUrl = normalizeContestImageUrl(rawImageUrl);
  if (rawImageUrl && !imageUrl) {
    return res.status(400).json({ error: 'Обложка конкурса должна быть загружена через админку' });
  }
  dbRun(`
    INSERT INTO contests (id, title, description, prize, image_url, starts_at, ends_at, status, winners_json, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      description = excluded.description,
      prize = excluded.prize,
      image_url = excluded.image_url,
      starts_at = excluded.starts_at,
      ends_at = excluded.ends_at,
      status = excluded.status,
      updated_at = excluded.updated_at
  `, id, title, normalizeOptionalText(req.body?.description, 2000), normalizeOptionalText(req.body?.prize, 240),
    imageUrl, startsAt, endsAt, status, '[]', admin.id, nowIso, nowIso);
  const row = dbGet<any>('SELECT * FROM contests WHERE id = ?', id);
  res.json({ success: true, contest: contestFromRow(row) });
});

app.get('/api/admin/contests/:contestId/entries', (req, res) => {
  const admin = contestAdminAuth(req);
  if (!admin) return res.status(403).json({ error: 'Недостаточно прав' });
  const rows = dbAll<any>(`
    SELECT e.*, u.name, u.role, u.country, u.contact_vk_url, u.contact_telegram, u.contact_email, tg.username AS telegram_username
    FROM contest_entries e
    LEFT JOIN users u ON u.id = e.user_id
    LEFT JOIN (
      SELECT user_id, MAX(username) AS username
      FROM identities
      WHERE provider IN ('telegram', 'telegram_oidc')
      GROUP BY user_id
    ) tg ON tg.user_id = e.user_id
    WHERE e.contest_id = ?
    ORDER BY e.created_at DESC
  `, String(req.params.contestId));
  res.json({
    entries: rows.map(row => ({
      id: String(row.id),
      contestId: String(row.contest_id),
      userId: String(row.user_id),
      profileId: String(row.user_id),
      name: String(row.name || ''),
      email: String(row.email || ''),
      status: String(row.status || ''),
      createdAt: String(row.created_at || ''),
      contact: safeJsonObject(row.contact_json),
      subscription: safeJsonObject(row.subscription_json),
      profileContacts: {
        vk: String(row.contact_vk_url || ''),
        telegram: String(row.contact_telegram || row.telegram_username || ''),
        email: String(row.contact_email || ''),
      },
    })),
  });
});

app.post('/api/admin/contests/:contestId/winners', (req, res) => {
  const admin = contestAdminAuth(req);
  if (!admin) return res.status(403).json({ error: 'Недостаточно прав' });
  const contestId = String(req.params.contestId);
  const contest = dbGet<any>('SELECT * FROM contests WHERE id = ?', contestId);
  if (!contest) return res.status(404).json({ error: 'Конкурс не найден' });
  const requestedWinners: string[] = Array.isArray(req.body?.winners)
    ? req.body.winners.map((item: unknown) => normalizeOptionalText(item, 120)).filter(Boolean).slice(0, 100)
    : [];
  if (requestedWinners.length === 0) return res.status(400).json({ error: 'Укажите хотя бы одного победителя из заявок конкурса' });
  const entryRows = dbAll<any>("SELECT user_id FROM contest_entries WHERE contest_id = ? AND status = 'approved'", contestId);
  const allowedWinnerIds = new Set(entryRows.map(row => String(row.user_id || '')).filter(Boolean));
  const winners = Array.from(new Set(requestedWinners));
  const invalidWinners = winners.filter(id => !allowedWinnerIds.has(id));
  if (invalidWinners.length > 0) {
    return res.status(400).json({ error: `Победители должны быть ID участников этого конкурса: ${invalidWinners.join(', ')}` });
  }
  dbRun('UPDATE contests SET winners_json = ?, status = ?, updated_at = ? WHERE id = ?',
    JSON.stringify(winners), 'completed', new Date().toISOString(), contestId);
  const row = dbGet<any>('SELECT * FROM contests WHERE id = ?', contestId);
  res.json({ success: true, contest: contestFromRow(row, undefined, { includeRawWinners: true }) });
});

app.delete('/api/admin/contests/:contestId', (req, res) => {
  const admin = contestAdminAuth(req);
  if (!admin) return res.status(403).json({ error: 'Недостаточно прав' });
  const id = String(req.params.contestId || '');
  const row = dbGet<any>('SELECT * FROM contests WHERE id = ?', id);
  if (!row) return res.status(404).json({ error: 'Конкурс не найден' });
  dbRun('DELETE FROM contests WHERE id = ?', id);
  res.json({ success: true, deletedId: id });
});

app.get('/api/admin/users', (req, res) => {
  const admin = adminAuth(req);
  if (!admin) return res.status(403).json({ error: 'Недостаточно прав' });
  const q = normalizeOptionalText(req.query.q, 120).toLowerCase();
  const role = normalizeOptionalText(req.query.role, 40);
  const subscription = normalizeOptionalText(req.query.subscription, 40);
  const limit = Math.min(200, Math.max(10, Number(req.query.limit || 100) || 100));
  const offset = Math.max(0, Number(req.query.offset || 0) || 0);
  const where: string[] = [];
  const params: any[] = [];

  if (q) {
    const like = `%${q}%`;
    where.push(`(
      lower(u.id) LIKE ?
      OR lower(u.email) LIKE ?
      OR lower(u.name) LIKE ?
      OR lower(COALESCE(u.contact_vk_url, '')) LIKE ?
      OR lower(COALESCE(u.contact_telegram, '')) LIKE ?
      OR lower(COALESCE(u.contact_email, '')) LIKE ?
      OR lower(COALESCE(tg.username, '')) LIKE ?
      OR lower(COALESCE(tg.provider_user_id, '')) LIKE ?
    )`);
    params.push(like, like, like, like, like, like, like, like);
  }
  if (role === 'admin' || role === 'user') {
    where.push('u.role = ?');
    params.push(role);
  }
  if (subscription === 'active') where.push('(COALESCE(s.has_access, 0) = 1 OR COALESCE(g.active, 0) = 1)');
  if (subscription === 'inactive') where.push('(COALESCE(s.has_access, 0) = 0 AND COALESCE(g.active, 0) = 0)');

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = dbGet<{ count: number }>(`
    SELECT COUNT(*) AS count
    FROM users u
    LEFT JOIN identities tg ON tg.user_id = u.id AND tg.provider = 'telegram'
    LEFT JOIN subscriptions s ON s.user_id = u.id
    LEFT JOIN manual_subscription_grants g ON g.user_id = u.id
    ${whereSql}
  `, ...params)?.count ?? 0;
  const users = dbAll<any>(`
    SELECT
      u.*,
      tg.provider_user_id AS telegram_id,
      tg.username AS telegram_username,
      tg.photo_url AS telegram_photo_url,
      oidc.provider_user_id AS telegram_oidc_id,
      s.has_access,
      s.source AS subscription_source,
      s.message AS subscription_message,
      s.checked_at AS subscription_checked_at,
      s.updated_at AS subscription_updated_at,
      s.boosty_json,
      s.telegram_json,
      g.active AS lifetime_access,
      g.granted_at AS lifetime_granted_at,
      (
        SELECT COUNT(*) FROM contest_entries e WHERE e.user_id = u.id
      ) AS contest_entries_count
    FROM users u
    LEFT JOIN identities tg ON tg.user_id = u.id AND tg.provider = 'telegram'
    LEFT JOIN identities oidc ON oidc.user_id = u.id AND oidc.provider = 'telegram_oidc'
    LEFT JOIN subscriptions s ON s.user_id = u.id
    LEFT JOIN manual_subscription_grants g ON g.user_id = u.id
    ${whereSql}
    ORDER BY u.updated_at DESC, u.created_at DESC
    LIMIT ? OFFSET ?
  `, ...params, limit, offset);

  res.json({
    users: users.map(row => ({
      id: String(row.id),
      profileId: String(row.id),
      name: String(row.name || ''),
      email: String(row.email || ''),
      role: String(row.role || 'user'),
      country: String(row.country || ''),
      newsletterOptIn: Boolean(row.newsletter_opt_in),
      avatarInitials: String(row.avatar_initials || ''),
      telegramId: String(row.telegram_id || ''),
      telegramUsername: String(row.telegram_username || ''),
      telegramOidcId: String(row.telegram_oidc_id || ''),
      photoUrl: String(row.telegram_photo_url || ''),
      contactVkUrl: String(row.contact_vk_url || ''),
      contactTelegram: String(row.contact_telegram || ''),
      contactEmail: String(row.contact_email || ''),
      blockedAt: String(row.blocked_at || ''),
      lifetimeAccess: Boolean(row.lifetime_access),
      lifetimeGrantedAt: String(row.lifetime_granted_at || ''),
      subscription: (() => {
        const boosty = normalizeBoostySubscriptionDetail(safeJsonObject(row.boosty_json));
        const telegram = normalizeTelegramSubscriptionDetail(safeJsonObject(row.telegram_json));
        const lifetimeAccess = Boolean(row.lifetime_access);
        const providerSource = String(row.subscription_source || 'none');
        const source = lifetimeAccess
          ? providerSource === 'none' ? 'manual-lifetime' : `${providerSource},manual-lifetime`
          : providerSource;
        const entitlements = lifetimeAccess
          ? allEntitlements()
          : deriveStoredEntitlements(Boolean(row.has_access), source, boosty, telegram);
        return {
          hasAccess: hasAnyEntitlement(entitlements),
          source,
          message: lifetimeAccess ? 'Бессрочный доступ выдан администратором.' : String(row.subscription_message || ''),
          checkedAt: row.subscription_checked_at ? String(row.subscription_checked_at) : '',
          updatedAt: row.subscription_updated_at ? String(row.subscription_updated_at) : '',
          entitlements,
          boosty,
          telegram,
        };
      })(),
      contestEntriesCount: Number(row.contest_entries_count || 0),
      createdAt: String(row.created_at || ''),
      updatedAt: String(row.updated_at || ''),
    })),
    total,
    limit,
    offset,
  });
});

app.get('/api/admin/boosty/status', async (req, res) => {
  const admin = adminAuth(req);
  if (!admin) return res.status(403).json({ error: 'Недостаточно прав' });
  setPrivateNoStore(res);
  res.json(await fetchBoostyServiceStatus());
});

app.get('/api/admin/boosty/subscribers', async (req, res) => {
  const admin = adminAuth(req);
  if (!admin) return res.status(403).json({ error: 'Недостаточно прав' });
  setPrivateNoStore(res);
  try {
    const includeInactive = String(req.query.includeInactive ?? '1') !== '0';
    res.json(await fetchBoostySubscribers(includeInactive));
  } catch (err: any) {
    res.status(502).json({
      configured: Boolean(BOOSTY_AUTH_API_URL),
      source: 'unavailable',
      stale: true,
      subscribers: [],
      summary: {},
      levels: {},
      fetchedAt: new Date().toISOString(),
      error: err?.message || 'Не удалось загрузить подписчиков Boosty',
    });
  }
});

app.get('/api/admin/telegram/accounts', (req, res) => {
  const admin = adminAuth(req);
  if (!admin) return res.status(403).json({ error: 'Недостаточно прав' });
  setPrivateNoStore(res);
  const rows = dbAll<any>(`
    SELECT
      u.*,
      tg.provider_user_id AS telegram_id,
      tg.username AS telegram_username,
      tg.photo_url AS telegram_photo_url,
      tg.verified_at AS telegram_verified_at,
      oidc.provider_user_id AS telegram_oidc_id,
      oidc.username AS telegram_oidc_username,
      oidc.verified_at AS telegram_oidc_verified_at,
      s.has_access,
      s.source AS subscription_source,
      s.message AS subscription_message,
      s.checked_at AS subscription_checked_at,
      s.updated_at AS subscription_updated_at,
      s.boosty_json,
      s.telegram_json
    FROM users u
    LEFT JOIN identities tg ON tg.user_id = u.id AND tg.provider = 'telegram'
    LEFT JOIN identities oidc ON oidc.user_id = u.id AND oidc.provider = 'telegram_oidc'
    LEFT JOIN subscriptions s ON s.user_id = u.id
    ORDER BY u.updated_at DESC, u.created_at DESC
  `);

  const accounts = rows
    .map(row => {
      const boosty = normalizeBoostySubscriptionDetail(safeJsonObject(row.boosty_json));
      const telegram = normalizeTelegramSubscriptionDetail(safeJsonObject(row.telegram_json));
      const source = String(row.subscription_source || 'none');
      const entitlements = deriveStoredEntitlements(Boolean(row.has_access), source, boosty, telegram);
      const contactTelegram = String(row.contact_telegram || '').trim().replace(/^@/, '');
      const telegramUsername = String(row.telegram_username || telegram.username || row.telegram_oidc_username || contactTelegram || '').trim().replace(/^@/, '');
      const telegramId = String(row.telegram_id || telegram.telegramId || '').trim();
      const telegramOidcId = String(row.telegram_oidc_id || '').trim();
      const chats = Array.isArray(telegram.chats) ? telegram.chats : [];
      const hasTelegramIdentity = Boolean(telegramId || telegramOidcId);
      const hasContactOnly = Boolean(!hasTelegramIdentity && contactTelegram);
      const telegramAccess = Boolean(telegram.hasAccess);
      const subscriptionCheckedAt = row.subscription_checked_at ? String(row.subscription_checked_at) : '';
      const checkedMs = subscriptionCheckedAt ? Date.parse(subscriptionCheckedAt) : Number.NaN;
      const stale = Number.isFinite(checkedMs) ? Date.now() - checkedMs > SUBSCRIPTION_REFRESH_MS : true;
      const canBeChecked = Boolean(telegramId);
      let accessState: 'access' | 'checkable' | 'contact-only' | 'no-access' | 'blocked' = 'no-access';
      if (row.blocked_at) accessState = 'blocked';
      else if (telegramAccess) accessState = 'access';
      else if (canBeChecked) accessState = 'checkable';
      else if (hasContactOnly) accessState = 'contact-only';

      return {
        id: String(row.id),
        profileId: String(row.id),
        name: String(row.name || ''),
        email: String(row.email || ''),
        role: String(row.role || 'user'),
        blockedAt: String(row.blocked_at || ''),
        telegramId,
        telegramOidcId,
        telegramUsername,
        contactTelegram,
        photoUrl: String(row.telegram_photo_url || ''),
        hasTelegramIdentity,
        hasContactOnly,
        canBeChecked,
        hasAccess: hasAnyEntitlement(entitlements),
        telegramHasAccess: telegramAccess,
        accessState,
        source,
        message: String(row.subscription_message || telegram.message || ''),
        checkedAt: subscriptionCheckedAt,
        updatedAt: row.subscription_updated_at ? String(row.subscription_updated_at) : '',
        stale,
        entitlements,
        chats,
        boostyHasAccess: Boolean(boosty.hasAccess),
        createdAt: String(row.created_at || ''),
        userUpdatedAt: String(row.updated_at || ''),
      };
    })
    .filter(account => (
      account.hasTelegramIdentity
      || account.hasContactOnly
      || account.telegramHasAccess
      || account.source.includes('telegram')
      || account.chats.length > 0
    ));

  const summary = {
    total: accounts.length,
    access: accounts.filter(account => account.telegramHasAccess).length,
    checkable: accounts.filter(account => account.accessState === 'checkable').length,
    contactOnly: accounts.filter(account => account.accessState === 'contact-only').length,
    stale: accounts.filter(account => account.stale).length,
    blocked: accounts.filter(account => account.accessState === 'blocked').length,
  };
  res.json({
    configured: Boolean(KHA_VIP_BOT_TOKEN),
    chatIds: SUBSCRIPTION_TELEGRAM_CHAT_IDS,
    summary,
    accounts,
    fetchedAt: new Date().toISOString(),
  });
});

app.patch('/api/admin/users/:userId', (req, res) => {
  const admin = adminAuth(req);
  if (!admin) return res.status(403).json({ error: 'Недостаточно прав' });
  setPrivateNoStore(res);
  const userId = normalizeOptionalText(req.params.userId, 160);
  const store = loadAuthStore();
  const user = store.users.find(item => item.id === userId);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

  const nextRoleRaw = req.body?.role === undefined ? undefined : normalizeOptionalText(req.body.role, 20);
  const nextBlockedRaw = req.body?.blocked;
  const wantsLifetimeChange = Object.prototype.hasOwnProperty.call(req.body ?? {}, 'lifetimeAccess');
  if (nextBlockedRaw !== undefined && typeof nextBlockedRaw !== 'boolean') {
    return res.status(400).json({ error: 'Некорректное значение блокировки' });
  }
  if (wantsLifetimeChange && typeof req.body?.lifetimeAccess !== 'boolean') {
    return res.status(400).json({ error: 'Некорректное значение бессрочного доступа' });
  }
  if (!cookieMutationCsrfAllowed(req)) {
    return res.status(403).json({ error: 'Запрос отклонён: обновите страницу и повторите действие' });
  }
  const wantsRoleChange = nextRoleRaw !== undefined;
  const wantsBlockChange = nextBlockedRaw !== undefined;
  if (!wantsRoleChange && !wantsBlockChange && !wantsLifetimeChange) {
    return res.status(400).json({ error: 'Нет изменений' });
  }
  if (nextRoleRaw !== undefined && nextRoleRaw !== 'admin' && nextRoleRaw !== 'user') {
    return res.status(400).json({ error: 'Некорректная роль' });
  }
  const nextBlocked = nextBlockedRaw === undefined ? Boolean(user.blockedAt) : Boolean(nextBlockedRaw);
  const nextRole = nextRoleRaw === undefined ? user.role : nextRoleRaw as 'admin' | 'user';

  if (user.id === admin.id && nextBlocked) {
    return res.status(400).json({ error: 'Нельзя заблокировать свой аккаунт' });
  }
  if (user.id === admin.id && nextRole !== 'admin') {
    return res.status(400).json({ error: 'Нельзя снять администратора с самого себя' });
  }

  const wouldDisableAdmin = user.role === 'admin' && (nextRole !== 'admin' || nextBlocked);
  if (wouldDisableAdmin) {
    const remainingAdmins = store.users.filter(item => item.id !== user.id && item.role === 'admin' && !item.blockedAt);
    if (remainingAdmins.length === 0) {
      return res.status(400).json({ error: 'Нельзя оставить сайт без активного администратора' });
    }
  }

  const nowIso = new Date().toISOString();
  const previousRole = user.role;
  const previousBlocked = Boolean(user.blockedAt);
  const previousLifetime = Boolean(activeManualSubscriptionGrant(user.id));
  if (wantsRoleChange || wantsBlockChange) {
    user.role = nextRole;
    user.blockedAt = nextBlocked ? (user.blockedAt || nowIso) : '';
    user.updatedAt = nowIso;
    if (nextBlocked) {
      store.sessions = store.sessions.filter(item => item.userId !== user.id && item.email !== user.email);
    }
    saveAuthStore(store);
  }
  const auditDetails = {
    role: wantsRoleChange ? { from: previousRole, to: nextRole } : undefined,
    blocked: wantsBlockChange ? { from: previousBlocked, to: nextBlocked } : undefined,
    lifetimeAccess: wantsLifetimeChange ? { from: previousLifetime, to: Boolean(req.body.lifetimeAccess) } : undefined,
  };
  if (wantsLifetimeChange) {
    const lifetimeAccess = Boolean(req.body.lifetimeAccess);
    const database = db();
    try {
      database.exec('BEGIN IMMEDIATE');
      if (lifetimeAccess) {
        database.prepare(`
          INSERT INTO manual_subscription_grants (
            user_id, active, entitlements_json, granted_by, granted_at, revoked_by, revoked_at, note, updated_at
          ) VALUES (?, 1, ?, ?, ?, NULL, NULL, ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET
            active = 1,
            entitlements_json = excluded.entitlements_json,
            granted_by = CASE WHEN manual_subscription_grants.active = 1 THEN manual_subscription_grants.granted_by ELSE excluded.granted_by END,
            granted_at = CASE WHEN manual_subscription_grants.active = 1 THEN manual_subscription_grants.granted_at ELSE excluded.granted_at END,
            revoked_by = NULL,
            revoked_at = NULL,
            note = CASE WHEN manual_subscription_grants.active = 1 THEN manual_subscription_grants.note ELSE excluded.note END,
            updated_at = excluded.updated_at
        `).run(user.id, JSON.stringify(allEntitlements()), admin.id, nowIso, 'Бессрочный доступ из админ-панели', nowIso);
      } else {
        database.prepare(`
          UPDATE manual_subscription_grants
          SET active = 0, revoked_by = ?, revoked_at = ?, updated_at = ?
          WHERE user_id = ?
        `).run(admin.id, nowIso, nowIso, user.id);
      }
      recordAdminAudit(admin, 'user.updated', 'user', user.id, auditDetails);
      database.exec('COMMIT');
    } catch (err: any) {
      try { database.exec('ROLLBACK'); } catch { /* BEGIN may itself have failed. */ }
      return res.status(500).json({ error: err?.message || 'Не удалось изменить бессрочный доступ' });
    }
  } else {
    recordAdminAudit(admin, 'user.updated', 'user', user.id, auditDetails);
  }
  const lifetimeAccess = Boolean(activeManualSubscriptionGrant(user.id));
  res.json({
    success: true,
    user: { ...publicUser(user), lifetimeAccess },
    lifetimeAccess,
    subscription: readSubscriptionStatus(user.id) ?? emptySubscriptionStatus(),
  });
});

app.get('/api/admin/mailings/overview', (req, res) => {
  const admin = adminAuth(req);
  if (!admin) return res.status(403).json({ error: 'Недостаточно прав' });
  setPrivateNoStore(res);
  res.json(mailingOverviewPayload());
});

app.post('/api/admin/mailings/preview', (req, res) => {
  const admin = adminAuth(req);
  if (!admin) return res.status(403).json({ error: 'Недостаточно прав' });
  if (!cookieMutationCsrfAllowed(req)) return res.status(403).json({ error: 'Запрос отклонён: обновите страницу' });
  setPrivateNoStore(res);
  if (!NEWSLETTER_UNSUBSCRIBE_SECRET) {
    return res.status(503).json({ error: 'На сервере не настроена безопасная подпись предпросмотра' });
  }
  try {
    const draft = normalizeNewsletterDraft(req.body);
    const contacts = eligibleMailingContacts(draft.segment);
    const recipientCount = contacts.length;
    const previewUrl = `${APP_URL}/api/newsletter/unsubscribe?token=preview`;
    res.json({
      subject: draft.subject,
      html: renderNewsletterHtml(draft, previewUrl, true),
      text: draft.textBody,
      recipientCount,
      previewDigest: newsletterPreviewDigest(draft, contacts),
      sanitizedHtmlBody: draft.htmlBody,
    });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Не удалось подготовить предпросмотр' });
  }
});

app.post('/api/admin/mailings/test', adminIdGuard, newsletterTestLimiter, async (req, res) => {
  const admin = adminAuth(req);
  if (!admin) return res.status(403).json({ error: 'Недостаточно прав' });
  if (!cookieMutationCsrfAllowed(req)) return res.status(403).json({ error: 'Запрос отклонён: обновите страницу' });
  setPrivateNoStore(res);
  try {
    if (!isRealEmail(admin.email)) return res.status(400).json({ error: 'У администратора нет подтверждённой почты для теста' });
    const draft = normalizeNewsletterDraft(req.body);
    syncMailingContactForUser(db(), admin, { source: 'admin-test' });
    const contact = dbGet<any>('SELECT * FROM mailing_contacts WHERE lower(email) = lower(?)', admin.email);
    if (!contact) return res.status(400).json({ error: 'Не удалось подготовить тестовый контакт' });
    const token = newsletterUnsubscribeToken(String(contact.id));
    const unsubscribeUrl = `${APP_URL}/api/newsletter/unsubscribe?token=${encodeURIComponent(token)}`;
    const testDraft = { ...draft, subject: `[Тест] ${draft.subject}` };
    const host = new URL(APP_URL).hostname;
    await sendMimeEmail({
      to: admin.email,
      subject: testDraft.subject,
      text: `${draft.textBody}\n\nОтписаться от рассылки: ${unsubscribeUrl}`,
      html: renderNewsletterHtml(testDraft, unsubscribeUrl),
      messageId: `${randomBytes(12).toString('hex')}@${host}`,
      headers: ['Precedence: bulk', `List-Unsubscribe: <${unsubscribeUrl}>`, 'List-Unsubscribe-Post: List-Unsubscribe=One-Click'],
    });
    recordAdminAudit(admin, 'mailing.test-sent', 'mailing', 'test', { templateKey: draft.templateKey });
    res.json({ success: true, message: `Тестовое письмо принято для ${admin.email}` });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Не удалось отправить тестовое письмо' });
  }
});

app.post('/api/admin/mailings/send', adminIdGuard, newsletterSendLimiter, (req, res) => {
  const admin = adminAuth(req);
  if (!admin) return res.status(403).json({ error: 'Недостаточно прав' });
  if (!cookieMutationCsrfAllowed(req)) return res.status(403).json({ error: 'Запрос отклонён: обновите страницу' });
  setPrivateNoStore(res);
  try {
    if (String(req.body?.confirmation || '') !== 'SEND') {
      return res.status(400).json({ error: 'Подтвердите массовую отправку' });
    }
    if (!NEWSLETTER_UNSUBSCRIBE_SECRET) {
      return res.status(503).json({ error: 'На сервере не настроена безопасная ссылка отписки' });
    }
    const running = dbGet<any>("SELECT id FROM mailing_campaigns WHERE status IN ('queued', 'sending') LIMIT 1");
    if (running) return res.status(409).json({ error: 'Другая рассылка уже выполняется' });
    const draft = normalizeNewsletterDraft(req.body);
    const contacts = eligibleMailingContacts(draft.segment);
    const expectedRecipients = Number(req.body?.expectedRecipients);
    if (!Number.isInteger(expectedRecipients) || expectedRecipients !== contacts.length) {
      return res.status(409).json({ error: `Аудитория изменилась: сейчас ${contacts.length}. Обновите предпросмотр.` });
    }
    if (!contacts.length) return res.status(400).json({ error: 'В выбранной аудитории нет доступных адресов' });
    const suppliedPreviewDigest = String(req.body?.previewDigest || '').trim();
    const expectedPreviewDigest = newsletterPreviewDigest(draft, contacts);
    if (!safeEqualHex(suppliedPreviewDigest, expectedPreviewDigest)) {
      return res.status(409).json({ error: 'Предпросмотр устарел или содержимое письма изменилось. Обновите предпросмотр.' });
    }
    const campaignId = `campaign_${Date.now().toString(36)}_${randomBytes(5).toString('hex')}`;
    const nowIso = new Date().toISOString();
    const database = db();
    try {
      database.exec('BEGIN IMMEDIATE');
      database.prepare(`
        INSERT INTO mailing_campaigns (
          id, subject, preheader, html_body, text_body, template_key, segment, status,
          created_by, created_at, recipient_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?)
      `).run(campaignId, draft.subject, draft.preheader, draft.htmlBody, draft.textBody, draft.templateKey, draft.segment,
      admin.id, nowIso, contacts.length);
      const insertDelivery = database.prepare(`
        INSERT INTO mailing_deliveries (campaign_id, contact_id, email_snapshot, status, attempts, updated_at)
        VALUES (?, ?, ?, 'pending', 0, ?)
      `);
      for (const contact of contacts) insertDelivery.run(campaignId, contact.id, contact.email, nowIso);
      database.exec('COMMIT');
    } catch (err) {
      database.exec('ROLLBACK');
      throw err;
    }
    recordAdminAudit(admin, 'mailing.queued', 'mailing_campaign', campaignId, {
      segment: draft.segment,
      recipientCount: contacts.length,
      templateKey: draft.templateKey,
    });
    setImmediate(() => void runNewsletterCampaign(campaignId));
    res.status(202).json({ success: true, campaign: mailingCampaignFromRow(dbGet<any>('SELECT * FROM mailing_campaigns WHERE id = ?', campaignId)) });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Не удалось запустить рассылку' });
  }
});

app.get('/api/admin/mailings/:campaignId', (req, res) => {
  const admin = adminAuth(req);
  if (!admin) return res.status(403).json({ error: 'Недостаточно прав' });
  setPrivateNoStore(res);
  const campaignId = normalizeOptionalText(req.params.campaignId, 160);
  const row = dbGet<any>('SELECT * FROM mailing_campaigns WHERE id = ?', campaignId);
  if (!row) return res.status(404).json({ error: 'Рассылка не найдена' });
  res.json({ campaign: mailingCampaignFromRow(row) });
});

app.get('/api/newsletter/unsubscribe', (req, res) => {
  setPrivateNoStore(res);
  res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
  const token = String(req.query.token || '');
  const contact = mailingContactFromUnsubscribeToken(token);
  if (!contact) return res.status(400).type('html').send('<!doctype html><meta charset="utf-8"><title>Ссылка недействительна</title><p>Ссылка отписки недействительна или устарела.</p>');
  const alreadyUnsubscribed = contact.consent_status === 'unsubscribed' || contact.consent_status === 'suppressed';
  res.type('html').send(`<!doctype html>
    <html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Отписка от Manacost</title>
    <style>body{margin:0;background:#eef3f8;color:#1d2c3a;font:16px/1.5 Arial,sans-serif}.card{width:min(92%,520px);margin:10vh auto;padding:28px;border:1px solid #cad7e4;border-radius:12px;background:#fff}button{min-height:42px;padding:0 18px;border:0;border-radius:6px;background:#0d6fae;color:#fff;font-weight:700;cursor:pointer}</style></head>
    <body><main class="card"><h1>${alreadyUnsubscribed ? 'Вы уже отписаны' : 'Отписаться от рассылки?'}</h1>
    <p>${alreadyUnsubscribed ? 'Новые письма на этот адрес отправляться не будут.' : 'После подтверждения мы сохраним адрес только в списке исключений, чтобы больше не отправлять письма.'}</p>
    ${alreadyUnsubscribed ? '' : `<form method="post" action="/api/newsletter/unsubscribe"><input type="hidden" name="token" value="${escapeNewsletterHtml(token)}"><button type="submit">Подтвердить отписку</button></form>`}
    </main></body></html>`);
});

app.post('/api/newsletter/unsubscribe', (req, res) => {
  setPrivateNoStore(res);
  const token = String(req.body?.token || req.query.token || '');
  const contact = mailingContactFromUnsubscribeToken(token);
  if (!contact) return res.status(400).json({ error: 'Ссылка отписки недействительна' });
  const nowIso = new Date().toISOString();
  dbRun(`
    UPDATE mailing_contacts
    SET consent_status = 'unsubscribed', unsubscribed_at = COALESCE(unsubscribed_at, ?),
        suppressed_reason = 'user-unsubscribed', updated_at = ?
    WHERE id = ?
  `, nowIso, nowIso, contact.id);
  if (contact.user_id) dbRun('UPDATE users SET newsletter_opt_in = 0, updated_at = ? WHERE id = ?', nowIso, contact.user_id);
  if (String(req.headers['list-unsubscribe'] || req.body?.ListUnsubscribe || '') === 'One-Click'
    || String(req.body?.['List-Unsubscribe'] || '') === 'One-Click') {
    return res.json({ success: true });
  }
  res.type('html').send('<!doctype html><meta charset="utf-8"><title>Вы отписались</title><p>Готово. Новые письма Manacost на этот адрес отправляться не будут.</p>');
});

app.get('/api/admin/users/search', (req, res) => {
  const admin = adminAuth(req);
  if (!admin) return res.status(403).json({ error: 'Недостаточно прав' });
  setPrivateNoStore(res);
  const q = normalizeOptionalText(req.query.q, 120);
  if (!q) return res.json({ users: [] });
  const like = `%${q.toLowerCase()}%`;
  const users = dbAll<any>(`
    SELECT
      u.*,
      tg.username AS telegram_username,
      s.has_access,
      s.source AS subscription_source,
      s.checked_at AS subscription_checked_at,
      s.boosty_json,
      s.telegram_json
    FROM users u
    LEFT JOIN identities tg ON tg.user_id = u.id AND tg.provider = 'telegram'
    LEFT JOIN subscriptions s ON s.user_id = u.id
    WHERE lower(u.id) LIKE ?
      OR lower(u.email) LIKE ?
      OR lower(u.name) LIKE ?
      OR lower(COALESCE(u.contact_vk_url, '')) LIKE ?
      OR lower(COALESCE(u.contact_telegram, '')) LIKE ?
      OR lower(COALESCE(u.contact_email, '')) LIKE ?
      OR lower(COALESCE(tg.username, '')) LIKE ?
    ORDER BY u.updated_at DESC
    LIMIT 40
  `, like, like, like, like, like, like, like);
  res.json({
    users: users.map(row => ({
      id: String(row.id),
      profileId: String(row.id),
      name: String(row.name || ''),
      email: String(row.email || ''),
      role: String(row.role || 'user'),
      country: String(row.country || ''),
      telegramUsername: String(row.telegram_username || ''),
      contactVkUrl: String(row.contact_vk_url || ''),
      contactTelegram: String(row.contact_telegram || ''),
      contactEmail: String(row.contact_email || ''),
      subscription: (() => {
        const source = String(row.subscription_source || 'none');
        const boosty = normalizeBoostySubscriptionDetail(safeJsonObject(row.boosty_json));
        const telegram = normalizeTelegramSubscriptionDetail(safeJsonObject(row.telegram_json));
        const entitlements = deriveStoredEntitlements(Boolean(row.has_access), source, boosty, telegram);
        return {
          hasAccess: hasAnyEntitlement(entitlements),
          source,
          checkedAt: row.subscription_checked_at ? String(row.subscription_checked_at) : '',
          entitlements,
        };
      })(),
      createdAt: String(row.created_at || ''),
      updatedAt: String(row.updated_at || ''),
    })),
  });
});

app.post('/api/subscription/email/request', authCodeRequestLimiter, async (req, res) => {
  setPrivateNoStore(res);
  const user = userAuth(req);
  if (!user) return res.status(401).json({ error: 'Требуется вход' });
  const email = normalizeEmail(req.body?.email);
  if (!isRealEmail(email)) return res.status(400).json({ error: 'Укажите реальную почту Boosty' });

  const store = loadAuthStore();
  const existing = store.users.find(item => item.email === email && item.id !== user.id);
  if (existing || identityBelongsToAnotherUser('boosty-email', email, user.id)) {
    return res.status(409).json({ error: 'Эта почта уже привязана к другому профилю' });
  }

  const authCode = prepareAuthCode(store, email);
  if (authCode.ok === false) return res.status(authCode.status).json({ error: authCode.error });
  saveAuthStore(store);

  try {
    await sendAuthCodeEmail(email, authCode.code);
    res.json({ success: true, email, message: 'Код подтверждения отправлен на почту' });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Не удалось отправить код' });
  }
});

app.post('/api/subscription/email/confirm', authCodeVerifyLimiter, async (req, res) => {
  setPrivateNoStore(res);
  const authedUser = userAuth(req);
  if (!authedUser) return res.status(401).json({ error: 'Требуется вход' });
  const email = normalizeEmail(req.body?.email);
  const code = String(req.body?.code ?? '').replace(/\D/g, '');
  if (!isRealEmail(email)) return res.status(400).json({ error: 'Укажите реальную почту Boosty' });

  const store = loadAuthStore();
  let user = store.users.find(item => item.id === authedUser.id);
  if (!user) return res.status(401).json({ error: 'Пользователь не найден' });
  const existing = store.users.find(item => item.email === email && item.id !== user.id);
  if (existing || identityBelongsToAnotherUser('boosty-email', email, user.id)) {
    return res.status(409).json({ error: 'Эта почта уже привязана к другому профилю' });
  }
  const pending = store.pendingCodes.find(item => item.email === email && item.expiresAt > Date.now());
  if (!pending) return res.status(401).json({ error: 'Код устарел. Запросите новый.' });

  pending.attempts += 1;
  if (pending.attempts > AUTH_CODE_MAX_ATTEMPTS || !verifyPendingCode(pending, code)) {
    saveAuthStore(store);
    return res.status(401).json({ error: 'Неверный код' });
  }

  const oldEmail = user.email;
  user.email = email;
  user.updatedAt = new Date().toISOString();
  store.pendingCodes = store.pendingCodes.filter(item => item.email !== email);
  store.sessions = store.sessions.map(session => session.email === oldEmail ? { ...session, email } : session);
  saveAuthStore(store);
  syncMailingContactForUser(db(), user, {
    confirmConsent: Boolean(user.newsletterOptIn),
    source: 'verified-email-change',
  });
  const nowIso = new Date().toISOString();
  dbRun(`
    INSERT INTO identities (user_id, provider, provider_user_id, email, username, photo_url, verified_at, created_at, updated_at)
    VALUES (?, 'boosty-email', ?, ?, ?, '', ?, ?, ?)
    ON CONFLICT(provider, provider_user_id) DO UPDATE SET
      email = excluded.email,
      username = excluded.username,
      verified_at = excluded.verified_at,
      updated_at = excluded.updated_at
      WHERE identities.user_id = excluded.user_id
  `, user.id, email, email, email, nowIso, nowIso, nowIso);
  const status = await refreshSubscriptionForUser(user, true);
  res.json({ success: true, user: publicUser(user), subscription: status });
});

app.get('/api/ecosystem/internal/user', internalApiGuard, (req, res) => {
  setPrivateNoStore(res);
  const user = resolveUserFromRequest(req);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user: publicUser(user), subscription: readSubscriptionStatus(user.id) ?? emptySubscriptionStatus() });
});

app.get('/api/ecosystem/internal/subscription', internalApiGuard, async (req, res) => {
  setPrivateNoStore(res);
  const user = resolveUserFromRequest(req);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const force = String(req.query.force ?? '') === '1';
  const status = await refreshSubscriptionForUser(user, force);
  res.json({ user: publicUser(user), subscription: status });
});

app.post('/api/ecosystem/internal/subscription', internalApiGuard, async (req, res) => {
  setPrivateNoStore(res);
  const user = resolveUserFromRequest(req);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const status = await refreshSubscriptionForUser(user, true);
  res.json({ user: publicUser(user), subscription: status });
});

// ─── Admin API (/api/admin-articles — matches Vercel file api/admin-articles.js) ─

function adminIdGuard(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) {
  const user = userAuth(req);
  if (!user) return res.status(401).json({ error: 'Требуется вход' });
  if (!isAdminUser(user)) return res.status(403).json({ error: 'Доступ запрещён для этого ID' });
  next();
}

app.post('/api/admin-articles', adminIdGuard, async (req, res) => {
  if (!adminAuth(req)) return res.status(401).json({ error: 'Требуется вход' });
  const { article } = req.body ?? {};
  if (!article?.title?.trim()) return res.status(400).json({ error: 'Заголовок обязателен' });
  try {
    const filePath = join(DATA_DIR, 'articles.json');
    const existing: any = loadData('articles.json') ?? { articles: [], updatedAt: null };
    const publishedDate = normalizeDateOnlyInput(article.date) || new Date().toISOString().slice(0, 10);
    const newArticle = {
      id:      Date.now().toString(),
      title:   article.title.trim(),
      date:    publishedDate,
      image:   article.image   ?? '',
      excerpt: article.excerpt ?? '',
      tag:     article.tag     ?? '',
      mode:    normalizeArticleModeInput(article.mode, article),
      url:     article.url     ?? '#',
    };
    existing.articles.unshift(newArticle);
    existing.articles.sort((a: any, b: any) => articleDateMs(b) - articleDateMs(a) || String(b.id ?? '').localeCompare(String(a.id ?? '')));
    existing.updatedAt = new Date().toISOString();
    writeFileSync(filePath, JSON.stringify(existing, null, 2), 'utf-8');
    dataCache.delete('articles.json');
    res.json({ success: true, article: newArticle });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/admin-articles', adminIdGuard, async (req, res) => {
  if (!adminAuth(req)) return res.status(401).json({ error: 'Требуется вход' });
  const id = normalizeOptionalText(req.body?.id ?? req.query?.id, 160);
  const { article } = req.body ?? {};
  if (!id) return res.status(400).json({ error: 'id обязателен' });
  if (!article?.title?.trim()) return res.status(400).json({ error: 'Заголовок обязателен' });
  try {
    const filePath = join(DATA_DIR, 'articles.json');
    const existing: any = loadData('articles.json') ?? { articles: [], updatedAt: null };
    const list = Array.isArray(existing.articles) ? existing.articles : [];
    const index = list.findIndex((item: any) => String(item.id) === id);
    if (index === -1) return res.status(404).json({ error: 'Статья не найдена' });
    const previous = list[index] ?? {};
    const updatedArticle = {
      ...previous,
      id,
      title: String(article.title ?? '').trim(),
      date: normalizeDateOnlyInput(article.date) || String(previous.date || new Date().toISOString().slice(0, 10)),
      image: String(article.image ?? ''),
      excerpt: String(article.excerpt ?? ''),
      tag: String(article.tag ?? ''),
      mode: normalizeArticleModeInput(article.mode, article),
      url: String(article.url ?? '#'),
    };
    list[index] = updatedArticle;
    existing.articles = list.sort((a: any, b: any) => articleDateMs(b) - articleDateMs(a) || String(b.id ?? '').localeCompare(String(a.id ?? '')));
    existing.updatedAt = new Date().toISOString();
    writeFileSync(filePath, JSON.stringify(existing, null, 2), 'utf-8');
    dataCache.delete('articles.json');
    res.json({ success: true, article: updatedArticle });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/uploads/image', async (req, res) => {
  const canUpload = Boolean(adminAuth(req) || contestAdminAuth(req));
  if (!canUpload) return res.status(403).json({ error: 'Недостаточно прав' });
  const dataUrl = String(req.body?.dataUrl || '');
  const match = dataUrl.match(/^data:image\/[a-z0-9.+-]+;base64,([a-z0-9+/=\s]+)$/i);
  if (!match) return res.status(400).json({ error: 'Нужно передать изображение в формате data URL' });

  try {
    const base64 = match[1].replace(/\s/g, '');
    if (!/^[a-z0-9+/]+={0,2}$/i.test(base64) || base64.length % 4 !== 0) {
      return res.status(400).json({ error: 'Некорректные base64-данные изображения' });
    }
    const source = Buffer.from(base64, 'base64');
    if (!source.length) return res.status(400).json({ error: 'Файл пустой' });
    if (source.length > ADMIN_UPLOAD_MAX_BYTES) return res.status(413).json({ error: 'Картинка больше 12 МБ' });

    const actualFormat = detectAdminUploadFormat(source);
    if (!actualFormat) return res.status(415).json({ error: 'Формат изображения не распознан' });

    const metadata = await sharp(source, { limitInputPixels: ADMIN_UPLOAD_MAX_PIXELS }).metadata();
    const width = Number(metadata.width || 0);
    const height = Number(metadata.height || 0);
    if (!width || !height) return res.status(400).json({ error: 'Не удалось определить размер изображения' });
    if ((metadata.pages || 1) > 1) return res.status(400).json({ error: 'Анимированные изображения не поддерживаются' });
    if (width > ADMIN_UPLOAD_MAX_WIDTH || height > ADMIN_UPLOAD_MAX_HEIGHT || width * height > ADMIN_UPLOAD_MAX_PIXELS) {
      return res.status(413).json({ error: 'Разрешение изображения слишком большое' });
    }

    mkdirSync(ADMIN_UPLOAD_DIR, { recursive: true });
    mkdirSync(ADMIN_UPLOAD_SOURCE_DIR, { recursive: true });
    const fileName = `${Date.now().toString(36)}-${randomBytes(5).toString('hex')}.webp`;
    const distPath = join(ADMIN_UPLOAD_DIR, fileName);
    const sourcePath = join(ADMIN_UPLOAD_SOURCE_DIR, fileName);
    const output = await sharp(source, { limitInputPixels: ADMIN_UPLOAD_MAX_PIXELS })
      .rotate()
      .resize({ width: 1800, height: 1200, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 86 })
      .toBuffer();
    writeFileSync(distPath, output);
    chmodSync(distPath, 0o644);
    if (sourcePath !== distPath) {
      writeFileSync(sourcePath, output);
      chmodSync(sourcePath, 0o644);
    }
    res.json({ success: true, url: `/uploads/admin/${fileName}` });
  } catch (err: any) {
    console.warn('[admin-upload] image processing failed:', err?.message || err);
    res.status(500).json({ error: 'Не удалось обработать изображение' });
  }
});

app.use('/api', createReferralRouter({
  getDatabase: db,
  adminGuard: adminIdGuard,
  adminAuth,
  appUrl: APP_URL,
  clientIp: getTrustedClientIp,
  ipHashSalt: process.env.ECOSYSTEM_INTERNAL_KEY || 'manacost-referrals',
}));

app.get('/api/admin-class-positions', adminIdGuard, (req, res) => {
  if (!adminAuth(req)) return res.status(401).json({ error: 'Требуется вход' });
  try {
    res.json(loadClassPositionsData());
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin-class-positions', adminIdGuard, (req, res) => {
  if (!adminAuth(req)) return res.status(401).json({ error: 'Требуется вход' });
  const positions = req.body?.positions;
  if (!positions || typeof positions !== 'object' || Array.isArray(positions)) {
    return res.status(400).json({ error: 'positions must be an object' });
  }
  try {
    const normalized = Object.fromEntries(
      Object.entries(positions)
        .map(([key, value]) => [key, String(value ?? '').trim()])
        .filter(([, value]) => value.length > 0)
    );
    const payload = { positions: normalized, updatedAt: new Date().toISOString() };
    const filePath = join(DATA_DIR, 'class_positions.json');
    writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf-8');
    res.json({ success: true, ...payload });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Image generation (/api/admin/gen-image) ──────────────────────────────────

let isGenerating = false;

app.post('/api/admin/gen-image', adminIdGuard, (req, res) => {
  if (!adminAuth(req)) return res.status(401).json({ error: 'Требуется вход' });

  const type = (req.body?.type as string) ?? 'legendaries';
  const scriptMap: Record<string, string> = {
    legendaries: join(APP_ROOT_DIR, 'server', 'gen_legendary_image.py'),
  };
  const script = scriptMap[type];
  if (!script || !existsSync(script)) {
    return res.status(400).json({ error: `Скрипт для типа "${type}" не найден` });
  }
  if (isGenerating) {
    return res.status(409).json({ error: 'Генерация уже запущена' });
  }

  const outRel = `generated/${type === 'legendaries' ? 'top_legendaries' : type}.png`;
  const outAbs = join(APP_ROOT_DIR, 'public', outRel);

  isGenerating = true;
  const logs: string[] = [];

  const py = spawn('python', [script, outAbs], { cwd: join(APP_ROOT_DIR, 'server') });

  py.stdout.on('data', (d: Buffer) => {
    const line = d.toString().trim();
    if (line) { logs.push(line); console.log('[gen-image]', line); }
  });
  py.stderr.on('data', (d: Buffer) => {
    const line = d.toString().trim();
    if (line) { logs.push('ERR: ' + line); console.error('[gen-image]', line); }
  });

  py.on('close', (code: number) => {
    isGenerating = false;
    if (code === 0) {
      console.log('[gen-image] Done →', outAbs);
    } else {
      console.error('[gen-image] Failed, code:', code);
    }
  });

  // Respond immediately with task started; client polls /api/admin/gen-status
  res.json({ message: 'Генерация запущена', outUrl: '/' + outRel });
});

app.get('/api/admin/gen-status', adminIdGuard, (req, res) => {
  if (!adminAuth(req)) return res.status(401).json({ error: 'Требуется вход' });
  res.json({ busy: isGenerating });
});

app.delete('/api/admin-articles', adminIdGuard, (req, res) => {
  if (!adminAuth(req)) return res.status(401).json({ error: 'Требуется вход' });
  const id = req.body?.id;
  if (!id) return res.status(400).json({ error: 'id обязателен' });
  try {
    const filePath = join(DATA_DIR, 'articles.json');
    const existing: any = loadData('articles.json') ?? { articles: [], updatedAt: null };
    const before = existing.articles.length;
    existing.articles = existing.articles.filter((a: any) => a.id !== id);
    if (existing.articles.length === before) return res.status(404).json({ error: 'Статья не найдена' });
    existing.updatedAt = new Date().toISOString();
    writeFileSync(filePath, JSON.stringify(existing, null, 2), 'utf-8');
    dbRun('DELETE FROM article_votes WHERE article_id = ?', String(id));
    dataCache.delete('articles.json');
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.use(structuredErrorMiddleware());

cron.schedule('*/30 * * * *', async () => {
  console.log('[Subscription] Starting scheduled subscription refresh...');
  try {
    await refreshAllSubscriptions();
    console.log('[Subscription] Scheduled subscription refresh complete.');
  } catch (err) {
    console.error('[Subscription] Scheduled subscription refresh failed:', err);
  }
});

app.listen(PORT, HOST, () => {
  console.log(`[Server] API server running on http://${HOST || 'localhost'}:${PORT}`);
  console.log(`[Server] Blizzard card images: ${blizzardCardImages.configured ? 'enabled' : 'disabled (HearthstoneJSON fallback)'}`);
  console.log('[Server] Scraping is isolated in hs-arena-scraper.service. Trigger queue: POST /api/scrape');

  const mailingResumeTimer = setTimeout(() => resumeNewsletterCampaigns(), 1500);
  mailingResumeTimer.unref?.();

});
