export function compareEdges(left, right) {
  return left.source.localeCompare(right.source)
    || left.target.localeCompare(right.target)
    || left.kind.localeCompare(right.kind);
}

export function edgeKey(edge) {
  return `${edge.source}\0${edge.target}\0${edge.kind}`;
}

export function cycleKey(cycle) {
  return JSON.stringify({
    nodes: [...(cycle.nodes || [])].sort(),
    edges: [...(cycle.edges || [])].map(edge => ({
      source: edge.source,
      target: edge.target,
      kind: edge.kind,
    })).sort(compareEdges),
  });
}
