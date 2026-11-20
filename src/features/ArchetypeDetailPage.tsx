import React, { useEffect } from 'react';
import { ArrowLeft, Sparkles, TrendingUp } from 'lucide-react';
import { ArchetypeDetailSection, useArchetypeDetail } from '../modules/constructedArchetypes/public';
import PaywallGate, { type PaywallAccessState } from '../components/PaywallGate';
import { archetypeClassBackdrop, archetypeHeroArt } from './archetypeDetailModel';
import { BUILDS_PENDING_MESSAGE, classIcon, ErrorState, formatNumber, LoadingState, pagePeriod, viewerId } from './archetypeDetailHelpers';
import { ArchetypeBuildsSection } from './ArchetypeBuildsSection';
import { ArchetypeDossierKpis } from './ArchetypeDossierKpis';
import { ArchetypeHistoryCharts } from './ArchetypeHistoryCharts';
import { ArchetypeRadarSection, BuildComparisonSection, loadInsights, RankHeatmapSection } from './ArchetypeInsightSlots';
import { openBuildAsBuild, type OpenBuilds } from './archetypeOpenBuilds';
import { LockedPaidSections, PendingPaidSections, type PaidLock } from './ArchetypePaidFrames';
import type { ArchetypeDetail } from './archetypeDetailTypes';
import {
  ArchetypeAnalysisLoading, ArchetypeAnalysisReserve, ArchetypeBuildsSkeleton, ArchetypeHistorySkeleton, loadArchetypeAnalysis,
} from './ConstructedArchetypeDetailSkeletons';
import type { ArchetypeFormat } from './constructedArchetypeCatalogUrl';
import { RecoverableSurfaceBoundary } from './recovery/RecoverableSurface';

const ConstructedArchetypeAnalysis = React.lazy(loadArchetypeAnalysis);

export type ArchetypeDetailProps = {
  format: ArchetypeFormat;
  slug: string;
  navigatePath: (path: string) => void;
  hasFullAccess: boolean;
  paywall: PaywallAccessState;
  initialDetail: ArchetypeDetail | null;
  embedded: boolean;
  accessPending: boolean;
  /**
   * `openLayer`: a guest sees the subscriber's page on the open data: the gallery of `openBuilds` (printed by the
   * server), the open comparisons, and every paid part at its place behind `paidLock`. A subscriber's paid answer
   * replaces them in place.
   */
  openLayer?: boolean;
  openBuilds?: OpenBuilds;
  paidLock?: PaidLock;
};

function History({ detail, read }: { detail: ArchetypeDetail; read: { loading: boolean; error: string; retry: () => void } }) {
  return (
    <ArchetypeDetailSection title="История архетипа" loading={read.loading} error={read.error} onRetry={read.retry}
      skeleton={<ArchetypeHistorySkeleton />}>
      <section className="archetype-history" aria-labelledby="archetype-history-title" data-tour-id="archetype-history">
        <header className="archetype-section-heading">
          <div>
            <span className="archetypes-eyebrow"><TrendingUp size={15} /> Накопительная статистика</span>
            <h2 id="archetype-history-title">История архетипа</h2>
            <p>Срез добавляется каждые 12 часов. HSGuru считает статистику внутри периода — патча или дополнения — и с новым периодом начинает счёт заново, поэтому граница отмечена пунктиром.</p>
          </div>
          <span className="archetype-section-heading__count">{detail.history.length} срезов</span>
        </header>
        <ArchetypeHistoryCharts history={detail.history} />
      </section>
    </ArchetypeDetailSection>
  );
}

function ArchetypeDossier({ item, history, analysis }: { item: ArchetypeDetail['item']; history: ArchetypeDetail['history']; analysis: ArchetypeDetail['analysis'] }) {
  const heroArt = archetypeHeroArt(item.slug, analysis?.cardStats ?? []);
  const backdrop = archetypeClassBackdrop(item.classKey);
  return (
  <section className="archetype-dossier" data-tour-id="archetype-summary">
    {/* The class art is known from the public seed, so guests get it and it can lead LCP;
        the archetype's card art arrives with the paid analysis and sits on the right. */}
    {backdrop ? (
      <img
        key={backdrop.src}
        className="archetype-dossier__backdrop"
        onError={event => { event.currentTarget.hidden = true; }}
        src={backdrop.src}
        srcSet={backdrop.srcSet}
        sizes="(min-width: 1480px) 1440px, 100vw"
        style={{ objectPosition: backdrop.focus }}
        width={1920}
        height={800}
        alt=""
        aria-hidden="true"
        decoding="async"
        fetchPriority="high"
      />
    ) : null}
    {heroArt ? (
      <img key={heroArt.src} className="archetype-dossier__art" onError={event => { event.currentTarget.hidden = true; }}
        src={heroArt.src} alt="" aria-hidden="true" decoding="async" />
    ) : null}
    <div className="archetype-dossier__identity">
      <img src={classIcon(item.classKey)} alt="" width="92" height="92" />
      <h1>{item.archetypeLabel}</h1>
    </div>
    <ArchetypeDossierKpis item={item} history={history} />
  </section>
  );
}

export function ArchetypeDetailPage({ format, slug, navigatePath, hasFullAccess, paywall, initialDetail, embedded, accessPending, openLayer, openBuilds, paidLock }: ArchetypeDetailProps) {
  const Root = embedded ? 'section' : 'main';
  const rootProps = { className: 'archetypes-page archetype-detail-page', id: embedded ? undefined : 'main-content', tabIndex: embedded ? undefined : -1 };
  const { detail, core, history: historyRead, analysis: analysisRead, ranks: ranksRead, fullAccess, denied } = useArchetypeDetail({
    format, slug, hasFullAccess, accessPending, seed: initialDetail,
  });
  // The analysis chunk loads beside the analysis request, so its placeholder and view are usually ready first.
  useEffect(() => {
    if (!fullAccess || accessPending) return;
    loadArchetypeAnalysis().catch(() => undefined);
    loadInsights().catch(() => undefined);
  }, [fullAccess, accessPending]);
  const archetypeLabel = detail?.item.archetypeLabel;
  useEffect(() => {
    if (archetypeLabel) document.title = `${archetypeLabel} — сборки и статистика | HearthPulse`;
  }, [archetypeLabel]);

  if (core.loading && !detail) return <Root {...rootProps}><LoadingState detail /></Root>;
  if (!detail) {
    return (
      <Root {...rootProps}>
        <button type="button" className="archetype-back" onClick={() => navigatePath('/standard/archetypes')}>
          <ArrowLeft size={18} /> Все архетипы
        </button>
        <ErrorState message={core.error || 'Архетип не найден'} onRetry={core.retry} />
      </Root>
    );
  }

  const { item, history } = detail;
  const paidReady = fullAccess && !core.loading;
  // The paid builds replace the open ones once they are there; a failed or empty paid answer keeps the open ones.
  const paidBuilds = openLayer && paidReady && !core.error && item.builds.length > 0 ? item.builds : null;
  const galleryBuilds = paidBuilds ?? (openBuilds?.builds ?? []).map(openBuildAsBuild);
  // Locks stand until access is granted, also while it is checked (a remembered subscriber is granted at once, so
  // he never sees them); a granted viewer sees the sections' own loading state while the paid answer is on its way.
  const locked = Boolean(openLayer && !fullAccess && paidLock);
  const pending = Boolean(openLayer && fullAccess && core.loading);
  const openRadar = openLayer ? <ArchetypeRadarSection item={item} viewerId={viewerId(paywall.authUser)}
    matchupLock={locked && paidLock ? paidLock({ label: 'Очный матчап', children: <span>Очный матчап — по подписке</span> }) : undefined} /> : null;

  return (
    <Root {...rootProps}>
      <nav className="archetype-breadcrumb" aria-label="Навигационная цепочка">
        <a href="/standard/archetypes/" onClick={event => { event.preventDefault(); navigatePath('/standard/archetypes/'); }}>
          <ArrowLeft size={17} /> Архетипы
        </a>
        <span aria-hidden="true">/</span>
        {/* Wild's catalog has its own address (#543); Standard's is the first step. */}
        {format === 'wild' ? <a href="/standard/archetypes/wild/">{detail.formatLabel}</a> : <span>{detail.formatLabel}</span>}
        <span aria-hidden="true">/</span>
        <strong>{item.archetypeLabel}</strong>
      </nav>
      <ArchetypeDossier item={item} history={history} analysis={detail.analysis} />

      {/* One visible line when the subscriber's data failed: whatever the page has of the open data stays under it. */}
      {openLayer && fullAccess && core.error && !core.loading ? <p role="status" className="archetype-open-builds__retry">
        {galleryBuilds.length ? 'Данные подписчика не загрузились, показаны открытые сборки.' : 'Данные подписчика не загрузились.'}{' '}
        <button type="button" className="archetype-detail-read__retry" onClick={core.retry}>Повторить загрузку</button>
      </p> : null}
      {openLayer ? <ArchetypeBuildsSection item={item} open={openBuilds} paid={paidBuilds} pagePeriod={pagePeriod(detail)} />
        : null}
      {!openLayer && (accessPending || (fullAccess && (core.error || core.loading))) ? (
        <ArchetypeDetailSection reserveViewport title="Сборки архетипа" loading={accessPending || core.loading}
          error={accessPending ? null : core.error} onRetry={core.retry} skeleton={<ArchetypeBuildsSkeleton deckCount={item.deckCount} />} />
      ) : null}
      {denied ? <p role="alert">Доступ изменился. Обновите страницу, чтобы проверить подписку.</p> : null}

      {!openLayer && fullAccess && item.builds.length > 0 ? (
        <ArchetypeBuildsSection item={item} open={undefined} paid={item.builds} pagePeriod={pagePeriod(detail)} />
      ) : null}

      {item.deckCount === 0 ? (
        <section className="archetype-build-preview" aria-labelledby="archetype-builds-pending-title">
          <div>
            <span className="archetypes-eyebrow"><Sparkles size={14} /> Сборки</span>
            <h2 id="archetype-builds-pending-title">{BUILDS_PENDING_MESSAGE}</h2>
            <p>Статистика архетипа уже есть, но ни одна его сборка пока не набрала достаточно игр на HSGuru.</p>
          </div>
        </section>
      ) : null}

      {!openLayer && !fullAccess && !accessPending && !paywall.subscriptionStatus?.unavailable && detail.featuredBuild ? (
        <section className="archetype-build-preview" aria-labelledby="archetype-build-preview-title">
          <div>
            <span className="archetypes-eyebrow"><Sparkles size={14} /> Главная сборка</span>
            <h2 id="archetype-build-preview-title">Самая большая подтверждённая выборка</h2>
          </div>
          <dl>
            <div><dt>Винрейт</dt><dd>{formatNumber(detail.featuredBuild.winrate, '%')}</dd></div>
            <div><dt>Игры</dt><dd>{detail.featuredBuild.games?.toLocaleString('ru-RU') ?? '—'}</dd></div>
          </dl>
        </section>
      ) : null}

      {!fullAccess && !accessPending && (!openLayer || paywall.subscriptionStatus?.unavailable) ? (
        <PaywallGate active presentation="inline" surface="archetype" variant="standard" title="Матчапы, муллиган и история" {...paywall} />
      ) : null}

      {openLayer && (locked || pending || paidReady) ? (
        <BuildComparisonSection builds={galleryBuilds} format={item.format} archetype={item.archetype} />
      ) : null}
      {!openLayer && paidReady ? <BuildComparisonSection builds={item.builds} format={item.format} archetype={item.archetype} /> : null}

      {locked && paidLock ? <LockedPaidSections lock={paidLock} radar={openRadar} /> : null}
      {pending ? <PendingPaidSections radar={openRadar} /> : null}

      {paidReady ? <>
        <ArchetypeDetailSection title="Матчапы и муллиган" loading={analysisRead.loading}
          error={analysisRead.error} onRetry={analysisRead.retry} skeleton={<ArchetypeAnalysisLoading />}>
          <RecoverableSurfaceBoundary scope="constructed-archetype-analysis" title="Аналитика архетипа временно недоступна">
            <React.Suspense fallback={<ArchetypeAnalysisReserve />}>
              <ConstructedArchetypeAnalysis analysis={detail.analysis} format={item.format} slug={item.slug} />
            </React.Suspense>
          </RecoverableSurfaceBoundary>
        </ArchetypeDetailSection>
        <RankHeatmapSection read={ranksRead} />
        <ArchetypeRadarSection item={item} viewerId={viewerId(paywall.authUser)} />
        <History detail={detail} read={historyRead} />
      </> : null}
    </Root>
  );
}
