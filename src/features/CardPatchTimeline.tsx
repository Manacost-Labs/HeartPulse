import { useState } from 'react';
import { ArrowDownRight, ArrowUpRight, ExternalLink, Plus, RefreshCw } from 'lucide-react';
import type { CardPatchChangeKind, CardPatchEntry } from './cardPatchChanges';
import './CardPatchTimeline.css';

const KIND: Record<CardPatchChangeKind, { label: string; icon: typeof Plus }> = {
  added: { label: 'Добавлена', icon: Plus },
  buff: { label: 'Усиление', icon: ArrowUpRight },
  nerf: { label: 'Ослабление', icon: ArrowDownRight },
  removed: { label: 'Убрана', icon: ArrowDownRight },
  change: { label: 'Изменение', icon: RefreshCw },
};

const formatDate = (value: string | null) => {
  const time = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(time)
    ? new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(time)
    : null;
};

/**
 * What changed on the card, patch by patch: a timeline with the real change
 * lines (cost 5 → 4, added, new text) instead of each patch's announcement.
 * Flavor, unlock and Duels notes fold into a quiet line. `kindLabels` renames
 * the badges for a subject other than a card (a hero is «Добавлен»); `limit`
 * shows the newest patches first and the rest behind one button.
 */
export function CardPatchTimeline({ entries, kindLabels, limit }: {
  entries: CardPatchEntry[];
  kindLabels?: Partial<Record<CardPatchChangeKind, string>>;
  limit?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!entries.length) return <p className="card-patch-timeline__empty">История изменений не найдена.</p>;
  // A single leftover patch is shown rather than hidden behind a button.
  const hidden = limit && !expanded && entries.length > limit + 1 ? entries.length - limit : 0;
  return (
    <>
      <ol className="card-patch-timeline">
        {entries.slice(0, entries.length - hidden).map((entry, index) => {
          const main = entry.changes.filter(change => !change.minor);
          const minor = entry.changes.filter(change => change.minor);
          const date = formatDate(entry.date);
          return (
            <li key={`${entry.version}-${entry.date}-${index}`} className="card-patch-timeline__entry">
              <div className="card-patch-timeline__when">
                <strong>{entry.version}</strong>
                {date ? <time dateTime={entry.date ?? undefined}>{date}</time> : null}
              </div>
              <div className="card-patch-timeline__what">
                {main.length ? (
                  <ul className="card-patch-timeline__changes">
                    {main.map((change, changeIndex) => {
                      const kind = KIND[change.kind];
                      const Icon = kind.icon;
                      return (
                        <li key={changeIndex} data-kind={change.kind}>
                          <span className="card-patch-timeline__badge"><Icon aria-hidden="true" size={14} />{kindLabels?.[change.kind] ?? kind.label}</span>
                          <span>{change.text}</span>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
                {minor.length ? (
                  <details className="card-patch-timeline__minor">
                    <summary>{main.length ? 'Ещё' : 'Технические правки'}: {minor.length}</summary>
                    <ul>{minor.map((change, changeIndex) => <li key={changeIndex}>{change.text}</li>)}</ul>
                  </details>
                ) : null}
                {entry.articleUrl || entry.wikiUrl ? (
                  <p className="card-patch-timeline__links">
                    {entry.articleUrl ? (
                      <a href={entry.articleUrl} target="_blank" rel="noreferrer" title={entry.articleTitle ?? undefined}>
                        Статья об обновлении <ExternalLink aria-hidden="true" size={13} />
                      </a>
                    ) : null}
                    {entry.wikiUrl ? (
                      <a href={entry.wikiUrl} target="_blank" rel="noreferrer">Hearthstone Wiki <ExternalLink aria-hidden="true" size={13} /></a>
                    ) : null}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
      {hidden ? (
        <button type="button" className="card-patch-timeline__more" onClick={() => setExpanded(true)}>
          Показать все изменения ({entries.length})
        </button>
      ) : null}
    </>
  );
}
