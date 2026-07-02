import express from 'express';
import cron from 'node-cron';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import sharp from 'sharp';
import { createClient } from 'redis';
import { chmodSync, copyFileSync, createReadStream, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { spawn } from 'child_process';
import { createHash, createHmac, createPublicKey, randomBytes, randomInt, scryptSync, timingSafeEqual, verify } from 'crypto';
// @ts-ignore: node:sqlite is available in the production Node 22 runtime.
import { DatabaseSync } from 'node:sqlite';
import { scrapeAll, loadData } from './scraper.js';
import { HSREPLAY_NO_ARENASMITH_TIER, normalizeArenasmithTier, tierFromArenasmithScore } from './hsreplayArenasmith.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const DATA_DIR   = join(__dirname, 'data');
const CARD_IMAGE_CACHE_DIR = join(DATA_DIR, 'card-images');
const ADMIN_UPLOAD_SOURCE_DIR = process.env.ADMIN_UPLOAD_SOURCE_DIR || join(DATA_DIR, 'uploads', 'admin');
const ADMIN_UPLOAD_DIR = process.env.ADMIN_UPLOAD_DIR || ADMIN_UPLOAD_SOURCE_DIR;
const CARD_IMAGE_CACHE_VERSION = 'card_img_v1';
const MAX_CARD_IMAGE_JOBS = 4;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const BG_DATA_CACHE_MS = Math.max(60_000, Number(process.env.BG_DATA_CACHE_MS || ONE_DAY_MS));
const BG_DATA_STALE_MS = Math.max(60_000, Number(process.env.BG_DATA_STALE_MS || 7 * ONE_DAY_MS));
const BG_JSON_CACHE_CONTROL = `public, max-age=${Math.floor(BG_DATA_CACHE_MS / 1000)}, stale-while-revalidate=${Math.floor(BG_DATA_STALE_MS / 1000)}`;
const BG_IMAGE_CACHE_CONTROL = 'public, max-age=2592000, immutable';

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
const battlegroundAppProxyCache = new Map<string, ProxyBodyCacheEntry>();
let homeSummaryApiCache: MemoryCacheEntry | null = null;
let arenaDecksCache: MemoryCacheEntry | null = null;
const cardImageJobs = new Map<string, Promise<string>>();
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
  battlegroundAppProxyCache.clear();
  homeSummaryApiCache = null;
  classMatchupsCache = null;
  arenaDecksCache = null;
  void clearRedisDataCache();
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
const KOLODAHS_RELATED_CARD_PAGES_DIR = join(KOLODAHS_DB_ROOT, 'var/wiki-hs-cache/related-card-pages');
const AUTH_COOKIE_NAME = 'manacost_auth_token';
const AUTH_FROM = process.env.AUTH_FROM || 'noreply@hs-manacost.ru';
const AUTH_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const AUTH_CODE_TTL_MS = 10 * 60 * 1000;
const TELEGRAM_AUTH_BOT_TOKEN = process.env.TELEGRAM_AUTH_BOT_TOKEN || '';
const TELEGRAM_AUTH_BOT_USERNAME = (process.env.TELEGRAM_AUTH_BOT_USERNAME || '').trim().replace(/^@/, '');
const TELEGRAM_AUTH_MAX_AGE_MS = 24 * 60 * 60 * 1000;
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
const KHA_VIP_BOT_TOKEN = process.env.KHA_VIP_BOT_TOKEN || '';
const KHA_VIP_PROFILES_FILE = process.env.KHA_VIP_PROFILES_FILE || '/var/lib/docker/volumes/kha-vip-bot_bot_cache/_data/profiles.json';
const KHA_VIP_WP_BASE_URL = (process.env.KHA_VIP_WP_BASE_URL || process.env.WP_BASE_URL || 'https://kolodahearthstone.ru').replace(/\/$/, '');
const KHA_VIP_WP_BEARER = process.env.KHA_VIP_WP_BEARER || process.env.WP_BEARER || '';
const KHA_VIP_LOCKERS_CACHE_MS = Math.max(60_000, Number(process.env.KHA_VIP_LOCKERS_CACHE_MS || 5 * 60 * 1000));
const KHA_VIP_ARTICLE_HOSTS = new Set(['kolodahearthstone.ru', 'www.kolodahearthstone.ru']);
const KOLODAHS_API_BASE_URL = (process.env.KOLODAHS_API_BASE_URL || 'https://db.kolodahs.ru/api/v1').replace(/\/$/, '');
const OLD_GUIDES_DB_FILE = process.env.OLD_GUIDES_DB_FILE || '/var/www/koloda/data/old-sites/kolodahearthstone.ru_old/db/guides.sqlite';
const OLD_GUIDES_PUBLIC_URL = (process.env.OLD_GUIDES_PUBLIC_URL || 'https://old.kolodahearthstone.ru').replace(/\/$/, '');
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
const REDIS_URL = (process.env.REDIS_URL || 'redis://127.0.0.1:6379').trim();
const REDIS_ENABLED = process.env.REDIS_ENABLED !== '0' && REDIS_URL !== '';
const REDIS_CACHE_PREFIX = process.env.REDIS_CACHE_PREFIX || 'hs-arena:v2';
const REDIS_DATASET_TTL_SECONDS = Math.max(60, Number(process.env.REDIS_DATASET_TTL_SECONDS || 6 * 60 * 60));
const REDIS_HOME_SUMMARY_TTL_SECONDS = Math.max(60, Number(process.env.REDIS_HOME_SUMMARY_TTL_SECONDS || 5 * 60));
const DATASET_MEMORY_CACHE_MS = Math.max(60_000, Number(process.env.DATASET_MEMORY_CACHE_MS || 5 * 60 * 1000));
const HOME_SUMMARY_CACHE_MS = REDIS_HOME_SUMMARY_TTL_SECONDS * 1000;
const CONTEST_ADMIN_USER_ID = 'user_42368c85b8de';

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
  boosty: Record<string, any>;
  telegram: Record<string, any>;
}

interface PendingCode {
  email: string;
  codeHash: string;
  expiresAt: number;
  attempts: number;
}

interface AdminSession {
  tokenHash: string;
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
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  ecosystemDb.exec('CREATE INDEX IF NOT EXISTS idx_referral_clicks_referral_time ON referral_clicks(referral_id, clicked_at DESC);');
  const userColumns = new Set((ecosystemDb.prepare('PRAGMA table_info(users)').all() as any[]).map(row => String(row.name)));
  if (!userColumns.has('contact_vk_url')) ecosystemDb.exec('ALTER TABLE users ADD COLUMN contact_vk_url TEXT');
  if (!userColumns.has('contact_telegram')) ecosystemDb.exec('ALTER TABLE users ADD COLUMN contact_telegram TEXT');
  if (!userColumns.has('contact_email')) ecosystemDb.exec('ALTER TABLE users ADD COLUMN contact_email TEXT');
  migrateLegacyAuthStore(ecosystemDb);
  syncKhaVipProfiles(ecosystemDb);
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
      if (code.expiresAt > Date.now() && code.attempts < 5) {
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

function upsertUserRow(database: DatabaseSync, user: AdminUser) {
  const nowIso = new Date().toISOString();
  const createdAt = user.createdAt || nowIso;
  const updatedAt = user.updatedAt || nowIso;
  database.prepare(`
    INSERT INTO users (
      id, email, name, role, country, newsletter_opt_in, avatar_initials, contact_vk_url, contact_telegram, contact_email, password_hash, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    user.passwordHash,
    createdAt,
    updatedAt,
  );

  database.prepare("DELETE FROM identities WHERE user_id = ? AND provider = 'email' AND provider_user_id <> ?").run(user.id, user.email);
  database.prepare(`
    INSERT INTO identities (user_id, provider, provider_user_id, email, username, photo_url, verified_at, created_at, updated_at)
    VALUES (?, 'email', ?, ?, ?, '', ?, ?, ?)
    ON CONFLICT(provider, provider_user_id) DO UPDATE SET
      user_id = excluded.user_id,
      email = excluded.email,
      username = excluded.username,
      updated_at = excluded.updated_at
  `).run(user.id, user.email, user.email, user.email, createdAt, createdAt, updatedAt);

  if (user.telegramId) {
    database.prepare(`
      INSERT INTO identities (user_id, provider, provider_user_id, email, username, photo_url, verified_at, created_at, updated_at)
      VALUES (?, 'telegram', ?, '', ?, ?, ?, ?, ?)
      ON CONFLICT(provider, provider_user_id) DO UPDATE SET
        user_id = excluded.user_id,
        username = excluded.username,
        photo_url = excluded.photo_url,
        updated_at = excluded.updated_at
    `).run(user.id, user.telegramId, user.telegramUsername ?? '', user.photoUrl ?? '', createdAt, createdAt, updatedAt);
  }
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
    passwordHash: String(row.password_hash),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function loadAuthStore(): AdminAuthStore {
  const now = Date.now();
  dbRun('DELETE FROM pending_codes WHERE expires_at <= ? OR attempts >= 5', now);
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
  const sessions = dbAll<any>('SELECT token_hash, email, expires_at, created_at FROM sessions')
    .map(row => ({
      tokenHash: String(row.token_hash),
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
      database.prepare(`DELETE FROM users WHERE id NOT IN (${keepIds.map(() => '?').join(',')})`).run(...keepIds);
    }
    for (const user of store.users) upsertUserRow(database, user);
    database.prepare('DELETE FROM pending_codes').run();
    for (const code of store.pendingCodes) {
      if (code.expiresAt <= Date.now() || code.attempts >= 5) continue;
      database.prepare(`
        INSERT OR REPLACE INTO pending_codes (email, code_hash, expires_at, attempts)
        VALUES (?, ?, ?, ?)
      `).run(code.email, code.codeHash, code.expiresAt, code.attempts);
    }
    database.prepare('DELETE FROM sessions').run();
    for (const session of store.sessions) {
      if (session.expiresAt <= Date.now()) continue;
      const user = store.users.find(item => item.email === session.email);
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

function contestAdminAuth(req: import('express').Request): AdminUser | null {
  const user = userAuth(req);
  return user && user.id === CONTEST_ADMIN_USER_ID ? user : null;
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
  if (status === 'draft' || status === 'cancelled') return status;
  const now = Date.now();
  const startMs = startsAt ? Date.parse(startsAt) : Number.NaN;
  const endMs = endsAt ? Date.parse(endsAt) : Number.NaN;
  if (Number.isFinite(endMs) && now > endMs) return 'completed';
  if (Number.isFinite(startMs) && now < startMs) return 'planned';
  return 'active';
}

function contestFromRow(row: any, userEntry?: any) {
  const status = contestStatusFromDates(String(row.status || 'draft'), row.starts_at, row.ends_at);
  return {
    id: String(row.id),
    title: String(row.title || ''),
    description: String(row.description || ''),
    prize: String(row.prize || ''),
    imageUrl: String(row.image_url || ''),
    startsAt: row.starts_at ? String(row.starts_at) : '',
    endsAt: row.ends_at ? String(row.ends_at) : '',
    status,
    winners: parseJsonArray(row.winners_json).map(String),
    createdBy: String(row.created_by || ''),
    createdAt: String(row.created_at || ''),
    updatedAt: String(row.updated_at || ''),
    entry: userEntry ? {
      status: String(userEntry.status || 'pending'),
      createdAt: String(userEntry.created_at || ''),
    } : null,
  };
}

function slugifyReferral(value: any): string {
  const raw = String(value ?? '').trim().toLowerCase();
  const translit = raw
    .replace(/а/g, 'a').replace(/б/g, 'b').replace(/в/g, 'v').replace(/г/g, 'g')
    .replace(/д/g, 'd').replace(/е/g, 'e').replace(/ё/g, 'e').replace(/ж/g, 'zh')
    .replace(/з/g, 'z').replace(/и/g, 'i').replace(/й/g, 'y').replace(/к/g, 'k')
    .replace(/л/g, 'l').replace(/м/g, 'm').replace(/н/g, 'n').replace(/о/g, 'o')
    .replace(/п/g, 'p').replace(/р/g, 'r').replace(/с/g, 's').replace(/т/g, 't')
    .replace(/у/g, 'u').replace(/ф/g, 'f').replace(/х/g, 'h').replace(/ц/g, 'c')
    .replace(/ч/g, 'ch').replace(/ш/g, 'sh').replace(/щ/g, 'sch').replace(/ы/g, 'y')
    .replace(/э/g, 'e').replace(/ю/g, 'yu').replace(/я/g, 'ya')
    .replace(/[ъь]/g, '');
  return translit.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 72) || `ref-${Date.now().toString(36)}`;
}

function normalizeReferralTarget(value: any): string {
  const raw = String(value ?? '/').trim();
  if (!raw || raw === '#') return '/';
  try {
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      const url = new URL(raw);
      const appUrl = new URL(APP_URL);
      if (url.hostname !== appUrl.hostname) return '/';
      return `${url.pathname || '/'}${url.search || ''}${url.hash || ''}`;
    }
  } catch {
    return '/';
  }
  return raw.startsWith('/') ? raw : '/';
}

function requestIpHash(req: import('express').Request): string {
  const ip = getClientIp(req);
  const salt = process.env.ECOSYSTEM_INTERNAL_KEY || 'manacost-referrals';
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex');
}

function referralFromRow(row: any) {
  const slug = String(row.slug || '');
  return {
    id: String(row.id),
    slug,
    label: String(row.label || ''),
    campaign: String(row.campaign || ''),
    targetPath: String(row.target_path || '/'),
    status: String(row.status || 'active'),
    createdBy: String(row.created_by || ''),
    createdAt: String(row.created_at || ''),
    updatedAt: String(row.updated_at || ''),
    url: `${APP_URL}/r/${encodeURIComponent(slug)}`,
    clicks: Number(row.clicks || 0),
    uniqueClicks: Number(row.unique_clicks || 0),
    lastClickAt: row.last_click_at ? String(row.last_click_at) : '',
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

function khaVerifiedEmail(profile: Record<string, any> | null): string {
  if (!profile?.email_verified_at) return '';
  const email = normalizeEmail(profile.email);
  return isRealEmail(email) ? email : '';
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
      const sourceUser = database.prepare('SELECT email FROM users WHERE id = ?')
        .get(telegramIdentity.user_id) as { email?: string } | undefined;
      database.prepare("UPDATE identities SET user_id = ?, email = ?, updated_at = ? WHERE provider = 'telegram' AND provider_user_id = ?")
        .run(emailUser.id, '', now, telegramId);
      if (sourceUser?.email) {
        database.prepare('UPDATE sessions SET user_id = ?, email = ? WHERE user_id = ? OR email = ?')
          .run(emailUser.id, email, telegramIdentity.user_id, sourceUser.email);
      }
      database.prepare('DELETE FROM users WHERE id = ?').run(telegramIdentity.user_id);
      const user = loadAuthStore().users.find(item => item.id === emailUser.id);
      if (user) applyKhaSubscriptionSnapshot(user, profile as Record<string, any>);
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
        ON CONFLICT(provider, provider_user_id) DO UPDATE SET user_id = excluded.user_id, updated_at = excluded.updated_at
      `).run(emailUser.id, telegramId, now, now, now);
      const user = loadAuthStore().users.find(item => item.id === emailUser.id);
      if (user) applyKhaSubscriptionSnapshot(user, profile as Record<string, any>);
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
  return hasRequiredBoostyLevel(levelName) || price >= BOOSTY_MIN_PRICE;
}

function applyKhaSubscriptionSnapshot(user: AdminUser, profile: Record<string, any> | null) {
  if (!profile || profile.boosty_access !== true) return;
  const levelName = String(profile.boosty_level || '');
  const rawPrice = Number(profile.boosty_price || 0);
  const hasAccess = hasBoostyContentAccess(levelName, rawPrice);
  if (!hasAccess) return;
  const inferredPrice = rawPrice || (hasRequiredBoostyLevel(levelName) ? BOOSTY_MIN_PRICE : rawPrice);
  const now = new Date().toISOString();
  const status: SubscriptionStatus = {
    hasAccess: true,
    source: 'boosty',
    checkedAt: now,
    stale: false,
    message: 'Boosty подписка подтверждена через Telegram-бот Манакоста.',
    boosty: {
      configured: true,
      checked: true,
      found: true,
      hasAccess: true,
      email: khaVerifiedEmail(profile) || user.email,
      levelName,
      price: inferredPrice,
      source: 'kha-vip-bot',
      message: 'Boosty подписка подтверждена через Telegram-бот Манакоста.',
    },
    telegram: {},
  };
  writeSubscriptionStatus(user, status);
  writeSubscriptionCheck(user, 'boosty:kha-vip-bot', true, status.boosty);
}

function mergeAuthUsers(store: AdminAuthStore, sourceUser: AdminUser, targetUser: AdminUser, patch: Partial<AdminUser> = {}): AdminUser {
  targetUser.role = targetUser.role === 'admin' || sourceUser.role === 'admin' ? 'admin' : 'user';
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
  store.users = store.users.filter(user => user.id !== sourceUser.id);
  return targetUser;
}

function telegramAuthEnabled(): boolean {
  return Boolean(telegramOidcEnabled() || (TELEGRAM_AUTH_BOT_TOKEN && TELEGRAM_AUTH_BOT_USERNAME));
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
  const token = randomBytes(32).toString('hex');
  store.sessions = store.sessions
    .filter(item => item.expiresAt > Date.now() && item.email !== user.email)
    .concat({
      tokenHash: sha256(token),
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
  const cookie = [
    `${AUTH_COOKIE_NAME}=`,
    'Path=/',
    'Max-Age=0',
    'HttpOnly',
    'SameSite=Lax',
    'Secure',
    authCookieDomain(req),
  ].filter(Boolean).join('; ');
  res.append('Set-Cookie', cookie);
}

function setTelegramOidcCookie(req: import('express').Request, res: import('express').Response, state: TelegramOidcState) {
  const secure = String(req.headers['x-forwarded-proto'] ?? req.protocol).includes('https')
    || String(req.headers.host ?? '').includes('arena.hs-manacost.ru')
    || String(req.headers.host ?? '').includes('hs-manacost.ru');
  const cookie = [
    `${TELEGRAM_OIDC_COOKIE_NAME}=${encodeURIComponent(base64UrlEncode(JSON.stringify(state)))}`,
    'Path=/api/auth/telegram',
    `Max-Age=${Math.floor(TELEGRAM_OIDC_STATE_TTL_MS / 1000)}`,
    'HttpOnly',
    'SameSite=Lax',
    secure ? 'Secure' : '',
    authCookieDomain(req),
  ].filter(Boolean).join('; ');
  res.append('Set-Cookie', cookie);
}

function clearTelegramOidcCookie(req: import('express').Request, res: import('express').Response) {
  const cookie = [
    `${TELEGRAM_OIDC_COOKIE_NAME}=`,
    'Path=/api/auth/telegram',
    'Max-Age=0',
    'HttpOnly',
    'SameSite=Lax',
    'Secure',
    authCookieDomain(req),
  ].filter(Boolean).join('; ');
  res.append('Set-Cookie', cookie);
}

function readTelegramOidcState(req: import('express').Request): TelegramOidcState | null {
  const raw = cookieValue(req, TELEGRAM_OIDC_COOKIE_NAME);
  if (!raw) return null;
  try {
    const parsed = base64UrlDecodeJson(raw);
    if (!parsed?.state || !parsed?.nonce || !parsed?.codeVerifier || !parsed?.expiresAt) return null;
    if (Number(parsed.expiresAt) <= Date.now()) return null;
    return {
      state: String(parsed.state),
      nonce: String(parsed.nonce),
      codeVerifier: String(parsed.codeVerifier),
      returnTo: String(parsed.returnTo || '/?login&telegram=ok'),
      expiresAt: Number(parsed.expiresAt),
    };
  } catch {
    return null;
  }
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
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
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
    const child = spawn('/usr/sbin/sendmail', ['-f', AUTH_FROM, '-t'], { stdio: ['pipe', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code: number) => code === 0 ? resolve() : reject(new Error(stderr || `sendmail exited ${code}`)));
    child.stdin.end(message);
  });
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
  return store.users.find(user => user.email === session.email) ?? null;
}

function adminAuth(req: import('express').Request): AdminUser | null {
  const user = userAuth(req);
  return user && isAdminUser(user) ? user : null;
}

function isAdminUser(user: AdminUser | null | undefined): user is AdminUser {
  return Boolean(user && user.role === 'admin' && (ADMIN_USER_IDS.size === 0 || ADMIN_USER_IDS.has(user.id)));
}

function getClientIp(req: import('express').Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return (raw ? raw.split(',')[0] : req.socket?.remoteAddress ?? '').trim();
}

function emptySubscriptionStatus(message = 'Подписка пока не подтверждена'): SubscriptionStatus {
  return {
    hasAccess: false,
    source: 'none',
    checkedAt: null,
    stale: true,
    message,
    boosty: {},
    telegram: {},
  };
}

function readSubscriptionStatus(userId: string): SubscriptionStatus | null {
  const row = dbGet<any>('SELECT * FROM subscriptions WHERE user_id = ?', userId);
  if (!row) return null;
  const checkedAt = row.checked_at ? String(row.checked_at) : null;
  const age = checkedAt ? Date.now() - Date.parse(checkedAt) : Number.POSITIVE_INFINITY;
  return {
    hasAccess: Boolean(row.has_access),
    source: String(row.source || 'none'),
    checkedAt,
    stale: Boolean(row.stale) || age > SUBSCRIPTION_REFRESH_MS,
    message: String(row.message || ''),
    boosty: safeJsonObject(row.boosty_json),
    telegram: safeJsonObject(row.telegram_json),
  };
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
  `, user.id, status.hasAccess ? 1 : 0, status.source, status.message, status.checkedAt, status.stale ? 1 : 0,
    JSON.stringify(status.boosty), JSON.stringify(status.telegram), nowIso);
}

function writeSubscriptionCheck(user: AdminUser, source: string, hasAccess: boolean, detail: Record<string, any>) {
  dbRun(`
    INSERT INTO subscription_checks (user_id, source, has_access, detail_json, checked_at)
    VALUES (?, ?, ?, ?, ?)
  `, user.id, source, hasAccess ? 1 : 0, JSON.stringify(detail), new Date().toISOString());
}

async function checkBoostySubscription(user: AdminUser): Promise<Record<string, any>> {
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
    const active = Boolean(subscriber?.active ?? subscriber?.hasActivePaidAccess ?? data?.hasAccess);
    const levelName = String(level.name || '');
    const hasAccess = Boolean(data?.found && active && hasBoostyContentAccess(levelName, price));
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
      message: hasAccess
        ? 'Boosty подписка подтверждена.'
        : data?.found
          ? `Для доступа нужен уровень ${BOOSTY_MIN_LEVEL_NAME} или выше.`
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
      const url = `https://api.telegram.org/bot${KHA_VIP_BOT_TOKEN}/getChatMember?chat_id=${encodeURIComponent(chatId)}&user_id=${encodeURIComponent(user.telegramId)}`;
      const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
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
    telegramId: user.telegramId,
    username: user.telegramUsername ?? '',
    chats,
    message: hasAccess
      ? 'Telegram VIP-канал подтверждён.'
      : 'Пользователь не найден в VIP Telegram-каналах.',
  };
}

async function refreshSubscriptionForUser(user: AdminUser, force = false): Promise<SubscriptionStatus> {
  if (!force) {
    const cached = readSubscriptionStatus(user.id);
    if (cached && !cached.stale) return cached;
  }

  const [boosty, telegram] = await Promise.all([
    checkBoostySubscription(user),
    checkTelegramSubscription(user),
  ]);
  writeSubscriptionCheck(user, 'boosty', Boolean(boosty.hasAccess), boosty);
  writeSubscriptionCheck(user, 'telegram', Boolean(telegram.hasAccess), telegram);

  const sources = [
    boosty.hasAccess ? 'boosty' : '',
    telegram.hasAccess ? 'telegram' : '',
  ].filter(Boolean);
  const hasAccess = sources.length > 0;
  const status: SubscriptionStatus = {
    hasAccess,
    source: hasAccess ? sources.join(',') : 'none',
    checkedAt: new Date().toISOString(),
    stale: Boolean(boosty.stale || telegram.stale),
    message: hasAccess
      ? 'Подписка Манакоста подтверждена.'
      : boosty.message || telegram.message || 'Подписка пока не подтверждена.',
    boosty,
    telegram,
  };
  writeSubscriptionStatus(user, status);
  return status;
}

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
  if (String(req.headers['x-ecosystem-key'] ?? '') !== ECOSYSTEM_INTERNAL_KEY) {
    return res.status(401).json({ error: 'Invalid ecosystem key' });
  }
  next();
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

function cardImageCachePath(cardId: string, variant: 'thumb' | 'full'): string {
  return join(CARD_IMAGE_CACHE_DIR, `${cardId}-${variant}-${CARD_IMAGE_CACHE_VERSION}.webp`);
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

async function fetchRemoteCardImage(cardId: string, variant: 'thumb' | 'full'): Promise<Buffer> {
  const sourceSize = variant === 'full' ? '512x' : '256x';
  const locales = ['ruRU', 'enUS'];
  let lastError: Error | null = null;

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
        return Buffer.from(await upstream.arrayBuffer());
      } catch (err: any) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }
  }

  throw lastError ?? new Error('Card image unavailable');
}

async function ensureCardImage(cardId: string, variant: 'thumb' | 'full'): Promise<string> {
  mkdirSync(CARD_IMAGE_CACHE_DIR, { recursive: true });
  const outPath = cardImageCachePath(cardId, variant);
  if (existsSync(outPath)) return outPath;

  const jobKey = `${cardId}:${variant}`;
  const existingJob = cardImageJobs.get(jobKey);
  if (existingJob) return existingJob;

  const job = (async () => {
    return withCardImageSlot(async () => {
      const source = await fetchRemoteCardImage(cardId, variant);
      const width = variant === 'full' ? 360 : 180;
      await sharp(source)
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: variant === 'full' ? 82 : 76, effort: 4 })
        .toFile(outPath);
      return outPath;
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
  if (!bypassCache && cached && cached.expiresAt > now) {
    return { data: cached.data, etag: cached.etag, cacheSource: 'memory' };
  }

  const redisKey = redisDataKey('legendaries', source);
  if (!bypassCache) {
    const redisCached = await redisGetCache(redisKey);
    if (redisCached) {
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

async function buildHomeSummary(now: number) {
  const [winratesData, tierlistData, legendariesData] = await Promise.all([
    fetchFreshestClassWinratesData().catch((err: any) => {
      console.warn('[api/home/summary] winrates source failed:', err?.message ?? err);
      return loadDataCached('winrates.json')?.data
        ?? { classes: [], updatedAt: null, source: 'unavailable' };
    }),
    loadTierlistForHomeSummary(now),
    loadLegendariesForHomeSummary(now),
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
    updatedAt: {
      winrates: winratesData?.updatedAt ?? null,
      tierlist: tierlistData?.updatedAt ?? null,
      legendaries: legendariesData?.updatedAt ?? null,
    },
    sources: {
      winrates: winratesData?.source ?? 'unknown',
      tierlist: tierlistData?.source ?? 'unknown',
      legendaries: legendariesData?.source ?? 'unknown',
    },
  };
}

function makeHomeSummaryEtag(data: any, now: number) {
  const updatedValues = Object.values(data?.updatedAt ?? {})
    .map(value => typeof value === 'string' ? Date.parse(value) : NaN)
    .filter(Number.isFinite) as number[];
  const updatedToken = (updatedValues.length ? Math.max(...updatedValues) : now).toString(36);
  return `"home-summary-${updatedToken}-${data.topClasses?.length ?? 0}-${data.topCards?.length ?? 0}-${data.topLegendaries?.length ?? 0}"`;
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

ensureAdminUploadDirs();
const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST;

app.use(compression({ level: 6, threshold: 1024 }));
app.use(express.json({ limit: '16mb' }));
app.use('/uploads/admin', express.static(ADMIN_UPLOAD_DIR, {
  immutable: true,
  maxAge: '30d',
}));

// Rate limiting: max 120 req/min per IP for data API
const apiLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много запросов. Попробуйте через минуту.' },
  skip: (req) => req.path.startsWith('/card-image/') || req.ip === '127.0.0.1' || req.ip === '::1',
});
app.use('/api/', apiLimiter);

// CORS for Vite dev server
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

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

// ─── ETag helper ──────────────────────────────────────────────────────────────
function sendCached(req: express.Request, res: express.Response, entry: CacheEntry, cacheHeader: string) {
  res.set('Cache-Control', cacheHeader);
  res.set('ETag', entry.etag);
  if (req.headers['if-none-match'] === entry.etag) return res.status(304).end();
  res.json(entry.data);
}

function sendJsonCached(req: express.Request, res: express.Response, data: any, etag: string, cacheHeader: string, cacheSource?: string) {
  res.set('Cache-Control', cacheHeader);
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

function escapeHtml(value: any): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttribute(value: any): string {
  return escapeHtml(value).replace(/`/g, '&#96;');
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

function normalizeOldGuideAssetUrl(rawValue: any): string {
  const raw = String(rawValue ?? '').trim();
  if (!raw) return '';
  if (raw.startsWith('//')) return `https:${raw}`;
  try {
    return new URL(raw).href;
  } catch {
    const path = raw.startsWith('/') ? raw : `/${raw}`;
    return `${OLD_GUIDES_PUBLIC_URL}${path}`;
  }
}

function normalizeOldGuideLink(rawValue: any): string {
  const raw = String(rawValue ?? '').trim();
  if (!raw || raw.startsWith('#') || raw.startsWith('mailto:') || raw.startsWith('tel:')) return raw;
  if (/^javascript:/i.test(raw)) return '#';
  if (raw.startsWith('//')) return `https:${raw}`;
  try {
    return new URL(raw).href;
  } catch {
    const path = raw.startsWith('/') ? raw : `/${raw}`;
    return `${OLD_GUIDES_PUBLIC_URL}${path}`;
  }
}

function htmlAttribute(attrs: string, name: string): string {
  const pattern = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
  const match = attrs.match(pattern);
  return String(match?.[2] ?? match?.[3] ?? match?.[4] ?? '').trim();
}

const OLD_GUIDE_ALLOWED_TAGS = new Set([
  'a', 'b', 'blockquote', 'br', 'code', 'div', 'em', 'figcaption', 'figure', 'h2', 'h3', 'h4', 'hr',
  'i', 'img', 'li', 'ol', 'p', 'pre', 'span', 'strong', 'table', 'tbody', 'td', 'th', 'thead', 'tr', 'u', 'ul',
]);

function sanitizeOldGuideHtml(rawHtml: any): string {
  let html = String(rawHtml ?? '');
  if (!html.trim()) return '';

  html = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\s*(script|style|iframe|object|embed|form|input|button|select|textarea|canvas|svg|video|audio)\b[\s\S]*?<\/\s*\1\s*>/gi, '')
    .replace(/<\s*(script|style|iframe|object|embed|form|input|button|select|textarea|canvas|svg|video|audio)\b[^>]*\/?>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s(style|class|id|width|height|align|valign|border|cellpadding|cellspacing)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');

  html = html.replace(/<img\b([^>]*)>/gi, (_full, attrs) => {
    const src = normalizeOldGuideAssetUrl(htmlAttribute(attrs, 'src') || htmlAttribute(attrs, 'data-src'));
    if (!src) return '';
    const normalizedSrc = src.toLowerCase();
    if (normalizedSrc.includes('/separations/') || normalizedSrc.includes('subpage-body-bg')) return '';
    const alt = htmlAttribute(attrs, 'alt');
    return `<figure><img src="${escapeAttribute(src)}" alt="${escapeAttribute(alt)}" loading="lazy" decoding="async"></figure>`;
  });

  html = html.replace(/<a\b([^>]*)>/gi, (_full, attrs) => {
    const href = normalizeOldGuideLink(htmlAttribute(attrs, 'href'));
    if (!href || href === '#') return '<a>';
    return `<a href="${escapeAttribute(href)}" target="_blank" rel="noopener noreferrer">`;
  });

  html = html.replace(/<\/?([a-z0-9-]+)([^>]*)>/gi, (full, rawTag, attrs) => {
    const tag = String(rawTag).toLowerCase();
    if (!OLD_GUIDE_ALLOWED_TAGS.has(tag)) return '';
    if (full.startsWith('</')) return `</${tag}>`;
    if (tag === 'a') return full;
    if (tag === 'img') {
      const src = normalizeOldGuideAssetUrl(htmlAttribute(attrs, 'src'));
      if (!src) return '';
      return `<img src="${escapeAttribute(src)}" alt="${escapeAttribute(htmlAttribute(attrs, 'alt'))}" loading="lazy" decoding="async">`;
    }
    if (tag === 'br' || tag === 'hr') return `<${tag}>`;
    return `<${tag}>`;
  });

  return html
    .replace(/<p>\s*<a href="#[^"]*"[^>]*>\s*(?:наверх|к оглавлению)\s*<\/a>\s*<\/p>/gi, '')
    .replace(/<a href="#[^"]*"[^>]*>\s*(?:наверх|к оглавлению)\s*<\/a>/gi, '')
    .replace(/^(?:\s*<\/(?:li|ul|ol)>)+/gi, '')
    .replace(/<p>\s*<\/p>/gi, '')
    .replace(/<a>\s*<\/a>/gi, '')
    .replace(/<strong>\s*<\/strong>/gi, '')
    .replace(/<span>\s*<\/span>/gi, '')
    .replace(/<p>(?:\s|&nbsp;|<strong>|<\/strong>|<span>|<\/span>|<i>|<\/i>)*<\/p>/gi, '')
    .replace(/<p>\s*<\/p>/gi, '')
    .replace(/<p>\s*<\/p>/gi, '')
    .replace(/<p>\s*(<figure>[\s\S]*?<\/figure>)\s*<\/p>/gi, '$1')
    .replace(/<p>\s*<a([^>]*)>\s*(<figure>[\s\S]*?<\/figure>)\s*<\/a>\s*<\/p>/gi, '<a$1>$2</a>')
    .replace(/<p>\s*([А-ЯA-Z])\s*<\/p>/g, '')
    .replace(/(?:<br>\s*){3,}/gi, '<br><br>')
    .trim();
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

  const redisKey = redisDataKey('home-summary');
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
    const imagePath = await ensureCardImage(cardId, variant);
    const stat = statSync(imagePath);
    const etag = `"${stat.mtimeMs.toString(36)}-${stat.size.toString(36)}"`;

    res.set('Content-Type', 'image/webp');
    res.set('Cache-Control', 'public, max-age=2592000, immutable');
    res.set('ETag', etag);
    if (req.headers['if-none-match'] === etag) return res.status(304).end();

    return createReadStream(imagePath).pipe(res);
  } catch (err: any) {
    return res.status(502).json({ error: err?.message ?? 'Card image unavailable' });
  }
});

app.get('/api/winrates', async (req, res) => {
  const source = (req.query.source as string) ?? 'hsreplay';
  const now = Date.now();
  const cached = winratesApiCache.get(source);
  if (cached && cached.expiresAt > now) {
    return sendJsonCached(req, res, cached.data, cached.etag, CACHE_5M);
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
      return sendJsonCached(req, res, data, etag, CACHE_5M);
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
      return sendJsonCached(req, res, localData, etag, CACHE_5M, 'local-fresher-than-upstream');
    }
    const updatedToken = data.updatedAt ? new Date(data.updatedAt).getTime().toString(36) : Date.now().toString(36);
    const etag = `"class-winrates-${updatedToken}-${data.classes.length}"`;
    winratesApiCache.set(source, { data, etag, expiresAt: now + CLASS_WINRATES_CACHE_MS });
    return sendJsonCached(req, res, data, etag, CACHE_5M);
  } catch (err: any) {
    console.error('[api/winrates] HSReplay arena dataset failed:', err?.message ?? err);
  }

  // Fallback to the last scraper snapshot if the live dataset is unavailable.
  if (!snapshotEntry) return res.status(404).json({ error: 'No data available' });
  return sendCached(req, res, { ...snapshotEntry, data: { ...snapshotEntry.data, source: 'cached' } }, 'public, max-age=300, stale-while-revalidate=600');
});

app.get('/api/class-matchups', async (req, res) => {
  const now = Date.now();
  if (classMatchupsCache && classMatchupsCache.expiresAt > now) {
    return sendJsonCached(req, res, classMatchupsCache.data, classMatchupsCache.etag, CACHE_1H);
  }

  try {
    const data = await fetchClassMatchupsData();
    const updatedToken = data.updatedAt ? new Date(data.updatedAt).getTime().toString(36) : now.toString(36);
    const etag = `"class-matchups-${updatedToken}-${data.matchups.length}"`;
    classMatchupsCache = { data, etag, expiresAt: now + CLASS_MATCHUPS_CACHE_MS };
    return sendJsonCached(req, res, data, etag, CACHE_1H);
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

app.get('/api/tierlist', async (req, res) => {
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

app.get('/api/legendaries', async (req, res) => {
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

app.get('/api/decks', async (req, res) => {
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

app.get('/api/articles', (req, res) => {
  const entry = loadDataCached('articles.json');
  if (!entry) return res.status(404).json({ error: 'No data' });
  return sendCached(req, res, entry, CACHE_1H);
});

app.get('/api/guides-archive', (req, res) => {
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

app.get('/api/guides-archive/:slug', (req, res) => {
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
    if (!subscription.hasAccess && !isAdminUser(user)) {
      return res.status(403).json({
        error: 'Для доступа к VIP-статье нужна активная подписка Манакоста',
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

    const upstream = await fetch(upstreamUrl, { signal: AbortSignal.timeout(20_000) });
    const body = Buffer.from(await upstream.arrayBuffer());
    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    const etag = `"bg-legacy-${createHash('sha1').update(cacheKey).update(body).digest('hex').slice(0, 16)}"`;
    if (upstream.status >= 200 && upstream.status < 300 && !contentType.toLowerCase().includes('image/')) {
      battlegroundAppProxyCache.set(cacheKey, {
        body,
        contentType,
        status: upstream.status,
        etag,
        expiresAt: Date.now() + BG_DATA_CACHE_MS,
      });
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
    const cached = battlegroundAppProxyCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      res.status(cached.status);
      res.setHeader('Content-Type', cached.contentType);
      res.setHeader('Cache-Control', cached.contentType.includes('image/')
        ? BG_IMAGE_CACHE_CONTROL
        : BG_JSON_CACHE_CONTROL);
      res.setHeader('ETag', cached.etag);
      res.setHeader('X-BG-Proxy-Cache', 'HIT');
      if (req.headers['if-none-match'] === cached.etag) return res.status(304).end();
      return res.send(cached.body);
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
      battlegroundAppProxyCache.set(cacheKey, {
        body,
        contentType,
        status: upstream.status,
        etag,
        expiresAt: Date.now() + BG_DATA_CACHE_MS,
      });
    }
    res.status(upstream.status);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', contentType.includes('image/')
      ? BG_IMAGE_CACHE_CONTROL
      : BG_JSON_CACHE_CONTROL);
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

    const upstream = await fetch(upstreamUrl, { signal: AbortSignal.timeout(25_000) });
    const body = Buffer.from(await upstream.arrayBuffer());
    const contentType = upstream.headers.get('content-type') || 'application/json; charset=utf-8';
    const etag = `"bg-extra-${createHash('sha1').update(cacheKey).update(body).digest('hex').slice(0, 16)}"`;
    if (upstream.status >= 200 && upstream.status < 300) {
      battlegroundAppProxyCache.set(cacheKey, {
        body,
        contentType,
        status: upstream.status,
        etag,
        expiresAt: Date.now() + BG_DATA_CACHE_MS,
      });
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

app.get('/api/battlegrounds-library', (req, res) => proxyLegacyBattlegroundEndpoint(req, res, '/api/battlegrounds-library'));
app.get('/api/battlegrounds-spells', (req, res) => proxyLegacyBattlegroundEndpoint(req, res, '/api/battlegrounds-spells'));
app.get('/api/battlegrounds-card-names', (req, res) => proxyLegacyBattlegroundEndpoint(req, res, '/api/battlegrounds-card-names'));
app.get('/api/bg-comps', (req, res) => proxyLegacyBattlegroundEndpoint(req, res, '/api/bg-comps'));
app.get('/api/card-art', (req, res) => proxyLegacyBattlegroundEndpoint(req, res, '/api/card-art'));
app.get('/api/remote-image', (req, res) => proxyLegacyBattlegroundEndpoint(req, res, '/api/remote-image'));
app.get('/api/bg/heroes', (req, res) => proxyBattlegroundAppEndpoint(req, res, '/api/bg/heroes'));
app.get('/api/bg/heroes/:dbfId/details', (req, res) => proxyBattlegroundAppEndpoint(
  req,
  res,
  `/api/bg/heroes/${encodeURIComponent(req.params.dbfId)}/details`,
  enrichBattlegroundHeroPayload,
));
app.get('/api/bg/library/meta', (req, res) => proxyBattlegroundAppEndpoint(req, res, '/api/bg/library/meta'));
app.get('/api/bg/library/cards', (req, res) => proxyBattlegroundAppEndpoint(req, res, '/api/bg/library/cards'));
app.get('/api/bg/library/cards/by-dbf/:dbfId', (req, res) => proxyBattlegroundAppEndpoint(req, res, `/api/bg/library/cards/by-dbf/${encodeURIComponent(req.params.dbfId)}`));
app.get('/api/bg/library/minion-stats', (req, res) => proxyBattlegroundAppEndpoint(req, res, '/api/bg/library/minion-stats'));
app.get('/api/bg/library/minions/:dbfId', (req, res) => proxyBattlegroundAppEndpoint(req, res, `/api/bg/library/minions/${encodeURIComponent(req.params.dbfId)}`));
app.get('/api/bg/library/minions/:dbfId/history', (req, res) => proxyBattlegroundAppEndpoint(req, res, `/api/bg/library/minions/${encodeURIComponent(req.params.dbfId)}/history`));
app.get('/api/bg/library/spell-stats', (req, res) => proxyBattlegroundAppEndpoint(req, res, '/api/bg/library/spell-stats'));
app.get('/api/bg/library/extra/:library', (req, res) => proxyExtraBattlegroundLibraryEndpoint(req, res, req.params.library));
app.get('/api/bg/tier-lists', (req, res) => proxyBattlegroundAppEndpoint(req, res, '/api/bg/tier-lists'));

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

let isScraping = false;

app.post('/api/scrape', async (req, res) => {
  if (isScraping) {
    return res.status(409).json({ message: 'Парсинг уже запущен' });
  }
  isScraping = true;
  res.json({ message: 'Парсинг запущен' });
  try {
    const result = await scrapeAll();
    invalidateDataCache();
    console.log('[Server] Manual scrape result:', result);
  } finally {
    isScraping = false;
  }
});

// ─── IP check endpoint (mirrors api/check-ip.js for Vercel) ──────────────────

app.get('/api/check-ip', (req, res) => {
  const user = userAuth(req);
  res.json({
    allowed: isAdminUser(user),
    id: user?.id ?? null,
    ip: getClientIp(req),
  });
});

app.post('/api/auth/register', async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password ?? '');
  const name = String(req.body?.name ?? '').trim() || 'Пользователь Манакоста';
  const country = String(req.body?.country ?? '').trim();
  const newsletterOptIn = Boolean(req.body?.newsletterOptIn);
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

  const code = randomInt(100000, 1000000).toString();
  store.pendingCodes = store.pendingCodes.filter(item => item.email !== email && item.expiresAt > Date.now());
  store.pendingCodes.push({
    email,
    codeHash: sha256(code),
    expiresAt: Date.now() + AUTH_CODE_TTL_MS,
    attempts: 0,
  });
  saveAuthStore(store);

  try {
    await sendAuthCodeEmail(email, code);
    res.json({ success: true, email, message: 'Аккаунт создан. Код отправлен на почту' });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Аккаунт создан, но код не удалось отправить' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password ?? '');
  if (!isRealEmail(email)) return res.status(400).json({ error: 'Укажите корректную почту' });
  const store = loadAuthStore();
  const user = store.users.find(item => item.email === email);
  if (!user || !password || !verifySecret(password, user.passwordHash)) {
    return res.status(401).json({ error: 'Неверная почта или пароль' });
  }

  const code = randomInt(100000, 1000000).toString();
  store.pendingCodes = store.pendingCodes.filter(item => item.email !== email && item.expiresAt > Date.now());
  store.pendingCodes.push({
    email,
    codeHash: sha256(code),
    expiresAt: Date.now() + AUTH_CODE_TTL_MS,
    attempts: 0,
  });
  saveAuthStore(store);

  try {
    await sendAuthCodeEmail(email, code);
    res.json({ success: true, email, message: 'Код отправлен на почту' });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Не удалось отправить код' });
  }
});

app.post('/api/auth/password-reset/request', async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  if (!isRealEmail(email)) return res.status(400).json({ error: 'Укажите корректную почту' });
  const store = loadAuthStore();
  const user = store.users.find(item => item.email === email);

  if (user) {
    const code = randomInt(100000, 1000000).toString();
    store.pendingCodes = store.pendingCodes.filter(item => item.email !== email && item.expiresAt > Date.now());
    store.pendingCodes.push({
      email,
      codeHash: sha256(code),
      expiresAt: Date.now() + AUTH_CODE_TTL_MS,
      attempts: 0,
    });
    saveAuthStore(store);

    try {
      await sendAuthCodeEmail(email, code);
    } catch (err: any) {
      return res.status(500).json({ error: err?.message ?? 'Не удалось отправить код' });
    }
  }

  res.json({ success: true, email, message: 'Если аккаунт существует, код отправлен на почту' });
});

app.post('/api/auth/password-reset/confirm', (req, res) => {
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
  if (pending.attempts > 5 || pending.codeHash !== sha256(code)) {
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
  res.json({
    enabled,
    mode: telegramOidcEnabled() ? 'oidc' : 'legacy-widget',
    botUsername: enabled ? TELEGRAM_AUTH_BOT_USERNAME : '',
    authUrl: enabled ? `${APP_URL}/api/auth/telegram/start` : '',
    callbackUrl: enabled ? `${APP_URL}/api/auth/telegram/callback` : '',
  });
});

function upsertTelegramUser(payload: Record<string, unknown>) {
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
  const telegramUser = telegramId ? store.users.find(item => item.telegramId === telegramId) : undefined;
  const usernameTelegramUser = username
    ? store.users.find(item => String(item.telegramUsername || '').toLowerCase() === username.toLowerCase())
    : undefined;
  const emailUser = store.users.find(item => item.email === email);
  let user = oidcUser ?? telegramUser ?? usernameTelegramUser ?? emailUser;

  if (telegramUser && emailUser && telegramUser.id !== emailUser.id) {
    user = mergeAuthUsers(store, telegramUser, emailUser, {
      telegramId,
      telegramUsername: username,
      photoUrl: photoUrl || telegramUser.photoUrl,
    });
  } else if (!telegramUser && emailUser) {
    user = emailUser;
    user.telegramId = telegramId || user.telegramId;
    user.telegramUsername = username;
    user.photoUrl = photoUrl || user.photoUrl;
    user.updatedAt = now;
  } else if (telegramUser && verifiedBoostyEmail && telegramUser.email !== verifiedBoostyEmail) {
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
      user_id = excluded.user_id,
      username = excluded.username,
      photo_url = excluded.photo_url,
      updated_at = excluded.updated_at
  `, user.id, oidcSub, String(claims.preferred_username || '').replace(/^@/, ''), String(claims.picture || ''), now, now, now);
}

app.get('/api/auth/telegram/start', async (req, res) => {
  if (!telegramOidcEnabled()) return res.redirect('/?login&telegram=error');
  try {
    const discovery = await telegramOidcDiscovery();
    const state = randomBytes(24).toString('base64url');
    const nonce = randomBytes(24).toString('base64url');
    const codeVerifier = randomBytes(48).toString('base64url');
    const returnToRaw = String(req.query.returnTo ?? '/?login&telegram=ok');
    const returnTo = returnToRaw.startsWith('/') && !returnToRaw.startsWith('//') ? returnToRaw : '/?login&telegram=ok';
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
  if (telegramOidcEnabled() && req.query.code) {
    const oidcState = readTelegramOidcState(req);
    clearTelegramOidcCookie(req, res);
    if (!oidcState || String(req.query.state ?? '') !== oidcState.state) {
      return res.redirect('/?login&telegram=error');
    }
    try {
      const discovery = await telegramOidcDiscovery();
      const tokenParams = new URLSearchParams({
        grant_type: 'authorization_code',
        code: String(req.query.code),
        redirect_uri: `${APP_URL}/api/auth/telegram/callback`,
        client_id: TELEGRAM_OIDC_CLIENT_ID,
        client_secret: TELEGRAM_OIDC_CLIENT_SECRET,
        code_verifier: oidcState.codeVerifier,
      });
      const tokenData = await fetchJsonWithTimeout(discovery.token_endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: tokenParams,
      });
      const claims = await verifyTelegramOidcIdToken(String(tokenData.id_token || ''), oidcState.nonce);
      const nameParts = String(claims.name || '').trim().split(/\s+/).filter(Boolean);
      const payload: Record<string, unknown> = {
        oidc_sub: String(claims.sub ?? ''),
        first_name: nameParts[0] || String(claims.name || '').trim(),
        last_name: nameParts.slice(1).join(' '),
        username: String(claims.preferred_username || '').replace(/^@/, ''),
        photo_url: String(claims.picture || ''),
      };
      const { store, user, khaProfile } = upsertTelegramUser(payload);
      const token = createAuthSession(store, user);
      saveAuthStore(store);
      linkTelegramOidcIdentity(user, claims);
      applyKhaSubscriptionSnapshot(user, khaProfile);
      setAuthCookie(req, res, token);
      return res.redirect(oidcState.returnTo || '/?login&telegram=ok');
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
    const { store, user, khaProfile } = upsertTelegramUser(payload);
    const token = createAuthSession(store, user);
    saveAuthStore(store);
    applyKhaSubscriptionSnapshot(user, khaProfile);
    setAuthCookie(req, res, token);
    return res.redirect('/?login&telegram=ok');
  } catch (err) {
    console.warn('[auth] Telegram callback failed:', err);
    return res.redirect('/?login&telegram=error');
  }
});

app.post('/api/auth/telegram', (req, res) => {
  const payload = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {};
  const verification = verifyTelegramAuthPayload(payload);
  if (verification.ok === false) return res.status(401).json({ error: verification.error });

  let store: AdminAuthStore;
  let user: AdminUser;
  let khaProfile: Record<string, any> | null;
  try {
    ({ store, user, khaProfile } = upsertTelegramUser(payload));
  } catch (err: any) {
    return res.status(400).json({ error: err?.message ?? 'Telegram не передал пользователя' });
  }

  const token = createAuthSession(store, user);
  saveAuthStore(store);
  applyKhaSubscriptionSnapshot(user, khaProfile);
  setAuthCookie(req, res, token);
  res.json({ success: true, token, user: publicUser(user), adminAllowed: isAdminUser(user) });
});

app.post('/api/auth/verify', (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const code = String(req.body?.code ?? '').replace(/\D/g, '');
  if (!isRealEmail(email)) return res.status(400).json({ error: 'Укажите корректную почту' });
  const store = loadAuthStore();
  const pending = store.pendingCodes.find(item => item.email === email && item.expiresAt > Date.now());
  if (!pending) return res.status(401).json({ error: 'Код устарел. Запросите новый.' });
  pending.attempts += 1;
  if (pending.attempts > 5 || pending.codeHash !== sha256(code)) {
    saveAuthStore(store);
    return res.status(401).json({ error: 'Неверный код' });
  }

  const user = store.users.find(item => item.email === email);
  if (!user) return res.status(401).json({ error: 'Пользователь не найден' });

  store.pendingCodes = store.pendingCodes.filter(item => item.email !== email);
  const token = createAuthSession(store, user);
  saveAuthStore(store);
  setAuthCookie(req, res, token);
  res.json({ success: true, token, user: publicUser(user), adminAllowed: isAdminUser(user) });
});

app.get('/api/auth/me', (req, res) => {
  const user = userAuth(req);
  if (!user) return res.status(401).json({ error: 'Требуется вход' });
  res.json({ user: publicUser(user), adminAllowed: isAdminUser(user) });
});

app.patch('/api/auth/profile', (req, res) => {
  const authedUser = userAuth(req);
  if (!authedUser) return res.status(401).json({ error: 'Требуется вход' });
  const store = loadAuthStore();
  const user = store.users.find(item => item.id === authedUser.id);
  if (!user) return res.status(401).json({ error: 'Пользователь не найден' });

  if (req.body?.country !== undefined) {
    user.country = String(req.body.country ?? '').trim();
  }
  if (req.body?.newsletterOptIn !== undefined) {
    user.newsletterOptIn = Boolean(req.body.newsletterOptIn);
  }
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
  res.json({ success: true, user: publicUser(user) });
});

app.post('/api/auth/logout', (req, res) => {
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
  if (!subscription.hasAccess && user.id !== CONTEST_ADMIN_USER_ID) {
    return res.status(403).json({
      error: 'Для участия нужна активная подписка Манакоста',
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
        winners,
        isWinner: winners.includes(user.id) || winners.includes(user.email),
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
    contests: rows.map(row => ({ ...contestFromRow(row), entriesCount: Number(row.entries_count || 0) })),
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
    normalizeOptionalText(req.body?.imageUrl, 500), startsAt, endsAt, status, '[]', admin.id, nowIso, nowIso);
  const row = dbGet<any>('SELECT * FROM contests WHERE id = ?', id);
  res.json({ success: true, contest: contestFromRow(row) });
});

app.get('/api/admin/contests/:contestId/entries', (req, res) => {
  const admin = contestAdminAuth(req);
  if (!admin) return res.status(403).json({ error: 'Недостаточно прав' });
  const rows = dbAll<any>(`
    SELECT e.*, u.name, u.role, u.country, u.contact_vk_url, u.contact_telegram, u.contact_email, u.telegram_username
    FROM contest_entries e
    LEFT JOIN users u ON u.id = e.user_id
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
  const winners = Array.isArray(req.body?.winners)
    ? req.body.winners.map((item: unknown) => normalizeOptionalText(item, 120)).filter(Boolean).slice(0, 100)
    : [];
  dbRun('UPDATE contests SET winners_json = ?, status = ?, updated_at = ? WHERE id = ?',
    JSON.stringify(winners), 'completed', new Date().toISOString(), String(req.params.contestId));
  const row = dbGet<any>('SELECT * FROM contests WHERE id = ?', String(req.params.contestId));
  if (!row) return res.status(404).json({ error: 'Конкурс не найден' });
  res.json({ success: true, contest: contestFromRow(row) });
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

app.get('/api/admin/users/search', (req, res) => {
  const admin = contestAdminAuth(req);
  if (!admin) return res.status(403).json({ error: 'Недостаточно прав' });
  const q = normalizeOptionalText(req.query.q, 120);
  if (!q) return res.json({ users: [] });
  const like = `%${q.toLowerCase()}%`;
  const users = dbAll<any>(`
    SELECT
      u.*,
      tg.username AS telegram_username,
      s.has_access,
      s.source AS subscription_source,
      s.checked_at AS subscription_checked_at
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
      subscription: {
        hasAccess: Boolean(row.has_access),
        source: String(row.subscription_source || 'none'),
        checkedAt: row.subscription_checked_at ? String(row.subscription_checked_at) : '',
      },
      createdAt: String(row.created_at || ''),
      updatedAt: String(row.updated_at || ''),
    })),
  });
});

app.post('/api/subscription/email/request', async (req, res) => {
  const user = userAuth(req);
  if (!user) return res.status(401).json({ error: 'Требуется вход' });
  const email = normalizeEmail(req.body?.email);
  if (!isRealEmail(email)) return res.status(400).json({ error: 'Укажите реальную почту Boosty' });

  const store = loadAuthStore();
  const authedStoreUser = store.users.find(item => item.id === user.id);
  const existing = store.users.find(item => item.email === email && item.id !== user.id);
  if (existing && !authedStoreUser?.telegramId && !existing.telegramId) {
    return res.status(409).json({ error: 'Эта почта уже привязана к другому профилю' });
  }

  const code = randomInt(100000, 1000000).toString();
  store.pendingCodes = store.pendingCodes.filter(item => item.email !== email && item.expiresAt > Date.now());
  store.pendingCodes.push({
    email,
    codeHash: sha256(code),
    expiresAt: Date.now() + AUTH_CODE_TTL_MS,
    attempts: 0,
  });
  saveAuthStore(store);

  try {
    await sendAuthCodeEmail(email, code);
    res.json({ success: true, email, message: 'Код подтверждения отправлен на почту' });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Не удалось отправить код' });
  }
});

app.post('/api/subscription/email/confirm', async (req, res) => {
  const authedUser = userAuth(req);
  if (!authedUser) return res.status(401).json({ error: 'Требуется вход' });
  const email = normalizeEmail(req.body?.email);
  const code = String(req.body?.code ?? '').replace(/\D/g, '');
  if (!isRealEmail(email)) return res.status(400).json({ error: 'Укажите реальную почту Boosty' });

  const store = loadAuthStore();
  let user = store.users.find(item => item.id === authedUser.id);
  if (!user) return res.status(401).json({ error: 'Пользователь не найден' });
  const existing = store.users.find(item => item.email === email && item.id !== user.id);
  if (existing) {
    if (!user.telegramId && !existing.telegramId) {
      return res.status(409).json({ error: 'Эта почта уже привязана к другому профилю' });
    }
    user = mergeAuthUsers(store, user, existing);
  }
  const pending = store.pendingCodes.find(item => item.email === email && item.expiresAt > Date.now());
  if (!pending) return res.status(401).json({ error: 'Код устарел. Запросите новый.' });

  pending.attempts += 1;
  if (pending.attempts > 5 || pending.codeHash !== sha256(code)) {
    saveAuthStore(store);
    return res.status(401).json({ error: 'Неверный код' });
  }

  const oldEmail = user.email;
  user.email = email;
  user.updatedAt = new Date().toISOString();
  store.pendingCodes = store.pendingCodes.filter(item => item.email !== email);
  store.sessions = store.sessions.map(session => session.email === oldEmail ? { ...session, email } : session);
  saveAuthStore(store);
  const status = await refreshSubscriptionForUser(user, true);
  res.json({ success: true, user: publicUser(user), subscription: status });
});

app.get('/api/ecosystem/internal/user', internalApiGuard, (req, res) => {
  const user = resolveUserFromRequest(req);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user: publicUser(user), subscription: readSubscriptionStatus(user.id) ?? emptySubscriptionStatus() });
});

app.get('/api/ecosystem/internal/subscription', internalApiGuard, async (req, res) => {
  const user = resolveUserFromRequest(req);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const force = String(req.query.force ?? '') === '1';
  const status = await refreshSubscriptionForUser(user, force);
  res.json({ user: publicUser(user), subscription: status });
});

app.post('/api/ecosystem/internal/subscription', internalApiGuard, async (req, res) => {
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
      url:     article.url     ?? '#',
    };
    existing.articles.unshift(newArticle);
    existing.updatedAt = new Date().toISOString();
    writeFileSync(filePath, JSON.stringify(existing, null, 2), 'utf-8');
    dataCache.delete('articles.json');
    res.json({ success: true, article: newArticle });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/uploads/image', adminIdGuard, async (req, res) => {
  if (!adminAuth(req)) return res.status(401).json({ error: 'Требуется вход' });
  const dataUrl = String(req.body?.dataUrl || '');
  const match = dataUrl.match(/^data:image\/(png|jpe?g|webp|gif);base64,([a-z0-9+/=\s]+)$/i);
  if (!match) return res.status(400).json({ error: 'Нужно передать изображение в формате data URL' });

  try {
    const source = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
    if (!source.length) return res.status(400).json({ error: 'Файл пустой' });
    if (source.length > 12 * 1024 * 1024) return res.status(413).json({ error: 'Картинка больше 12 МБ' });

    mkdirSync(ADMIN_UPLOAD_DIR, { recursive: true });
    mkdirSync(ADMIN_UPLOAD_SOURCE_DIR, { recursive: true });
    const fileName = `${Date.now().toString(36)}-${randomBytes(5).toString('hex')}.webp`;
    const distPath = join(ADMIN_UPLOAD_DIR, fileName);
    const sourcePath = join(ADMIN_UPLOAD_SOURCE_DIR, fileName);
    const output = await sharp(source)
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
    res.status(500).json({ error: err.message || 'Не удалось обработать изображение' });
  }
});

app.post('/api/referrals/track/:slug', (req, res) => {
  const slug = slugifyReferral(req.params.slug);
  if (!slug) return res.status(404).json({ error: 'Ссылка не найдена' });
  try {
    const database = db();
    const link = database.prepare("SELECT * FROM referral_links WHERE slug = ? AND status = 'active'")
      .get(slug) as any | undefined;
    if (!link) return res.status(404).json({ error: 'Ссылка не найдена', targetUrl: `${APP_URL}/` });

    database.prepare(`
      INSERT INTO referral_clicks (referral_id, clicked_at, ip_hash, user_agent, referrer, landing_path)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      link.id,
      new Date().toISOString(),
      requestIpHash(req),
      String(req.headers['user-agent'] || '').slice(0, 500),
      String(req.headers.referer || req.headers.referrer || '').slice(0, 500),
      String(req.body?.landingPath || req.originalUrl || '').slice(0, 500),
    );

    res.json({
      success: true,
      targetPath: normalizeReferralTarget(link.target_path),
      targetUrl: `${APP_URL}${normalizeReferralTarget(link.target_path)}`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Не удалось записать переход' });
  }
});

app.get('/api/admin/referrals', adminIdGuard, (req, res) => {
  if (!adminAuth(req)) return res.status(401).json({ error: 'Требуется вход' });
  try {
    const database = db();
    const rows = database.prepare(`
      SELECT
        link.*,
        COUNT(clicks.id) AS clicks,
        COUNT(DISTINCT clicks.ip_hash) AS unique_clicks,
        MAX(clicks.clicked_at) AS last_click_at
      FROM referral_links AS link
      LEFT JOIN referral_clicks AS clicks ON clicks.referral_id = link.id
      GROUP BY link.id
      ORDER BY link.created_at DESC
    `).all() as any[];
    const recentClicks = database.prepare(`
      SELECT clicks.referral_id, links.slug, clicks.clicked_at, clicks.user_agent, clicks.referrer, clicks.landing_path
      FROM referral_clicks AS clicks
      JOIN referral_links AS links ON links.id = clicks.referral_id
      ORDER BY clicks.clicked_at DESC
      LIMIT 120
    `).all() as any[];
    res.json({
      referrals: rows.map(referralFromRow),
      recentClicks: recentClicks.map(row => ({
        referralId: String(row.referral_id || ''),
        slug: String(row.slug || ''),
        clickedAt: String(row.clicked_at || ''),
        userAgent: String(row.user_agent || ''),
        referrer: String(row.referrer || ''),
        landingPath: String(row.landing_path || ''),
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Не удалось загрузить ссылки' });
  }
});

app.post('/api/admin/referrals', adminIdGuard, (req, res) => {
  const user = adminAuth(req);
  if (!user) return res.status(401).json({ error: 'Требуется вход' });
  const label = String(req.body?.label || '').trim();
  if (!label) return res.status(400).json({ error: 'Название ссылки обязательно' });
  const slug = slugifyReferral(req.body?.slug || label);
  const status = String(req.body?.status || 'active') === 'paused' ? 'paused' : 'active';
  const now = new Date().toISOString();
  const id = `ref_${randomBytes(6).toString('hex')}`;

  try {
    const database = db();
    database.prepare(`
      INSERT INTO referral_links (id, slug, label, campaign, target_path, status, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      slug,
      label,
      String(req.body?.campaign || '').trim(),
      normalizeReferralTarget(req.body?.targetPath || req.body?.target_path || '/'),
      status,
      user.id,
      now,
      now,
    );
    const row = database.prepare(`
      SELECT link.*, 0 AS clicks, 0 AS unique_clicks, NULL AS last_click_at
      FROM referral_links AS link
      WHERE link.id = ?
    `).get(id) as any;
    res.json({ success: true, referral: referralFromRow(row) });
  } catch (err: any) {
    if (String(err?.message || '').includes('UNIQUE')) {
      return res.status(409).json({ error: 'Такой slug уже занят' });
    }
    res.status(500).json({ error: err.message || 'Не удалось сохранить ссылку' });
  }
});

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
    legendaries: join(__dirname, 'gen_legendary_image.py'),
  };
  const script = scriptMap[type];
  if (!script || !existsSync(script)) {
    return res.status(400).json({ error: `Скрипт для типа "${type}" не найден` });
  }
  if (isGenerating) {
    return res.status(409).json({ error: 'Генерация уже запущена' });
  }

  const outRel = `generated/${type === 'legendaries' ? 'top_legendaries' : type}.png`;
  const outAbs = join(__dirname, '..', 'public', outRel);

  isGenerating = true;
  const logs: string[] = [];

  const py = spawn('python', [script, outAbs], { cwd: __dirname });

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
    dataCache.delete('articles.json');
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Scheduled scraping every 6 hours ─────────────────────────────────────────
cron.schedule('0 */6 * * *', async () => {
  if (isScraping) return;
  isScraping = true;
  console.log('[Cron] Starting scheduled scrape...');
  try {
    const result = await scrapeAll();
    invalidateDataCache();
    console.log('[Cron] Scrape complete:', result);
  } catch (err) {
    console.error('[Cron] Scrape failed:', err);
  } finally {
    isScraping = false;
  }
});

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
  console.log('[Server] Scraping every 6 hours. Trigger manual: POST /api/scrape');

  // Initial scrape on startup (non-blocking)
  setTimeout(async () => {
    if (isScraping) return;
    isScraping = true;
    console.log('[Server] Running initial scrape...');
    try {
      const result = await scrapeAll();
      invalidateDataCache();
      console.log('[Server] Initial scrape complete:', result);
    } catch (err) {
      console.error('[Server] Initial scrape failed:', err);
    } finally {
      isScraping = false;
    }
  }, 2000);
});
