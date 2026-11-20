'use client';
import { lazy } from 'react';

/** Same reason as `CardAssembleLazy`: the page chunk stays out of every route that only imports the public entry. */
export const AssembleTool = lazy(() => import('./AssembleTool'));
