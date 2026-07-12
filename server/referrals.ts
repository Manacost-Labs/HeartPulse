export type ReferralClickRow = {
  id?: unknown;
  referral_id?: unknown;
  slug?: unknown;
  clicked_at?: unknown;
  user_agent?: unknown;
  referrer?: unknown;
  landing_path?: unknown;
};

export type ReferralClick = {
  id: string;
  referralId: string;
  slug: string;
  clickedAt: string;
  userAgent: string;
  referrer: string;
  landingPath: string;
};

export function referralClickFromRow(row: ReferralClickRow): ReferralClick {
  return {
    id: String(row.id ?? ''),
    referralId: String(row.referral_id ?? ''),
    slug: String(row.slug ?? ''),
    clickedAt: String(row.clicked_at ?? ''),
    userAgent: String(row.user_agent ?? ''),
    referrer: String(row.referrer ?? ''),
    landingPath: String(row.landing_path ?? ''),
  };
}
