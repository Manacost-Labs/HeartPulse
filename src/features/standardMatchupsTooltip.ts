import { useCallback, useLayoutEffect } from 'react';

export interface ActiveMatrixMatchup {
  row: { archetype: string };
  cell: { opponent: string; winrate: number | null };
  rowLabel: string;
  opponentLabel: string;
  anchor: HTMLButtonElement;
  left: number;
  top: number;
  placement: 'above' | 'below';
}

export function activeMatrixMatchupAt(
  anchor: HTMLButtonElement,
  row: ActiveMatrixMatchup['row'],
  cell: ActiveMatrixMatchup['cell'],
  rowLabel: string,
  opponentLabel: string,
): ActiveMatrixMatchup {
  const rect = anchor.getBoundingClientRect();
  const tooltipWidth = Math.min(360, Math.max(280, window.innerWidth - 24));
  const estimatedHeight = 258;
  const left = Math.min(
    Math.max(12, rect.left + (rect.width / 2) - (tooltipWidth / 2)),
    Math.max(12, window.innerWidth - tooltipWidth - 12),
  );
  const hasRoomBelow = rect.bottom + estimatedHeight + 16 <= window.innerHeight;
  return {
    row, cell, rowLabel, opponentLabel, anchor, left,
    top: hasRoomBelow ? rect.bottom + 10 : rect.top - 10,
    placement: hasRoomBelow ? 'below' : 'above',
  };
}

export function useTooltipViewportPosition(
  activeMatchup: ActiveMatrixMatchup | null,
  tooltipRef: React.RefObject<HTMLDivElement | null>,
  adjustedAnchorRef: React.MutableRefObject<HTMLButtonElement | null>,
  setActiveMatchup: React.Dispatch<React.SetStateAction<ActiveMatrixMatchup | null>>,
) {
  useLayoutEffect(() => {
    const tooltip = tooltipRef.current;
    if (!activeMatchup || !tooltip || adjustedAnchorRef.current === activeMatchup.anchor) return;
    const rect = tooltip.getBoundingClientRect();
    const clamp = (value: number, max: number) => Math.min(Math.max(12, value), Math.max(12, max - 12));
    adjustedAnchorRef.current = activeMatchup.anchor;
    const left = clamp(rect.left, window.innerWidth - rect.width);
    const top = clamp(rect.top, window.innerHeight - rect.height);
    if (Math.abs(left - rect.left) < 1 && Math.abs(top - rect.top) < 1) return;
    setActiveMatchup(current => current === activeMatchup ? { ...current, left, top, placement: 'below' } : current);
  }, [activeMatchup, adjustedAnchorRef, setActiveMatchup, tooltipRef]);
}

export function useCloseMatrixMatchup(
  adjustedAnchorRef: React.MutableRefObject<HTMLButtonElement | null>,
  setActiveMatchup: React.Dispatch<React.SetStateAction<ActiveMatrixMatchup | null>>,
) {
  return useCallback((restoreFocus = false) => {
    adjustedAnchorRef.current = null;
    setActiveMatchup(current => {
      if (restoreFocus) window.requestAnimationFrame(() => current?.anchor.focus());
      return null;
    });
  }, [adjustedAnchorRef, setActiveMatchup]);
}
