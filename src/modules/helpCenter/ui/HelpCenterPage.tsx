import { ArrowRight, ChevronDown, Gem, KeyRound, Library, LifeBuoy, Link as LinkIcon, LockKeyhole, Search, Swords, Users } from 'lucide-react';
import { SectionBanner } from '../../../shared/ui/EditorialRouteChrome';
import { HELP_SECTIONS } from '../model/helpContent';
import HelpCenterExplorer from './HelpCenterExplorer';
import './HelpCenter.css';

const ICONS = { account: KeyRound, subscription: Gem, access: LockKeyhole,
  arena: Swords, battlegrounds: Users, standard: Library, data: Search, support: LifeBuoy };

/** Server-compatible content; the explorer receives HTML answers rather than their rendering code. */
export default function HelpCenterPage() {
  const sections = HELP_SECTIONS.map(section => {
    const Icon = ICONS[section.id as keyof typeof ICONS];
    return {
      id: section.id, title: section.title,
      heading: <header className="faq-page__section-heading">
        <span className="faq-page__section-icon"><Icon size={22} aria-hidden="true" /></span>
        <div><p className="faq-page__eyebrow">{section.eyebrow}</p>
          <h2 id={`faq-${section.id}-title`}>{section.title}</h2><p>{section.description}</p></div>
      </header>,
      items: section.items.map(item => ({
        id: `faq-${item.id}`, searchText: `${item.question} ${item.answer} ${item.keywords || ''}`,
        content: <>
          <summary><span>{item.question}</span><ChevronDown size={18} aria-hidden="true" /></summary>
          <div className="faq-page__answer"><p>{item.answer}</p>
            <div className="faq-page__answer-links">
              {item.link && <a href={item.link.href} target={item.link.external ? '_blank' : undefined}
                rel={item.link.external ? 'noreferrer' : undefined}>{item.link.label}<ArrowRight size={16} aria-hidden="true" /></a>}
              <a className="faq-page__permalink" href={`#faq-${item.id}`} aria-label={`Ссылка на вопрос: ${item.question}`}>
                <LinkIcon size={15} aria-hidden="true" />Ссылка на вопрос</a>
            </div>
          </div>
        </>,
      })),
    };
  });
  return <article className="faq-page">
    <SectionBanner title="Частые вопросы" subtitle="Поможем разобраться с аккаунтом, доступом и игровыми разделами." />
    <HelpCenterExplorer sections={sections} />
    <footer className="faq-page__footer"><LifeBuoy size={28} aria-hidden="true" />
      <div><h2>Не нашли свой вопрос?</h2><p>Расскажите, что не получилось. Приложите адрес страницы и скриншот — без паролей и кодов.</p></div>
      <a href="https://t.me/manacost_ru" target="_blank" rel="noreferrer">Написать в Telegram <ArrowRight size={16} aria-hidden="true" /></a>
    </footer>
  </article>;
}
