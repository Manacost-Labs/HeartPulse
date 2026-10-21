import type { ReactNode } from 'react';
import { ClassShareBars } from './ClassShareBars';
import type { ClassDistribution, DeckDistribution } from './viciousGoldModel';

/**
 * Meta shares: a stacked bar per class with its archetypes and, under it, the archetype list
 * (`children`). Picking a class filters the list. Stacked bars replaced a class -> archetype
 * treemap: at 412 px most treemap tiles were too small for a name, the bars keep one.
 */
export function MetaShare({ classes, decks, selectedClass, onSelectClass, minimumFrequency, children }: {
  classes: ClassDistribution[];
  decks: DeckDistribution[];
  selectedClass: string;
  onSelectClass: (classKey: string) => void;
  minimumFrequency: number;
  children: ReactNode;
}) {
  return (
    <section className="vsgold-section vsgold-share" id="vsgold-classes" aria-labelledby="vsgold-share-title">
      <header className="vsgold-section__head">
        <div>
          <h2 id="vsgold-share-title">Доли меты</h2>
          <p>Доля класса в партиях и его архетипы. Нажмите на класс, чтобы оставить в списке ниже только его колоды.</p>
        </div>
      </header>
      <ClassShareBars classes={classes} decks={decks} selectedClass={selectedClass} onSelectClass={onSelectClass} minimumFrequency={minimumFrequency} />
      {children}
    </section>
  );
}
