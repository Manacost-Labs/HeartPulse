// Vercel Serverless Function — arena class winrates
// ?source=hsreplay  (default) → api.hs-manacost.ru HSReplay dataset
// ?source=firestone           → live Firestone/zerotoheroes.com API
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

const HSREPLAY_ARENA_DATASET_URL = 'https://api.hs-manacost.ru/datasets/hsreplay_arena';

const CLASS_INFO = {
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

function classInfoFromArenaClass(row) {
  const key = String(row.class ?? '').toLowerCase().replace(/[\s_-]+/g, '');
  return CLASS_INFO[key] ?? null;
}

function normalizeHsReplayArenaDataset(raw) {
  const rows = raw?.data?.structured?.classes;
  if (!Array.isArray(rows)) throw new Error('missing data.structured.classes');

  const classes = rows
    .map(row => {
      const info = classInfoFromArenaClass(row);
      if (!info) return null;
      const winrate = Number(row.win_rate ?? String(row.winrate ?? '').replace('%', ''));
      const games = Number(row.num_drafts ?? row.games ?? 0);
      if (!Number.isFinite(winrate) || !Number.isFinite(games)) return null;
      return { ...info, winrate: Math.round(winrate * 10) / 10, games };
    })
    .filter(Boolean)
    .sort((a, b) => b.winrate - a.winrate);

  return {
    classes,
    updatedAt: raw.fetched_at ?? null,
    source: 'api.hs-manacost.ru',
  };
}

async function fetchHsReplayArenaDataset() {
  const response = await fetch(HSREPLAY_ARENA_DATASET_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ManacostArena/1.0)' },
  });
  if (!response.ok) throw new Error(`Upstream HTTP ${response.status}`);
  return normalizeHsReplayArenaDataset(await response.json());
}

function loadSnapshot() {
  return JSON.parse(
    readFileSync(join(__dirname, '../server/data/winrates.json'), 'utf-8'),
  );
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const source = req.query?.source ?? 'hsreplay';

  // ── HSReplay mode: use the same api.hs-manacost.ru dataset as class matchups
  if (source === 'hsreplay') {
    try {
      const data = await fetchHsReplayArenaDataset();
      res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200');
      return res.json(data);
    } catch (err) {
      console.error('[api/winrates] api.hs-manacost.ru fetch failed:', err.message);
      try {
        const snapshot = loadSnapshot();
        res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600');
        return res.json({ ...snapshot, source: 'cached' });
      } catch {
        return res.status(502).json({ error: err.message });
      }
    }
  }

  // ── Firestone mode: live zerotoheroes.com API ─────────────────────────────
  try {
    const url =
      'https://static.zerotoheroes.com/api/arena/stats/classes/arena/last-patch/overview.gz.json';
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ManacostArena/1.0)' },
    });
    if (!response.ok) throw new Error(`Upstream HTTP ${response.status}`);

    const data = await response.json();

    const classes = (data.stats || [])
      .map(s => {
        const key  = (s.playerClass || '').toLowerCase().replace(/\s+/g, '');
        const info = CLASS_INFO[key];
        if (!info || !s.totalGames) return null;
        const winrate = Math.round((s.totalsWins / s.totalGames) * 1000) / 10;
        return { ...info, winrate, games: s.totalGames };
      })
      .filter(Boolean)
      .sort((a, b) => b.winrate - a.winrate);

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200');
    return res.json({ classes, updatedAt: data.lastUpdated, source: 'firestoneapp.com' });
  } catch (err) {
    console.error('[api/winrates] Firestone fetch failed:', err.message);
    // Fallback to snapshot
    try {
      const snapshot = loadSnapshot();
      res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600');
      return res.json({ ...snapshot, source: 'cached' });
    } catch {
      return res.status(502).json({ error: err.message });
    }
  }
}
