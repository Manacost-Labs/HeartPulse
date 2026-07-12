import type { MouseEvent } from 'react';
import './SiteFooter.css';

const FOOTER_NAV_LINKS = [
  { label: 'Главная', href: '/', tab: 'home' },
  { label: 'Классы', href: '/classes', tab: 'winrates' },
  { label: 'Тир-лист', href: '/tierlist', tab: 'tierlist' },
  { label: 'Легендарки', href: '/legendaries', tab: 'legendaries' },
  { label: 'Статьи', href: '/articles', tab: 'articles' },
  { label: 'Галерея', href: '/gallery', tab: 'gallery' },
] as const;

export default function SiteFooter({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const year = new Date().getFullYear();
  return (
    <footer
      className="arena-footer mt-8"
      style={{
        background: 'linear-gradient(180deg, rgba(8,16,32,0.98) 0%, rgba(3,7,14,0.98) 100%)',
        borderTop: '1px solid rgba(246,206,104,0.22)',
        color: '#c8d5e8',
      }}
      aria-label="Подвал сайта"
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 grid grid-cols-2 gap-6">
        <div>
          <h3 className="font-hs text-[#f6ce68] text-sm mb-3 uppercase">Разделы</h3>
          <nav aria-label="Навигация по сайту">
            <ul className="flex flex-col gap-1.5">
              {FOOTER_NAV_LINKS.map(link => (
                <li key={link.tab}>
                  <a
                    href={link.href}
                    onClick={(event: MouseEvent) => { event.preventDefault(); onNavigate(link.tab); }}
                    className="text-sm hover:text-[#f6ce68] transition-colors"
                    style={{ color: 'inherit', textDecoration: 'none' }}
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div>
          <h3 className="font-hs text-[#f6ce68] text-sm mb-3 uppercase">Сообщество</h3>
          <ul className="flex flex-col gap-1.5 text-sm">
            <li><a href="https://t.me/manacost_ru" target="_blank" rel="noopener noreferrer" className="hover:text-[#f6ce68] transition-colors" style={{ color: 'inherit', textDecoration: 'none' }}>Telegram</a></li>
            <li><a href="https://boosty.to/kolodahearthstone" target="_blank" rel="noopener noreferrer" className="hover:text-[#f6ce68] transition-colors" style={{ color: 'inherit', textDecoration: 'none' }}>Boosty</a></li>
          </ul>
        </div>
      </div>

      <div
        className="border-t py-4 px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-2"
        style={{ borderColor: 'rgba(148,163,184,0.18)' }}
      >
        <p className="text-xs" style={{ color: '#64748b' }}>© 2024–{year} Manacost. Все права защищены.</p>
        <p className="text-xs" style={{ color: '#64748b' }}>Hearthstone® — зарегистрированная торговая марка Blizzard Entertainment.</p>
      </div>
    </footer>
  );
}
