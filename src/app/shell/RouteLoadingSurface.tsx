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
      <strong>Собираем раздел</strong>
    </div>
  );
}
