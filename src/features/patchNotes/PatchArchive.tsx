import { CalendarClock } from 'lucide-react';
import { patchArchiveByExpansion, patchNotesHref, type PatchNotesSummary } from '../../modules/patchNotes/public';
import { ExpansionSeal } from './PatchHero';
import { expansionBadge } from './patchArt';

/* Every archived patch on one timeline, grouped by the expansion cycle it shipped in. */

function patchWord(count: number): string {
  const tens = count % 100;
  const ones = count % 10;
  if (tens >= 11 && tens <= 14) return 'патчей';
  if (ones === 1) return 'патч';
  return ones >= 2 && ones <= 4 ? 'патча' : 'патчей';
}

export function PatchArchive({ patches, current, formatDate }: {
  patches: PatchNotesSummary[]; current: string; formatDate: (value: string | null) => string | null;
}) {
  if (patches.length < 2) return null;
  const groups = patchArchiveByExpansion(patches);
  return (
    <section className="hp-patch-archive" aria-labelledby="hp-patch-archive-title">
      <div className="hp-patch-archive__head">
        <h3 id="hp-patch-archive-title"><CalendarClock aria-hidden="true" />Архив патчей</h3>
        <p>{patches.length} {patchWord(patches.length)} с изменениями карт, по циклам дополнений — от нового к старому.</p>
      </div>
      <ol className="hp-patch-archive__cycles">
        {groups.map((group, index) => {
          const open = index === 0 || group.patches.some(patch => patch.version === current);
          const label = group.code ? expansionBadge(group.code).label : `Версия ${Number.parseInt(group.patches[0].version, 10)}`;
          const changes = group.patches.reduce((sum, patch) => sum + patch.changeCount, 0);
          return (
            <li key={group.key} className="hp-patch-archive__cycle">
              <details open={open}>
                <summary>
                  {group.code ? <ExpansionSeal code={group.code} size="small" /> : <span className="hp-patch-seal" data-size="small" aria-hidden="true" />}
                  <span className="hp-patch-archive__label">{label}</span>
                  <small>{group.patches.length} {patchWord(group.patches.length)} · {changes} изм.</small>
                </summary>
                <ol className="hp-patch-archive__patches">
                  {group.patches.map(patch => {
                    const date = formatDate(patch.publishedAt);
                    const isCurrent = patch.version === current;
                    return (
                      <li key={patch.version} data-current={isCurrent || undefined}>
                        <a href={patchNotesHref(patch === patches[0] ? null : patch.version)} aria-current={isCurrent ? 'page' : undefined}>
                          <b>{patch.version}</b>
                          {date && <time dateTime={patch.publishedAt ?? undefined}>{date}</time>}
                          <span>{patch.changeCount} изм.</span>
                        </a>
                      </li>
                    );
                  })}
                </ol>
              </details>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
