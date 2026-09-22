import { useTelegramAccountLink } from '../hooks/useTelegramAccountLink';

export type TelegramAccountLinkActionsViewProps = {
  mode: 'legacy-widget' | 'oidc' | 'disabled';
  botUsername: string;
  action: 'bot' | 'oidc' | null;
  code: string;
  expiresAt: string;
  onOidcLink: () => void;
  onBotCodeRequest: () => void;
};

function formatExpiry(value: string): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
}

export function TelegramAccountLinkActionsView(input: TelegramAccountLinkActionsViewProps) {
  const botUrl = input.botUsername && input.code
    ? `https://t.me/${input.botUsername}?start=${encodeURIComponent(input.code)}`
    : '';
  const expiresLabel = formatExpiry(input.expiresAt);

  return (
    <>
      <div className="profile-subscription-source__actions" aria-live="polite">
        {input.mode === 'oidc' && (
          <button
            type="button"
            onClick={input.onOidcLink}
            disabled={input.action !== null}
            aria-busy={input.action === 'oidc'}
          >
            {input.action === 'oidc' ? 'Открываем...' : 'Привязать Telegram'}
          </button>
        )}
        {input.botUsername && (
          <button
            type="button"
            onClick={input.onBotCodeRequest}
            disabled={input.action !== null}
            aria-busy={input.action === 'bot'}
          >
            {input.action === 'bot' ? 'Создаем...' : 'ID-код для бота'}
          </button>
        )}
        {input.code && <code>{input.code}</code>}
        {botUrl && (
          <a
            href={botUrl}
            target="_blank"
            rel="noreferrer"
            className="profile-subscription-source__link"
          >
            Открыть @{input.botUsername}
          </a>
        )}
        {expiresLabel && (
          <span className="profile-subscription-source__expiry">до {expiresLabel}</span>
        )}
      </div>
      {input.botUsername && (
        <p className="profile-subscription-source__tip">
          Для Boosty-почты в боте: /email name@example.com.
        </p>
      )}
    </>
  );
}

export default function TelegramAccountLinkActions(input: {
  userId: string;
  mode: 'legacy-widget' | 'oidc' | 'disabled';
  botUsername: string;
  onMessage: (type: 'ok' | 'err', text: string) => void;
}) {
  const link = useTelegramAccountLink({
    userId: input.userId,
    onMessage: input.onMessage,
  });
  return (
    <TelegramAccountLinkActionsView
      mode={input.mode}
      botUsername={link.botUsername || input.botUsername}
      action={link.action}
      code={link.code}
      expiresAt={link.expiresAt}
      onOidcLink={() => { void link.startOidcLink(); }}
      onBotCodeRequest={() => { void link.requestBotCode(); }}
    />
  );
}
