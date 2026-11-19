import './BattlegroundLibraryPublic.css';
import { LIBRARY_LISTING_KINDS, type LibraryListingKind } from '@/apps/public-web/lib/publicBattlegroundLibraryListingData';

const LABELS: Record<LibraryListingKind, string> = {
  minions: 'Существа', spells: 'Заклинания', anomalies: 'Аномалии', 'dark-gifts': 'Темные дары', quests: 'Квесты',
  rewards: 'Награды', 'darkmoon-prizes': 'Призы Ярмарки Новолуния', trinkets: 'Аксессуары', timewarped: 'Хрономальные карты',
};

/** The hub of the library: a link to every listing with its size. The links stay when the sizes are unavailable. */
export function BattlegroundLibraryPublicIndex({ sizes }: { sizes: Partial<Record<LibraryListingKind, number>> }) {
  return <nav className="bg-library-public" aria-label="Разделы библиотеки">
    <ul className="bg-library-public__kinds">
      {LIBRARY_LISTING_KINDS.map(kind => <li key={kind}>
        <a href={`/library/${kind}/`}>{LABELS[kind]}{sizes[kind] ? <span className="bg-library-public__size">{sizes[kind]}</span> : null}</a>
      </li>)}
      <li><a href="/library/archive/">Архив</a></li>
    </ul>
  </nav>;
}
