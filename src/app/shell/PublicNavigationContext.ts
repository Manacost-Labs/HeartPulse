import { createContext } from 'react';

// Page-specific timestamps reach the persistent menu without moving page data
// loaders into the application layout. A missing provider means a standalone shell.
export const PublicNavigationContext = createContext<((label: string) => void) | null>(null);
