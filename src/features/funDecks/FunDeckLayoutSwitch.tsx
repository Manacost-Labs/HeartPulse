import { useCallback, useEffect, useState } from 'react';
import { Columns3, ImageIcon, Rows3 } from 'lucide-react';
import './FunDeckLayouts.css';

export type FunDeckLayout = 'tiles' | 'rows' | 'images';

const LAYOUTS: ReadonlyArray<{ id: FunDeckLayout; label: string; Icon: typeof Columns3 }> = [
  { id: 'tiles', label: 'Плитки', Icon: Columns3 },
  { id: 'rows', label: 'Строки', Icon: Rows3 },
  { id: 'images', label: 'Картинки', Icon: ImageIcon },
];
const LAYOUT_STORAGE_KEY = 'hp:fun-decks:layout';

function isLayout(value: unknown): value is FunDeckLayout {
  return LAYOUTS.some(item => item.id === value);
}

/** The reader's chosen deck view; the server HTML always starts with tiles. */
export function useFunDeckLayout(): [FunDeckLayout, (layout: FunDeckLayout) => void] {
  const [layout, setLayout] = useState<FunDeckLayout>('tiles');
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(LAYOUT_STORAGE_KEY);
      if (isLayout(saved)) setLayout(saved);
    } catch {
      // Storage may be blocked; the default view still works.
    }
  }, []);
  const change = useCallback((next: FunDeckLayout) => {
    setLayout(next);
    try {
      window.localStorage.setItem(LAYOUT_STORAGE_KEY, next);
    } catch {
      // The choice simply lasts until the page is left.
    }
  }, []);
  return [layout, change];
}

export function FunDeckLayoutSwitch({ layout, onChange }: { layout: FunDeckLayout; onChange: (layout: FunDeckLayout) => void }) {
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
