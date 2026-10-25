import { useMemo } from 'react';
import { patchSnapshotDayLabel, type PatchFlowLink, type PatchFlowNode, type PatchNotesMeta } from '../../modules/patchNotes/public';
import { SankeyChart, type SankeyNode } from '../../vendor/valyro-ui/charts/SankeyChart';
import '../../vendor/valyro-ui/styles/index.css';
import '../../shared/ui/varyloParchment.css';
import { classIconUrl } from '../classIcons';
import { classAccent } from './patchArt';
import { KIND_ICONS, KIND_LABELS } from './patchKinds';

/* Where the patch landed in the meta of its day: changed cards flowing into the archetypes that played them. */

// The page's kind colours; a lighter rework brown washes out into the parchment at flow opacity.
const KIND_COLORS = { buff: '#2f6e39', nerf: '#93202a', rework: '#7a582e' } as const;
const FORMAT_LABELS = { standard: 'Стандарт', wild: 'Вольный' } as const;
/** Fewer cards than this read better as the list: a two-card Sankey is a couple of wide bands. */
const MIN_CHART_CARDS = 3;
/** Pixels per row of the taller column, within one block of reasonable height. */
const ROW_HEIGHT = 30;
const MIN_HEIGHT = 200;
const MAX_HEIGHT = 360;

const LABELS = {
  empty: 'Нет данных',
  value: 'Вхождений в сборки',
  share: 'Доля всех связей',
  shareOfSource: 'Доля связей карты',
  shareOfTarget: 'Доля в архетипе',
  incoming: 'Входит',
  outgoing: 'Выходит',
  source: 'Карта',
  target: 'Архетип',
};

function nodeColor(node: PatchFlowNode): string {
  return node.kind === 'card' ? KIND_COLORS[node.cardKind ?? 'rework'] : classAccent(node.classKey) ?? '#806044';
}

function open(href: string) {
  if (href.startsWith('#')) {
    const target = document.getElementById(href.slice(1));
    const details = target?.closest('details');
    if (details) details.open = true;
  }
  window.location.assign(href);
}

/**
 * "Изменённые карты → Затронутые архетипы": on wide content a Sankey diagram
 * (flow = builds of the archetype that play the card), on narrow content or
 * for fewer than three cards the same links as a list, because twelve labels
 * a side do not fit a phone. The page shows it only with at least two links.
 */
export function PatchMetaFlow({ flow, meta }: { flow: { nodes: PatchFlowNode[]; links: PatchFlowLink[] }; meta: PatchNotesMeta }) {
  const nodes = useMemo<SankeyNode[]>(() => flow.nodes.map(node => ({ id: node.id, label: node.label, color: nodeColor(node) })), [flow]);
  const byId = new Map(flow.nodes.map(node => [node.id, node]));
  const cards = flow.nodes.filter(node => node.kind === 'card');
  const rows = Math.max(cards.length, flow.nodes.length - cards.length);
  const chart = cards.length >= MIN_CHART_CARDS;
  const day = patchSnapshotDayLabel(meta.day);
  return (
    <div className="hp-patch-flow hp-varylo-parchment" data-tour-id="patch-flow" data-layout={chart ? 'chart' : 'list'}>
      <h4>Изменённые карты → затронутые архетипы</h4>
      <p className="hp-patch-flow__as-of">Архетипы на момент выхода патча{day ? ` (данные за ${day})` : ''}</p>
      {chart && <div className="hp-patch-flow__chart">
        <SankeyChart nodes={nodes} links={flow.links} height={Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, rows * ROW_HEIGHT))} nodePadding={8}
          labels={LABELS} locale="ru-RU" ariaLabel="Изменённые карты и архетипы на момент выхода патча, которые их играли"
          onNodeClick={node => { const target = byId.get(node.id); if (target) open(target.href); }} />
      </div>}
      <ul className="hp-patch-flow__list">
        {cards.map(card => {
          const kind = card.cardKind ?? 'rework';
          const Icon = KIND_ICONS[kind];
          return <li key={card.id}>
            <a className="hp-patch-flow__card" href={card.href} data-kind={kind}>
              <span className="hp-patch-kind" data-kind={kind} title={KIND_LABELS[kind]}><Icon aria-hidden="true" /><span className="sr-only">{KIND_LABELS[kind]}: </span></span>{card.label}
            </a>
            <span className="hp-patch-flow__arrow" aria-hidden="true">→</span>
            <span className="hp-patch-flow__targets">
              {flow.links.filter(link => link.source === card.id).map(link => {
                const archetype = byId.get(link.target);
                return archetype && (
                  <a key={link.target} href={archetype.href}>
                    <img src={classIconUrl(archetype.classKey)} alt="" width={64} height={64} loading="lazy" decoding="async" />
                    {archetype.label} <small>{link.value} сб.</small>
                  </a>
                );
              })}
            </span>
          </li>;
        })}
      </ul>
      <p className="hp-patch-flow__note">
        Сколько сборок архетипа играли карту; {flow.nodes.length - cards.length} самых популярных архетипов меты HSGuru того дня.
        {meta.missing.length ? ` ${meta.missing.map(format => FORMAT_LABELS[format]).join(' и ')}: снимка за этот день нет.` : ''}
      </p>
    </div>
  );
}
