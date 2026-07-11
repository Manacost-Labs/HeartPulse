const SUBSCRIPTION_OPTIONS = [
  {
    href: 'https://boosty.to/kolodahearthstone',
    icon: '/ad/boosty.png',
    title: 'Оформить на Boosty',
    text: 'Уровень Любитель Арены и выше',
    background: 'linear-gradient(135deg, rgba(255,247,237,0.96), rgba(239,246,255,0.94))',
    border: '#f97316',
    glow: 'rgba(249,115,22,0.18)',
  },
  {
    href: 'https://web.tribute.tg/s/xz9',
    icon: '/ad/telegram.png',
    title: 'Оформить в Telegram',
    text: 'Подписка через Tribute',
    background: 'linear-gradient(135deg, rgba(239,246,255,0.98), rgba(224,242,254,0.94))',
    border: '#38bdf8',
    glow: 'rgba(56,189,248,0.20)',
  },
] as const;

export default function SubscriptionPurchaseButtons() {
  return (
    <div className="arena-paywall__purchase-options" style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
      gap: '10px',
      margin: '0 0 14px',
    }}>
      {SUBSCRIPTION_OPTIONS.map(item => (
        <a
          key={item.href}
          href={item.href}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'grid',
            gridTemplateColumns: '42px 1fr auto',
            alignItems: 'center',
            gap: '10px',
            minHeight: 70,
            padding: '12px',
            borderRadius: '14px',
            border: `1.5px solid ${item.border}`,
            background: item.background,
            boxShadow: `0 14px 30px ${item.glow}, inset 0 1px 0 rgba(255,255,255,0.86)`,
            textDecoration: 'none',
            textAlign: 'left',
            transition: 'transform 160ms ease, box-shadow 160ms ease',
          }}
        >
          <span style={{
            width: 42,
            height: 42,
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            background: '#fff',
            boxShadow: '0 6px 14px rgba(15,23,42,0.14)',
          }}>
            <img src={item.icon} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} draggable={false} />
          </span>
          <span style={{ minWidth: 0 }}>
            <strong style={{ display: 'block', color: '#142238', fontSize: '14px', lineHeight: 1.2 }}>
              {item.title}
            </strong>
            <span style={{ display: 'block', color: '#52647a', fontSize: '12px', marginTop: '4px', lineHeight: 1.35 }}>
              {item.text}
            </span>
          </span>
          <span aria-hidden="true" style={{
            width: 28,
            height: 28,
            borderRadius: '999px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#12233f',
            color: '#e5eefc',
            fontWeight: 800,
            flexShrink: 0,
          }}>
            →
          </span>
        </a>
      ))}
    </div>
  );
}
