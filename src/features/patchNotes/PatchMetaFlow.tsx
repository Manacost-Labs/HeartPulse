import { useMemo } from 'react';
import { patchMetaFlow, type PatchFlowNode, type PatchView } from '../../modules/patchNotes/public';
import { SankeyChart, type SankeyNode } from '../../vendor/valyro-ui/charts/SankeyChart';
import '../../vendor/valyro-ui/styles/index.css';
import '../../shared/ui/varyloParchment.css';
import { classAccent } from './patchArt';

/* Where the patch lands in today's meta: changed cards flowing into the archetypes that play them. */

const KIND_COLORS = { buff: '#2f6e39', nerf: '#93202a', rework: '#a07a40' } as const;
const KIND_MARKS = { buff: '▲', nerf: '▼', rework: '↻' } as const;
/** Pixels per row of the taller column; the plot stays readable for a dozen nodes a side. */
const ROW_HEIGHT = 30;

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
 * (flow = builds of the archetype that play the card), on narrow content the
 * same links as a list, because twelve labels a side do not fit a phone.
 */
export function PatchMetaFlow({ view }: { view: PatchView }) {
  const flow = useMemo(() => patchMetaFlow(view), [view]);
  const nodes = useMemo<SankeyNode[]>(() => flow.nodes.map(node => ({ id: node.id, label: node.label, color: nodeColor(node) })), [flow]);
  if (flow.links.length < 2) return null;
  const byId = new Map(flow.nodes.map(node => [node.id, node]));
  const cards = flow.nodes.filter(node => node.kind === 'card');
  const rows = Math.max(cards.length, flow.nodes.length - cards.length);
  return (
    <div className="hp-patch-flow hp-varylo-parchment">
      <h4>Изменённые карты → затронутые архетипы</h4>
      <div className="hp-patch-flow__chart">
        <SankeyChart nodes={nodes} links={flow.links} height={Math.max(240, rows * ROW_HEIGHT)} nodePadding={10}
          labels={LABELS} locale="ru-RU" ariaLabel="Изменённые карты и архетипы текущей меты, которые их играют"
          onNodeClick={node => { const target = byId.get(node.id); if (target) open(target.href); }} />
      </div>
      <ul className="hp-patch-flow__list">
        {cards.map(card => (
          <li key={card.id}>
            <a className="hp-patch-flow__card" href={card.href} data-kind={card.cardKind}>
              <span aria-hidden="true">{KIND_MARKS[card.cardKind ?? 'rework']}</span>{card.label}
            </a>
            <span className="hp-patch-flow__arrow" aria-hidden="true">→</span>
            <span className="hp-patch-flow__targets">
              {flow.links.filter(link => link.source === card.id).map(link => {
                const archetype = byId.get(link.target);
                return archetype && (
                  <a key={link.target} href={archetype.href}>{archetype.label} <small>{link.value} сб.</small></a>
                );
              })}
            </span>
          </li>
        ))}
      </ul>
      <p className="hp-patch-flow__note">
        Толщина потока — сколько сборок архетипа содержат карту; архетипы — самые популярные в текущей мете
        ({flow.nodes.length - cards.length}). Нажмите на карту или архетип, чтобы открыть его страницу.
      </p>
    </div>
  );
}
