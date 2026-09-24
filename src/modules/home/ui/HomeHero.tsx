import React, { useMemo } from 'react';
import { ArrowRight, BarChart3 } from 'lucide-react';
import { CLASS_ICON_BY_ID, type HomeSummaryData } from '../model/homeSummary';

export function HomeHero({ homeSummaryData, loadingHomeSummary, onNavigate }: {
  homeSummaryData: HomeSummaryData | null;
  loadingHomeSummary: boolean;
  onNavigate: (tab: string) => void;
}) {
  const topClasses = useMemo(
    () => [...(homeSummaryData?.topClasses ?? [])]
      .sort((a, b) => b.winrate - a.winrate)
      .slice(0, 3),
    [homeSummaryData?.topClasses],
  );
  return (
      <section className="home-stage" aria-labelledby="draft-home-title">
        <div className="home-stage__copy">
          <span className="home-stage__label"><span aria-hidden="true" /> Данные обновляются автоматически</span>
          <h1 id="draft-home-title">Мета <span>на сегодня</span></h1>
          <p>
            Лидеры Арены, свежесть данных и ключевые инструменты — на одном экране.
          </p>
          <div className="home-stage__actions">
            <a
              href="/tierlist"
              className="home-action home-action--primary"
              onClick={(event: React.MouseEvent) => { event.preventDefault(); onNavigate('tierlist'); }}
            >
              Открыть тир-лист <ArrowRight size={18} aria-hidden="true" />
            </a>
            <a
              href="/classes"
              className="home-action home-action--secondary"
              onClick={(event: React.MouseEvent) => { event.preventDefault(); onNavigate('winrates'); }}
            >
              Сравнить классы
            </a>
          </div>
        </div>

        <figure className="home-stage__character" aria-hidden="true">
          <img
            src="/wallpaper/home-paladin-hero.webp"
            alt=""
            width={1280}
            height={853}
            decoding="async"
            fetchPriority="high"
          />
        </figure>

        <aside className="home-draft-orbit" aria-live="polite" aria-label="Классы-лидеры текущей меты">
          <span className="home-draft-orbit__caption">Топ классов Арены</span>
          <div className="home-draft-orbit__board">
            {loadingHomeSummary && topClasses.length === 0
              ? [0, 1, 2].map(index => <span key={index} className={`home-orbit-class home-orbit-class--${index + 1} home-orbit-class--loading`} />)
              : topClasses.map((classItem, index) => {
                const icon = CLASS_ICON_BY_ID[classItem.id];
                return (
                  <a
                    key={classItem.id}
                    href="/classes"
                    className={`home-orbit-class home-orbit-class--${index + 1}`}
                    onClick={(event: React.MouseEvent) => { event.preventDefault(); onNavigate('winrates'); }}
                  >
                    <span className="home-orbit-class__icon">
                      {icon
                        ? <img src={icon} alt="" width={64} height={64} decoding="async" />
                        : <BarChart3 size={24} aria-hidden="true" />}
                    </span>
                    <span className="home-orbit-class__copy">
                      <small>#{index + 1}</small>
                      <strong>{classItem.name}</strong>
                      <b>{classItem.winrate.toFixed(1)}%</b>
                    </span>
                  </a>
                );
              })}
            {!loadingHomeSummary && topClasses.length === 0 && (
              <a
                href="/classes"
                className="home-orbit-empty"
                onClick={(event: React.MouseEvent) => { event.preventDefault(); onNavigate('winrates'); }}
              >
                <BarChart3 size={22} aria-hidden="true" />
                <span><strong>Срез меты обновляется</strong><small>Рейтинг классов доступен на отдельной странице</small></span>
              </a>
            )}
          </div>
          <a
            href="/classes"
            className="home-orbit-action"
            onClick={(event: React.MouseEvent) => { event.preventDefault(); onNavigate('winrates'); }}
          >
            Полный рейтинг классов <ArrowRight size={15} aria-hidden="true" />
          </a>
        </aside>
      </section>
  );
}
