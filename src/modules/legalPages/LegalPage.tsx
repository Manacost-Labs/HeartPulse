import { FileText, Scale, ShieldCheck } from 'lucide-react';
import legalPages from './content.json';
import './LegalPage.css';

type LegalPageKind = 'privacy' | 'terms';

const UPDATED_AT = legalPages.updatedAt;
const LEGAL_PAGES = legalPages.pages;

function LegalParagraph({ text }: { text: string }) {
  return text.split(/(\{\{(?:telegram|privacy)\}\})/g).map((part, index) => {
    if (part === '{{telegram}}') return <a key={index} href="https://t.me/manacost_ru" target="_blank" rel="noreferrer">Telegram Manacost</a>;
    if (part === '{{privacy}}') return <a key={index} href="/privacy/">Политика конфиденциальности</a>;
    return part;
  });
}

/**
 * A legal document. It has no state and no handlers, so a server component can
 * render it: links are plain anchors that load the target page as a document.
 */
export default function LegalPage({ kind }: { kind: LegalPageKind }) {
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
          return <section key={section.heading} aria-labelledby={sectionId}><h2 id={sectionId}>{section.heading}</h2>{section.paragraphs.map(paragraph => <p key={paragraph}><LegalParagraph text={paragraph} /></p>)}</section>;
        })}
      </div>

      <footer className="legal-page__footer">
        <FileText size={20} aria-hidden="true" />
        <span>{otherPage.title}</span>
        <a href={isPrivacy ? '/terms/' : '/privacy/'}>Открыть документ</a>
      </footer>
    </article>
  );
}
