import { useId, useState } from 'react';
import './FAQSection.css';

const FAQ_ITEMS = [
  {
    q: 'Какой класс лучший на Арене Hearthstone?',
    a: 'По данным HSReplay и Firestone, в текущем патче топ-3 классы меняются с каждым обновлением. Актуальный рейтинг классов по проценту побед смотрите на странице «Классы».',
  },
  {
    q: 'Как пользоваться тир-листом карт?',
    a: 'Выберите класс в верхней панели тир-листа, чтобы увидеть оценки всех карт именно для него. Карты класса S — авто-пик, A — отличные, B — хорошие, C и ниже — ситуативные.',
  },
  {
    q: 'Как выбрать легендарку на Арене?',
    a: 'На старте Арены вам предлагают группу из трёх легендарных карт. Выбирайте ту группу, у которой наивысший процент побед — это показывает страница «Легендарки».',
  },
  {
    q: 'Как часто обновляются данные?',
    a: 'Данные о винрейтах классов и тир-лист карт обновляются автоматически несколько раз в сутки на основе HSReplay, Firestone и HearthArena.',
  },
  {
    q: 'Что такое винрейт класса на Арене?',
    a: 'Винрейт — процент матчей, выигранных игроками этого класса. Например, 55% означает, что из 100 партий класс выигрывает в среднем 55.',
  },
  {
    q: 'Сколько побед нужно для окупаемости Арены?',
    a: 'Для полной окупаемости (получить золото ≥ стоимости входа) обычно нужно 7+ побед. При 12 победах вы получаете максимальные награды.',
  },
] as const;

export default function FAQSection() {
  const headingId = useId();
  const [open, setOpen] = useState<number | null>(null);
  return (
    <section aria-labelledby={headingId} className="faq-section">
      <h2 id={headingId} className="faq-section__heading">Частые вопросы</h2>
      <div className="faq-section__list">
        {FAQ_ITEMS.map((item, index) => {
          const expanded = open === index;
          const panelId = `${headingId}-panel-${index}`;
          return (
            <div key={item.q} className="faq-card">
              <button
                type="button"
                className="faq-card__trigger"
                onClick={() => setOpen(expanded ? null : index)}
                aria-expanded={expanded}
                aria-controls={panelId}
              >
                <span className="faq-card__question">{item.q}</span>
                <span aria-hidden="true" className="faq-card__icon">{expanded ? '−' : '+'}</span>
              </button>
              <div id={panelId} className="faq-card__panel" hidden={!expanded}>
                <p className="faq-card__answer">{item.a}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
