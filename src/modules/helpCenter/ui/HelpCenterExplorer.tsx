'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Search, X } from 'lucide-react';
import { matchesHelpSearch } from '../model/helpSearch';

export type HelpExplorerSection = {
  id: string;
  title: string;
  heading: ReactNode;
  items: { id: string; searchText: string; content: ReactNode }[];
};

/** Static answers arrive as server-rendered JSX; only filtering and hash navigation hydrate. */
export default function HelpCenterExplorer({ sections }: { sections: HelpExplorerSection[] }) {
  const [query, setQuery] = useState('');
  const [topic, setTopic] = useState('all');
  const [linkedQuestion, setLinkedQuestion] = useState('');
  const searchInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const followHash = () => {
      const id = window.location.hash.slice(1);
      if (!sections.some(section => `faq-${section.id}` === id || section.items.some(item => item.id === id))) return;
      setQuery('');
      setTopic('all');
      setLinkedQuestion(id);
    };
    followHash();
    window.addEventListener('hashchange', followHash);
    return () => window.removeEventListener('hashchange', followHash);
  }, [sections]);
  useEffect(() => {
    if (linkedQuestion) document.getElementById(linkedQuestion)?.scrollIntoView({ block: 'start' });
  }, [linkedQuestion]);

  const searched = sections.map(section => ({
    ...section, items: section.items.filter(item => matchesHelpSearch(item.searchText, query)),
  }));
  const visible = searched.filter(section => (topic === 'all' || section.id === topic) && section.items.length);
  const count = visible.reduce((total, section) => total + section.items.length, 0);
  const reset = () => { setQuery(''); setTopic('all'); setLinkedQuestion(''); };
  const changeQuery = (value: string) => { setQuery(value); setLinkedQuestion(''); };

  return (
    <>
      <section className="faq-page__search" aria-labelledby="faq-search-title">
        <div><p className="faq-page__eyebrow">Помощь HearthPulse</p><h2 id="faq-search-title">Найдём ответ</h2>
          <p>Вход, подписка или игровой раздел — начните с вопроса.</p></div>
        <div className="faq-page__search-controls">
          <label htmlFor="faq-search">Поиск по вопросам и ответам</label>
          <div className="faq-page__search-field">
            <Search size={20} aria-hidden="true" />
            <input ref={searchInput} id="faq-search" type="search" value={query} onChange={event => changeQuery(event.target.value)}
              placeholder="Например, не приходит код" maxLength={200} aria-describedby="faq-search-hint" />
            {query && <button type="button" aria-label="Очистить поиск" onClick={() => {
              changeQuery(''); searchInput.current?.focus();
            }}><X size={18} aria-hidden="true" /></button>}
          </div>
          <p id="faq-search-hint">Можно искать по названию сервиса, проблеме или режиму.</p>
          <div className="faq-page__suggestions" aria-label="Популярные запросы">
            {['Boosty', 'Код из письма', 'Тир-лист'].map(value => <button type="button" key={value}
              onClick={() => { changeQuery(value); setTopic('all'); }}>{value}</button>)}
          </div>
        </div>
      </section>
      <div className="faq-page__layout">
        <nav className="faq-page__topics" aria-label="Темы вопросов">
          <p>Выберите тему</p>
          <div className="faq-page__topic-picker">
            <label htmlFor="faq-topic">Тема вопросов</label>
            <select id="faq-topic" value={topic} onChange={event => setTopic(event.target.value)}>
              <option value="all">Все вопросы ({searched.reduce((total, section) => total + section.items.length, 0)})</option>
              {searched.map(section => <option key={section.id} value={section.id}>{section.title} ({section.items.length})</option>)}
            </select>
          </div>
          <button type="button" data-faq-topic="all" aria-pressed={topic === 'all'} onClick={() => setTopic('all')}>
            Все вопросы <span>{searched.reduce((total, section) => total + section.items.length, 0)}</span>
          </button>
          {searched.map(section => <button type="button" data-faq-topic={section.id} key={section.id}
            aria-pressed={topic === section.id} onClick={() => setTopic(section.id)}>
            {section.title}<span>{section.items.length}</span>
          </button>)}
          <a href="/?login">Перейти в личный кабинет →</a>
        </nav>
        <div className="faq-page__answers">
          <div className="faq-page__results">
            <p role="status" aria-live="polite">{query.trim() ? 'Найдено вопросов' : 'Вопросов'}: {count}</p>
            {(query || topic !== 'all') && <button className="faq-page__reset" type="button" onClick={reset}>Сбросить фильтры</button>}
          </div>
          {visible.map(section => <section key={section.id} id={`faq-${section.id}`} className="faq-page__section"
            aria-labelledby={`faq-${section.id}-title`}>
            {section.heading}
            <div className="faq-page__questions">{section.items.map(item => (
              <details className="faq-page__question" key={item.id} id={item.id} open={linkedQuestion === item.id || undefined}>
                {item.content}
              </details>
            ))}</div>
          </section>)}
          {!count && <div className="faq-page__empty">
            <Search size={28} aria-hidden="true" /><h2>Пока нет совпадений</h2>
            <p>Попробуйте короче: «код», «Boosty» или «герой». Можно выбрать другую тему или посмотреть все вопросы.</p>
            <button type="button" onClick={reset}>Показать все вопросы</button>
            <a href="#faq-contact-support" onClick={reset}>Обратиться за помощью</a>
          </div>}
        </div>
      </div>
    </>
  );
}
