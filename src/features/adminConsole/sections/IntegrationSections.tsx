import React, { useCallback, useEffect, useRef, useState } from 'react';
import { subscriptionEntitlementLabels, type SubscriptionStatus } from '../../../modules/subscriptions/public';
import { useAdminResource } from '../../../modules/adminWorkspace/public';
import { fetchWithDeadline } from '../../../shared/http/fetchWithDeadline';
import { ContestAdminBoosty } from '../../ContestAdminBoosty';
import { ContestAdminReferrals, type ReferralDraft } from '../../ContestAdminReferrals';
import { ContestAdminTelegram } from '../../ContestAdminTelegram';
import {
  ADMIN_READS,
  boostyStatusFailure,
  fetchBoostyStatus,
  fetchBoostySubscribers,
  boostySubscribersFailure,
  telegramAccountsFailure,
} from '../adminPanelRequests';
import { authJsonHeaders, errorText, formatDate, readResponseJson, type AdminMessageSink } from '../adminSectionKit';

/** Boosty: the import service's health and every subscriber with their level and site access. */
export function BoostySection() {
  // Raised only while «Обновить» starts its two requests, so they skip the server's Boosty cache.
  const freshRef = useRef(false);
  const loadStatus = useCallback(() => fetchBoostyStatus(freshRef.current), []);
  const loadSubscribers = useCallback(() => fetchBoostySubscribers(freshRef.current), []);
  const status = useAdminResource(ADMIN_READS.boostyStatus.key, loadStatus);
  const subscribers = useAdminResource(ADMIN_READS.boostySubscribers.key, loadSubscribers);
  return (
    <ContestAdminBoosty
      status={status.error ? boostyStatusFailure(status.error) : status.data ?? null}
      statusLoading={status.loading || status.refreshing}
      subscribers={subscribers.error ? boostySubscribersFailure(subscribers.error) : subscribers.data ?? null}
      subscribersLoading={subscribers.loading || subscribers.refreshing}
      onReload={() => {
        freshRef.current = true;
        void status.reload();
        void subscribers.reload();
        freshRef.current = false;
      }}
      formatDate={formatDate}
      entitlementLabels={subscriber => subscriptionEntitlementLabels({
        hasAccess: subscriber.siteAccess,
        entitlements: subscriber.entitlements as SubscriptionStatus['entitlements'],
      })}
    />
  );
}

/** Telegram: linked accounts and whether the bot can check their VIP access. */
export function TelegramSection() {
  const accounts = useAdminResource(ADMIN_READS.telegram.key, ADMIN_READS.telegram.load);
  return (
    <ContestAdminTelegram
      payload={accounts.error ? telegramAccountsFailure(accounts.error) : accounts.data ?? null}
      loading={accounts.loading || accounts.refreshing}
      onReload={() => void accounts.reload()}
      formatDate={formatDate}
      entitlementLabels={account => subscriptionEntitlementLabels({
        hasAccess: account.hasAccess,
        entitlements: account.entitlements as SubscriptionStatus['entitlements'],
      })}
    />
  );
}

/** Referral links: campaigns with their clicks, sign-ups and paid access. */
export function ReferralsSection({ onMessage, onCopy }: {
  onMessage: AdminMessageSink;
  onCopy: (text: string, okText?: string) => Promise<void>;
}) {
  const referrals = useAdminResource(ADMIN_READS.referrals.key, ADMIN_READS.referrals.load);
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    if (referrals.error) onMessage({ type: 'err', text: referrals.error.message });
  }, [onMessage, referrals.error]);

  const create = async (draft: ReferralDraft): Promise<boolean> => {
    setCreating(true);
    onMessage(null);
    try {
      const response = await fetchWithDeadline('/api/admin/referrals', {
        method: 'POST',
        headers: authJsonHeaders(),
        body: JSON.stringify(draft),
      });
      const data = await readResponseJson(response);
      if (!response.ok) throw new Error(typeof data.error === 'string' && data.error ? data.error : 'Не удалось создать ссылку');
      onMessage({ type: 'ok', text: 'Реферальная ссылка создана.' });
      await referrals.reload();
      return true;
    } catch (error) {
      onMessage({ type: 'err', text: errorText(error, 'Не удалось создать ссылку') });
      return false;
    } finally {
      setCreating(false);
    }
  };

  return (
    <ContestAdminReferrals
      referrals={referrals.data?.referrals ?? []}
      referralClicks={referrals.data?.recentClicks ?? []}
      loading={creating || referrals.loading || referrals.refreshing}
      formatDate={formatDate}
      onCopy={onCopy}
      onSubmit={create}
    />
  );
}
