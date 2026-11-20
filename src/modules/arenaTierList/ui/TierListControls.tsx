import { Search, X, Grid3X3, List, ChevronDown, LockKeyhole } from 'lucide-react';
import type { ClassSection } from '../model/types';
import './TierListControls.css';

export type ManaFilterValue = 'all' | number;

const CLASS_ICONS: Record<string, string> = {
  '__all__': '/class_icon/ui/all-96.webp',
  'death-knight': '/class_icon/ui/deathknight-96.webp',
  'demon-hunter': '/class_icon/ui/demonhunter-96.webp',
  druid: '/class_icon/ui/druid-96.webp', hunter: '/class_icon/ui/hunter-96.webp',
  mage: '/class_icon/ui/mage-96.webp', paladin: '/class_icon/ui/paladin-96.webp',
  priest: '/class_icon/ui/priest-96.webp', rogue: '/class_icon/ui/rogue-96.webp',
  shaman: '/class_icon/ui/shaman-96.webp', warlock: '/class_icon/ui/warlock-96.webp',
  warrior: '/class_icon/ui/warrior-96.webp', any: '/class_icon/neutral.webp',
};

interface ControlsProps {
  sections: ClassSection[];
  activeClassId: string;
  onClassChange: (id: string) => void;
  search: string;
  onSearchChange: (value: string) => void;
  rarity: string;
  onRarityChange: (value: string) => void;
  mana: ManaFilterValue;
  onManaChange: (value: ManaFilterValue) => void;
  view: 'gallery' | 'table';
  onViewChange: (value: 'gallery' | 'table') => void;
  canUseTable: boolean;
  onReset: () => void;
  /**
   * A viewer without access: the rarity and mana filters stay in place as locked buttons that call this
   * (the subscription offer); `.paywalled-tierlist` is the closed part the page's JSON-LD names.
   */
  onLockedFilter?: () => void;
  /**
   * Each class has a page of its own (`/tierlist/<class>/`): the class choice is a plain link to it, so the whole
   * card pool is reachable through server-rendered pages. Without it the choice switches the class in place.
   */
  classHref?: (id: string) => string;
}

function LockedFilter({ label, icon, onClick }: { label: string; icon: string; onClick: () => void }) {
  return <button type="button" className="arena-tier-select arena-tier-select--locked paywalled-tierlist" onClick={onClick}
    aria-label={`${label}: фильтр по подписке`}>
    <span>{label}</span>
    <img className="arena-tier-select-icon" src={icon} alt="" draggable={false} />
    <b className="arena-tier-select-locked-value">{label === 'Мана' ? 'Любая мана' : 'Любая редкость'}</b>
    <LockKeyhole size={15} aria-hidden="true" />
  </button>;
}

export function TierListControls(props: ControlsProps) {
  const classes = [{ id: '__all__', name: 'Все карты' }, ...props.sections];
  const activeName = classes.find(section => section.id === props.activeClassId)?.name ?? 'Все карты';
  const filtered = Boolean(props.search || props.rarity !== 'all' || props.mana !== 'all');
  return <div className="arena-tier-controls">
    <div className="arena-tier-controls-top" data-tour-id="arena-tier-class">
      <div className="arena-tier-classes" role="group" aria-label="Класс карт">
        {classes.map(section => {
          const icon = <img src={CLASS_ICONS[section.id] ?? CLASS_ICONS.any} alt="" draggable={false} />;
          return props.classHref
            ? <a key={section.id} href={props.classHref(section.id)} aria-label={section.name} title={section.name}
              aria-current={section.id === props.activeClassId ? 'page' : undefined}>{icon}</a>
            : <button key={section.id} type="button" aria-label={section.name} title={section.name}
              aria-pressed={section.id === props.activeClassId} onClick={() => props.onClassChange(section.id)}>{icon}</button>;
        })}
      </div>
      <label className="arena-tier-search">
        <Search size={18} aria-hidden="true" />
        <input type="search" aria-label="Поиск карт" placeholder="Найти карту…"
          value={props.search} onChange={event => props.onSearchChange(event.target.value)} />
        {props.search && <button type="button" aria-label="Очистить поиск"
          onClick={() => props.onSearchChange('')}><X size={16} /></button>}
      </label>
    </div>
    <div className="arena-tier-controls-bottom" data-tour-id="arena-tier-filters">
      <div className="arena-tier-selection" aria-live="polite" aria-atomic="true">
        <h2>{activeName}</h2>
      </div>
      <div className="arena-tier-filters">
        {props.onLockedFilter ? <>
          <LockedFilter label="Редкость" icon="/assets/common.png" onClick={props.onLockedFilter} />
          <LockedFilter label="Мана" icon="/assets/mana-64.webp" onClick={props.onLockedFilter} />
        </> : <>
        <label className="arena-tier-select"><span>Редкость</span>
          <img className="arena-tier-select-icon arena-tier-select-icon--rarity"
            src={`/assets/${props.rarity === 'all' ? 'common' : props.rarity}.png`} alt="" draggable={false} />
          <select data-selected={props.rarity !== 'all'} value={props.rarity} onChange={event => props.onRarityChange(event.target.value)}>
            <option value="all">Любая редкость</option><option value="common">Обычная</option>
            <option value="rare">Редкая</option><option value="epic">Эпическая</option>
            <option value="legendary">Легендарная</option>
          </select><ChevronDown size={16} aria-hidden="true" />
        </label>
        <label className="arena-tier-select"><span>Мана</span>
          <img className="arena-tier-select-icon" src="/assets/mana-64.webp" alt="" draggable={false} />
          <select data-selected={props.mana !== 'all'} value={props.mana} onChange={event => props.onManaChange(
            event.target.value === 'all' ? 'all' : Number(event.target.value))}>
            <option value="all">Любая мана</option>
            {Array.from({ length: 11 }, (_, cost) => <option key={cost} value={cost}>
              {cost === 10 ? 'Мана: 10+' : `Мана: ${cost}`}
            </option>)}
          </select><ChevronDown size={16} aria-hidden="true" />
        </label>
        </>}
        {filtered && <button className="arena-tier-reset" type="button" onClick={props.onReset}>Сбросить</button>}
        {props.canUseTable && <div className="arena-tier-view" role="group" aria-label="Вид карт" data-tour-id="arena-tier-view">
          <button type="button" aria-label="Галерея" title="Галерея" aria-pressed={props.view === 'gallery'}
            onClick={() => props.onViewChange('gallery')}><Grid3X3 size={18} /></button>
          <button type="button" aria-label="Таблица" title="Таблица" aria-pressed={props.view === 'table'}
            onClick={() => props.onViewChange('table')}><List size={18} /></button>
        </div>}
      </div>
    </div>
  </div>;
}

/** Letters that have a painted mark in `public/tier-marks/` (`u` is «Без тира»). */
const TIER_MARK_LETTERS: ReadonlySet<string> = new Set(['s', 'a', 'b', 'c', 'd', 'e', 'f', 'u']);

/** Side of the square mark in px: the compact one for tables and cards, the default for tier headings, the large one for hero places. */
export const TIER_BADGE_SIZES = { sm: 32, md: 52, lg: 72 } as const;
export type TierBadgeSize = keyof typeof TIER_BADGE_SIZES;

/** The mark of a tier letter as a width-descriptor srcset (40, 80 and 160 px files). */
const tierMarkSrcSet = (letter: string): string => [40, 80, 160].map(width => `/tier-marks/${letter}-${width}.webp ${width}w`).join(', ');

/**
 * The one tier mark of the site: a painted image from `/tier-marks/` (S gold,
 * A copper, B amethyst, C emerald, D sapphire, E bronze, F iron, U «Без тира»).
 * The case of the letter does not matter. Any other value, such as a tier a
 * reader named in the builder, gets a plain neutral text mark instead of a
 * broken image. `small` is the short form of `size="sm"`.
 */
export function TierBadge({ tier, small = false, size }: { tier: string; small?: boolean; size?: TierBadgeSize }) {
  const px = TIER_BADGE_SIZES[size ?? (small ? 'sm' : 'md')];
  const letter = tier.trim().toLowerCase();
  if (!TIER_MARK_LETTERS.has(letter)) {
    return <span className="arena-tier-badge arena-tier-badge--text" data-size={px} role="img" aria-label={`Тир ${tier}`}>
      <span aria-hidden="true">{tier.trim().slice(0, 3)}</span>
    </span>;
  }
  return <img className="arena-tier-badge" data-tier={letter.toUpperCase()} src={`/tier-marks/${letter}-80.webp`} srcSet={tierMarkSrcSet(letter)}
    sizes={`${px}px`} width={px} height={px} alt={letter === 'u' ? 'Без тира' : `Тир ${letter.toUpperCase()}`}
    loading="lazy" decoding="async" draggable={false} />;
}
