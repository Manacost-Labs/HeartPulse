'use client';

import { SectionBanner } from '../../../shared/ui/EditorialRouteChrome';

import React, { useCallback, useEffect, useState } from 'react';
import { Gift } from 'lucide-react';
import type { AuthUser } from '../../identity/public';
import type { SubscriptionStatus } from '../../subscriptions/public';
import type { Contest } from '../model/types';
import { requestContestJoin, requestContests } from '../api/contestRequests';
import { ContestsSkeleton } from './ContestsSkeleton';
import './ContestsPage.css';

type PageMessage = { type: 'ok' | 'err'; text: string };

function formatDate(iso: string | null): string {
  if (!iso) return 'нет данных';
  const d = new Date(iso);
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}


function contestStatusLabel(status: string): string {
  if (status === 'approved') return 'Одобрено';
  if (status === 'pending') return 'На проверке';
  if (status === 'completed') return 'Завершен';
  if (status === 'planned') return 'Скоро';
  if (status === 'draft') return 'Черновик';
  if (status === 'cancelled') return 'Отменен';
  return 'Активен';
}

const ContestCard: React.FC<{
  contest: Contest;
  authUser: AuthUser | null;
  subscriptionStatus: SubscriptionStatus | null;
  subscriptionLoading: boolean;
  joining?: boolean;
  onJoin: (contestId: string) => void | Promise<void>;
}> = ({
  contest,
  authUser,
  subscriptionStatus,
  subscriptionLoading,
  joining,
  onJoin,
}) => {
  const joined = contest.entry?.status === 'approved';
  const completed = contest.status === 'completed';
  const planned = contest.status === 'planned';
  const hasSubscription = Boolean(subscriptionStatus?.hasAccess);
  const buttonLabel = joined
    ? 'Участие подтверждено'
    : completed
      ? 'Конкурс завершен'
      : planned
        ? 'Ожидает старта'
        : joining || subscriptionLoading
          ? 'Проверяем подписку...'
          : hasSubscription
            ? 'Участвовать'
            : 'Нужна подписка';
  return (
    <article className="contest-card">
      {contest.imageUrl ? (
        <img className="contest-card-image" src={contest.imageUrl} alt="" loading="lazy" />
      ) : (
        <div className="contest-card-image contest-card-image-empty"><Gift size={38} /></div>
      )}
      <div className="contest-card-body">
        <div className="contest-card-kicker">
          <span>{contestStatusLabel(contest.status)}</span>
          {contest.prize && <span>{contest.prize}</span>}
        </div>
        <h3>{contest.title}</h3>
        <p>{contest.description || 'Подписчики Манакоста могут подать заявку на участие.'}</p>
        <div className="contest-card-meta">
          {contest.endsAt && <span>Итоги: {formatDate(contest.endsAt)}</span>}
          {contest.entry && <span>Заявка: {contestStatusLabel(contest.entry.status)}</span>}
        </div>
        {completed && contest.winners.length > 0 && (
          <div className="contest-winners">
            <strong>ID победителей</strong>
            <div>{contest.winners.map(id => <code key={id}>{id}</code>)}</div>
          </div>
        )}
        {!authUser ? (
          <a className="contest-primary-button" href="/?login">Войдите для участия</a>
        ) : (
          <button
            type="button"
            className="contest-primary-button"
            disabled={joined || completed || planned || joining || subscriptionLoading}
            onClick={() => onJoin(contest.id)}
          >
            {buttonLabel}
          </button>
        )}
      </div>
    </article>
  );
};

export function ContestsPage({
  authUser,
  subscriptionStatus,
  subscriptionLoading,
  onRefreshSubscription,
  initialContests,
}: {
  authUser: AuthUser | null;
  subscriptionStatus: SubscriptionStatus | null;
  subscriptionLoading: boolean;
  onRefreshSubscription: () => Promise<SubscriptionStatus | null>;
  initialContests?: Contest[];
}) {
  const [contests, setContests] = useState<Contest[]>(initialContests ?? []);
  // `loaded`: there is a list on screen (the server's public one or a fetched one).
  // A later request for the viewer's own entries keeps it visible, dimmed and
  // aria-busy, instead of swapping it back to the skeleton.
  const [loaded, setLoaded] = useState(Boolean(initialContests));
  const [pending, setPending] = useState(!initialContests);
  const [loadError, setLoadError] = useState('');
  const [joiningId, setJoiningId] = useState('');
  const [message, setMessage] = useState<PageMessage | null>(null);

  const loadContests = useCallback(async () => {
    setPending(true);
    setLoadError('');
    try {
      setContests(await requestContests());
      setLoaded(true);
    } catch (error: unknown) {
      setLoadError(error instanceof Error ? error.message : 'Не удалось загрузить конкурсы');
    } finally {
      setPending(false);
    }
  }, []);

  useEffect(() => { if (!initialContests || authUser?.id) void loadContests(); }, [loadContests, authUser?.id, initialContests]);

  const joinContest = async (contestId: string) => {
    setJoiningId(contestId);
    setMessage(null);
    try {
      const status = subscriptionStatus?.hasAccess ? subscriptionStatus : await onRefreshSubscription();
      if (!status?.hasAccess) {
        throw new Error(status?.message || 'Участие в конкурсах доступно подписчикам Манакоста.');
      }
      await requestContestJoin(contestId);
      setMessage({ type: 'ok', text: 'Заявка одобрена. Вы участвуете в конкурсе.' });
      void onRefreshSubscription();
      await loadContests();
    } catch (error: unknown) {
      setMessage({ type: 'err', text: error instanceof Error ? error.message : 'Не удалось подать заявку' });
    } finally {
      setJoiningId('');
    }
  };

  return (
    <section className="contests-page">
      <SectionBanner title="Конкурсы" />
      <div className="contest-hero">
        <div>
          <p className="contest-eyebrow">Manacost</p>
          <p>
            Здесь будут проходить розыгрыши для подписчиков: игровая валюта, бонусы и другие призы.
            Нажмите “Участвовать”, система проверит подписку и подтвердит заявку автоматически.
          </p>
        </div>
        <div className="contest-access-card">
          <span>Статус доступа</span>
          <strong>{subscriptionLoading ? 'Проверяем...' : subscriptionStatus?.hasAccess ? 'Подписка активна' : authUser ? 'Нужна подписка' : 'Нужен вход'}</strong>
          <button type="button" onClick={() => void onRefreshSubscription()} disabled={!authUser || subscriptionLoading}>
            Обновить
          </button>
        </div>
      </div>

      {message && <div className={`contest-message contest-message-${message.type}`}>{message.text}</div>}

      <div className="contest-steps">
        <div><strong>1</strong><span>Выберите конкурс</span></div>
        <div><strong>2</strong><span>Система проверит подписку</span></div>
        <div><strong>3</strong><span>После завершения появятся ID победителей</span></div>
      </div>

      {loadError && (
        <div className={`contest-message contest-message-err contest-message--retry${loaded ? '' : ' contest-load-error'}`} role="alert">
          <span>{loaded ? `Не удалось обновить конкурсы. ${loadError}` : loadError}</span>
          <button type="button" className="contest-message-retry" onClick={() => void loadContests()}>Повторить</button>
        </div>
      )}

      {!loaded ? (
        pending ? <ContestsSkeleton /> : null
      ) : contests.length ? (
        <div className="contest-grid data-surface" aria-busy={pending}>
          {contests.map(contest => (
            <ContestCard
              key={contest.id}
              contest={contest}
              authUser={authUser}
              subscriptionStatus={subscriptionStatus}
              subscriptionLoading={subscriptionLoading}
              joining={joiningId === contest.id}
              onJoin={joinContest}
            />
          ))}
        </div>
      ) : (
        <div className="contest-empty data-surface" aria-busy={pending}>
          <Gift size={34} />
          <strong>Сейчас активных конкурсов нет</strong>
          <span>Когда конкурс будет создан, он появится на этой странице.</span>
        </div>
      )}
    </section>
  );
}
