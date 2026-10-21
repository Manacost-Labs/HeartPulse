'use client';

import { useRef } from 'react';

/*
 * Labels with one level of nested groups (`statuses: { error: '…' }`), shared by the domain packs. A group in
 * `labels` merges key by key with the default group, so overriding one status keeps the others.
 */

const isPlain = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;

export function mergeLabels<T extends object>(defaults: T, labels: object | undefined): T {
  if (!labels) return defaults;
  const out: Record<string, unknown> = { ...(defaults as Record<string, unknown>) };
  for (const [key, value] of Object.entries(labels)) {
    if (value === undefined) continue;
    const base = out[key];
    out[key] = isPlain(base) && isPlain(value) ? { ...base, ...value } : value;
  }
  return out as T;
}

const sameShallow = (a: Record<string, unknown>, b: Record<string, unknown>) => {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => Object.is(a[key], b[key]));
};

/** Equal when every key (and every key of a nested group) holds the same value. */
function sameLabels(a: object | undefined, b: object | undefined) {
  if (a === b) return true;
  if (!a || !b) return false;
  const x = a as Record<string, unknown>;
  const y = b as Record<string, unknown>;
  const keys = Object.keys(x);
  if (keys.length !== Object.keys(y).length) return false;
  return keys.every((key) => Object.is(x[key], y[key]) || (isPlain(x[key]) && isPlain(y[key]) && sameShallow(x[key], y[key])));
}

/**
 * Defaults merged with `labels`, keeping the same object while the labels hold the same values: an inline
 * `labels={{…}}` then does not re-render memoised rows on every parent update.
 */
export function useLabels<T extends object>(defaults: T, labels: object | undefined): T {
  const ref = useRef<{ labels: object | undefined; defaults: T; value: T } | null>(null);
  const prev = ref.current;
  if (!prev || prev.defaults !== defaults || !sameLabels(prev.labels, labels)) {
    ref.current = { labels, defaults, value: mergeLabels(defaults, labels) };
  }
  return ref.current!.value;
}
