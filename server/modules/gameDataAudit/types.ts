export type AuditSeverity = 'info' | 'warning' | 'error';
export type AuditStatus = 'no_change' | 'change_detected' | 'source_lag' | 'incomplete';
export type SourceRole = 'release-signal' | 'catalog' | 'health' | 'statistics';
export type CatalogProfile = 'battlegroundCards' | 'constructedCards' | 'heroes' | 'trinkets' | 'darkGifts' | 'generic';
export type SourceProfile = CatalogProfile | 'arenaHealth' | 'hsDataHealth' | 'parserControl' | 'recentChanges';

export interface AuditIssue {
  code: string;
  severity: AuditSeverity;
  message: string;
  sourceId?: string;
  affectedCount?: number;
}

export interface SourceDefinition {
  id: string;
  label: string;
  kind: 'head' | 'json' | 'document';
  role: SourceRole;
  url: string;
  allowedHosts: string[];
  required?: boolean;
  escalateOnChange?: boolean;
  trackChanges?: boolean;
  optionalWhenEnvMissing?: string;
  authHeaderEnv?: string;
  timeoutMs?: number;
  maxBytes?: number;
  recordsPath?: string;
  identityPath?: string;
  minRecords?: number;
  expectedRecords?: number;
  profile?: SourceProfile;
  pagination?: {
    pageParameter?: string;
    perPageParameter?: string;
    perPage?: number;
    maxPages?: number;
    totalPagesPath?: string;
  };
  documentPattern?: string;
}

export interface AuditManifest {
  schemaVersion: 1;
  normalIntervalHours: number;
  fastIntervalHours: number;
  fastModeHours: number;
  sources: SourceDefinition[];
}

export interface SourceObservation {
  id: string;
  label: string;
  role: SourceRole;
  required: boolean;
  escalateOnChange?: boolean;
  trackChanges?: boolean;
  ok: boolean;
  checkedAt: string;
  fingerprint: string | null;
  recordCount: number | null;
  facts: Record<string, string | number | boolean | null>;
  issues: AuditIssue[];
}

export interface AuditSourceState {
  fingerprint: string | null;
  issueFingerprint?: string;
  recordCount: number | null;
  checkedAt: string;
}

export interface AuditState {
  schemaVersion: 1;
  lastCompletedAt: string | null;
  fastModeUntil: string | null;
  sources: Record<string, AuditSourceState>;
}

export interface AuditChange {
  sourceId: string;
  previousFingerprint: string | null;
  currentFingerprint: string | null;
  previousRecordCount?: number | null;
  currentRecordCount?: number | null;
}

export interface AuditReport {
  schemaVersion: 1;
  auditId: string;
  checkedAt: string;
  status: AuditStatus;
  patchSignal: boolean;
  fastModeUntil: string | null;
  shouldInvokeCodex: boolean;
  baselineCreated: boolean;
  summary: {
    sources: number;
    changed: number;
    warnings: number;
    errors: number;
  };
  changes: AuditChange[];
  issues: AuditIssue[];
  sources: SourceObservation[];
}

export interface CatalogEvaluation {
  identities: string[];
  issues: AuditIssue[];
  facts: Record<string, string | number | boolean | null>;
}
