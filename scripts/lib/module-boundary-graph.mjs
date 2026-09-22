import { compareEdges } from './module-boundary-edges.mjs';
import { normalizePath } from './repository-path-policy.mjs';

function tarjan(nodes, edges) {
  const adjacency = new Map([...nodes].map(node => [node, []]));
  for (const edge of edges) {
    if (adjacency.has(edge.source) && adjacency.has(edge.target)) adjacency.get(edge.source).push(edge.target);
  }
  for (const targets of adjacency.values()) targets.sort();

  let nextIndex = 0;
  const indices = new Map();
  const lowLinks = new Map();
  const stack = [];
  const onStack = new Set();
  const components = [];

  const visit = node => {
    indices.set(node, nextIndex);
    lowLinks.set(node, nextIndex);
    nextIndex += 1;
    stack.push(node);
    onStack.add(node);

    for (const target of adjacency.get(node)) {
      if (!indices.has(target)) {
        visit(target);
        lowLinks.set(node, Math.min(lowLinks.get(node), lowLinks.get(target)));
      } else if (onStack.has(target)) {
        lowLinks.set(node, Math.min(lowLinks.get(node), indices.get(target)));
      }
    }

    if (lowLinks.get(node) !== indices.get(node)) return;
    const component = [];
    while (stack.length) {
      const member = stack.pop();
      onStack.delete(member);
      component.push(member);
      if (member === node) break;
    }
    component.sort();
    const selfCycle = component.length === 1
      && edges.some(edge => edge.source === component[0] && edge.target === component[0]);
    if (component.length > 1 || selfCycle) components.push(component);
  };

  for (const node of [...nodes].sort()) if (!indices.has(node)) visit(node);
  return components.sort((left, right) => left.join('\0').localeCompare(right.join('\0')));
}

export function describeCycles(sourceFiles, edges) {
  const sourceNodes = new Set(sourceFiles.map(path => normalizePath(path)));
  const graphEdges = edges.filter(edge => sourceNodes.has(edge.source) && sourceNodes.has(edge.target));
  const runtimeEdges = graphEdges.filter(edge => edge.kind === 'runtime');
  const runtimeComponents = tarjan(sourceNodes, runtimeEdges);
  const combinedComponents = tarjan(sourceNodes, graphEdges);
  const runtimeNodeSets = runtimeComponents.map(component => new Set(component));
  const typeComponents = combinedComponents.filter(component => !runtimeNodeSets.some(runtime => (
    runtime.size > 0 && [...runtime].every(node => component.includes(node))
  )));
  const describe = (component, kind) => {
    const nodeSet = new Set(component);
    return {
      source: component[0],
      target: component.at(-1),
      kind,
      nodes: component,
      edges: graphEdges.filter(edge => nodeSet.has(edge.source) && nodeSet.has(edge.target)).sort(compareEdges),
    };
  };
  return {
    runtime: runtimeComponents.map(component => describe(component, 'runtime-cycle')),
    typeInclusive: typeComponents.map(component => describe(component, 'type-cycle')),
  };
}
