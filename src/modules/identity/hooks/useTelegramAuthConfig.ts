import { useEffect, useState } from 'react';
import {
  fetchTelegramAuthConfig,
  telegramAuthConfigRefreshDelay,
  type TelegramAuthConfig,
} from '../api/telegramAuthConfigApi';

const DISABLED_CONFIG: TelegramAuthConfig = {
  enabled: false,
  mode: 'disabled',
  botUsername: '',
  authUrl: '',
  callbackUrl: '',
  legacyIntentExpiresAt: 0,
};

export function useTelegramAuthConfig(): TelegramAuthConfig {
  const [config, setConfig] = useState<TelegramAuthConfig>(DISABLED_CONFIG);

  useEffect(() => {
    let active = true;
    let refreshTimer: number | undefined;
    const load = async (): Promise<void> => {
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
      try {
        const nextConfig = await fetchTelegramAuthConfig();
        if (!active) return;
        setConfig({
          ...nextConfig,
          authUrl: nextConfig.authUrl || '/api/auth/telegram/start',
          callbackUrl: nextConfig.callbackUrl
            || nextConfig.authUrl
            || '/api/auth/telegram/callback',
          enabled: nextConfig.enabled && Boolean(nextConfig.authUrl),
        });
        if (nextConfig.mode === 'legacy-widget') {
          const delay = telegramAuthConfigRefreshDelay(
            nextConfig.legacyIntentExpiresAt,
            Date.now(),
          );
          if (delay !== null) refreshTimer = window.setTimeout(() => { void load(); }, delay);
        }
      } catch {
        if (active) refreshTimer = window.setTimeout(() => { void load(); }, 30_000);
      }
    };
    void load();
    return () => {
      active = false;
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
    };
  }, []);

  return config;
}
