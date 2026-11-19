'use client';

import { useEffect, useRef, useState } from 'react';
import { TierBadge } from '@/src/modules/arenaTierList/public';
import { PaidLockButton } from './PaidOffer';
import { paidAccess, usePublicAccess } from './usePublicAccess';

/**
 * One tier of a class. `rows` is one line per card, `name\twinrate\tpick rate`
 * (already formatted).
 */
export type TierListTierRows = { tier: string; rows: string };
/** One class of the open tier list, its cards grouped by tier. */
export type TierListClassRows = { id: string; name: string; tiers: TierListTierRows[] };

const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * The rows of one tier as a string without the optional end tags (valid HTML).
 * The pool is over a thousand cards and the page carries every element twice
 * (in the HTML and in the RSC payload), so the payload holds a plain text line
 * per card and the markup is a string: an element per cell would push the page
 * past its 300 KB budget. The last cell is empty on purpose: it is the closed
 * column (`.tierlist-public-pool__lock`), drawn by the stylesheet. Every value
 * is escaped; the text comes from the parsed whitelist, never raw from Express.
 */
const tierRows = (rows: string): string => rows.split('\n').map(line => {
  const [name, winrate, pick] = line.split('\t');
  return `<tr><th>${escapeHtml(name)}<td>${winrate}<td>${pick}<td>`;
}).join('');

/** Where the chosen class lives in the address, so a link, a reload and the return from sign-in keep it. */
const CLASS_PARAM = 'class';

/**
 * The class filter and tables of the open tier list. The server HTML carries
 * every class section and a plain anchor to each one, so the page works without
 * a script; once hydrated, a click shows one class instead (the sections stay in
 * the DOM, only the others get `hidden`) and writes it to the address. The
 * closed values sit behind locks: the last column and the two filters.
 * The data never comes from the client.
 */
export function TierListClassTables({ classes }: { classes: TierListClassRows[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const body = useRef<HTMLDivElement>(null);
  // The address is read back only for a visitor known to be a guest: a subscriber who comes back from signing in
  // is about to get the full view on that class, and narrowing the list first would move it for nothing.
  const { allowed, pending } = paidAccess(usePublicAccess(), 'arena');
  const guest = !allowed && !pending;
  useEffect(() => {
    if (!guest) return;
    const requested = new URLSearchParams(window.location.search).get(CLASS_PARAM);
    if (requested && classes.some(entry => entry.id === requested)) setSelected(requested);
  }, [classes, guest]);
  useEffect(() => {
    for (const section of body.current?.querySelectorAll<HTMLElement>('[data-tierlist-class]') ?? []) {
      section.hidden = selected !== null && section.dataset.tierlistClass !== selected;
    }
  }, [selected]);
  const choose = (id: string | null) => (event: { preventDefault: () => void }) => {
    event.preventDefault();
    setSelected(id);
    try {
      const url = new URL(window.location.href);
      if (id) url.searchParams.set(CLASS_PARAM, id); else url.searchParams.delete(CLASS_PARAM);
      window.history.replaceState(window.history.state, '', url);
    } catch { /* The address is a convenience; the state above still holds. */ }
  };
  return <>
    <nav className="tierlist-public-pool__classes" aria-label="Классы Арены">
      <a href="#tierlist-pool" aria-current={selected === null ? 'true' : undefined} onClick={choose(null)}>Все классы</a>
      {classes.map(entry => <a key={entry.id} href={`#tierlist-${entry.id}`}
        aria-current={selected === entry.id ? 'true' : undefined} onClick={choose(entry.id)}>{entry.name}</a>)}
      <PaidLockButton className="tierlist-public-pool__chip-lock" closed="paywalled-tierlist" label="Фильтр по мане"><span>Мана</span></PaidLockButton>
      <PaidLockButton className="tierlist-public-pool__chip-lock" closed="paywalled-tierlist" label="Фильтр по редкости"><span>Редкость</span></PaidLockButton>
    </nav>
    <div ref={body}>
      {classes.map(entry => <section key={entry.id} id={`tierlist-${entry.id}`} data-tierlist-class={entry.id}
        aria-labelledby={`tierlist-${entry.id}-title`}>
        <h3 id={`tierlist-${entry.id}-title`}>{entry.name}</h3>
        <div className="tierlist-public-pool__scroll">
          <table>
            <caption>{`Карты Арены: ${entry.name}`}</caption>
            <colgroup><col /><col /><col />
              <col className="tierlist-public-pool__col-lock paywalled-tierlist" /></colgroup>
            <thead><tr>
              <th scope="col">Карта</th><th scope="col">Винрейт, %</th><th scope="col">Выбор, %</th>
              <th scope="col" className="tierlist-public-pool__lock-head">
                <PaidLockButton className="tierlist-public-pool__lock" closed="paywalled-tierlist" label="Остальные показатели"><span>Ещё</span></PaidLockButton>
              </th>
            </tr></thead>
            {entry.tiers.map(group => <TierGroup key={group.tier} group={group} />)}
          </table>
        </div>
      </section>)}
    </div>
  </>;
}

/** A tier's painted mark (the site `TierBadge`) as a heading row, then its cards. */
function TierGroup({ group }: { group: TierListTierRows }) {
  return <>
    <tbody className="tierlist-public-pool__tier">
      <tr><th colSpan={4} scope="rowgroup"><TierBadge tier={group.tier} small /></th></tr>
    </tbody>
    <tbody dangerouslySetInnerHTML={{ __html: tierRows(group.rows) }} />
  </>;
}
