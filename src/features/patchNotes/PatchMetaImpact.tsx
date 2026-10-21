import { useState } from 'react';
import { Award, Crown, Gem, Gift, Layers, ScrollText, Shapes, Sparkles, Swords } from 'lucide-react';
import {
  PATCH_SECTION_TITLES, patchAffectedArchetypes, patchGroupKinds, type PatchCardView, type PatchFilter, type PatchGroupIcon,
  type PatchNotesMeta, type PatchView,
} from '../../modules/patchNotes/public';
import { classIconUrl } from '../classIcons';

/* What the patch means for today's meta: affected archetypes, per-card archetypes and the class/type strip. */

// Listed here rather than imported from PatchCard, which renders these chips: no import cycle.
const KINDS = ['buff', 'nerf', 'rework'] as const;
/** The rest of a card's archetypes is a count; the card page lists every deck. */
const CHIPS_PER_CARD = 4;
const AFFECTED_FIRST = 6;
const FORMAT_LABELS = { standard: 'Стандарт', wild: 'Вольный' } as const;
const KIND_MARKS = { buff: '▲', nerf: '▼', rework: '↻' } as const;
const KIND_WORDS = { buff: 'усилено', nerf: 'ослаблено', rework: 'изменено' } as const;
const TYPE_ICONS: Record<string, typeof Gem> = {
  minion: Swords, spell: Sparkles, hero: Crown, trinket: Gem, 'dark-gift': Gift, anomaly: Shapes, quest: ScrollText, reward: Award,
};

function ClassIcon({ classKey }: { classKey: string | null }) {
  return <img className="hp-patch-class-icon" src={classIconUrl(classKey)} alt="" width={64} height={64} loading="lazy" decoding="async" />;
}

function GroupIcon({ icon }: { icon: PatchGroupIcon }) {
  if ('classKey' in icon) return <ClassIcon classKey={icon.classKey} />;
  const Icon = (icon.cardType && TYPE_ICONS[icon.cardType]) || Layers;
  return <span className="hp-patch-type-icon"><Icon aria-hidden="true" /></span>;
}

function popularity(value: number | null) {
  return value === null ? null : `${value.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%`;
}

function metaSource(meta: PatchNotesMeta): string {
  const missing = meta.missing.map(format => FORMAT_LABELS[format]).join(' и ');
  return 'Архетипы текущей меты HSGuru: карта считается сыгранной, если она есть хотя бы в одной из сборок архетипа.'
    + (missing ? ` ${missing}: данные сейчас недоступны.` : '');
}

/** The patch's reach into today's meta, most popular archetype first. */
export function AffectedArchetypes({ view, meta }: { view: PatchView; meta: PatchNotesMeta | null }) {
  const [expanded, setExpanded] = useState(false);
  if (!meta) return null;
  const all = patchAffectedArchetypes(view);
  const archetypes = expanded ? all : all.slice(0, AFFECTED_FIRST);
  const constructed = view.groups.some(group => group.section !== 'battlegrounds' && group.section !== 'arena');
  if (!constructed) return null;
  return (
    <div className="hp-patch-affected">
      <h4>Затронутые архетипы</h4>
      {archetypes.length > 0 ? (
        <ul>
          {archetypes.map(archetype => (
            <li key={`${archetype.format}:${archetype.slug}`}>
              <a href={archetype.href}>
                <ClassIcon classKey={archetype.classKey} />
                <span className="hp-patch-affected__name">
                  {archetype.name}
                  {archetype.format === 'wild' && <small> · Вольный</small>}
                </span>
                {archetype.popularity !== null && <span className="hp-patch-affected__share">{popularity(archetype.popularity)}</span>}
                <span className="hp-patch-affected__kinds">
                  {KINDS.filter(kind => archetype.kinds[kind] > 0).map(kind => (
                    <span key={kind} data-kind={kind} title={`${archetype.kinds[kind]} карт ${KIND_WORDS[kind]}`}>
                      {KIND_MARKS[kind]}{archetype.kinds[kind]}
                    </span>
                  ))}
                </span>
              </a>
              <span className="hp-patch-affected__cards">{archetype.cards.map(card => card.name).join(', ')}</span>
            </li>
          ))}
        </ul>
      ) : <p>Ни одна изменённая карта не встречается в сборках текущих архетипов.</p>}
      {all.length > AFFECTED_FIRST && (
        <button type="button" className="hp-patch-affected__more" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>
          {expanded ? 'Свернуть' : `Показать все архетипы (${all.length})`}
        </button>
      )}
      <p className="hp-patch-affected__source">{metaSource(meta)}</p>
    </div>
  );
}

/** Archetypes of today's meta that play this card, with how many of their listed builds do. */
export function ArchetypeChips({ card }: { card: PatchCardView }) {
  if (!card.archetypes.length) return null;
  const shown = card.archetypes.slice(0, CHIPS_PER_CARD);
  const more = card.archetypes.length - shown.length;
  return (
    <div className="hp-patch-card__meta-use">
      <span>Играют сейчас:</span>
      <ul>
        {shown.map(use => (
          <li key={`${use.format}:${use.slug}`}>
            <a href={use.href} title={`${use.decks} из ${use.totalDecks} сборок архетипа`}>
              <ClassIcon classKey={use.classKey} />
              {use.name}
              <small>{use.decks}/{use.totalDecks}</small>
            </a>
          </li>
        ))}
        {more > 0 && <li><span>ещё {more}</span></li>}
      </ul>
    </div>
  );
}

/** Classes and card types at a glance; a click filters to that group, a second click clears it. */
export function GroupStrip({ view, filter, onChange }: { view: PatchView; filter: PatchFilter; onChange: (next: Partial<PatchFilter>) => void }) {
  if (view.groups.length < 2) return null;
  return (
    <div className="hp-patch-strip" role="group" aria-label="Изменения по классам и типам">
      {view.groups.map(group => {
        const kinds = patchGroupKinds(group);
        return (
          <button key={group.id} type="button" aria-pressed={filter.group === group.id}
            title={`${PATCH_SECTION_TITLES[group.section]}: ${group.title}`}
            onClick={() => onChange({ group: filter.group === group.id ? 'all' : group.id })}>
            <GroupIcon icon={group.icon} />
            <span className="hp-patch-strip__title">{group.title}</span>
            <span className="hp-patch-strip__kinds">
              {KINDS.filter(kind => kinds[kind] > 0).map(kind => (
                <span key={kind} data-kind={kind}>{KIND_MARKS[kind]}{kinds[kind]}</span>
              ))}
            </span>
          </button>
        );
      })}
    </div>
  );
}
