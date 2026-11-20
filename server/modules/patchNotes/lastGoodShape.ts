import type { PatchNotesDetail } from './contract.js';

type Row = Record<string, unknown>;

const isObject = (value: unknown): value is Row => typeof value === 'object' && value !== null && !Array.isArray(value);
const isText = (value: unknown) => typeof value === 'string';
const isTextOrNull = (value: unknown) => value === null || typeof value === 'string';
const isCount = (value: unknown) => typeof value === 'number' && Number.isFinite(value);
const isObjects = (value: unknown) => Array.isArray(value) && value.every(isObject);

const ENTRY_TEXT = ['id', 'name', 'mode'] as const;
const ENTRY_NULLABLE = ['sourceName', 'cardId', 'cardClass', 'cardType', 'renderUrl', 'format', 'beforeRenderUrl', 'afterRenderUrl', 'subtitle', 'note'] as const;
const ENTRY_LISTS = ['archetypes', 'history', 'changes'] as const;

function isEntry(value: unknown): boolean {
  return isObject(value)
    && ENTRY_TEXT.every(key => isText(value[key]))
    && ENTRY_NULLABLE.every(key => isTextOrNull(value[key]))
    && ENTRY_LISTS.every(key => isObjects(value[key]))
    && (value.artwork === null || isObject(value.artwork))
    && (value.changes as Row[]).every(change => isText(change.label));
}

const PATCH_TEXT = ['version', 'build', 'title'] as const;
const PATCH_NULLABLE = ['publishedAt', 'sourceUrl', 'officialUrl', 'summary'] as const;

/** A patch of a stored copy with every field of the `PatchNotesDetail` contract the routes and the page read. */
export function isStoredPatch(value: unknown): value is PatchNotesDetail {
  return isObject(value)
    && PATCH_TEXT.every(key => isText(value[key]))
    && PATCH_NULLABLE.every(key => isTextOrNull(value[key]))
    && isCount(value.changeCount) && isCount(value.missingBefore)
    && Array.isArray(value.entries) && value.entries.every(isEntry)
    && isObjects(value.pictureSections) && isObjects(value.generalChanges)
    && (value.meta === null || isObject(value.meta));
}
