export function RouteLoadingSurface({ minHeight = 520 }: { minHeight?: number }) {
  return (
    <div
      className="route-fallback"
      role="status"
      aria-busy="true"
      aria-live="polite"
      aria-label="Собираем раздел"
      style={{ minHeight }}
    >
      <div className="route-fallback__ledger">
        <span className="route-fallback__eyebrow">HearthPulse</span>
        <strong>Собираем раздел</strong>
        <span className="route-fallback__line route-fallback__line--title" aria-hidden="true" />
        <span className="route-fallback__line" aria-hidden="true" />
        <span className="route-fallback__line route-fallback__line--short" aria-hidden="true" />
      </div>
    </div>
  );
}
