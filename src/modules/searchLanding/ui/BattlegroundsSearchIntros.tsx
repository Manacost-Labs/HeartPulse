import { SectionBanner } from '../../../shared/ui/EditorialRouteChrome';

export function BattlegroundsTierListSearchIntro() {
  return (
    <SectionBanner title="Тир-лист Полей сражений">
      <div className="traditional-mode-banner__related">
        <a href="/heroes/">Герои Полей сражений</a>
      </div>
    </SectionBanner>
  );
}

export function BattlegroundsStrategyBuilderSearchIntro() {
  return <SectionBanner title="Конструктор стратегий Полей сражений" />;
}
