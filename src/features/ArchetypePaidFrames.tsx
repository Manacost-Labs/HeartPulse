import React from 'react';
import { Grid3x3, Swords, Sparkles, TrendingUp } from 'lucide-react';
import { ArchetypeDetailSection } from '../modules/constructedArchetypes/public';
import { RankHeatmapSection } from './ArchetypeInsightSlots';
import { ArchetypeAnalysisLoading, ArchetypeHistorySkeleton } from './ConstructedArchetypeDetailSkeletons';
import './ArchetypePaidFrames.css';

/**
 * A lock for a paid part of the page: the app (which owns the subscription offer) draws it, with the part's name
 * for a screen reader and its caption as `children`.
 */
export type PaidLock = (props: { label: string; children?: React.ReactNode }) => React.ReactNode;

type FrameCopy = { id: string; icon: React.ReactNode; eyebrow: string; title: string; text: string; caption: string };

const FRAMES: Record<'matchups' | 'mulligan' | 'ranks' | 'history', FrameCopy> = {
  matchups: {
    id: 'matchups', icon: <Swords size={15} aria-hidden="true" />, eyebrow: 'Матчапы', title: 'Матчапы против классов',
    text: 'Винрейт архетипа против каждого класса на ранге Легенда и доля соперников в выборке.', caption: 'Матчапы — по подписке',
  },
  mulligan: {
    id: 'mulligan', icon: <Sparkles size={15} aria-hidden="true" />, eyebrow: 'Карты', title: 'Муллиган и влияние карт',
    text: 'Как каждая карта меняет винрейт: в стартовой руке, при взятии и среди оставленных.', caption: 'Муллиган — по подписке',
  },
  ranks: {
    id: 'ranks', icon: <Grid3x3 size={15} aria-hidden="true" />, eyebrow: 'Ранги и периоды', title: 'Винрейт по рангам',
    text: 'Винрейт архетипа в каждом ранге за разные периоды HSGuru.', caption: 'Ранги — по подписке',
  },
  history: {
    id: 'history', icon: <TrendingUp size={15} aria-hidden="true" />, eyebrow: 'Накопительная статистика', title: 'История архетипа',
    text: 'Срез добавляется каждые 12 часов: как менялись винрейт, популярность и число игр.', caption: 'История — по подписке',
  },
};

/** A paid section for a guest: its place, heading and one line of what it holds, closed behind the lock. */
function LockedFrame({ frame, lock }: { frame: keyof typeof FRAMES; lock: PaidLock }) {
  const copy = FRAMES[frame];
  return <section className="archetype-insight archetype-paid-frame" aria-labelledby={`archetype-paid-${copy.id}`} data-paid-frame={copy.id}>
    <header className="archetype-section-heading"><div>
      <span className="archetypes-eyebrow">{copy.icon} {copy.eyebrow}</span>
      <h2 id={`archetype-paid-${copy.id}`}>{copy.title}</h2>
      <p>{copy.text}</p>
    </div></header>
    <div className="archetype-paid-frame__body">{lock({ label: copy.title, children: <span>{copy.caption}</span> })}</div>
  </section>;
}

const noop = () => undefined;

/** The sections of a subscriber's page, in the state they hold while the access or the paid answer is still on its way. */
export function PendingPaidSections({ radar }: { radar: React.ReactNode }) {
  return <>
    <ArchetypeDetailSection title="Матчапы и муллиган" loading error="" onRetry={noop} skeleton={<ArchetypeAnalysisLoading />}>{null}</ArchetypeDetailSection>
    <RankHeatmapSection read={{ loading: true, error: '', retry: noop, data: null }} />
    {radar}
    <ArchetypeDetailSection title="История архетипа" loading error="" onRetry={noop} skeleton={<ArchetypeHistorySkeleton />}>{null}</ArchetypeDetailSection>
  </>;
}

/** Matchups and mulligan, ranks and history of a guest's page: each at its subscriber place, with a lock. */
export function LockedPaidSections({ lock, radar }: { lock: PaidLock; radar: React.ReactNode }) {
  return <>
    <LockedFrame frame="matchups" lock={lock} />
    <LockedFrame frame="mulligan" lock={lock} />
    <LockedFrame frame="ranks" lock={lock} />
    {radar}
    <LockedFrame frame="history" lock={lock} />
  </>;
}
