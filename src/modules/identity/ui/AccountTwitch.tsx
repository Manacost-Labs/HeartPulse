import { useEffect, useState } from 'react';
import { Twitch } from 'lucide-react';
import { fetchTwitchLink, TWITCH_CONNECT_URL, unlinkTwitch, type TwitchLinkState } from '../api/twitchLinkApi';
import AccountSectionHead from './AccountSectionHead';

/** What the OAuth callback reported in `?twitch=`; read once on mount. */
const RESULT_TEXT: Readonly<Record<string, { type: 'ok' | 'err'; text: string }>> = {
  linked: { type: 'ok', text: 'Twitch привязан. Включите «Twitch-расширение» в приложении: Настройки → Стрим.' },
  cancelled: { type: 'err', text: 'Привязка Twitch отменена.' },
  error: { type: 'err', text: 'Не удалось привязать Twitch. Попробуйте ещё раз.' },
  not_configured: { type: 'err', text: 'Twitch-расширение пока не подключено на сайте.' },
};

function callbackResult(): { type: 'ok' | 'err'; text: string } | null {
  if (typeof window === 'undefined') return null;
  const key = new URLSearchParams(window.location.search).get('twitch') ?? '';
  return Object.hasOwn(RESULT_TEXT, key) ? RESULT_TEXT[key] : null;
}

/**
 * The streamer's Twitch link for the Hearthpulse extension: the desktop app
 * sends the remaining deck through the site to the linked channel. Hidden
 * while the site has no extension configured and nothing is linked.
 */
export default function AccountTwitch({ initial }: { initial?: TwitchLinkState | null }) {
  const [link, setLink] = useState<TwitchLinkState | null>(initial ?? null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    setStatus(callbackResult());
    if (initial !== undefined) return undefined;
    const controller = new AbortController();
    void fetchTwitchLink(controller.signal).then(result => {
      if (!controller.signal.aborted) setLink(result);
    });
    return () => controller.abort();
  }, [initial]);

  if (!link || (!link.configured && !link.linked && !status)) return null;
  const unlink = () => {
    setBusy(true);
    setStatus(null);
    unlinkTwitch()
      .then(() => {
        setLink(current => (current ? { ...current, linked: false, login: null, displayName: null } : current));
        setStatus({ type: 'ok', text: 'Twitch отвязан. Расширение больше не получает вашу колоду.' });
      })
      .catch((error: unknown) => setStatus({ type: 'err', text: error instanceof Error ? error.message : 'Не удалось отвязать Twitch' }))
      .finally(() => setBusy(false));
  };

  return (
    <section id="account-twitch" className="account-section account-twitch" aria-labelledby="account-twitch-title">
      <AccountSectionHead
        id="account-twitch-title"
        icon={<Twitch size={15} aria-hidden="true" />}
        eyebrow="Стрим"
        title="Twitch-расширение"
        description={link.linked
          ? <>Привязан канал <strong>{link.displayName || link.login}</strong>. Зрители видят в расширении оставшиеся карты вашей колоды — без руки, порядка колоды и карт соперника.</>
          : 'Привяжите свой Twitch-канал, чтобы зрители видели в расширении Hearthpulse оставшиеся карты вашей колоды.'}
        aside={link.linked ? (
          <button type="button" className="account-button account-button--secondary account-button--small" disabled={busy}
            onClick={unlink}>{busy ? 'Отвязываем…' : 'Отвязать'}</button>
        ) : link.configured ? (
          <a className="account-button account-button--small" href={TWITCH_CONNECT_URL}>
            <Twitch size={15} aria-hidden="true" /> Привязать Twitch
          </a>
        ) : null}
      />
      {status ? <p className={`account-twitch__${status.type}`} role={status.type === 'err' ? 'alert' : 'status'}>{status.text}</p> : null}
    </section>
  );
}
