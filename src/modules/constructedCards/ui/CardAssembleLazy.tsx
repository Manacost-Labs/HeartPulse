'use client';
import { lazy } from 'react';

/**
 * The section loads on demand. The `import()` lives in a client file so the server graph sees only
 * this one-line reference, not the section's chunks, and a card page without Assemble never
 * fetches them.
 */
export const CardAssembleSection = lazy(() => import('./CardAssembleSection'));
