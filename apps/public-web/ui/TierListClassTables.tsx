'use client';

import { useEffect, useRef, useState } from 'react';

/** One class of the open tier list. `rows` is one line per card, `name\ttier\twinrate\tpick rate` (already formatted). */
export type TierListClassRows = { id: string; name: string; rows: string };

const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * One class as a table. The pool is over a thousand cards and the page carries
 * every element twice (in the HTML and in the RSC payload), so the payload
 * holds a plain text line per card and the markup is a string without the
 * optional end tags (valid HTML): an element per cell would push the page past
 * its 300 KB budget. Every value is escaped; the text comes from the parsed
 * whitelist, never raw from Express.
 */
function classTable(entry: TierListClassRows): string {
  const rows = entry.rows.split('\n').map(line => {
    const [name, tier, winrate, pick] = line.split('\t');
    return `<tr><th>${escapeHtml(name)}<td>${tier}<td>${winrate}<td>${pick}`;
  }).join('');
  return `<table><caption>${escapeHtml(`Карты Арены: ${entry.name}`)}</caption><thead><tr><th scope=col>Карта<th scope=col>Тир`
    + `<th scope=col>Винрейт, %<th scope=col>Выбор, %<tbody>${rows}</table>`;
}

/**
 * The class filter and tables of the open tier list. The server HTML carries
 * every class section and a plain anchor to each one, so the page works without
 * a script; once hydrated, a click shows one class instead (the sections stay in
 * the DOM, only the others get `hidden`). The data never comes from the client.
 */
export function TierListClassTables({ classes }: { classes: TierListClassRows[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    for (const section of body.current?.querySelectorAll<HTMLElement>('[data-tierlist-class]') ?? []) {
      section.hidden = selected !== null && section.dataset.tierlistClass !== selected;
    }
  }, [selected]);
  const choose = (id: string | null) => (event: { preventDefault: () => void }) => {
    event.preventDefault();
    setSelected(id);
  };
  return <>
    <nav className="tierlist-public-pool__classes" aria-label="Классы Арены">
      <a href="#tierlist-pool" aria-current={selected === null ? 'true' : undefined} onClick={choose(null)}>Все классы</a>
      {classes.map(entry => <a key={entry.id} href={`#tierlist-${entry.id}`}
        aria-current={selected === entry.id ? 'true' : undefined} onClick={choose(entry.id)}>{entry.name}</a>)}
    </nav>
    <div ref={body}>
      {classes.map(entry => <section key={entry.id} id={`tierlist-${entry.id}`} data-tierlist-class={entry.id}
        aria-labelledby={`tierlist-${entry.id}-title`}>
        <h3 id={`tierlist-${entry.id}-title`}>{entry.name}</h3>
        <div className="tierlist-public-pool__scroll" dangerouslySetInnerHTML={{ __html: classTable(entry) }} />
      </section>)}
    </div>
  </>;
}
