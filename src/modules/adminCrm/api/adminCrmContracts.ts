/**
 * Response contracts of the admin CRM endpoints used by this module. They live in the api layer so
 * the client and the view models both depend on them, never on each other.
 */

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
