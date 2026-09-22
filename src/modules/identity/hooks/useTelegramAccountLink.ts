import { useEffect, useState } from 'react';
import {
  requestTelegramBotLinkCode,
  startTelegramOidcAccountLink,
} from '../api/telegramLinkApi';

export function useTelegramAccountLink(input: {
  userId: string;
  onMessage: (type: 'ok' | 'err', text: string) => void;
}) {
  const [action, setAction] = useState<'bot' | 'oidc' | null>(null);
  const [code, setCode] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [botUsername, setBotUsername] = useState('');

  useEffect(() => {
    setAction(null);
    setCode('');
    setExpiresAt('');
    setBotUsername('');
  }, [input.userId]);

  const requestBotCode = async () => {
    setAction('bot');
    try {
      const result = await requestTelegramBotLinkCode();
      setCode(result.code);
      setExpiresAt(result.expiresAt);
      setBotUsername(result.botUsername);
      input.onMessage('ok', 'ID-код создан. Отправьте его Telegram-боту.');
    } catch (error) {
      input.onMessage('err', error instanceof Error ? error.message : 'Не удалось создать Telegram ID-код');
    } finally {
      setAction(null);
    }
  };

  const startOidcLink = async () => {
    setAction('oidc');
    try {
      window.location.assign(await startTelegramOidcAccountLink());
    } catch (error) {
      input.onMessage('err', error instanceof Error ? error.message : 'Не удалось начать привязку Telegram');
      setAction(null);
    }
  };

  return { action, code, expiresAt, botUsername, requestBotCode, startOidcLink };
}
