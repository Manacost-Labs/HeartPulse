import { FileText, Scale, ShieldCheck } from 'lucide-react';
import type { MouseEvent, ReactNode } from 'react';
import legalPages from '../../config/legal-pages.json';
import '../route-parchment.css';
import './LegalPage.css';

type LegalPageKind = 'privacy' | 'terms';

const UPDATED_AT = legalPages.updatedAt;
const LEGAL_PAGES = legalPages.pages;

function InternalLink({ href, children, navigatePath }: {
  href: string;
  children: ReactNode;
  navigatePath: (path: string) => void;
}) {
  const openInternalLink = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigatePath(href);
  };
  return <a href={href} onClick={openInternalLink}>{children}</a>;
}

function LegalParagraph({ text, navigatePath }: { text: string; navigatePath: (path: string) => void }) {
  return text.split(/(\{\{(?:telegram|privacy)\}\})/g).map((part, index) => {
    if (part === '{{telegram}}') return <a key={index} href="https://t.me/manacost_ru" target="_blank" rel="noreferrer">Telegram Manacost</a>;
    if (part === '{{privacy}}') return <InternalLink key={index} href="/privacy" navigatePath={navigatePath}>Политика конфиденциальности</InternalLink>;
    return part;
  });
}

export default function LegalPage({ kind, navigatePath }: {
  kind: LegalPageKind;
  navigatePath: (path: string) => void;
}) {
  const isPrivacy = kind === 'privacy';
  const Icon = isPrivacy ? ShieldCheck : Scale;
  const page = LEGAL_PAGES[kind];
  const otherPage = LEGAL_PAGES[isPrivacy ? 'terms' : 'privacy'];

  return (
    <article className="legal-page">
      <header className="legal-page__hero">
        <div className="legal-page__hero-icon" aria-hidden="true"><Icon size={28} /></div>
        <div>
          <p>HearthPulse · Manacost</p>
          <h1>{page.title}</h1>
          <span>Актуальная редакция от {UPDATED_AT}.</span>
        </div>
      </header>

      <div className="legal-page__content">
        {page.sections.map((section, index) => {
          const sectionId = `legal-section-${index + 1}`;
          return <section key={section.heading} aria-labelledby={sectionId}><h2 id={sectionId}>{section.heading}</h2>{section.paragraphs.map(paragraph => <p key={paragraph}><LegalParagraph text={paragraph} navigatePath={navigatePath} /></p>)}</section>;
        })}
      </div>

      <footer className="legal-page__footer">
        <FileText size={20} aria-hidden="true" />
        <span>{otherPage.title}</span>
        <InternalLink href={isPrivacy ? '/terms' : '/privacy'} navigatePath={navigatePath}>Открыть документ</InternalLink>
      </footer>
    </article>
  );
}
