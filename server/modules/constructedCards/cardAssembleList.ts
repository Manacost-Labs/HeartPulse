/**
 * «Сборка»: the list of cards with Assemble and their state, from hs-data-api
 * `/v1/hsreplay/assemble/cards`. The upstream body is untrusted; only the fields
 * the tool page renders are projected.
 */
import { readCard, record, percent, text, isFormat, type AssembleCard, type CardAssembleFormat } from './cardAssembleProjection.js';

const MAX_CARDS = 40;
const MAX_ROWS = 400;
const MAX_BASES_TOTAL = 1000;
const STATE = /^[a-z_]{1,32}$/;

export type CardAssembleListCard = {
  card: AssembleCard;
  /** `ok`, `no_data`, `not_collected` or `failed`. */
  state: string;
  basesTotal: number | null;
  winRate: number | null;
};
export type CardAssembleListPayload = {
  format: CardAssembleFormat;
  checkedAt: string | null;
  stale: boolean;
  cards: CardAssembleListCard[];
};

function readRow(value: unknown, format: CardAssembleFormat): CardAssembleListCard | null {
  const row = record(value);
  const card = readCard(row.card);
  if (!card || !Array.isArray(row.formats) || !row.formats.includes(format)) return null;
  const state = text(row.state);
  const basesTotal = row.bases_total;
  return {
    card,
    state: state !== null && STATE.test(state) ? state : 'failed',
    basesTotal: typeof basesTotal === 'number' && Number.isInteger(basesTotal) && basesTotal >= 0 && basesTotal <= MAX_BASES_TOTAL ? basesTotal : null,
    winRate: percent(row.win_rate),
  };
}

/** Projects one hs-data-api list answer; `null` when it is not one or no card survives. */
export function projectCardAssembleList(body: unknown, format: string): CardAssembleListPayload | null {
  if (!isFormat(format)) return null;
  const root = record(body);
  if (!Array.isArray(root.data)) return null;
  const meta = record(root.meta);
  const cards = root.data.slice(0, MAX_ROWS).flatMap(row => readRow(row, format) ?? []).slice(0, MAX_CARDS);
  return cards.length ? { format, checkedAt: text(meta.fetched_at), stale: meta.stale === true, cards } : null;
}
