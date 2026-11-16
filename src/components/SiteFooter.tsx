import './SiteFooter.css';
import { FOOTER_COLUMNS, FOOTER_LEGAL_LINKS, type FooterColumn } from './siteFooterContent';

const linkProps = (external?: boolean) => (external ? { target: '_blank', rel: 'noopener noreferrer' } : {});

const footerList = (column: FooterColumn) => (
  <ul className="arena-footer__links">
    {column.links.map(link => (
      <li key={link.href}><a href={link.href} className="arena-footer__link" {...linkProps(link.external)}>{link.label}</a></li>
    ))}
  </ul>
);

export default function SiteFooter(_props: { onNavigate?: (tab: string) => void }) {
  const year = new Date().getFullYear();
  return (
    <footer
      className="arena-footer"
      aria-label="Подвал сайта"
    >
      <div className="arena-footer__columns">
        {FOOTER_COLUMNS.map(column => (
          <div className="arena-footer__section" key={column.title}>
            <h2 className="arena-footer__heading">{column.title}</h2>
            {column.navLabel
              ? <nav aria-label={column.navLabel}>{footerList(column)}</nav>
              : footerList(column)}
          </div>
        ))}
      </div>

      <div className="arena-footer__legal">
        <p>© 2024–{year} Manacost. Все права защищены.</p>
        <nav className="arena-footer__legal-links" aria-label="Правовые документы">
          {FOOTER_LEGAL_LINKS.map(link => <a key={link.href} href={link.href} className="arena-footer__link">{link.label}</a>)}
        </nav>
        <p>Hearthstone® — зарегистрированная торговая марка Blizzard Entertainment.</p>
      </div>
    </footer>
  );
}
