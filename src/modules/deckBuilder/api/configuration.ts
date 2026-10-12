import { catalogCard } from './client';
import { configurationKind, isZilliaxArt, isZilliaxModule, type CardConfiguration } from '../model/configuration';
import type { BuilderCard } from '../model/selection';

const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? value as Record<string, unknown> : {};

/** Uses existing anonymous card relations and the current E.T.C. exclusion pool. */
export async function loadCardConfiguration(owner: Pick<BuilderCard, 'id' | 'dbfId'>, signal: AbortSignal,
  fetcher: typeof fetch = fetch): Promise<CardConfiguration> {
  const kind = configurationKind(owner);
  if (!kind) throw new Error('У этой карты нет настраиваемого набора');
  const response = await fetcher(`/api/constructed-cards/${encodeURIComponent(owner.id)}`, {
    signal, credentials: 'same-origin', headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error('Не удалось загрузить настройки карты');
  const card = record(record(await response.json()).card);
  if (card.card_id !== owner.id || card.dbf !== owner.dbfId) throw new Error('Неверная карта в настройках');
  if (kind === 'etc') {
    const pools = record(card.wiki).generated_card_pools;
    const pool = Array.isArray(pools) ? pools.map(record).find(item => item.pool === "Cards banned from E.T.C.'s band") : null;
    const banned = [...new Set((Array.isArray(pool?.card_ids) ? pool.card_ids : [])
      .filter((id): id is string => typeof id === 'string' && /^[A-Za-z0-9_]{2,80}$/.test(id)))];
    if (!banned.includes('ETC_080') || !banned.includes('TOY_330')) throw new Error('Не удалось подтвердить ограничения E.T.C.');
    return { kind, modules: [], art: [], banned };
  }
  const groups = Array.isArray(card.related_cards_localized) ? card.related_cards_localized : [];
  const related = groups.flatMap(group => {
    const items = record(group).cards;
    return Array.isArray(items) ? items : [];
  }).map(value => catalogCard(value, 'NEUTRAL')).filter((value): value is BuilderCard => value !== null);
  const unique = [...new Map(related.map(item => [item.dbfId, item])).values()];
  const modules = unique.filter(isZilliaxModule);
  const art = unique.filter(isZilliaxArt).sort((a, b) => Number(a.id.replace('TOY_330t', '')) - Number(b.id.replace('TOY_330t', '')));
  if (modules.length !== 8 || !art.length) throw new Error('Не удалось загрузить все модули Зиллиакса');
  return { kind, modules, art, banned: [] };
}
