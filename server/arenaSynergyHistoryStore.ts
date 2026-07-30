import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  ArenaClassId,
  ArenaCohortHistoryEntry,
  ArenaSynergyPayload,
} from '../shared/arenaSynergyContract.js';
import { writeJsonAtomically } from './durableJson.js';

const HISTORY_FILENAME = 'arena-synergy-history-v2.json';
const HISTORY_SCHEMA_VERSION = 2;
const MAX_SNAPSHOTS = 36;
const MAX_ACTIVE_CARD_IDS = 5_000;

export type ArenaSynergyStoredSnapshot = {
  savedAt: string;
  activeCardIds: string[];
  payload: ArenaSynergyPayload;
};

type ArenaSynergyHistoryDocument = {
  schemaVersion: 2;
  updatedAt: string;
  snapshots: ArenaSynergyStoredSnapshot[];
};

export type ArenaSynergyHistoryStore = {
  save: (snapshot: ArenaSynergyStoredSnapshot) => void;
  saveMany: (snapshots: ArenaSynergyStoredSnapshot[]) => void;
  latest: (className: ArenaClassId) => ArenaSynergyStoredSnapshot | null;
  previous: (
    className: ArenaClassId,
    currentCohortId: string,
  ) => ArenaSynergyStoredSnapshot | null;
  history: (className: ArenaClassId) => ArenaCohortHistoryEntry[];
};

function validIsoDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function validSnapshot(value: unknown): value is ArenaSynergyStoredSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const snapshot = value as Partial<ArenaSynergyStoredSnapshot>;
  const payload = snapshot.payload;
  return validIsoDate(snapshot.savedAt)
    && Array.isArray(snapshot.activeCardIds)
    && snapshot.activeCardIds.length <= MAX_ACTIVE_CARD_IDS
    && snapshot.activeCardIds.every(id => typeof id === 'string' && id.length > 0 && id.length <= 80)
    && Boolean(payload)
    && payload?.schemaVersion === 2
    && typeof payload.cohort?.id === 'string'
    && payload.cohort.id.length <= 200
    && Array.isArray(payload.combinations)
    && payload.combinations.length <= 60
    && Array.isArray(payload.redraft)
    && payload.redraft.length <= 240
    && Array.isArray(payload.history);
}

function emptyDocument(now: Date): ArenaSynergyHistoryDocument {
  return {
    schemaVersion: HISTORY_SCHEMA_VERSION,
    updatedAt: now.toISOString(),
    snapshots: [],
  };
}

function readDocument(stateDirectory: string, now: Date): ArenaSynergyHistoryDocument {
  try {
    const parsed = JSON.parse(
      readFileSync(join(stateDirectory, HISTORY_FILENAME), 'utf8'),
    ) as Partial<ArenaSynergyHistoryDocument>;
    if (
      parsed.schemaVersion !== HISTORY_SCHEMA_VERSION
      || !validIsoDate(parsed.updatedAt)
      || !Array.isArray(parsed.snapshots)
      || parsed.snapshots.length > MAX_SNAPSHOTS
      || !parsed.snapshots.every(validSnapshot)
    ) {
      return emptyDocument(now);
    }
    return parsed as ArenaSynergyHistoryDocument;
  } catch {
    return emptyDocument(now);
  }
}

function orderedSnapshots(document: ArenaSynergyHistoryDocument): ArenaSynergyStoredSnapshot[] {
  return [...document.snapshots].sort((left, right) => (
    Date.parse(right.savedAt) - Date.parse(left.savedAt)
  ));
}

function historyEntry(snapshot: ArenaSynergyStoredSnapshot): ArenaCohortHistoryEntry {
  const top = snapshot.payload.combinations[0];
  return {
    id: snapshot.payload.cohort.id,
    patchVersion: snapshot.payload.cohort.patchVersion,
    poolFingerprint: snapshot.payload.cohort.poolFingerprint,
    from: snapshot.payload.cohort.from,
    to: snapshot.payload.cohort.to,
    generatedAt: snapshot.payload.generatedAt,
    runsAnalyzed: snapshot.payload.summary.runsAnalyzed,
    qualityStatus: snapshot.payload.dataQuality.status,
    topCombination: top
      ? {
          cards: [top.cards[0].name, top.cards[1].name],
          score: top.score,
          interactionDeltaPoints: top.adjustedInteractionDeltaPoints,
        }
      : null,
  };
}

export function createArenaSynergyHistoryStore(
  options: {
    stateDirectory: string;
    now?: () => Date;
  },
): ArenaSynergyHistoryStore {
  const now = options.now ?? (() => new Date());
  const read = () => readDocument(options.stateDirectory, now());
  const saveMany = (incoming: ArenaSynergyStoredSnapshot[]) => {
    if (!incoming.length) return;
    if (!incoming.every(validSnapshot)) throw new Error('invalid Arena synergy snapshot');
    const replacements = new Map<string, ArenaSynergyStoredSnapshot>();
    incoming.forEach(snapshot => {
      const key = `${snapshot.payload.selectedClass}\u0000${snapshot.payload.cohort.id}`;
      replacements.set(key, {
        ...snapshot,
        activeCardIds: Array.from(new Set(snapshot.activeCardIds)).sort(),
        payload: { ...snapshot.payload, history: [] },
      });
    });
    const retained = orderedSnapshots(read()).filter(snapshot => (
      !replacements.has(`${snapshot.payload.selectedClass}\u0000${snapshot.payload.cohort.id}`)
    ));
    const snapshots = orderedSnapshots({
      schemaVersion: HISTORY_SCHEMA_VERSION,
      updatedAt: now().toISOString(),
      snapshots: [...replacements.values(), ...retained],
    }).slice(0, MAX_SNAPSHOTS);
    writeJsonAtomically(options.stateDirectory, HISTORY_FILENAME, {
      schemaVersion: HISTORY_SCHEMA_VERSION,
      updatedAt: now().toISOString(),
      snapshots,
    } satisfies ArenaSynergyHistoryDocument);
  };

  return {
    save(snapshot) {
      saveMany([snapshot]);
    },
    saveMany,
    latest(className) {
      return orderedSnapshots(read())
        .find(snapshot => snapshot.payload.selectedClass === className) ?? null;
    },
    previous(className, currentCohortId) {
      return orderedSnapshots(read()).find(snapshot => (
        snapshot.payload.selectedClass === className
        && snapshot.payload.cohort.id !== currentCohortId
      )) ?? null;
    },
    history(className) {
      return orderedSnapshots(read())
        .filter(snapshot => snapshot.payload.selectedClass === className)
        .map(historyEntry);
    },
  };
}
