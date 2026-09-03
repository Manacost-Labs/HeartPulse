import type { ReactNode } from 'react';
import { ArrowUpRight, Check, LockKeyhole, RefreshCw, Send } from 'lucide-react';
import '../route-parchment.css';
import '../battlegrounds-shell.css';
import './PaywallGate.css';
import SubscriptionPurchaseButtons from './SubscriptionPurchaseButtons';
import { subscriptionPaywallHeading } from './subscriptionPaywallHeading';
export type PaywallGateProps = {
  active: boolean;
  title: string;
  authUser: object | null;
  subscriptionStatus: { message?: string } | null;
  subscriptionLoading: boolean;
  onRefreshSubscription: () => Promise<unknown>;
  variant?: 'default' | 'standard';
  children?: ReactNode;
  previewTitle?: string;
  presentation?: 'overlay' | 'inline';
  surface?: 'meta' | 'archetype';
  description?: string;
  benefits?: string[];
  actionLabel?: string;
  providerButtons?: boolean;
};

export type PaywallAccessState = Pick<
  PaywallGateProps,
  'authUser' | 'subscriptionStatus' | 'subscriptionLoading' | 'onRefreshSubscription'
>;

const ACTION_STYLE = {
  background: 'rgba(37,99,235,0.08)',
  color: '#1f3b63',
  border: '1px solid #9db4d5',
  borderRadius: '8px',
  padding: '8px 12px',
  fontSize: '13px',
  cursor: 'pointer',
} as const;

export default function PaywallGate({
  active,
  title,
  authUser,
  subscriptionStatus,
  subscriptionLoading,
  onRefreshSubscription,
  variant = 'default',
  children,
  previewTitle,
  presentation = 'overlay',
  surface = 'meta',
  description,
  benefits,
  actionLabel,
  providerButtons = false,
}: PaywallGateProps) {
  const preview = children ?? <SubscriptionLockedPreview title={previewTitle || title} />;
  if (!active) return <>{preview}</>;
  if (presentation === 'inline') {
    return (
      <InlineSubscriptionPaywall
        title={title}
        surface={surface}
        description={description}
        benefits={benefits}
        actionLabel={actionLabel}
        providerButtons={providerButtons}
        authUser={authUser}
        subscriptionStatus={subscriptionStatus}
        subscriptionLoading={subscriptionLoading}
        onRefreshSubscription={onRefreshSubscription}
      />
    );
  }

  return (
    <div className="arena-paywall" style={{ position: 'relative', minHeight: 760, paddingBottom: 48 }}>
      <div
        aria-hidden="true"
        inert
        className="arena-paywall__preview"
        style={{
          minHeight: 660,
          filter: 'blur(6px)',
          opacity: 0.55,
          pointerEvents: 'none',
          userSelect: 'none',
          transition: 'filter 180ms ease',
        }}
      >
        {preview}
      </div>
      <div
        className="arena-paywall__overlay"
        style={{
          position: 'absolute',
          inset: 0,
          minHeight: 720,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
          padding: '48px 16px 72px',
          background: 'linear-gradient(180deg, rgba(238,243,255,0.22), rgba(238,243,255,0.72) 42%, rgba(238,243,255,0.96))',
          borderRadius: '14px',
        }}
      >
        <section
          className="arena-paywall__dialog"
          aria-labelledby="paywall-gate-title"
          aria-describedby="paywall-gate-description"
          style={{
            width: 'min(680px, 94%)',
            borderRadius: '14px',
            border: '1.5px solid #8fa7c8',
            background: 'linear-gradient(180deg, #f8faff, #e9f0fb)',
            boxShadow: '0 20px 46px rgba(15,23,42,0.24)',
            padding: '20px',
            textAlign: 'center',
          }}
        >
          <div data-tour-id="subscription-paywall">
            <p className="arena-paywall__eyebrow" style={{ margin: '0 0 6px', color: '#45617f', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Раздел для подписчиков
            </p>
            <h1 className="arena-paywall__title" id="paywall-gate-title" style={{ margin: '0 0 10px', color: '#142238', fontFamily: 'var(--font-display)', fontSize: '1.25rem' }}>
              {subscriptionPaywallHeading(title)}
            </h1>
            <p className="arena-paywall__description" id="paywall-gate-description" style={{ margin: '0 0 14px', color: '#42566f', fontSize: '13px', lineHeight: 1.55 }}>
              {variant === 'standard'
                ? 'Тариф «Алмаз» открывает статистику традиционного режима, актуальную мету и готовые сборки.'
                : 'Подписка открывает закрытые инструменты Арены и помогает Манакосту держать данные свежими.'}
            </p>
          </div>
          <div className="arena-paywall__benefits" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '10px', margin: '0 0 14px', textAlign: 'left' }}>
            <div style={{ padding: '12px', borderRadius: '14px', background: 'linear-gradient(135deg, rgba(239,246,255,0.92), rgba(219,234,254,0.72))', border: '1px solid rgba(96,165,250,0.34)' }}>
              <strong style={{ display: 'block', color: '#142238', fontSize: '13px', marginBottom: '5px' }}>{variant === 'standard' ? 'Мета и матчапы' : 'Платная статистика HSReplay'}</strong>
              <span style={{ color: '#4b5f78', fontSize: '12px', lineHeight: 1.45 }}>
                {variant === 'standard'
                  ? 'Распределение архетипов, винрейты и матчапы по доступным рейтингам.'
                  : 'Удобный доступ к платным данным по Арене: тир-листы, винрейты и быстрые срезы по текущему патчу.'}
              </span>
            </div>
            <div style={{ padding: '12px', borderRadius: '14px', background: 'linear-gradient(135deg, rgba(255,247,237,0.94), rgba(254,243,199,0.62))', border: '1px solid rgba(249,115,22,0.28)' }}>
              <strong style={{ display: 'block', color: '#142238', fontSize: '13px', marginBottom: '5px' }}>{variant === 'standard' ? 'Колоды и Power Tier' : 'Авторские мета-отчёты'}</strong>
              <span style={{ color: '#4b5f78', fontSize: '12px', lineHeight: 1.45 }}>
                {variant === 'standard'
                  ? 'Готовые к копированию сборки и аналитика Vicious Syndicate Gold.'
                  : 'Разборы от топ-игрока и стримера Арены: что брать, чем играть и где сейчас преимущество.'}
              </span>
            </div>
          </div>
          <p className="arena-paywall__note" style={{ margin: '0 0 16px', color: '#42566f', fontSize: '12px', lineHeight: 1.5 }}>
            {variant === 'standard'
              ? 'Доступ откроется через Boosty уровня «Алмаз» или выше.'
              : 'Доступ откроется через Boosty уровня Любитель Арены и выше или через участие в VIP Telegram-канале.'}
          </p>
          <SubscriptionPurchaseButtons />
          <div className="arena-paywall__actions" style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
            {!authUser ? (
              <a href="/?login" style={{ ...ACTION_STYLE, textDecoration: 'none', background: 'linear-gradient(135deg,#12365d,#0a1c32)', color: '#e5f2ff', borderColor: '#60a5fa' }}>
                Войти в профиль
              </a>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => { void onRefreshSubscription(); }}
                  disabled={subscriptionLoading}
                  style={{ ...ACTION_STYLE, background: 'linear-gradient(135deg,#12365d,#0a1c32)', color: '#e5f2ff', borderColor: '#60a5fa', cursor: subscriptionLoading ? 'wait' : 'pointer' }}
                >
                  {subscriptionLoading ? 'Проверяем...' : 'Обновить подписку'}
                </button>
                <a href="/?login" style={{ ...ACTION_STYLE, textDecoration: 'none', background: '#f8faff', color: '#1f3b63', borderColor: '#9db4d5' }}>
                  Открыть профиль
                </a>
              </>
            )}
          </div>
          {subscriptionStatus?.message && (
            <p className="arena-paywall__status" style={{ margin: '12px 0 0', color: '#64748b', fontSize: '12px', lineHeight: 1.4 }}>
              {subscriptionStatus.message}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

function InlineSubscriptionPaywall({
  title,
  surface,
  description,
  benefits,
  actionLabel,
  providerButtons,
  authUser,
  subscriptionStatus,
  subscriptionLoading,
  onRefreshSubscription,
}: {
  title: string;
  surface: 'meta' | 'archetype';
  description?: string;
  benefits?: string[];
  actionLabel?: string;
  providerButtons: boolean;
  authUser: object | null;
  subscriptionStatus: { message?: string } | null;
  subscriptionLoading: boolean;
  onRefreshSubscription: () => Promise<unknown>;
}) {
  const copy = surface === 'meta'
    ? {
      description: 'Сейчас показан короткий срез текущего патча. Полный список, все рейтинги и готовые сборки доступны с тарифом «Алмаз».',
      benefits: ['Все архетипы и рейтинги', 'Периоды патча и дополнения', 'Готовые сборки и коды колод'],
      actionLabel: 'Открыть всю мету',
    }
    : {
      description: 'Откройте все сборки архетипа, статистику против классов и влияние карт на винрейт.',
      benefits: ['Все сборки и коды колод', 'Матчапы на ранге Легенда', 'Муллиган и история показателей'],
      actionLabel: 'Открыть статистику архетипа',
    };

  return (
    <section
      className={`arena-inline-paywall arena-inline-paywall--${surface}${providerButtons ? ' arena-inline-paywall--providers' : ''}`}
      aria-labelledby={`arena-inline-paywall-${surface}-title`}
      aria-describedby={`arena-inline-paywall-${surface}-description`}
      data-tour-id="subscription-paywall"
    >
      <div className="arena-inline-paywall__seal" aria-hidden="true">
        <LockKeyhole size={24} strokeWidth={2.1} />
      </div>
      <div className="arena-inline-paywall__copy">
        <span className="arena-inline-paywall__eyebrow">Тариф «Алмаз»</span>
        <h2 id={`arena-inline-paywall-${surface}-title`}>{title}</h2>
        <p id={`arena-inline-paywall-${surface}-description`}>{description ?? copy.description}</p>
        <ul aria-label="Что входит в подписку">
          {(benefits ?? copy.benefits).map(item => (
            <li key={item}><Check size={16} aria-hidden="true" />{item}</li>
          ))}
        </ul>
      </div>
      <div className="arena-inline-paywall__actions">
        {providerButtons ? (
          <>
            <span className="arena-inline-paywall__actions-label">Выберите способ подписки</span>
            <div className="arena-inline-paywall__providers">
              <a
                className="arena-inline-paywall__provider arena-inline-paywall__provider--boosty"
                href="https://boosty.to/kolodahearthstone"
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className="arena-inline-paywall__provider-mark" aria-hidden="true">B</span>
                <span className="arena-inline-paywall__provider-copy">
                  <small>Boosty</small>
                  <strong>Открыть через Boosty</strong>
                </span>
                <ArrowUpRight size={18} aria-hidden="true" />
              </a>
              <a
                className="arena-inline-paywall__provider arena-inline-paywall__provider--telegram"
                href="https://web.tribute.tg/s/xz9"
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className="arena-inline-paywall__provider-mark" aria-hidden="true">
                  <Send size={18} />
                </span>
                <span className="arena-inline-paywall__provider-copy">
                  <small>Telegram</small>
                  <strong>Открыть через Telegram</strong>
                </span>
                <ArrowUpRight size={18} aria-hidden="true" />
              </a>
            </div>
          </>
        ) : (
          <>
            <a
              className="arena-inline-paywall__primary"
              href="https://boosty.to/kolodahearthstone"
              target="_blank"
              rel="noopener noreferrer"
            >
              <span>{actionLabel ?? copy.actionLabel}</span>
              <ArrowUpRight size={18} aria-hidden="true" />
            </a>
            <a
              className="arena-inline-paywall__payment-link"
              href="https://web.tribute.tg/s/xz9"
              target="_blank"
              rel="noopener noreferrer"
            >
              Оформить через Telegram
            </a>
          </>
        )}
        {!authUser ? (
          <a className="arena-inline-paywall__account-link" href="/?login">Уже подписаны? Войти</a>
        ) : (
          <button
            type="button"
            className="arena-inline-paywall__refresh"
            onClick={() => { void onRefreshSubscription(); }}
            disabled={subscriptionLoading}
          >
            <RefreshCw size={15} aria-hidden="true" />
            {subscriptionLoading ? 'Проверяем доступ…' : 'Обновить доступ'}
          </button>
        )}
        {subscriptionStatus?.message ? (
          <p className="arena-inline-paywall__status" role="status">{subscriptionStatus.message}</p>
        ) : null}
      </div>
    </section>
  );
}

function SubscriptionLockedPreview({ title }: { title: string }) {
  return (
    <section
      aria-label="Предпросмотр закрытого раздела"
      style={{
        minHeight: 420,
        display: 'grid',
        gap: 14,
        alignContent: 'center',
        padding: 'clamp(1rem, 3vw, 2rem)',
      }}
    >
      <div className="hs-card" style={{ borderRadius: 18, padding: 'clamp(1rem, 3vw, 1.5rem)' }}>
        <p className="modern-eyebrow" style={{ margin: '0 0 10px' }}>Раздел подписчиков</p>
        <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', color: '#1f3654', fontSize: 'clamp(1.7rem, 4vw, 2.6rem)' }}>
          {title}
        </h2>
        <p style={{ maxWidth: 680, margin: '12px 0 0', color: '#52667f', lineHeight: 1.55 }}>
          Статистика, отдельные страницы карт и инструменты Манакоста доступны подписчикам. Главная и страница конкурсов остаются открытыми для всех.
        </p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        {['Проверка подписки', 'Доступ к данным', 'VIP-инструменты'].map(item => (
          <div key={item} className="hs-card" style={{ minHeight: 92, borderRadius: 16, padding: 14, display: 'flex', alignItems: 'center', color: '#52667f', fontWeight: 800 }}>
            {item}
          </div>
        ))}
      </div>
    </section>
  );
}
