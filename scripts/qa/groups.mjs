export const QA_BATCHES = Object.freeze([
  ['routes-desktop', 'home'],
  ['routes-mobile', 'navigation'],
  ['admin-mobile', 'public'],
  ['shell-responsive', 'admin-desktop'],
]);
export const QA_GROUPS = Object.freeze(QA_BATCHES.flat());

/** A group narrows independent scenarios; the default preserves the full standalone suite. */
export function qaGroupFilter(group = 'all', part = 'all') {
  if (group !== 'all' && !QA_GROUPS.includes(group)) throw new Error(`Unknown QA_GROUP: ${group}`);
  const routeGroup = group.startsWith('routes-') || group === 'shell-responsive';
  if (group !== 'all' && ((part === 'routes' && !routeGroup) || (part === 'interactions' && routeGroup))) {
    throw new Error('QA_PART and QA_GROUP select disjoint scenarios');
  }
  return (...groups) => {
    if (groups.some(candidate => !QA_GROUPS.includes(candidate))) throw new Error('Unknown QA scenario group');
    return group === 'all' || groups.includes(group);
  };
}

export function qaBatch(value) {
  if (!/^[1-4]$/.test(String(value))) throw new Error('QA batch must be 1–4');
  return QA_BATCHES[Number(value) - 1];
}
