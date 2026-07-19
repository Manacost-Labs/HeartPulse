import React, { useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import './HomeLatestArticles.css';

export interface HomeArticle {
  id: string;
  title: string;
  date: string;
  image: string;
  excerpt: string;
  tag?: string;
  mode?: string;
  url: string;
}

function formatArticleDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

function ArticleImage({ src, title }: { src: string; title: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <span className="home-latest-article__image-fallback" aria-hidden="true">M</span>;
  return (
    <img
      src={src}
      alt=""
      width={560}
      height={300}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      title={title}
    />
  );
}

function articleSectionLabel(article: HomeArticle): string {
  if (article.tag) return article.tag;
  if (article.mode === 'battlegrounds') return 'Поля Сражений';
  if (article.mode === 'standard') return 'Стандарт';
  if (article.mode === 'wild') return 'Вольный';
  if (article.mode === 'arena') return 'Арена';
  return 'Manacost';
}

export default function HomeLatestArticles({ articles, loading, onNavigate }: {
  articles: HomeArticle[];
  loading: boolean;
  onNavigate: (tab: string) => void;
}) {
  const latest = useMemo(
    () => [...articles]
      .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime())
      .slice(0, 3),
    [articles],
  );

  return (
    <section className="home-latest-articles home-reveal" aria-labelledby="home-articles-heading">
      <div className="home-section-heading">
        <div>
          <span>Новые материалы</span>
          <h2 id="home-articles-heading">Последние статьи</h2>
        </div>
        <p>Свежие мета-отчёты, разборы патчей и практические гайды редакции.</p>
      </div>

      <div className="home-latest-articles__board" aria-busy={loading}>
        {loading && latest.length === 0
          ? [0, 1, 2].map(index => <div key={index} className="home-latest-article home-latest-article--loading" />)
          : latest.map(article => (
            <a
              key={article.id}
              href={article.url}
              target="_blank"
              rel="noreferrer"
              className="home-latest-article"
            >
              <span className="home-latest-article__image"><ArticleImage src={article.image} title={article.title} /></span>
              <span className="home-latest-article__body">
                <span className="home-latest-article__meta">
                  <small>{articleSectionLabel(article)}</small>
                  <time dateTime={article.date}>{formatArticleDate(article.date)}</time>
                </span>
                <strong>{article.title}</strong>
                {article.excerpt && <span>{article.excerpt}</span>}
                <b>Читать статью <ArrowRight size={15} aria-hidden="true" /></b>
              </span>
            </a>
          ))}

        {!loading && latest.length === 0 && (
          <div className="home-latest-articles__empty" role="status">Новые публикации скоро появятся.</div>
        )}
      </div>

      <a
        href="/articles"
        className="home-latest-articles__all"
        onClick={(event: React.MouseEvent) => { event.preventDefault(); onNavigate('articles'); }}
      >
        Все статьи <ArrowRight size={16} aria-hidden="true" />
      </a>
    </section>
  );
}
