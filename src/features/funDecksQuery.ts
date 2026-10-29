import {
  DEFAULT_FUN_DECKS_VIEW,
  FUN_DECK_CLASSES,
  FUN_DECK_TAGS,
  FUN_DECKS_SORTS,
  type FunDecksFormat,
  type FunDecksView,
} from './funDecksPreview';

/**
 * The page's filters and sort in the address bar, so a link shares them:
 * `?format=wild&class=priest,mage&tag=highlander&sort=reliable`. A value that
 * is the default is left out, an unknown one is ignored, and the search text
 * is not kept.
 */
export function readFunDecksQuery(search: string): FunDecksView {
  const params = new URLSearchParams(search);
  const format = params.get('format');
  const sort = params.get('sort');
  const chosen = <Item extends string>(items: ReadonlyArray<{ id: Item }>, name: string) => {
    const wanted = (params.get(name) ?? '').toLowerCase().split(',');
    return items.map(item => item.id).filter(id => wanted.includes(id));
  };
  return {
    ...DEFAULT_FUN_DECKS_VIEW,
    format: format === 'standard' || format === 'wild' ? format as FunDecksFormat : 'all',
    classes: chosen(FUN_DECK_CLASSES, 'class'),
    tags: chosen(FUN_DECK_TAGS, 'tag'),
    sort: FUN_DECKS_SORTS.find(item => item.id === sort)?.id ?? 'newest',
  };
}

/** `search` with the page's own parameters replaced by `view`'s; others, such as a story's, stay. */
export function writeFunDecksQuery(search: string, view: FunDecksView): string {
  const params = new URLSearchParams(search);
  const set = (name: string, value: string) => (value ? params.set(name, value) : params.delete(name));
  set('format', view.format === 'all' ? '' : view.format);
  set('class', view.classes.join(','));
  set('tag', view.tags.join(','));
  set('sort', view.sort === 'newest' ? '' : view.sort);
  const text = params.toString().replace(/%2C/gi, ',');
  return text ? `?${text}` : '';
}
