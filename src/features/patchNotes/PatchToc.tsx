import { useEffect, useId, useState } from 'react';
import { openTarget } from './patchAnchors';

/*
 * Ways to jump inside one patch: a sticky table of contents beside the
 * changes on wide content, and the same entries as one select on narrow
 * content. CSS shows one of the two, so the page keeps a single navigation.
 */

export type PatchTocGroup = { id: string; title: string };
export type PatchTocEntry = { id: string; title: string; groups: PatchTocGroup[] };

/**
 * The entry and group under the reading line (a band at a quarter of the
 * viewport): an IntersectionObserver per anchor, no scroll handler.
 */
function useReadingAnchors(ids: readonly string[]): ReadonlySet<string> {
  const [active, setActive] = useState<ReadonlySet<string>>(new Set());
  const key = ids.join('|');
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return undefined;
    const visible = new Set<string>();
    const observer = new IntersectionObserver(records => {
      for (const record of records) {
        if (record.isIntersecting) visible.add(record.target.id);
        else visible.delete(record.target.id);
      }
      setActive(new Set(visible));
    }, { rootMargin: '-25% 0px -70% 0px' });
    for (const id of key.split('|')) {
      const element = id ? document.getElementById(id) : null;
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [key]);
  return active;
}

function jump(id: string) {
  openTarget(`#${id}`);
  window.location.hash = id;
}

/** The sticky table of contents: entries, and the groups of a section with more than one. */
export function PatchToc({ entries }: { entries: PatchTocEntry[] }) {
  const active = useReadingAnchors(entries.flatMap(entry => [entry.id, ...entry.groups.map(group => group.id)]));
  return (
    <nav className="hp-patch-toc" aria-label="Оглавление патча" data-tour-id="patch-toc">
      <p className="hp-patch-toc__title" aria-hidden="true">В этом патче</p>
      <ol>
        {entries.map(entry => (
          <li key={entry.id} data-active={active.has(entry.id) || undefined}>
            <a href={`#${entry.id}`} onClick={event => openTarget(event.currentTarget.hash)}
              aria-current={active.has(entry.id) && !entry.groups.some(group => active.has(group.id)) ? 'location' : undefined}>
              {entry.title}
            </a>
            {entry.groups.length > 1 && (
              <ol>
                {entry.groups.map(group => (
                  <li key={group.id}>
                    <a href={`#${group.id}`} onClick={event => openTarget(event.currentTarget.hash)}
                      aria-current={active.has(group.id) ? 'location' : undefined}>
                      {group.title}
                    </a>
                  </li>
                ))}
              </ol>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** The same entries as one select for narrow content; choosing one jumps there and the select resets. */
export function PatchJump({ entries }: { entries: PatchTocEntry[] }) {
  const id = useId();
  return (
    <span className="hp-patch-jump" data-tour-id="patch-toc">
      <label htmlFor={id} className="sr-only">Перейти к разделу или классу</label>
      <select id={id} value="" onChange={event => { if (event.target.value) jump(event.target.value); }}>
        <option value="" disabled>Перейти к…</option>
        {entries.map(entry => (entry.groups.length > 1
          ? (
            <optgroup key={entry.id} label={entry.title}>
              <option value={entry.id}>{`${entry.title}: начало`}</option>
              {entry.groups.map(group => <option key={group.id} value={group.id}>{group.title}</option>)}
            </optgroup>
          )
          : <option key={entry.id} value={entry.id}>{entry.title}</option>))}
      </select>
    </span>
  );
}
