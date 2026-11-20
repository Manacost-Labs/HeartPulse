import './ModeHubPage.css';
import '@/src/route-parchment.css';
import type { ReactNode } from 'react';
import { MODE_HUB_ORDER, MODE_HUBS, type ModeHubId } from '@/apps/public-web/lib/modeHubs';
import { SeoStructuredData } from './SeoStructuredData';
import { SharedPageShell } from './SharedPageShell';

/**
 * A mode hub (`/standard/`, `/arena/`, `/battlegrounds/`, `/wild/`): H1, a
 * one-line lead, the «Сейчас в режиме» block of open data (`children`, absent
 * without data) and plain links to every indexable page of the mode. A server
 * component: the whole text is server HTML, the same for every visitor; only
 * the shared site shell hydrates. `updatedAt` dates the page's JSON-LD.
 */
export function ModeHubPage({ hub: id, updatedAt, children }: {
  hub: ModeHubId; updatedAt?: string | null; children: ReactNode;
}) {
  const hub = MODE_HUBS[id];
  const now = children ? <section className="mode-hub__now" aria-labelledby={`mode-hub-${id}-now`}>
    <h2 id={`mode-hub-${id}-now`}>{hub.nowTitle}</h2>
    {children}
  </section> : null;
  return <>
    <SeoStructuredData path={hub.path} data={{ updatedAt }} />
    <SharedPageShell pathname={`${hub.path}/`}>
      <article className="mode-hub">
        <h1>{hub.heading}</h1>
        <p className="mode-hub__lead">{hub.lead}</p>
        {now}
        <section aria-labelledby={`mode-hub-${id}-pages`}>
          <h2 id={`mode-hub-${id}-pages`}>Разделы режима</h2>
          <ul className="mode-hub__links">
            {hub.links.map(link => <li key={link.href}>
              <a href={link.href}>{link.title}</a>
              <span>{link.text}</span>
            </li>)}
          </ul>
        </section>
        <nav className="mode-hub__modes" aria-label="Другие режимы">
          <span>Другие режимы:</span>
          {MODE_HUB_ORDER.filter(other => other !== id).map(other => <a key={other} href={`${MODE_HUBS[other].path}/`}>
            {MODE_HUBS[other].name}
          </a>)}
        </nav>
      </article>
    </SharedPageShell>
  </>;
}
