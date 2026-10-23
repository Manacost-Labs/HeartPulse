'use client';
import { useEffect } from 'react';
import { classifyAppError } from '@/src/components/appErrorRecovery';
import { claimChunkReload } from '@/src/components/chunkReloadGuard';
import { useRouteErrorReport } from '@/apps/public-web/ui/useRouteErrorReport';

// An error the root layout itself cannot survive: the shell, the menu, or a
// route error page whose own code failed to load. It replaces the whole
// document, so it carries its own markup and inline styles and needs no code
// loaded separately. A chunk failure (a network blip, a tab that outlived a
// deploy) reloads once by itself.

const styles = {
  body: { margin: 0, minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, boxSizing: 'border-box',
    background: '#f3e3bf', color: '#3d2a1e', fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", sans-serif' },
  card: { maxWidth: 440, width: '100%', padding: '28px 28px 24px', borderRadius: 12, border: '1px solid rgba(99, 58, 31, 0.28)',
    background: '#fff8e8', boxShadow: '0 16px 36px rgba(61, 42, 30, 0.14)' },
  brand: { margin: '0 0 18px', fontWeight: 800, fontSize: 15, letterSpacing: '0.02em', color: '#7a2f45' },
  title: { margin: '0 0 10px', fontSize: 24, lineHeight: 1.2 },
  text: { margin: '0 0 22px', fontSize: 15, lineHeight: 1.55, color: '#5f4730' },
  actions: { display: 'flex', flexWrap: 'wrap', gap: 10 },
  primary: { minHeight: 44, padding: '0 18px', border: 0, borderRadius: 8, background: '#7a2f45', color: '#fff4dc',
    fontSize: 15, fontWeight: 700, cursor: 'pointer' },
  secondary: { minHeight: 44, padding: '0 18px', display: 'inline-flex', alignItems: 'center', borderRadius: 8,
    border: '1px solid rgba(99, 58, 31, 0.35)', color: '#3d2a1e', fontSize: 15, fontWeight: 700, textDecoration: 'none' },
  code: { margin: '18px 0 0', fontSize: 12, color: '#8b6c42' },
} as const;

function sessionStore(): Storage | null {
  try { return window.sessionStorage; } catch { return null; }
}

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useRouteErrorReport(error, 'global');
  const chunk = classifyAppError(error) === 'chunk';
  useEffect(() => {
    if (chunk && claimChunkReload(sessionStore(), Date.now())) window.location.reload();
  }, [chunk]);
  return <html lang="ru"><head><title>Страница не загрузилась — HearthPulse</title>
    <meta name="robots" content="noindex" />
  </head><body style={styles.body}>
    <main role="alert" data-app-error="global" aria-labelledby="global-error-title" style={styles.card}>
      <p style={styles.brand}>HearthPulse</p>
      <h1 id="global-error-title" style={styles.title}>{chunk ? 'Страница не догрузилась' : 'Что-то пошло не так'}</h1>
      <p style={styles.text}>{chunk
        ? 'Похоже, прервалась связь или сайт только что обновился. Обновите страницу — обычно этого достаточно.'
        : 'Не удалось показать страницу. Обновите её или вернитесь на главную — остальные разделы работают.'}</p>
      <div style={styles.actions}>
        <button type="button" style={styles.primary} onClick={() => window.location.reload()}>Обновить страницу</button>
        <a href="/" style={styles.secondary}>На главную</a>
      </div>
      {error.digest && <p style={styles.code}>Код ошибки: {error.digest}</p>}
    </main>
  </body></html>;
}
