// Vercel Serverless Function - HSReplay arena dual-class matchup matrix

const HSREPLAY_ARENA_DATASET_URL = 'https://api.hs-manacost.ru/datasets/hsreplay_arena';

const HSREPLAY_CLASS_ID = {
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

let memoryCache = null;
const CACHE_MS = 30 * 60 * 1000;

function normalizeHsReplayClassId(value) {
  const key = String(value ?? '').toLowerCase().replace(/[^a-z]/g, '');
  return HSREPLAY_CLASS_ID[key] ?? null;
}

function parseWinrate(value) {
  const raw = typeof value === 'string' ? value.replace('%', '').trim() : value;
  const num = Number(raw);
  if (!Number.isFinite(num)) return null;
  const pct = num > 0 && num <= 1 ? num * 100 : num;
  return Math.round(pct * 100) / 100;
}

function sendCached(req, res, data, etag, cacheControl) {
  res.setHeader('Cache-Control', cacheControl);
  res.setHeader('ETag', etag);
  if (req.headers['if-none-match'] === etag) return res.status(304).end();
  return res.json(data);
}

async function fetchClassMatchupsData() {
  const upstream = await fetch(HSREPLAY_ARENA_DATASET_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ManacostArena/1.0)' },
  });
  if (!upstream.ok) throw new Error(`Upstream HTTP ${upstream.status}`);

  const payload = await upstream.json();
  const structured = payload?.data?.structured ?? payload?.structured ?? {};
  const rawMatchups = Array.isArray(structured?.matchups) ? structured.matchups : [];
  const matchups = rawMatchups
    .map(row => {
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

  return {
    matchups,
    updatedAt: payload?.fetched_at ?? payload?.data?.fetched_at ?? null,
    source: 'api.hs-manacost.ru',
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const now = Date.now();
  if (memoryCache && memoryCache.expiresAt > now) {
    return sendCached(req, res, memoryCache.data, memoryCache.etag, 's-maxage=3600, stale-while-revalidate=600');
  }

  try {
    const data = await fetchClassMatchupsData();
    const updatedToken = data.updatedAt ? new Date(data.updatedAt).getTime().toString(36) : now.toString(36);
    const etag = `"class-matchups-${updatedToken}-${data.matchups.length}"`;
    memoryCache = { data, etag, expiresAt: now + CACHE_MS };
    return sendCached(req, res, data, etag, 's-maxage=3600, stale-while-revalidate=600');
  } catch (err) {
    if (memoryCache) {
      return sendCached(req, res, {
        ...memoryCache.data,
        warning: 'stale',
      }, memoryCache.etag, 's-maxage=300, stale-while-revalidate=600');
    }
    return res.status(502).json({ error: String(err?.message ?? err) });
  }
}
