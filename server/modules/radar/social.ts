/** Статистика и обсуждения кандидата: периоды, посты Reddit и X. */
import { count, date, finite, list, percent, record, text } from './parsing.js';
import type { RadarPost, RadarPostSource, RadarSentiment, RadarSocial, RadarStance, RadarStats, RadarTrendPoint } from './types.js';

const MAX_POSTS = 6;
const MAX_TREND = 12;
const POST_HOSTS: Record<RadarPostSource, RegExp> = {
  reddit: /^(?:[a-z0-9-]+\.)*reddit\.com$|^redd\.it$/,
  x: /^(?:[a-z0-9-]+\.)*(?:x|twitter)\.com$/,
};
const RANK_LABELS: Record<string, string> = { all: 'Все ранги', legend: 'Легенда', diamond_4_1: 'Алмаз 4–1', top_legend: 'Топ легенды' };
const PERIOD_LABELS: Record<string, string> = {
  '1d': 'Сутки', '3d': '3 дня', '7d': 'Неделя', '14d': '2 недели', patch: 'С патча',
  past_3_hours: '3 часа', past_6_hours: '6 часов', past_day: 'Сутки', past_3_days: '3 дня', past_week: 'Неделя',
  past_2_weeks: '2 недели', past_30_days: '30 дней',
};
const SENTIMENTS = new Set<RadarSentiment>(['negative', 'mixed', 'neutral', 'positive', 'no_data']);
const STANCES = new Set<RadarStance>(['wants_nerf', 'wants_buff', 'divided', 'indifferent', 'no_data']);


export function radarPeriodLabel(period: string): string {
  if (PERIOD_LABELS[period]) return PERIOD_LABELS[period];
  const patch = /^patch_(\d+(?:\.\d+){1,3})$/.exec(period);
  if (patch) return `Патч ${patch[1]}`;
  // HSGuru называет окна дополнения по его имени: `black_empire`, `black_empire_ban`.
  if (period.endsWith('_ban')) return 'Баны';
  return /^[a-z]+(?:_[a-z]+)*$/.test(period) ? 'Дополнение' : period;
}

function postUrl(value: unknown, source: RadarPostSource): string | null {
  const raw = text(value, 2048);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && POST_HOSTS[source].test(url.hostname.toLowerCase()) ? url.toString() : null;
  } catch {
    return null;
  }
}

export function parsePost(value: unknown): RadarPost | null {
  const row = record(value);
  const source = row?.platform ?? row?.source;
  if (!row || (source !== 'reddit' && source !== 'x')) return null;
  const url = postUrl(row.url, source);
  const postText = text(row.excerpt, 600) ?? text(row.text, 600);
  if (!url || !postText) return null;
  const kind = row.kind === 'comment' || row.kind === 'tweet' ? row.kind : 'post';
  return {
    source, kind, url, author: text(row.author, 80) ?? 'аноним', score: Math.round(finite(row.score) ?? 0),
    comments: count(row.comments), title: text(row.title, 300), text: postText, community: text(row.community, 80),
    publishedAt: date(row.createdAt ?? row.publishedAt), official: row.official === true,
  };
}

function trendPoint(value: unknown, rank: string, seen: Set<string>): RadarTrendPoint[] {
  const row = record(value);
  const period = text(row?.period, 40);
  if (!row || !period || (row.rank !== undefined && row.rank !== rank) || seen.has(period)) return [];
  seen.add(period);
  return [{
    period, label: radarPeriodLabel(period),
    winrate: percent(row.winrate ?? row.deckWinrate),
    popularity: percent(row.popularity ?? row.deckPopularity),
    games: count(row.games ?? row.timesPlayed),
  }];
}

export function parseStats(value: unknown): RadarStats {
  const row = record(value) ?? {};
  const rank = text(row.rank, 40) ?? 'all';
  const period = text(row.period, 40) ?? '';
  const seen = new Set<string>();
  return {
    source: row.source === 'hsreplay' ? 'hsreplay' : 'hsguru',
    rankLabel: RANK_LABELS[rank] ?? rank,
    periodLabel: period ? radarPeriodLabel(period) : '',
    winrate: percent(row.winrate),
    popularity: percent(row.popularity),
    games: count(row.games ?? row.timesPlayed),
    trend: list(row.periods).flatMap(item => trendPoint(item, rank, seen)).slice(0, MAX_TREND),
  };
}

export function parseSocial(value: unknown): RadarSocial {
  const row = record(value) ?? {};
  const mentions = record(row.mentions);
  const seen = new Set<string>();
  return {
    mentions: count(mentions?.total ?? row.mentions) ?? 0,
    reddit: count(mentions?.reddit) ?? 0,
    x: count(mentions?.x) ?? 0,
    sentiment: SENTIMENTS.has(row.sentiment as RadarSentiment) ? row.sentiment as RadarSentiment : 'no_data',
    stance: STANCES.has(row.stance as RadarStance) ? row.stance as RadarStance : 'no_data',
    summary: text(row.summary, 1200),
    posts: list(row.topPosts ?? row.posts).map(parsePost)
      .filter((post): post is RadarPost => post !== null && !seen.has(post.url) && Boolean(seen.add(post.url)))
      .slice(0, MAX_POSTS),
  };
}
