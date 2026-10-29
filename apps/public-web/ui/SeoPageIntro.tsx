import { Fragment } from 'react';
import './SeoPageIntro.css';
import { seoCopyPieces, seoPageCopy } from '@/src/seo/pageCopy';

function Inline({ text }: { text: string }) {
  return <>{seoCopyPieces(text).map((piece, index) => <Fragment key={index}>
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
  if (!copy) return null;
  return (
    <section className="seo-page-intro">
      {copy.sections.map(section => <Fragment key={section.question}>
        <h2>{section.question}</h2>
        {section.body.map((block, index) => typeof block === 'string'
          ? <p key={index}><Inline text={block} /></p>
          : <ul key={index}>{block.map(item => <li key={item}><Inline text={item} /></li>)}</ul>)}
      </Fragment>)}
    </section>
  );
}
