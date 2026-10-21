'use client';

import { createContext, useContext } from 'react';

/*
 * FormField's wiring for the control inside it. A module of its own, without FormField's markup and CSS,
 * so controls in other categories (Slider, Switch, SegmentedControl) can read it and stay light.
 */

export interface FormFieldContextValue {
  /** Id the control should use (the label points at it). */
  id: string;
  /** Present when the field renders a label; for controls that are not labelable elements. */
  labelId?: string;
  /** Ids of the hint/error and counter, ready for `aria-describedby`. */
  describedBy?: string;
  invalid: boolean;
  required: boolean;
}

export const FormFieldContext = createContext<FormFieldContextValue | null>(null);

/** Field wiring for custom controls; null outside a FormField. */
export function useFormField() {
  return useContext(FormFieldContext);
}
