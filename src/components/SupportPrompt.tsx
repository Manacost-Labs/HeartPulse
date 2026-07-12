import { useCallback, useEffect, useState } from 'react';
import { Gift, X } from 'lucide-react';

const STORAGE_KEY = 'manacost_support_prompt_closed_at';
const INTERVAL_MS = 3 * 24 * 60 * 60 * 1000;
const SUPPORT_URL = 'https://boosty.to/kolodahearthstone';

export default function SupportPrompt() {
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(max-width: 760px)').matches) return;
    try {
      const closedAt = Number(window.localStorage.getItem(STORAGE_KEY) || 0);
      if (closedAt && Date.now() - closedAt < INTERVAL_MS) return;
    } catch { /* storage may be disabled */ }

    const reveal = () => setVisible(true);
    const handleScroll = () => {
      if (window.scrollY < 700) return;
      reveal();
      window.removeEventListener('scroll', handleScroll);
    };
    const timer = window.setTimeout(reveal, 12000);
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  const close = useCallback(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(Date.now()));
    } catch { /* storage may be disabled */ }
    setVisible(false);
  }, []);

  if (!visible) return null;
  if (!expanded) {
    return (
      <aside className="support-prompt support-prompt--collapsed" aria-label="Поддержать Манакост">
        <button type="button" className="support-prompt__trigger" onClick={() => setExpanded(true)} aria-expanded="false">
          <Gift size={17} aria-hidden="true" />
          Поддержать проект
        </button>
        <button type="button" className="support-prompt__dismiss" onClick={close} aria-label="Скрыть предложение поддержки">
          <X size={14} aria-hidden="true" />
        </button>
      </aside>
    );
  }

  return (
    <aside className="support-prompt support-prompt--expanded" aria-label="Поддержать Манакост">
      <button type="button" className="support-prompt__close" onClick={close} aria-label="Закрыть уведомление">
        <X size={15} aria-hidden="true" />
      </button>
      <div className="support-prompt__copy">
        <strong>Манакост держится на вашей поддержке</strong>
        <span>Донат или подписка помогают оплачивать серверы, парсинг статистики и новые инструменты.</span>
        <span>Отсканируйте QR или откройте Boosty.</span>
      </div>
      <a className="support-prompt__qr" href={SUPPORT_URL} target="_blank" rel="noopener noreferrer" aria-label="Открыть Boosty">
        <img src="/ad/donate-qr.png" alt="QR код Boosty Манакоста" width={124} height={124} loading="lazy" decoding="async" />
      </a>
      <a className="support-prompt__button" href={SUPPORT_URL} target="_blank" rel="noopener noreferrer" onClick={close}>
        Открыть Boosty
      </a>
    </aside>
  );
}
