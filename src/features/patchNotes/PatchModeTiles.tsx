import { Shapes } from 'lucide-react';
import type { PatchSectionView, PatchView } from '../../modules/patchNotes/public';
import { KindShareBar } from './PatchHero';
import { SECTION_ICONS, SECTION_PLATES } from './patchArt';
import { openTarget, sectionAnchor } from './PatchNotesNavigation';

/* The patch's modes as picture tiles: where the changes are and which way they lean. */

/** Mode emblem(s) of a section; side modes have no emblem of their own and use a neutral glyph. */
export function ModeEmblem({ section }: { section: Pick<PatchSectionView, 'id'> }) {
  const icons = SECTION_ICONS[section.id];
  return (
    <span className="hp-patch-emblem" data-count={icons.length || undefined} aria-hidden="true">
      {icons.length ? icons.map(icon => <img key={icon} src={icon} alt="" width={96} height={96} loading="lazy" decoding="async" />)
        : <Shapes />}
    </span>
  );
}

const KIND_WORDS = { buff: 'усилений', nerf: 'ослаблений', rework: 'изменений' } as const;

function tileLabel(section: PatchSectionView): string {
  const kinds = (Object.keys(KIND_WORDS) as (keyof typeof KIND_WORDS)[])
    .filter(kind => section.kinds[kind] > 0).map(kind => `${KIND_WORDS[kind]} ${section.kinds[kind]}`);
  return `${section.title}: ${section.count} изм.${kinds.length ? `, ${kinds.join(', ')}` : ''}`;
}

export function PatchModeTiles({ view }: { view: PatchView }) {
  if (!view.sections.length) return null;
  return (
    <nav className="hp-patch-modes" aria-label="Разделы патча">
      <ul data-count={Math.min(view.sections.length, 4)}>
        {view.sections.map(section => {
          const plate = SECTION_PLATES[section.id];
          return (
            <li key={section.id}>
              <a className="hp-patch-mode" data-section={section.id} href={`#${sectionAnchor(section.id)}`}
                aria-label={tileLabel(section)} onClick={event => openTarget(event.currentTarget.hash)}>
                <img className="hp-patch-mode__plate" src={plate.src} srcSet={plate.srcSet}
                  sizes="(min-width: 960px) 320px, 100vw" width={plate.width} height={plate.height}
                  style={{ objectPosition: plate.focus }} alt="" decoding="async" fetchPriority="low" />
                <ModeEmblem section={section} />
                <span className="hp-patch-mode__title">{section.title}</span>
                <span className="hp-patch-mode__count"><b>{section.count}</b> изм.</span>
                <span className="hp-patch-mode__kinds">
                  {(['buff', 'nerf', 'rework'] as const).filter(kind => section.kinds[kind] > 0).map(kind => (
                    <span key={kind} data-kind={kind}>{({ buff: '▲', nerf: '▼', rework: '↻' })[kind]}{section.kinds[kind]}</span>
                  ))}
                </span>
                <KindShareBar kinds={section.kinds} className="hp-patch-mode__share" />
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
