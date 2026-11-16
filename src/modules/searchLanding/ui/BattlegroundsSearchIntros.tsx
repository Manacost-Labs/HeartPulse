import { SectionBanner } from '../../../shared/ui/EditorialRouteChrome';

export function BattlegroundsTierListSearchIntro() {
  return (
    <SectionBanner title="Тир-лист Полей сражений" subtitle="Существа, составы, заклинания и аксессуары по текущему патчу">
      <nav className="traditional-mode-banner__related" aria-label="Связанный раздел">
        <a href="/heroes/">Герои Полей сражений</a>
      </nav>
    </SectionBanner>
  );
}

export function BattlegroundsStrategyBuilderSearchIntro() {
  return <SectionBanner title="Конструктор стратегий Полей сражений" />;
}
