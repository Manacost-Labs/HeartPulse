import './SiteFooter.css';

const FOOTER_NAV_LINKS = [
  { label: 'Главная', href: '/', tab: 'home' },
  { label: 'Классы', href: '/classes', tab: 'winrates' },
  { label: 'Тир-лист', href: '/tierlist', tab: 'tierlist' },
  { label: 'Легендарки', href: '/legendaries', tab: 'legendaries' },
  { label: 'Статьи', href: '/articles', tab: 'articles' },
  { label: 'Галерея', href: '/gallery', tab: 'gallery' },
] as const;

export default function SiteFooter(_props: { onNavigate?: (tab: string) => void }) {
  const year = new Date().getFullYear();
  return (
    <footer
      className="arena-footer"
      aria-label="Подвал сайта"
    >
      <div className="arena-footer__columns">
        <div className="arena-footer__section">
          <h3 className="arena-footer__heading">Разделы</h3>
          <nav aria-label="Навигация по сайту">
            <ul className="arena-footer__links">
              {FOOTER_NAV_LINKS.map(link => (
                <li key={link.tab}>
                  <a
                    href={link.href}
                    className="arena-footer__link"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="arena-footer__section">
          <h3 className="arena-footer__heading">Сообщество</h3>
          <ul className="arena-footer__links">
            <li><a href="https://t.me/manacost_ru" target="_blank" rel="noopener noreferrer" className="arena-footer__link">Telegram</a></li>
            <li><a href="https://boosty.to/kolodahearthstone" target="_blank" rel="noopener noreferrer" className="arena-footer__link">Boosty</a></li>
          </ul>
        </div>

        <div className="arena-footer__section">
          <h3 className="arena-footer__heading">Разработчикам</h3>
          <ul className="arena-footer__links">
            <li><a href="/developers/api/" className="arena-footer__link">API для разработчиков</a></li>
            <li><a href="/api/v1/openapi.json" className="arena-footer__link">OpenAPI JSON</a></li>
          </ul>
        </div>
      </div>

      <div className="arena-footer__legal">
        <p>© 2024–{year} Manacost. Все права защищены.</p>
        <p>Hearthstone® — зарегистрированная торговая марка Blizzard Entertainment.</p>
      </div>
    </footer>
  );
}
