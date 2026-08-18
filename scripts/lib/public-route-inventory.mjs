import { readFileSync } from 'node:fs';

import {
  isSafeMetadataText,
  singleLineErrorMessage,
} from './diagnostic-text-policy.mjs';
import { resolveRepositoryFile } from './repository-path-policy.mjs';

export const PUBLIC_ROUTE_INVENTORY_PATH = 'src/shared/seo/publicRouteInventory.json';

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function stablePublicRoute(route) {
  return {
    id: route.id,
    pattern: route.pattern,
    kind: route.kind,
    owner: route.owner,
    indexPolicy: route.indexPolicy,
  };
}

export function comparePublicRoutes(left, right) {
  return compareText(left.pattern, right.pattern) || compareText(left.id, right.id);
}

export function readPublicRouteInventory(root) {
  const inventoryFile = resolveRepositoryFile(root, PUBLIC_ROUTE_INVENTORY_PATH, { required: true });
  let inventory;
  try {
    inventory = JSON.parse(readFileSync(inventoryFile, 'utf8'));
  } catch (error) {
    throw new Error(
      `Public route inventory is not valid JSON: ${singleLineErrorMessage(error)}`,
    );
  }
  if (!inventory || typeof inventory !== 'object'
    || inventory.schemaVersion !== 1
    || !isSafeMetadataText(inventory.canonicalOrigin)
    || !Array.isArray(inventory.routes)) {
    throw new Error('Public route inventory must use schemaVersion 1 and declare canonicalOrigin and routes.');
  }
  let canonicalUrl;
  try {
    canonicalUrl = new URL(inventory.canonicalOrigin);
  } catch {
    throw new Error('Public route inventory canonicalOrigin must be a valid HTTP(S) origin.');
  }
  if (!['http:', 'https:'].includes(canonicalUrl.protocol)
    || canonicalUrl.origin !== inventory.canonicalOrigin) {
    throw new Error('Public route inventory canonicalOrigin must be a valid HTTP(S) origin.');
  }
  const routeIds = new Set();
  for (const route of inventory.routes) {
    if (!route || typeof route !== 'object'
      || ['id', 'pattern', 'kind', 'owner', 'indexPolicy'].some(field => (
        !isSafeMetadataText(route[field])
      ))) {
      throw new Error('Every public route requires id, pattern, kind, owner and indexPolicy.');
    }
    if (routeIds.has(route.id)) throw new Error(`Duplicate public route id: ${route.id}`);
    routeIds.add(route.id);
  }
  return inventory;
}

export function publicRoutesForScope(scope, publicRouteInventory) {
  if (!scope || typeof scope !== 'object' || Array.isArray(scope)) {
    throw new Error('Route scope must be an object.');
  }
  const keys = Object.keys(scope).sort(compareText);
  if (scope.mode === 'none') {
    if (keys.length !== 1 || keys[0] !== 'mode') {
      throw new Error('Route scope mode none must not declare owners.');
    }
    return [];
  }
  if (scope.mode === 'all') {
    if (keys.length !== 1 || keys[0] !== 'mode') {
      throw new Error('Route scope mode all must not declare owners.');
    }
    return publicRouteInventory.routes.map(stablePublicRoute).sort(comparePublicRoutes);
  }
  if (scope.mode !== 'owners'
    || keys.length !== 2
    || keys[0] !== 'mode'
    || keys[1] !== 'owners'
    || !Array.isArray(scope.owners)
    || scope.owners.length === 0
    || scope.owners.some(owner => !isSafeMetadataText(owner))
    || new Set(scope.owners).size !== scope.owners.length) {
    throw new Error('Route scope mode owners requires a non-empty unique owners array.');
  }
  const knownOwners = new Set(publicRouteInventory.routes.map(route => route.owner));
  for (const owner of scope.owners) {
    if (!knownOwners.has(owner)) throw new Error(`Unknown public route owner: ${owner}`);
  }
  const selectedOwners = new Set(scope.owners);
  return publicRouteInventory.routes
    .filter(route => selectedOwners.has(route.owner))
    .map(stablePublicRoute)
    .sort(comparePublicRoutes);
}
