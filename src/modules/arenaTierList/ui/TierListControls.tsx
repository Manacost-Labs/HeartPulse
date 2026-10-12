import { Search, X, Grid3X3, List, ChevronDown } from 'lucide-react';
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
}

export function TierListControls(props: ControlsProps) {
  const classes = [{ id: '__all__', name: 'Все карты' }, ...props.sections];
  const activeName = classes.find(section => section.id === props.activeClassId)?.name ?? 'Все карты';
  const filtered = Boolean(props.search || props.rarity !== 'all' || props.mana !== 'all');
  return <div className="arena-tier-controls">
    <div className="arena-tier-controls-top" data-tour-id="arena-tier-class">
      <div className="arena-tier-classes" role="group" aria-label="Класс карт">
        {classes.map(section => <button key={section.id} type="button"
          aria-label={section.name} title={section.name}
          aria-pressed={section.id === props.activeClassId}
          onClick={() => props.onClassChange(section.id)}>
          <img src={CLASS_ICONS[section.id] ?? CLASS_ICONS.any} alt="" draggable={false} />
        </button>)}
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

export function TierBadge({ tier, small = false }: { tier: string; small?: boolean }) {
  return <span className={`arena-tier-badge${small ? ' arena-tier-badge--small' : ''}`} data-tier={tier} role="img" aria-label={`Тир ${tier}`}>
    <span className="arena-tier-badge-letter" aria-hidden="true">{tier}</span>
  </span>;
}
