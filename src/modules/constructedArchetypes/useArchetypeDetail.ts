'use client';
import { useState } from 'react';
import { useDetailSection } from './useDetailSection';

type DetailModel = { item: { slug: string; format: 'standard' | 'wild' }; history: unknown[]; analysis: unknown };
/** The seed is an anonymous projection. Paid data lives only in this mounted viewer scope. */
export function useArchetypeDetail<D extends DetailModel>({ format, slug, hasFullAccess, accessPending, seed }: {
  format: 'standard' | 'wild'; slug: string; hasFullAccess: boolean; accessPending: boolean; seed: D | null;
}) {
  const scope = `${format}:${slug}:${hasFullAccess ? 'full' : 'teaser'}`;
  const [deniedScope, setDeniedScope] = useState('');
  const denied = deniedScope === scope;
  const fullAccess = hasFullAccess && !denied;
  const publicSeed = seed?.item.slug === slug && seed.item.format === format ? seed : null;
  const endpoint = `/api/constructed-archetypes${hasFullAccess ? '' : '/teaser'}/${format}/${slug}`;
  const enabled = !accessPending && !denied;
  const onDenied = () => setDeniedScope(scope);
  const core = useDetailSection<D>(`${endpoint}${hasFullAccess ? '?section=core' : ''}`, enabled,
    hasFullAccess ? null : publicSeed, onDenied);
  const history = useDetailSection<Pick<D, 'history'>>(`${endpoint}?section=history`, enabled && fullAccess, null, onDenied);
  const analysis = useDetailSection<Pick<D, 'analysis'>>(`${endpoint}?section=analysis`, enabled && fullAccess, null, onDenied);
  const base = denied ? publicSeed : core.data ?? publicSeed;
  const detail = base ? { ...base, history: fullAccess ? history.data?.history ?? [] : [],
    analysis: fullAccess ? analysis.data?.analysis ?? null : null } as D : null;
  return { detail, core, history, analysis, fullAccess, denied };
}
