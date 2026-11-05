import { useState } from 'react';
import { Check, Share2 } from 'lucide-react';

/**
 * Shares a profile link through the device's share sheet where there is one
 * (phones), otherwise copies it. A dismissed sheet is not an error; a sheet
 * the browser refuses (some desktops) falls back to copying.
 */
export default function ShareProfileButton({ url, title, className }: { url: string; title: string; className: string }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, url });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      setCopied(false);
    }
  };
  const Icon = copied ? Check : Share2;
  return (
    <button type="button" className={className} onClick={() => { void share(); }}>
      <Icon size={17} aria-hidden="true" />{copied ? 'Ссылка скопирована' : 'Поделиться'}
    </button>
  );
}
