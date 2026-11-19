import { useCallback, useEffect, useState } from 'react';
import { Columns3, ImageIcon, Rows3 } from 'lucide-react';
import '../funDecks/FunDeckLayouts.css';

export type DeckLayout = 'tiles' | 'rows' | 'images';

const LAYOUTS: ReadonlyArray<{ id: DeckLayout; label: string; Icon: typeof Columns3 }> = [
  { id: 'tiles', label: 'Плитки', Icon: Columns3 },
  { id: 'rows', label: 'Строки', Icon: Rows3 },
  { id: 'images', label: 'Картинки', Icon: ImageIcon },
];
/** One choice for every deck list on the site; the fun-decks key is its older name. */
const LAYOUT_STORAGE_KEY = 'hp:deck-layout';
const LEGACY_STORAGE_KEY = 'hp:fun-decks:layout';
const LAYOUT_EVENT = 'hp:deck-layout';

function isLayout(value: unknown): value is DeckLayout {
  return LAYOUTS.some(item => item.id === value);
}

/** The reader's chosen deck view; the server HTML always starts with tiles. */
export function useDeckLayout(): [DeckLayout, (layout: DeckLayout) => void] {
  const [layout, setLayout] = useState<DeckLayout>('tiles');
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(LAYOUT_STORAGE_KEY) ?? window.localStorage.getItem(LEGACY_STORAGE_KEY);
      if (isLayout(saved)) setLayout(saved);
    } catch {
      // Storage may be blocked; the default view still works.
    }
    // Every deck list on the page, and in other tabs, follows the choice at once.
    const follow = (event: Event) => {
      const next = event instanceof StorageEvent ? event.key === LAYOUT_STORAGE_KEY && event.newValue : (event as CustomEvent<unknown>).detail;
      if (isLayout(next)) setLayout(next);
    };
    window.addEventListener(LAYOUT_EVENT, follow);
    window.addEventListener('storage', follow);
    return () => {
      window.removeEventListener(LAYOUT_EVENT, follow);
      window.removeEventListener('storage', follow);
    };
  }, []);
  const change = useCallback((next: DeckLayout) => {
    setLayout(next);
    try {
      window.localStorage.setItem(LAYOUT_STORAGE_KEY, next);
    } catch {
      // The choice simply lasts until the page is left.
    }
    window.dispatchEvent(new CustomEvent(LAYOUT_EVENT, { detail: next }));
  }, []);
  return [layout, change];
}

export function DeckLayoutSwitch({ layout, onChange }: { layout: DeckLayout; onChange: (layout: DeckLayout) => void }) {
  return (
    <div className="fun-decks-layout" role="group" aria-label="Вид колод">
      <span aria-hidden="true">Вид</span>
      {LAYOUTS.map(({ id, label, Icon }) => (
        <button key={id} type="button" aria-pressed={layout === id} onClick={() => onChange(id)}>
          <Icon aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  );
}
