/*
 * Pure patch-note logic behind PatchNotes: which way a value moved (buff or nerf, given which direction is
 * better), what an entry amounts to overall, and a word-level diff of changed ability text.
 */
import type { ReactNode } from 'react';
import type { GameImageSource } from './game';

export type PatchChangeKind = 'buff' | 'nerf' | 'rework' | 'new' | 'removed' | 'fix';

export interface PatchValueChange {
  /** What changed: "Cost", "Attack", "Text". */
  label: string;
  /** Old value; leave out for something added. */
  before?: number | string;
  /** New value; leave out for something removed. */
  after?: number | string;
  /** Which way is good for the player: lower cooldown, higher damage. Default `higher`. */
  better?: 'higher' | 'lower';
  /** Buff or nerf stated outright, for values that are not plain numbers ("40/65/90" → "50/75/100"). */
  effect?: 'buff' | 'nerf';
  /** Unit after numbers: "%", " s". */
  unit?: string;
}

/** Changes to one ability or block of an entry: "Q — Orb of Deception", "Base stats". */
export interface PatchChangeGroup {
  /** Ability or block name. */
  title: string;
  /** Key on the ability icon: Q, W, E, R, P. */
  key?: string;
  /** Ability or item icon: an image URL or a node. */
  image?: GameImageSource;
  changes: PatchValueChange[];
}

export interface PatchEntry {
  id: string;
  /** Champion, item, rune or mechanic. */
  name: string;
  /** Portrait or item icon: an image URL or a node. Without it, the initials. */
  image?: GameImageSource;
  /** Line under the name: role, item class. */
  subtitle?: string;
  /** Section id: champions, items, runes. */
  section?: string;
  /** Overall verdict; derived from the changes when left out. */
  kind?: PatchChangeKind;
  /** Changes that belong to no ability. */
  changes?: PatchValueChange[];
  /** Changes per ability or block, each with its own icon. */
  groups?: PatchChangeGroup[];
  /** Developer comment. */
  note?: ReactNode;
}

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Every change of an entry: the loose ones, then the groups in order. */
export function entryChanges(entry: PatchEntry): PatchValueChange[] {
  return [...(entry.changes ?? []), ...(entry.groups ?? []).flatMap((group) => group.changes)];
}

/** The stated effect, else buff when a number moved the good way and nerf when it moved the other; else neutral. */
export function changeDirection(change: PatchValueChange): 'buff' | 'nerf' | 'neutral' {
  if (change.effect) return change.effect;
  if (!isNumber(change.before) || !isNumber(change.after) || change.before === change.after) return 'neutral';
  const up = change.after > change.before;
  return up === ((change.better ?? 'higher') === 'higher') ? 'buff' : 'nerf';
}

/** The entry's kind: given, else buff or nerf when every directed change agrees, else rework. */
export function entryKind(entry: PatchEntry): PatchChangeKind {
  if (entry.kind) return entry.kind;
  const changes = entryChanges(entry);
  if (changes.length > 0 && changes.every((c) => c.before === undefined)) return 'new';
  if (changes.length > 0 && changes.every((c) => c.after === undefined)) return 'removed';
  const directions = new Set(changes.map(changeDirection).filter((d) => d !== 'neutral'));
  if (directions.size === 1) return [...directions][0] as 'buff' | 'nerf';
  return 'rework';
}

export interface DiffToken {
  text: string;
  op: 'same' | 'add' | 'remove';
}

/**
 * Word-level diff (longest common subsequence over words and the spaces between them). Neighbouring tokens with
 * the same op are merged, so the output reads as phrases.
 */
export function wordDiff(before: string, after: string): DiffToken[] {
  const a = before.split(/(\s+)/).filter(Boolean);
  const b = after.split(/(\s+)/).filter(Boolean);
  const n = a.length;
  const m = b.length;
  // lcs[i][j]: common length of a[i..] and b[j..].
  const lcs = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  }
  const out: DiffToken[] = [];
  const push = (text: string, op: DiffToken['op']) => {
    const last = out[out.length - 1];
    if (last && last.op === op) last.text += text;
    else out.push({ text, op });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      push(a[i], 'same');
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) push(a[i++], 'remove');
    else push(b[j++], 'add');
  }
  while (i < n) push(a[i++], 'remove');
  while (j < m) push(b[j++], 'add');
  return out;
}

/** Counts of entries per kind, in a fixed order. */
export function patchSummary(entries: readonly PatchEntry[]): Record<PatchChangeKind, number> {
  const out: Record<PatchChangeKind, number> = { buff: 0, nerf: 0, rework: 0, new: 0, removed: 0, fix: 0 };
  for (const entry of entries) out[entryKind(entry)]++;
  return out;
}
