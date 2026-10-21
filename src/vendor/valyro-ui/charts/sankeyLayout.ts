/*
 * Sankey diagram layout: nodes in columns by longest path, heights proportional to the
 * flow through them, vertical positions relaxed towards their neighbours to reduce
 * crossings, and link bands stacked on each node in the order of their other end.
 * Pure functions, no React.
 */

export interface SankeyLinkInput {
  source: string;
  target: string;
  value: number;
}

export interface SankeyLayoutOptions {
  width: number;
  height: number;
  /** Width of a node bar. Default 12. */
  nodeWidth?: number;
  /** Vertical space between nodes of a column (shrunk when a column is too crowded). Default 16. */
  nodePadding?: number;
  /** `justify` moves nodes without outgoing flow to the last column; `left` keeps them at their depth. */
  align?: 'justify' | 'left';
  /** Relaxation passes. Default 32. */
  iterations?: number;
}

export interface SankeyNodeLayout {
  /** Index into the input `nodes`. */
  index: number;
  id: string;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  /** max(incoming, outgoing) flow. */
  value: number;
  inValue: number;
  outValue: number;
  column: number;
  /** Indices into the layout `links`. */
  incoming: number[];
  outgoing: number[];
}

export interface SankeyLinkLayout {
  /** Index into the input `links`. */
  index: number;
  /** Indices into the layout `nodes`. */
  source: number;
  target: number;
  value: number;
  /** Band thickness. */
  width: number;
  /** Band centre where it leaves the source and where it enters the target. */
  y0: number;
  y1: number;
}

export interface SankeyLayout {
  nodes: SankeyNodeLayout[];
  links: SankeyLinkLayout[];
  columns: number;
  /** Input links left out: unknown ends, self links, non-positive values or links closing a cycle. */
  skipped: number[];
}

/**
 * Lays out a flow graph in a `width` × `height` box. Nodes without any flow are left out.
 * Cycles cannot be drawn left to right, so the link that closes one is skipped.
 */
export function sankeyLayout(
  nodeIds: readonly string[],
  linkInputs: readonly SankeyLinkInput[],
  { width, height, nodeWidth = 12, nodePadding = 16, align = 'justify', iterations = 32 }: SankeyLayoutOptions,
): SankeyLayout {
  const indexOf = new Map<string, number>();
  nodeIds.forEach((id, i) => {
    if (!indexOf.has(id)) indexOf.set(id, i);
  });

  const skipped: number[] = [];
  const edges: { index: number; s: number; t: number; value: number }[] = [];
  linkInputs.forEach((l, index) => {
    const s = indexOf.get(l.source);
    const t = indexOf.get(l.target);
    if (s == null || t == null || s === t || !Number.isFinite(l.value) || l.value <= 0) skipped.push(index);
    else edges.push({ index, s, t, value: l.value });
  });

  // Drop links that close a cycle (back edges of a depth-first search in input order).
  const out = nodeIds.map(() => [] as number[]);
  edges.forEach((e, k) => out[e.s].push(k));
  const state = new Uint8Array(nodeIds.length); // 0 new, 1 on stack, 2 done
  const back = new Set<number>();
  const visit = (root: number) => {
    const stack: [number, number][] = [[root, 0]];
    state[root] = 1;
    while (stack.length) {
      const top = stack[stack.length - 1];
      const [n, next] = top;
      if (next < out[n].length) {
        top[1]++;
        const k = out[n][next];
        const t = edges[k].t;
        if (state[t] === 1) back.add(k);
        else if (state[t] === 0) {
          state[t] = 1;
          stack.push([t, 0]);
        }
      } else {
        state[n] = 2;
        stack.pop();
      }
    }
  };
  nodeIds.forEach((_, i) => state[i] === 0 && visit(i));
  const kept = edges.filter((_, k) => !back.has(k));
  edges.forEach((e, k) => back.has(k) && skipped.push(e.index));
  skipped.sort((a, b) => a - b);

  // Nodes with flow, in input order.
  const inSum = new Float64Array(nodeIds.length);
  const outSum = new Float64Array(nodeIds.length);
  for (const e of kept) {
    outSum[e.s] += e.value;
    inSum[e.t] += e.value;
  }
  const used = nodeIds.map((_, i) => i).filter((i) => inSum[i] > 0 || outSum[i] > 0);
  const layoutIndex = new Map(used.map((n, i) => [n, i]));
  const nodes: SankeyNodeLayout[] = used.map((n) => ({
    index: n,
    id: nodeIds[n],
    x0: 0,
    x1: 0,
    y0: 0,
    y1: 0,
    value: Math.max(inSum[n], outSum[n]),
    inValue: inSum[n],
    outValue: outSum[n],
    column: 0,
    incoming: [],
    outgoing: [],
  }));
  const links: SankeyLinkLayout[] = kept.map((e, i) => {
    const source = layoutIndex.get(e.s)!;
    const target = layoutIndex.get(e.t)!;
    nodes[source].outgoing.push(i);
    nodes[target].incoming.push(i);
    return { index: e.index, source, target, value: e.value, width: 0, y0: 0, y1: 0 };
  });
  if (nodes.length === 0) return { nodes, links, columns: 0, skipped };

  // Columns by longest path from a source (Kahn's topological order; the graph is acyclic now).
  const pending = nodes.map((n) => n.incoming.length);
  const queue = nodes.map((_, i) => i).filter((i) => pending[i] === 0);
  for (let q = 0; q < queue.length; q++) {
    const n = nodes[queue[q]];
    for (const l of n.outgoing) {
      const t = links[l].target;
      nodes[t].column = Math.max(nodes[t].column, n.column + 1);
      if (--pending[t] === 0) queue.push(t);
    }
  }
  let last = Math.max(...nodes.map((n) => n.column));
  if (align === 'justify') {
    for (const n of nodes) if (n.outgoing.length === 0) n.column = last;
  }
  last = Math.max(...nodes.map((n) => n.column));
  const columns: number[][] = Array.from({ length: last + 1 }, () => []);
  nodes.forEach((n, i) => columns[n.column].push(i));

  const nw = Math.max(0, Math.min(nodeWidth, width));
  for (const n of nodes) {
    n.x0 = last === 0 ? (width - nw) / 2 : (n.column * (width - nw)) / last;
    n.x1 = n.x0 + nw;
  }

  // Vertical scale: the fullest column fills the height. Crowded columns get less padding.
  const maxCount = Math.max(...columns.map((c) => c.length));
  const py = maxCount > 1 ? Math.min(nodePadding, (height * 0.5) / (maxCount - 1)) : 0;
  const ky = Math.min(
    ...columns.map((c) => {
      const total = c.reduce((s, i) => s + nodes[i].value, 0);
      return total > 0 ? (height - (c.length - 1) * py) / total : Infinity;
    }),
  );
  for (const l of links) l.width = l.value * ky;

  // Initial positions: stacked in input order, free space spread evenly between the nodes.
  for (const c of columns) {
    let y = 0;
    for (const i of c) {
      nodes[i].y0 = y;
      nodes[i].y1 = y + nodes[i].value * ky;
      y = nodes[i].y1 + py;
    }
    const free = (height - y + py) / (c.length + 1);
    c.forEach((i, k) => {
      nodes[i].y0 += free * (k + 1);
      nodes[i].y1 += free * (k + 1);
    });
  }

  const byY = (a: number, b: number) => nodes[a].y0 - nodes[b].y0 || a - b;
  const sortLinks = () => {
    for (const n of nodes) {
      n.outgoing.sort((a, b) => byY(links[a].target, links[b].target) || a - b);
      n.incoming.sort((a, b) => byY(links[a].source, links[b].source) || a - b);
    }
  };
  // Top edge of each link band at its source and at its target.
  const top0 = new Float64Array(links.length);
  const top1 = new Float64Array(links.length);
  const stackLinks = () => {
    for (const n of nodes) {
      let y = n.y0;
      for (const l of n.outgoing) {
        top0[l] = y;
        y += links[l].width;
      }
      y = n.y0;
      for (const l of n.incoming) {
        top1[l] = y;
        y += links[l].width;
      }
    }
  };

  const resolveCollisions = (column: number[]) => {
    column.sort(byY);
    let y = 0;
    for (const i of column) {
      const n = nodes[i];
      const dy = y - n.y0;
      if (dy > 0) {
        n.y0 += dy;
        n.y1 += dy;
      }
      y = n.y1 + py;
    }
    // Overflowed the bottom: push back up.
    y = height;
    for (let k = column.length - 1; k >= 0; k--) {
      const n = nodes[column[k]];
      const dy = n.y1 - y;
      if (dy > 0) {
        n.y0 -= dy;
        n.y1 -= dy;
      }
      y = n.y0 - py;
    }
  };

  // Relaxation: move each node towards the position that would keep its links level,
  // weighted by flow (and by column distance, so long links pull harder), alternating sweeps.
  sortLinks();
  stackLinks();
  for (let it = 0; it < iterations; it++) {
    const alpha = Math.pow(0.99, it);
    for (let c = 1; c <= last; c++) {
      for (const i of columns[c]) {
        const n = nodes[i];
        let sum = 0;
        let weight = 0;
        for (const l of n.incoming) {
          const w = links[l].value * (n.column - nodes[links[l].source].column);
          // Where this node's top would sit if the link entered level with how it left the source.
          sum += (top0[l] - (top1[l] - n.y0)) * w;
          weight += w;
        }
        if (weight > 0) {
          const dy = (sum / weight - n.y0) * alpha;
          n.y0 += dy;
          n.y1 += dy;
        }
      }
      resolveCollisions(columns[c]);
      sortLinks();
      stackLinks();
    }
    for (let c = last - 1; c >= 0; c--) {
      for (const i of columns[c]) {
        const n = nodes[i];
        let sum = 0;
        let weight = 0;
        for (const l of n.outgoing) {
          const w = links[l].value * (nodes[links[l].target].column - n.column);
          sum += (top1[l] - (top0[l] - n.y0)) * w;
          weight += w;
        }
        if (weight > 0) {
          const dy = (sum / weight - n.y0) * alpha;
          n.y0 += dy;
          n.y1 += dy;
        }
      }
      resolveCollisions(columns[c]);
      sortLinks();
      stackLinks();
    }
  }

  links.forEach((l, i) => {
    l.y0 = top0[i] + l.width / 2;
    l.y1 = top1[i] + l.width / 2;
  });
  return { nodes, links, columns: last + 1, skipped };
}
