import { ArrowDown, ArrowUp, RefreshCw } from 'lucide-react';
import type { PatchKind } from '../../modules/patchNotes/public';

/* How a change's kind reads across the page: one word and one shape per kind. */

export const KIND_LABELS: Record<PatchKind, string> = { buff: 'Усиление', nerf: 'Ослабление', rework: 'Переработка' };
export const KIND_ICONS: Record<PatchKind, typeof ArrowUp> = { buff: ArrowUp, nerf: ArrowDown, rework: RefreshCw };
/** A block of one kind inside a long group is named once with the plural. */
export const KIND_BLOCK_LABELS: Record<PatchKind, string> = { buff: 'Усиления', nerf: 'Ослабления', rework: 'Переработки' };
