import { Award, Crown, Gem, Gift, Layers, ScrollText, Shapes, Sparkles, Swords } from 'lucide-react';
import type { PatchCardView, PatchGroupIcon } from '../../modules/patchNotes/public';
import { classIconUrl } from '../classIcons';

/* What the patch means for today's meta on one card, and the icon of a class or card-type group. */

/** The rest of a card's archetypes is a count; the card page lists every deck. */
const CHIPS_PER_CARD = 4;
const TYPE_ICONS: Record<string, typeof Gem> = {
  minion: Swords, spell: Sparkles, hero: Crown, trinket: Gem, 'dark-gift': Gift, anomaly: Shapes, quest: ScrollText, reward: Award,
};

function ClassIcon({ classKey }: { classKey: string | null }) {
  return <img className="hp-patch-class-icon" src={classIconUrl(classKey)} alt="" width={64} height={64} loading="lazy" decoding="async" />;
}

export function GroupIcon({ icon }: { icon: PatchGroupIcon }) {
  if ('classKey' in icon) return <ClassIcon classKey={icon.classKey} />;
  const Icon = (icon.cardType && TYPE_ICONS[icon.cardType]) || Layers;
  return <span className="hp-patch-type-icon"><Icon aria-hidden="true" /></span>;
}

/** Archetypes of today's meta that play this card; how many of their builds do is in the link title. */
export function ArchetypeChips({ card }: { card: PatchCardView }) {
  if (!card.archetypes.length) return null;
  const shown = card.archetypes.slice(0, CHIPS_PER_CARD);
  const more = card.archetypes.length - shown.length;
  return (
    <div className="hp-patch-card__meta-use">
      <span>В архетипах текущей меты</span>
      <ul>
        {shown.map(use => (
          <li key={`${use.format}:${use.slug}`}>
            <a href={use.href} title={`${use.decks} из ${use.totalDecks} сборок архетипа`}>
              <ClassIcon classKey={use.classKey} />
              {use.name}
            </a>
          </li>
        ))}
        {more > 0 && <li><span>ещё {more}</span></li>}
      </ul>
    </div>
  );
}
