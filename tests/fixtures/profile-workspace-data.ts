export const profileUser = {
  id: 'profile-demo', publicProfileId: '1042', name: 'Александр',
  email: 'player@example.com', role: 'user', avatarInitials: 'АЛ',
  country: 'Россия', contactTelegram: '@hearthstone_player',
  contactEmail: 'player@example.com', contactVkUrl: '', newsletterOptIn: false,
};

export function mockProfileRequests(active = true, failRefresh = false) {
  const originalFetch = window.fetch;
  let user = { ...profileUser };
  window.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, window.location.href);
    if (!url.pathname.startsWith('/api/')) return originalFetch(input, init);
    if (url.pathname === '/api/auth/me') return Response.json({ user });
    if (url.pathname === '/api/auth/profile') {
      user = { ...user, ...JSON.parse(String(init?.body || '{}')) };
      return Response.json({ user });
    }
    if (url.pathname === '/api/subscription/refresh' && failRefresh) {
      return Response.json({ error: 'Не удалось проверить подписку. Попробуйте ещё раз.' }, { status: 503 });
    }
    if (url.pathname.startsWith('/api/subscription/')) {
      return Response.json({
        hasAccess: active, checkedAt: '2026-09-21T09:30:00.000Z',
        entitlements: { standard: active, arena: active, battlegrounds: active },
        message: active ? 'Подписка подтверждена. Вам доступны все разделы сайта.' : 'Подключите подписку, чтобы открыть закрытые разделы.',
        boosty: { hasAccess: active, levelName: 'Алмаз', price: 300, message: 'Подписка не подключена.' },
        telegram: { hasAccess: false, connected: false, message: 'Аккаунт Telegram не привязан.' },
        patreon: { hasAccess: false, configured: true, connected: false, message: 'Подписка не подключена.' },
      });
    }
    if (url.pathname === '/api/profile/contest-history') return Response.json({ items: [] });
    if (url.pathname === '/api/auth/telegram/config') return Response.json({ enabled: false, socialProviders: [] });
    return Response.json({ error: 'Unsupported fixture request' }, { status: 404 });
  };
  return () => { window.fetch = originalFetch; };
}
