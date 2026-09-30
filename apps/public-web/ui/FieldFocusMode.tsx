'use client';
import { useEffect } from 'react';
import { installFieldFocusMode } from '@/src/app/shell/installFieldFocusMode';

/** Tracks pointer versus Tab focus for the field rings in `src/styles/field-focus.css`. */
export function FieldFocusMode() {
  useEffect(() => installFieldFocusMode(document), []);
  return null;
}
