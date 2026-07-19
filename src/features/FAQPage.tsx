import {
  ArrowRight,
  CircleHelp,
  Gem,
  KeyRound,
  LifeBuoy,
  LockKeyhole,
  Search,
  ShieldCheck,
} from 'lucide-react';
import type { MouseEvent } from 'react';
import { FAQ_PAGE_SECTIONS } from '../content/faq';
import '../route-parchment.css';
import './FAQPage.css';

const SECTION_ICONS = {
  account: KeyRound,
  subscription: Gem,
  access: LockKeyhole,
  data: Search,
  support: LifeBuoy,
} as const;

export default function FAQPage({ navigatePath }: { navigatePath: (path: string) => void }) {
  const openInternalLink = (event: MouseEvent<HTMLAnchorElement>, href: string) => {
    if (!href.startsWith('/') || href.includes('?')) return;
    event.preventDefault();
    navigatePath(href);
  };

  return (
    <article className="faq-page">
      <header className="faq-page__hero">
        <div className="faq-page__hero-icon" aria-hidden="true"><CircleHelp size={28} /></div>
        <div>
          <p>Центр помощи Manacost Stats</p>
          <h1>Частые вопросы</h1>
          <span>Авторизация, подписки, уровни доступа, статистика и решение частых проблем — в одном месте.</span>
        </div>
      </header>

      <nav className="faq-page__index" aria-label="Разделы центра помощи">
        {FAQ_PAGE_SECTIONS.map(section => {
          const Icon = SECTION_ICONS[section.id as keyof typeof SECTION_ICONS] || CircleHelp;
          return (
            <a key={section.id} href={`#faq-${section.id}`}>
              <Icon size={18} aria-hidden="true" />
              <span>{section.title}</span>
              <ArrowRight size={15} aria-hidden="true" />
            </a>
          );
        })}
      </nav>

      <section className="faq-page__start" aria-labelledby="faq-quick-start">
        <div className="faq-page__start-heading">
          <ShieldCheck size={22} aria-hidden="true" />
          <div>
            <p>Быстрый старт</p>
            <h2 id="faq-quick-start">Как открыть доступ</h2>
          </div>
        </div>
        <ol>
          <li><strong>1</strong><span><b>Войдите в профиль</b>По email с кодом или через Telegram.</span></li>
          <li><strong>2</strong><span><b>Подтвердите источник</b>Boosty-почту или реальный Telegram-аккаунт.</span></li>
          <li><strong>3</strong><span><b>Обновите статус</b>Сайт покажет разделы, доступные вашему уровню.</span></li>
        </ol>
        <a className="faq-page__primary-link" href="/?login">Открыть профиль <ArrowRight size={16} /></a>
      </section>

      <div className="faq-page__sections">
        {FAQ_PAGE_SECTIONS.map((section, sectionIndex) => {
          const Icon = SECTION_ICONS[section.id as keyof typeof SECTION_ICONS] || CircleHelp;
          return (
            <section key={section.id} id={`faq-${section.id}`} className="faq-page__section" aria-labelledby={`faq-${section.id}-title`}>
              <header>
                <div className="faq-page__section-icon" aria-hidden="true"><Icon size={22} /></div>
                <div>
                  <p>{section.eyebrow}</p>
                  <h2 id={`faq-${section.id}-title`}>{section.title}</h2>
                  <span>{section.description}</span>
                </div>
              </header>
              <div className="faq-page__questions">
                {section.items.map((item, itemIndex) => (
                  <details key={item.question} open={sectionIndex === 0 && itemIndex === 0}>
                    <summary><span>{item.question}</span><i aria-hidden="true" /></summary>
                    <div>
                      <p>{item.answer}</p>
                      {item.link && (
                        <a
                          href={item.link.href}
                          target={item.link.external ? '_blank' : undefined}
                          rel={item.link.external ? 'noreferrer' : undefined}
                          onClick={event => openInternalLink(event, item.link!.href)}
                        >
                          {item.link.label} <ArrowRight size={14} aria-hidden="true" />
                        </a>
                      )}
                    </div>
                  </details>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <footer className="faq-page__footer">
        <LifeBuoy size={24} aria-hidden="true" />
        <div><strong>Не нашли ответ?</strong><span>Напишите нам адрес страницы и приложите скриншот. Пароль и коды подтверждения отправлять не нужно.</span></div>
        <a href="https://t.me/manacost_ru" target="_blank" rel="noreferrer">Написать в Telegram <ArrowRight size={15} /></a>
      </footer>
    </article>
  );
}
