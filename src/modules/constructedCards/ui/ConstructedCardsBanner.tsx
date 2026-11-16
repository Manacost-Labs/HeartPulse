export function ConstructedCardsBanner({ title = 'Карты' }: { title?: string }) {
  return (
    <header className="constructed-cards__header">
      <div className="traditional-mode-banner__copy"><h1>{title}</h1></div>
    </header>
  );
}
