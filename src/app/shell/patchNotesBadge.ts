'use client';
import { useEffect, useState } from 'react';
import type { NavigationBadges } from './NavigationItems';
import type { LatestPatch } from './patchNotesArchive';

/** A patch counts as new in the menu for this long after it was published. */
export const PATCH_BADGE_DAYS = 14;
const LATEST_KEY = 'hp:nav:latest-patch';
const SEEN_KEY = 'hp:nav:seen-patch';
/** The archive answer is public and cached for ten minutes; the menu asks at most this often. */
const LATEST_TTL_MS = 30 * 60 * 1000;
const PATCH_NOTES_PATH = /^\/standard\/patches(?:\/|$)/;

/**
 * «Новый» next to the patch notes only when it is true for this reader: the
 * newest patch is recent and they have not opened the patch notes since it
 * came out. No badge while the archive is unknown.
 */
export function patchNotesBadge(latest: LatestPatch | null, seenVersion: string | null, now: number): NavigationBadges {
  if (!latest || latest.version === seenVersion) return {};
  const age = now - Date.parse(latest.publishedAt);
  if (age < 0 || age > PATCH_BADGE_DAYS * 24 * 60 * 60 * 1000) return {};
  return { 'patch-notes': { label: 'Новый', title: `Новый патч ${latest.version}` } };
}

function readJson<T>(key: string): T | null {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null') as T | null; } catch { return null; }
}

function write(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* the badge is only a hint */ }
}

function saveData() {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return Boolean(connection?.saveData);
}

/**
 * The menu badges. The archive is read once the browser is idle, from the
 * HTTP cache or the public API, never during the first paint; opening the
 * patch notes marks the newest patch as seen.
 */
export function useNavigationBadges(pathname: string): NavigationBadges {
  const [latest, setLatest] = useState<LatestPatch | null>(null);
  const [seen, setSeen] = useState<string | null>(null);
  // Read once per visit: render stays pure and a badge never flips mid-session.
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    const cached = readJson<LatestPatch>(LATEST_KEY);
    setSeen(readJson<string>(SEEN_KEY));
    if (cached) setLatest(cached);
    if (cached && Date.now() - cached.checkedAt < LATEST_TTL_MS) return undefined;
    if (saveData()) return undefined;
    const controller = new AbortController();
    const idle = window.requestIdleCallback?.bind(window) ?? ((callback: () => void) => window.setTimeout(callback, 1));
    const cancelIdle = window.cancelIdleCallback?.bind(window) ?? window.clearTimeout.bind(window);
    const task = idle(() => {
      // The reader loads with its request, off every page's first bundle.
      void import('./patchNotesArchive').then(({ readLatestPatch }) => readLatestPatch(controller.signal))
        .then(found => {
          if (!found) return;
          write(LATEST_KEY, JSON.stringify(found));
          setLatest(found);
        })
        .catch(() => { /* no badge */ });
    });
    return () => { cancelIdle(task); controller.abort(); };
  }, []);
  const onPatchNotes = PATCH_NOTES_PATH.test(pathname);
  useEffect(() => {
    if (!onPatchNotes || !latest || seen === latest.version) return;
    write(SEEN_KEY, JSON.stringify(latest.version));
    setSeen(latest.version);
  }, [latest, onPatchNotes, seen]);
  return onPatchNotes ? {} : patchNotesBadge(latest, seen, now);
}
