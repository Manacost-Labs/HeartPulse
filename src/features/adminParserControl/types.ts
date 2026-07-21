export type ParserPublicationMode = 'stable' | 'early';
export type ParserHealth = 'healthy' | 'warning' | 'error' | 'running' | 'paused' | 'unknown';
export type ParserRunStatus = 'queued' | 'running' | 'succeeded' | 'partial' | 'failed' | 'cancelled';
export type ParserPublicationChannel = 'early' | 'stable' | 'stable_baseline' | 'unavailable';

export type ParserControlWarning = {
  code: string;
  message: string;
};

export type ParserPublicationPolicy = {
  mode: ParserPublicationMode;
  effectiveMode: ParserPublicationMode;
  earlyUntil: string | null;
  reason: string;
  updatedAt: string | null;
  updatedBy: string;
  managedBy: string;
};

export type ParserSource = {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
  supportsEarly: boolean;
  canRunManually: boolean;
  status: ParserHealth;
  lastSuccessAt: string | null;
  lastAttemptAt: string | null;
  candidateFetchedAt: string | null;
  publishedFetchedAt: string | null;
  publicationChannel: ParserPublicationChannel;
  stableBaselineAvailable: boolean;
  nextRunAt: string | null;
  itemCount: number | null;
  lastError: string;
  sourceState: string;
};

export type ParserSection = {
  id: string;
  group: string;
  label: string;
  description: string;
  enabled: boolean;
  status: ParserHealth;
  lastSuccessAt: string | null;
  nextRunAt: string | null;
  schedule: string;
  sources: ParserSource[];
};

export type ParserControlSummary = {
  totalSources: number;
  enabledSections: number;
  earlyCapableSources: number;
  activeRuns: number;
  failedSources: number;
};

export type ParserControlSnapshot = {
  revision: number;
  generatedAt: string | null;
  policy: ParserPublicationPolicy;
  sections: ParserSection[];
  summary: ParserControlSummary;
  warnings: ParserControlWarning[];
};

export type ParserRun = {
  id: string;
  status: ParserRunStatus;
  requestedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  requestedBy: string;
  reason: string;
  sectionIds: string[];
  sourceIds: string[];
  totalSources: number;
  completedSources: number;
  failedSources: number;
  error: string;
};
