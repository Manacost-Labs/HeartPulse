export type ModalViewport = {
  width: number;
  height: number;
  offsetLeft?: number;
  offsetTop?: number;
};

export type ModalViewportVariables = {
  '--modal-surface-left': string;
  '--modal-surface-top': string;
  '--modal-surface-width': string;
  '--modal-surface-height': string;
};

export function addModalToStack(stack: readonly string[], modalId: string): string[] {
  return [...stack.filter(id => id !== modalId), modalId];
}

export function removeModalFromStack(stack: readonly string[], modalId: string): string[] {
  return stack.filter(id => id !== modalId);
}

export function topModalId(stack: readonly string[]): string | null {
  return stack.at(-1) ?? null;
}

function positiveOrFallback(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function nonNegativeOrZero(value: number | undefined): number {
  return Number.isFinite(value) && Number(value) >= 0 ? Number(value) : 0;
}

export function modalViewportVariables(
  visualViewport: ModalViewport | null | undefined,
  layoutViewport: Pick<ModalViewport, 'width' | 'height'>,
): ModalViewportVariables {
  const width = positiveOrFallback(visualViewport?.width ?? 0, layoutViewport.width);
  const height = positiveOrFallback(visualViewport?.height ?? 0, layoutViewport.height);
  return {
    '--modal-surface-left': `${nonNegativeOrZero(visualViewport?.offsetLeft)}px`,
    '--modal-surface-top': `${nonNegativeOrZero(visualViewport?.offsetTop)}px`,
    '--modal-surface-width': `${width}px`,
    '--modal-surface-height': `${height}px`,
  };
}
