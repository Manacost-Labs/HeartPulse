/**
 * Response contracts of the admin CRM endpoints used by this module. They live in the api layer so
 * the client and the view models both depend on them, never on each other.
 */

/** GET /api/admin/boosty/analytics, reduced to the fields the money section reads. */
export type MoneyMetrics = { newSubscriptions: number; renewals: number; revenueRub: number; observedDecreaseRub: number };
export type MoneyPlan = { planId: string; planName: string; newSubscriptions: number; renewals: number; revenueRub: number; source: 'boosty' | 'tribute' };
export type MoneyRetention = { days: number; eligible: number; evaluated: number; retained: number; unknown: number; rate: number | null };
export type MoneyObservation = { observedAt: string; type: string; amountRub: number; planName: string; source: 'boosty' | 'tribute' };
export type MoneySaleObservation = { observedAt: string; type: 'donation' | 'post_purchase'; amountRub: number; postTitle: string };
export type MoneyBuyer = { userId: string; name: string; email: string; donations: number; postPurchases: number; totalRevenueRub: number; lastPurchaseAt: string };
export type MoneyTransaction = {
  eventKey: string; type: 'donation' | 'post_purchase'; createdAt: string; amountRub: number;
  user: { id: string; name: string; email: string }; post: { id: string; title: string } | null;
};

export type MoneyPayload = {
  from: string;
  to: string;
  summary: MoneyMetrics;
  plans: MoneyPlan[];
  observations?: MoneyObservation[];
  retention: MoneyRetention[];
  coverage: { lastAcceptedPollAt: string | null; complete: boolean };
  limitations: string[];
  sales: null | {
    summary: { donations: number; postPurchases: number; totalRevenueRub: number; uniqueBuyers: number };
    buyers: MoneyBuyer[];
    observations: MoneySaleObservation[];
    transactions?: MoneyTransaction[];
    coverage: { latestImportAt: string | null; complete: boolean };
  };
  generatedAt: string;
};

/** Client mirror of GET /api/admin/crm/overview (server/adminCrmOverview.ts). */
export type OverviewAlert = {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  detail: string;
  action?: { section: string; segment?: string; label: string };
};

export type OverviewActivity =
  | { id: string; kind: 'registration'; at: string; name: string; userId: string }
  | { id: string; kind: 'admin'; at: string; action: string; details: Record<string, unknown>; actorName: string; targetName: string; userId?: string }
  | { id: string; kind: 'contest'; at: string; name: string; contestTitle: string; status: string; userId: string }
  | { id: string; kind: 'mailing'; at: string; subject: string; accepted: number; failed: number };

export type AdminCrmOverview = {
  generatedAt: string;
  alerts: OverviewAlert[];
  kpis: {
    totalUsers: number;
    payingNow: number;
    payingProvider: number;
    manualAccess: number;
    newUsers30d: number;
    newUsersPrevious30d: number;
    lapsed30d: number;
    expiringSoon: number;
  };
  series: { days: string[]; newUsers: number[]; paying: number[] };
  activity: OverviewActivity[];
};
