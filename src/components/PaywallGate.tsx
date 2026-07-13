import type { ReactNode } from 'react';
import '../route-parchment.css';
import '../battlegrounds-shell.css';
import SubscriptionPurchaseButtons from './SubscriptionPurchaseButtons';

type PaywallGateProps = {
  active: boolean;
  title: string;
  authUser: object | null;
  subscriptionStatus: { message?: string } | null;
  subscriptionLoading: boolean;
  onRefreshSubscription: () => Promise<unknown>;
  children: ReactNode;
};

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
  children,
}: PaywallGateProps) {
  if (!active) return <>{children}</>;

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
        {children}
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
          <p className="arena-paywall__eyebrow" style={{ margin: '0 0 6px', color: '#45617f', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Раздел для подписчиков
          </p>
          <h3 className="arena-paywall__title" id="paywall-gate-title" style={{ margin: '0 0 10px', color: '#142238', fontFamily: 'var(--font-display)', fontSize: '1.25rem' }}>
            {title}
          </h3>
          <p className="arena-paywall__description" id="paywall-gate-description" style={{ margin: '0 0 14px', color: '#42566f', fontSize: '13px', lineHeight: 1.55 }}>
            Подписка открывает закрытые инструменты Арены и помогает Манакосту держать данные свежими.
          </p>
          <div className="arena-paywall__benefits" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '10px', margin: '0 0 14px', textAlign: 'left' }}>
            <div style={{ padding: '12px', borderRadius: '14px', background: 'linear-gradient(135deg, rgba(239,246,255,0.92), rgba(219,234,254,0.72))', border: '1px solid rgba(96,165,250,0.34)' }}>
              <strong style={{ display: 'block', color: '#142238', fontSize: '13px', marginBottom: '5px' }}>Платная статистика HSReplay</strong>
              <span style={{ color: '#4b5f78', fontSize: '12px', lineHeight: 1.45 }}>
                Удобный доступ к платным данным по Арене: тир-листы, винрейты и быстрые срезы по текущему патчу.
              </span>
            </div>
            <div style={{ padding: '12px', borderRadius: '14px', background: 'linear-gradient(135deg, rgba(255,247,237,0.94), rgba(254,243,199,0.62))', border: '1px solid rgba(249,115,22,0.28)' }}>
              <strong style={{ display: 'block', color: '#142238', fontSize: '13px', marginBottom: '5px' }}>Авторские мета-отчёты</strong>
              <span style={{ color: '#4b5f78', fontSize: '12px', lineHeight: 1.45 }}>
                Разборы от топ-игрока и стримера Арены: что брать, чем играть и где сейчас преимущество.
              </span>
            </div>
          </div>
          <p className="arena-paywall__note" style={{ margin: '0 0 16px', color: '#42566f', fontSize: '12px', lineHeight: 1.5 }}>
            Доступ откроется через Boosty уровня Любитель Арены и выше или через участие в VIP Telegram-канале.
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
