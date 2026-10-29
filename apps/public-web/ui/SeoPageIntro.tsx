import { Fragment } from 'react';
import './SeoPageIntro.css';
import { seoCopyPieces, seoPageCopy } from '@/src/seo/pageCopy';

function Inline({ text }: { text: string }) {
  return <>{seoCopyPieces(text).map(piece => <Fragment key={`${piece.href ?? ''}:${piece.text}`}>
    {piece.href ? <a href={piece.href}>{piece.text}</a> : piece.text}
  </Fragment>)}</>;
}

/**
 * The text a reader without JavaScript (and a search engine) gets on a page
 * whose data is closed to a guest: what the page shows, how to read it, where
 * the data comes from and how often it is collected. A server component fed
 * from `config/public-seo-page-copy.json`, passed to the client page as
 * `children` so it adds no client JavaScript. It prints no statistics.
 */
export function SeoPageIntro({ path }: { path: string }) {
  const copy = seoPageCopy(path);
  // A page that asks for its text must have it: fail the build, not the search snippet.
  if (!copy) throw new Error(`No SEO page copy for ${path}`);
  return (
    <section className="seo-page-intro">
      {copy.sections.map(section => <Fragment key={section.question}>
        <h2>{section.question}</h2>
        {section.body.map(block => typeof block === 'string'
          ? <p key={block}><Inline text={block} /></p>
          : <ul key={block.join('\n')}>{block.map(item => <li key={item}><Inline text={item} /></li>)}</ul>)}
      </Fragment>)}
    </section>
  );
}
