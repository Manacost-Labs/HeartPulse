'use client';

import { useCallback } from 'react';
import { useControllableState } from './useControllableState';

export interface DisclosureOptions {
  /** Controlled open state. */
  open?: boolean;
  /** Initial state when uncontrolled. Default false. */
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export interface Disclosure {
  open: boolean;
  setOpen: (open: boolean) => void;
  onOpen: () => void;
  onClose: () => void;
  onToggle: () => void;
}

/** Open/closed state for a dialog, drawer, popover or menu, controlled (`open` + `onOpenChange`) or not. */
export function useDisclosure({ open: openProp, defaultOpen = false, onOpenChange }: DisclosureOptions = {}): Disclosure {
  const [open, setOpen] = useControllableState({ value: openProp, defaultValue: defaultOpen, onChange: onOpenChange });
  const onOpen = useCallback(() => setOpen(true), [setOpen]);
  const onClose = useCallback(() => setOpen(false), [setOpen]);
  const onToggle = useCallback(() => setOpen((value) => !value), [setOpen]);
  return { open, setOpen, onOpen, onClose, onToggle };
}
