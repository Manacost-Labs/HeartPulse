import type { ParserControlWarning } from './types';

export type ParserControlError = { message: string; unavailable: boolean };

export function parserControlWarningMessage(warnings: ParserControlWarning[]): string | null {
  const combined = new Map<string, ParserControlWarning>();
  for (const warning of warnings) {
    if (!warning.message) continue;
    const code = warning.code.trim();
    const key = code ? `code:${code}` : `message:${warning.message}`;
    const current = combined.get(key);
    if (!current) {
      combined.set(key, warning);
    } else if (!current.requestId && warning.requestId) {
      combined.set(key, { ...current, requestId: warning.requestId });
    }
  }
  const messages = [...combined.values()].map(warning => (
    warning.requestId ? `${warning.message} Код запроса: ${warning.requestId}` : warning.message
  ));
  return messages.length ? messages.join(' ') : null;
}

export function toParserControlError(error: unknown): ParserControlError {
  const value = error as Error & { code?: string; status?: number };
  let message = value?.message || 'Не удалось загрузить управление парсерами';
  if (value?.code === 'HS_DATA_API_AUTH_FAILED') {
    message = 'Сайт не смог авторизоваться в API данных. Проверьте серверный ключ HS_DATA_API_ADMIN_KEY.';
  } else if (value?.code === 'REVISION_CONFLICT' || value?.status === 409) {
    message = 'Настройки уже изменены в другой сессии. Панель обновляет актуальные данные — повторите изменение.';
  } else if (/failed to fetch|networkerror|load failed/i.test(message)) {
    message = 'Нет связи с сервером данных. Проверьте подключение и повторите попытку.';
  } else if (value?.status === 401 || value?.status === 403) {
    message = 'Сессия администратора истекла или у аккаунта недостаточно прав.';
  } else if ([502, 503, 504].includes(value?.status ?? 0) && value?.code !== 'HS_DATA_API_NOT_CONFIGURED') {
    message = 'Сервер данных временно недоступен. Повторите попытку через несколько секунд.';
  }
  return {
    message,
    unavailable: value?.code === 'HS_DATA_API_NOT_CONFIGURED',
  };
}
